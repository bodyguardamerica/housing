"""FastAPI application for the GenCon Hotels scraper."""

__version__ = "1.2.0"  # Multi-night scraping with 2 min interval

import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager
from datetime import datetime, date
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from pydantic import BaseModel
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import config
from database import Database, process_scrape_result, compute_result_hash, process_multi_night_result, compute_multi_night_hash
from models import ScrapeRunCreate, ScrapeRunUpdate, ScrapeTiming
from passkey import PasskeyClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global state
db: Optional[Database] = None
passkey_client: Optional[PasskeyClient] = None
scheduler: Optional[AsyncIOScheduler] = None
scraper_enabled = True
start_time = datetime.utcnow()


async def run_scrape():
    """Execute a single scrape operation using multi-night search for partial availability."""
    global db, passkey_client

    if not scraper_enabled:
        logger.info("Scraper is disabled, skipping")
        return

    if db is None or passkey_client is None:
        logger.error("Database or Passkey client not initialized")
        return

    # Check if scraper is active in database
    if not await db.is_scraper_active():
        logger.info("Scraper is disabled in database config")
        return

    check_in = date.fromisoformat(config.default_check_in)
    check_out = date.fromisoformat(config.default_check_out)
    year = config.current_year

    # Create scrape run record
    scrape_run_id = await db.create_scrape_run(ScrapeRunCreate(
        check_in=check_in,
        check_out=check_out,
        year=year,
    ))

    start = datetime.utcnow()

    # Create timing tracker for performance analysis
    timing = ScrapeTiming()

    try:
        # Perform multi-night scrape to catch partial availability
        result, timing = await passkey_client.scrape_individual_nights(check_in, check_out, timing=timing)

        if result is None:
            raise Exception("Scrape returned no results")

        # Check for duplicate data
        hotel_ids = {}
        for hotel in result.hotels:
            hotel_id = await db.get_hotel_id_by_passkey_id(hotel.id, year)
            if hotel_id:
                hotel_ids[hotel.id] = hotel_id

        # Compute current result hash (with timing)
        import time
        hash_start = time.perf_counter()
        current_hash = compute_multi_night_hash(result, hotel_ids)
        previous_hash = await db.get_last_scrape_hash(year)
        timing.hash_computation_ms = int((time.perf_counter() - hash_start) * 1000)

        if current_hash == previous_hash:
            # No changes, mark as no_changes
            duration_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
            await db.update_scrape_run(scrape_run_id, ScrapeRunUpdate(
                completed_at=datetime.utcnow(),
                status="success",
                hotels_found=len(result.hotels),
                rooms_found=len(result.nights),
                duration_ms=duration_ms,
                no_changes=True,
            ))
            logger.info("Scrape completed - no changes detected")
            logger.info(timing.log_summary())
            return

        # Process and store results (with timing)
        hotels_found, rooms_found = await process_multi_night_result(
            db, result, scrape_run_id, year, timing=timing
        )

        duration_ms = int((datetime.utcnow() - start).total_seconds() * 1000)

        await db.update_scrape_run(scrape_run_id, ScrapeRunUpdate(
            completed_at=datetime.utcnow(),
            status="success",
            hotels_found=hotels_found,
            rooms_found=rooms_found,
            duration_ms=duration_ms,
        ))

        logger.info(f"Scrape completed: {hotels_found} hotels, {rooms_found} room types with availability")
        logger.info(timing.log_summary())

    except Exception as e:
        logger.error(f"Scrape failed: {e}")
        duration_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
        await db.update_scrape_run(scrape_run_id, ScrapeRunUpdate(
            completed_at=datetime.utcnow(),
            status="error",
            error_message=str(e),
            duration_ms=duration_ms,
        ))
        # Log timing even on error to help debug performance issues
        if timing.total_http_ms > 0 or timing.session_init_ms > 0:
            logger.info(f"Partial timing before error: {timing.log_summary()}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global db, passkey_client, scheduler

    # Initialize database
    if config:
        logger.info(f"Starting GenCon Hotels Scraper v{__version__}")
        db = Database(config.supabase_url, config.supabase_service_role_key)
        logger.info("Database initialized")

        # Initialize Passkey client
        passkey_client = PasskeyClient(
            token_url=config.passkey_token_url,
            event_id=config.passkey_event_id,
            owner_id=config.passkey_owner_id,
        )
        logger.info("Passkey client initialized")

        # Initialize scheduler
        scheduler = AsyncIOScheduler()
        scheduler.add_job(
            run_scrape,
            "interval",
            seconds=config.scrape_interval_seconds,
            id="scrape_job",
        )
        scheduler.start()
        logger.info(f"Scheduler started with {config.scrape_interval_seconds}s interval")

        # Run initial scrape
        asyncio.create_task(run_scrape())
    else:
        logger.warning("No config available, running in limited mode")

    yield

    # Cleanup
    if scheduler:
        scheduler.shutdown()
    if passkey_client:
        await passkey_client.close()


app = FastAPI(
    title="GenCon Hotels Scraper",
    description="Scrapes the Passkey housing portal for Gen Con hotel availability",
    version="1.0.0",
    lifespan=lifespan,
)


class HealthResponse(BaseModel):
    status: str
    uptime_seconds: int
    last_scrape: Optional[dict] = None


class StatusResponse(BaseModel):
    scraper_active: bool
    last_scrape: Optional[dict] = None
    scrapes_last_hour: int
    error_rate_last_hour: float


class ToggleRequest(BaseModel):
    enabled: bool


def verify_api_key(x_api_key: str = Header(None)):
    """Verify the API key for protected endpoints."""
    if not config or not config.scraper_api_key:
        raise HTTPException(status_code=500, detail="API key not configured")
    if x_api_key != config.scraper_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    uptime = int((datetime.utcnow() - start_time).total_seconds())

    last_scrape = None
    if db:
        last_scrape = await db.get_last_scrape_status()

    return HealthResponse(
        status="healthy",
        uptime_seconds=uptime,
        last_scrape=last_scrape,
    )


@app.get("/status", response_model=StatusResponse)
async def status():
    """Detailed status endpoint."""
    if not db:
        raise HTTPException(status_code=503, detail="Database not available")

    is_active = await db.is_scraper_active()
    last_scrape = await db.get_last_scrape_status()
    scrapes_last_hour = await db.get_scrapes_last_hour()
    error_rate = await db.get_error_rate_last_hour()

    return StatusResponse(
        scraper_active=is_active and scraper_enabled,
        last_scrape=last_scrape,
        scrapes_last_hour=scrapes_last_hour,
        error_rate_last_hour=error_rate,
    )


@app.post("/scrape/trigger")
async def trigger_scrape(
    background_tasks: BackgroundTasks,
    x_api_key: str = Header(None),
):
    """Manually trigger a scrape (API key required)."""
    verify_api_key(x_api_key)

    background_tasks.add_task(run_scrape)
    return {"message": "Scrape triggered"}


@app.post("/scrape/toggle")
async def toggle_scraper(
    request: ToggleRequest,
    x_api_key: str = Header(None),
):
    """Enable or disable the scraper (API key required)."""
    global scraper_enabled

    verify_api_key(x_api_key)
    scraper_enabled = request.enabled

    return {"message": f"Scraper {'enabled' if scraper_enabled else 'disabled'}"}


# Graceful shutdown handling
def handle_sigterm(*args):
    """Handle SIGTERM for graceful shutdown."""
    logger.info("Received SIGTERM, shutting down...")
    sys.exit(0)


signal.signal(signal.SIGTERM, handle_sigterm)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
