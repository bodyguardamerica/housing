"""Passkey API client for scraping hotel availability."""

import asyncio
import html
import json
import re
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional, Tuple, List

import httpx
from bs4 import BeautifulSoup

from models import HotelResult, RoomBlock, InventoryDay, ScrapeResult, MultiNightScrapeResult, NightAvailability, ScrapeTiming, NightTiming

logger = logging.getLogger(__name__)


@dataclass
class RateLimitState:
    """Tracks rate limiting state for adaptive backoff."""

    # Number of consecutive 429s seen
    consecutive_429s: int = 0

    # Current delay multiplier (increases on 429, decreases on success)
    delay_multiplier: float = 1.0

    # Last time we were rate limited
    last_429_time: Optional[float] = None

    # Whether we're in "cautious mode" (recently rate limited)
    cautious_mode: bool = False

    # Base delay between requests (seconds)
    base_delay: float = 0.1

    # Maximum delay (seconds)
    max_delay: float = 5.0

    def record_429(self):
        """Record a rate limit response."""
        self.consecutive_429s += 1
        self.last_429_time = time.time()
        self.cautious_mode = True
        # Double the delay multiplier, up to a max
        self.delay_multiplier = min(self.delay_multiplier * 2, 10.0)
        logger.warning(f"Rate limited! Consecutive 429s: {self.consecutive_429s}, delay multiplier: {self.delay_multiplier}")

    def record_success(self):
        """Record a successful request."""
        self.consecutive_429s = 0
        # Slowly reduce delay multiplier on success
        if self.delay_multiplier > 1.0:
            self.delay_multiplier = max(1.0, self.delay_multiplier * 0.9)
        # Exit cautious mode after 60 seconds of no 429s
        if self.last_429_time and (time.time() - self.last_429_time) > 60:
            self.cautious_mode = False

    def get_delay(self) -> float:
        """Get the current delay to use between requests."""
        delay = self.base_delay * self.delay_multiplier
        return min(delay, self.max_delay)

    @property
    def should_abort(self) -> bool:
        """Whether we should abort due to too many rate limits."""
        return self.consecutive_429s >= 5


class PasskeyClient:
    """Client for interacting with the Passkey housing portal."""

    BASE_URL = "https://book.passkey.com"

    def __init__(
        self,
        token_url: str,
        event_id: str,
        owner_id: str,
        max_concurrent: int = 2,  # Conservative default
    ):
        self.token_url = token_url
        self.event_id = event_id
        self.owner_id = owner_id
        self.max_concurrent = max_concurrent
        self._client: Optional[httpx.AsyncClient] = None
        self._csrf_token: Optional[str] = None
        self._rate_limit_state = RateLimitState()

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client with session cookies."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                follow_redirects=True,
                timeout=30.0,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            )
        return self._client

    async def initialize_session(self) -> bool:
        """Initialize a session by visiting the token URL to get cookies."""
        client = await self._get_client()

        try:
            logger.info(f"Initializing session with token URL")
            response = await client.get(self.token_url)
            response.raise_for_status()

            # Extract CSRF token from cookies
            cookies = client.cookies
            self._csrf_token = cookies.get("XSRF-TOKEN")

            if not self._csrf_token:
                logger.warning("No XSRF-TOKEN found in cookies")
                # Try to extract from page content
                soup = BeautifulSoup(response.text, "html.parser")
                csrf_input = soup.find("input", {"name": "_csrf"})
                if csrf_input:
                    self._csrf_token = csrf_input.get("value")

            logger.info(f"Session initialized, CSRF token: {bool(self._csrf_token)}")
            return True

        except httpx.HTTPError as e:
            logger.error(f"Failed to initialize session: {e}")
            return False

    async def submit_search(
        self,
        check_in: date,
        check_out: date,
        num_guests: int = 1,
        num_rooms: int = 1,
    ) -> Tuple[bool, bool]:
        """
        Submit a search query to the Passkey portal.

        Returns:
            Tuple of (success, rate_limited)
            - (True, False) = success
            - (False, True) = rate limited (429)
            - (False, False) = other failure
        """
        client = await self._get_client()

        url = f"{self.BASE_URL}/event/{self.event_id}/owner/{self.owner_id}/rooms/select"

        data = {
            "_csrf": self._csrf_token or "",
            "hotelId": "0",
            "blockMap.blocks[0].blockId": "0",
            "blockMap.blocks[0].checkIn": check_in.isoformat(),
            "blockMap.blocks[0].checkOut": check_out.isoformat(),
            "blockMap.blocks[0].numberOfGuests": str(num_guests),
            "blockMap.blocks[0].numberOfRooms": str(num_rooms),
            "blockMap.blocks[0].numberOfChildren": "0",
        }

        try:
            logger.info(f"Submitting search: {check_in} to {check_out}")
            response = await client.post(
                url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            # Check for rate limiting
            if response.status_code == 429:
                self._rate_limit_state.record_429()
                retry_after = response.headers.get("Retry-After", "60")
                logger.warning(f"Rate limited (429)! Retry-After: {retry_after}")
                return False, True

            # Check for redirect or error
            if response.status_code in (403, 401):
                logger.warning("Session expired, need to reinitialize")
                return False, False

            response.raise_for_status()
            self._rate_limit_state.record_success()
            return True, False

        except httpx.HTTPError as e:
            logger.error(f"Failed to submit search: {e}")
            return False, False

    async def fetch_results(self) -> Tuple[Optional[List[HotelResult]], bool]:
        """
        Fetch hotel results from the search results page.

        Returns:
            Tuple of (hotels, rate_limited)
            - (hotels, False) = success
            - (None, True) = rate limited (429)
            - (None, False) = other failure
        """
        client = await self._get_client()

        url = f"{self.BASE_URL}/event/{self.event_id}/owner/{self.owner_id}/list/hotels"

        try:
            logger.info("Fetching search results")
            response = await client.get(url)

            # Check for rate limiting
            if response.status_code == 429:
                self._rate_limit_state.record_429()
                retry_after = response.headers.get("Retry-After", "60")
                logger.warning(f"Rate limited (429) on fetch! Retry-After: {retry_after}")
                return None, True

            response.raise_for_status()
            self._rate_limit_state.record_success()

            # Parse the HTML and extract the JSON data
            soup = BeautifulSoup(response.text, "html.parser")
            script_tag = soup.find("script", {"id": "last-search-results"})

            if not script_tag:
                # Try alternative patterns
                script_tags = soup.find_all("script")
                for script in script_tags:
                    if script.string and "hotelId" in script.string:
                        # Try to extract JSON array
                        match = re.search(r'\[.*"id":\s*\d+.*\]', script.string, re.DOTALL)
                        if match:
                            try:
                                data = json.loads(match.group())
                                return self._parse_hotels(data), False
                            except json.JSONDecodeError:
                                continue

                logger.warning("Could not find search results in page")
                return None, False

            try:
                data = json.loads(script_tag.string)
                return self._parse_hotels(data), False
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON: {e}")
                return None, False

        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch results: {e}")
            return None, False

    def _parse_hotels(self, data: list[dict]) -> list[HotelResult]:
        """Parse raw hotel data into HotelResult objects."""
        hotels = []

        # Debug: log the first hotel's structure to understand the data
        if data:
            first_hotel = data[0]
            logger.info(f"First hotel keys: {list(first_hotel.keys())}")
            logger.info(f"First hotel name: {first_hotel.get('name', 'unknown')}")
            if 'blocks' in first_hotel:
                blocks_data = first_hotel.get('blocks', [])
                logger.info(f"First hotel has {len(blocks_data)} blocks")
                if blocks_data:
                    logger.info(f"First block keys: {list(blocks_data[0].keys())}")
                    logger.info(f"First block data: {blocks_data[0]}")
            else:
                # Check for alternative room data structures
                logger.info("No 'blocks' key found, checking alternatives:")
                for key in first_hotel.keys():
                    val = first_hotel[key]
                    if isinstance(val, list) and len(val) > 0:
                        logger.info(f"  {key}: list with {len(val)} items, first item: {val[0] if isinstance(val[0], dict) else type(val[0])}")

        for hotel_data in data:
            blocks = []
            for block_data in hotel_data.get("blocks", []):
                inventory = []
                for inv in block_data.get("inventory", []):
                    inventory.append(InventoryDay(
                        date=inv.get("date", ""),
                        rate=float(inv.get("rate", 0)),
                        available=int(inv.get("available", 0)),
                    ))

                blocks.append(RoomBlock(
                    name=html.unescape(block_data.get("name", "Unknown Room")),
                    inventory=inventory,
                ))

            hotels.append(HotelResult(
                id=hotel_data.get("id", 0),
                name=html.unescape(hotel_data.get("name", "Unknown Hotel")),
                distance_from_event=float(hotel_data.get("distanceFromEvent", 0)),
                distance_unit=int(hotel_data.get("distanceUnit", 1)),
                message_map=hotel_data.get("messageMap", ""),
                blocks=blocks,
            ))

        logger.info(f"Parsed {len(hotels)} hotels")
        return hotels

    async def scrape(
        self,
        check_in: date,
        check_out: date,
        max_retries: int = 3,
    ) -> Optional[ScrapeResult]:
        """
        Perform a full scrape operation.

        Returns ScrapeResult on success, None on failure.
        """
        for attempt in range(max_retries):
            try:
                # Check if we should abort due to rate limiting
                if self._rate_limit_state.should_abort:
                    logger.error("Aborting scrape due to too many rate limit errors")
                    return None

                # Initialize session if needed
                if self._csrf_token is None:
                    if not await self.initialize_session():
                        continue

                # Submit search
                success, rate_limited = await self.submit_search(check_in, check_out)
                if rate_limited:
                    # Wait and retry
                    await asyncio.sleep(self._rate_limit_state.get_delay() * 10)
                    continue
                if not success:
                    # Session might have expired, reinitialize
                    self._csrf_token = None
                    continue

                # Fetch results
                hotels, rate_limited = await self.fetch_results()
                if rate_limited:
                    await asyncio.sleep(self._rate_limit_state.get_delay() * 10)
                    continue
                if hotels is None:
                    continue

                return ScrapeResult(
                    hotels=hotels,
                    check_in=check_in,
                    check_out=check_out,
                    scraped_at=datetime.utcnow(),
                )

            except Exception as e:
                logger.error(f"Scrape attempt {attempt + 1} failed: {e}")
                # Exponential backoff
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** (attempt + 1))

        return None

    async def _scrape_single_night(
        self,
        night_check_in: date,
        night_check_out: date,
        semaphore: asyncio.Semaphore,
        max_retries: int = 3,
    ) -> Tuple[Optional[List[HotelResult]], NightTiming, bool]:
        """
        Scrape a single night with semaphore control.

        Returns:
            Tuple of (hotels, timing, rate_limited)
        """
        night_timing = NightTiming(night_date=night_check_in)
        night_start = time.perf_counter()

        async with semaphore:
            # Add adaptive delay before request
            delay = self._rate_limit_state.get_delay()
            if delay > 0.1:
                logger.info(f"Using adaptive delay of {delay:.2f}s before {night_check_in}")
            await asyncio.sleep(delay)

            for attempt in range(max_retries):
                try:
                    # Check if we should abort
                    if self._rate_limit_state.should_abort:
                        logger.error(f"Aborting night {night_check_in} due to rate limits")
                        return None, night_timing, True

                    # Submit search for this single night
                    submit_start = time.perf_counter()
                    success, rate_limited = await self.submit_search(night_check_in, night_check_out)

                    if rate_limited:
                        # Back off and retry
                        backoff = self._rate_limit_state.get_delay() * 5
                        logger.warning(f"Rate limited on submit for {night_check_in}, backing off {backoff:.1f}s")
                        await asyncio.sleep(backoff)
                        continue

                    if not success:
                        # Session might have expired, reinitialize
                        self._csrf_token = None
                        if not await self.initialize_session():
                            continue
                        success, rate_limited = await self.submit_search(night_check_in, night_check_out)
                        if rate_limited:
                            await asyncio.sleep(self._rate_limit_state.get_delay() * 5)
                            continue
                        if not success:
                            continue

                    night_timing.submit_ms = int((time.perf_counter() - submit_start) * 1000)

                    # Fetch results
                    fetch_start = time.perf_counter()
                    hotels, rate_limited = await self.fetch_results()
                    night_timing.fetch_ms = int((time.perf_counter() - fetch_start) * 1000)

                    if rate_limited:
                        backoff = self._rate_limit_state.get_delay() * 5
                        logger.warning(f"Rate limited on fetch for {night_check_in}, backing off {backoff:.1f}s")
                        await asyncio.sleep(backoff)
                        continue

                    if hotels is None:
                        continue

                    night_timing.total_ms = int((time.perf_counter() - night_start) * 1000)
                    return hotels, night_timing, False

                except Exception as e:
                    logger.error(f"Attempt {attempt + 1} failed for {night_check_in}: {e}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2 ** (attempt + 1))

        # All retries failed
        night_timing.total_ms = int((time.perf_counter() - night_start) * 1000)
        return None, night_timing, False

    async def scrape_individual_nights(
        self,
        check_in: date,
        check_out: date,
        max_retries: int = 3,
        timing: Optional[ScrapeTiming] = None,
        parallel: bool = True,
    ) -> Tuple[Optional[MultiNightScrapeResult], ScrapeTiming]:
        """
        Scrape each individual night separately to find partial availability.

        For a 5-night stay (July 29 - Aug 3), this searches:
        - July 29-30
        - July 30-31
        - July 31-Aug 1
        - Aug 1-2
        - Aug 2-3

        Returns aggregated results showing which nights each hotel/room has availability.

        Args:
            check_in: Start date of the range
            check_out: End date of the range
            max_retries: Max retries per night
            timing: Optional timing tracker
            parallel: If True, scrape nights in parallel (default). If False, sequential.

        If timing is provided, populates it with detailed timing metrics.
        """
        from datetime import timedelta

        # Initialize timing if provided
        if timing is None:
            timing = ScrapeTiming()

        all_nights: List[NightAvailability] = []
        all_hotels: dict[int, HotelResult] = {}  # passkey_id -> hotel info

        # Generate individual night ranges
        current = check_in
        nights = []
        while current < check_out:
            next_day = current + timedelta(days=1)
            nights.append((current, next_day))
            current = next_day

        # Determine concurrency based on rate limit state
        if self._rate_limit_state.cautious_mode:
            effective_concurrent = 1  # Sequential if recently rate limited
            logger.info("Using sequential mode due to recent rate limiting")
        else:
            effective_concurrent = self.max_concurrent if parallel else 1

        logger.info(f"Scraping {len(nights)} individual nights from {check_in} to {check_out} (concurrent={effective_concurrent})")

        # Initialize session once (with timing)
        session_start = time.perf_counter()
        if self._csrf_token is None:
            if not await self.initialize_session():
                logger.error("Failed to initialize session for multi-night scrape")
                return None, timing
        timing.session_init_ms = int((time.perf_counter() - session_start) * 1000)
        logger.info(f"Session init took {timing.session_init_ms}ms")

        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(effective_concurrent)

        # Scrape all nights (parallel or sequential based on semaphore)
        scrape_start = time.perf_counter()

        tasks = [
            self._scrape_single_night(night_ci, night_co, semaphore, max_retries)
            for night_ci, night_co in nights
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        total_scrape_time = int((time.perf_counter() - scrape_start) * 1000)

        # Process results
        rate_limited_count = 0
        for i, result in enumerate(results):
            night_ci, night_co = nights[i]

            if isinstance(result, Exception):
                logger.error(f"Night {night_ci} failed with exception: {result}")
                continue

            hotels, night_timing, rate_limited = result

            if rate_limited:
                rate_limited_count += 1

            timing.nights.append(night_timing)

            if hotels is None:
                logger.warning(f"No results for night {night_ci}")
                continue

            # Collect hotels and availability
            hotels_with_blocks = 0
            total_blocks = 0

            for hotel in hotels:
                # Store hotel info (update if we have new data)
                if hotel.id not in all_hotels or hotel.blocks:
                    all_hotels[hotel.id] = hotel

                if hotel.blocks:
                    hotels_with_blocks += 1
                    total_blocks += len(hotel.blocks)

                # Record availability for each room block
                for block in hotel.blocks:
                    available = block.min_available if block.inventory else 0
                    rate = block.nightly_rate if block.inventory else 0.0

                    all_nights.append(NightAvailability(
                        hotel_id=hotel.id,
                        hotel_name=hotel.name,
                        room_type=block.name,
                        night_date=night_ci,
                        available_count=available,
                        nightly_rate=rate,
                    ))

            logger.info(f"Night {night_ci}: {len(hotels)} hotels, {hotels_with_blocks} with blocks, {total_blocks} blocks (submit={night_timing.submit_ms}ms, fetch={night_timing.fetch_ms}ms)")

        # Calculate timing
        timing.total_http_ms = sum(n.total_ms for n in timing.nights)
        # In parallel mode, delays are overlapped, so we track wall-clock time differently
        if effective_concurrent > 1:
            timing.total_delay_ms = 0  # Delays are overlapped in parallel
            logger.info(f"Parallel scrape completed in {total_scrape_time}ms (wall-clock)")
        else:
            timing.total_delay_ms = int(len(nights) * self._rate_limit_state.get_delay() * 1000)

        logger.info(f"HTTP timing: total={timing.total_http_ms}ms, wall_clock={total_scrape_time}ms, session_init={timing.session_init_ms}ms")

        if rate_limited_count > 0:
            logger.warning(f"Encountered {rate_limited_count} rate-limited requests during scrape")

        if not all_nights:
            logger.warning("No availability found for any night")
            result = MultiNightScrapeResult(
                hotels=list(all_hotels.values()),
                nights=all_nights,
                check_in=check_in,
                check_out=check_out,
                scraped_at=datetime.utcnow(),
            )
            return result, timing

        logger.info(f"Found {len(all_nights)} room-night availability records across {len(all_hotels)} hotels")

        result = MultiNightScrapeResult(
            hotels=list(all_hotels.values()),
            nights=all_nights,
            check_in=check_in,
            check_out=check_out,
            scraped_at=datetime.utcnow(),
        )
        return result, timing

    async def scrape_full_range(
        self,
        check_in: date,
        check_out: date,
        max_retries: int = 3,
        timing: Optional[ScrapeTiming] = None,
    ) -> Tuple[Optional[MultiNightScrapeResult], ScrapeTiming]:
        """
        Scrape the full date range in a SINGLE request and extract per-night availability
        from the inventory array.

        This is faster and more reliable than scrape_individual_nights() because:
        - Single HTTP request instead of 5
        - No session context collision from parallel requests
        - Inventory array already contains per-day availability

        Returns (result, timing) tuple.
        """
        from datetime import timedelta

        if timing is None:
            timing = ScrapeTiming()

        all_nights: List[NightAvailability] = []

        # Initialize session (with timing)
        session_start = time.perf_counter()
        if self._csrf_token is None:
            if not await self.initialize_session():
                logger.error("Failed to initialize session")
                return None, timing
        timing.session_init_ms = int((time.perf_counter() - session_start) * 1000)

        # Single scrape for full date range
        scrape_start = time.perf_counter()
        result = await self.scrape(check_in, check_out, max_retries)
        scrape_ms = int((time.perf_counter() - scrape_start) * 1000)

        if result is None:
            logger.error("Full range scrape returned no results")
            return None, timing

        # Extract per-night availability from inventory arrays
        for hotel in result.hotels:
            for block in hotel.blocks:
                for inv in block.inventory:
                    # Parse inventory date
                    try:
                        if isinstance(inv.date, str):
                            inv_date = date.fromisoformat(inv.date)
                        else:
                            inv_date = inv.date
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid inventory date: {inv.date}")
                        continue

                    all_nights.append(NightAvailability(
                        hotel_id=hotel.id,
                        hotel_name=hotel.name,
                        room_type=block.name,
                        night_date=inv_date,
                        available_count=inv.available,
                        nightly_rate=inv.rate,
                    ))

        timing.total_http_ms = scrape_ms
        timing.nights = [NightTiming(night_date=check_in, total_ms=scrape_ms)]

        logger.info(
            f"Full range scrape: {len(result.hotels)} hotels, {len(all_nights)} room-nights "
            f"in {scrape_ms}ms"
        )

        multi_result = MultiNightScrapeResult(
            hotels=result.hotels,
            nights=all_nights,
            check_in=check_in,
            check_out=check_out,
            scraped_at=datetime.utcnow(),
        )
        return multi_result, timing

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
