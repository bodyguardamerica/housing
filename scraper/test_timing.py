"""Test script to run a scrape and measure timing without database writes."""

import argparse
import asyncio
import logging
from datetime import date

from config import config
from models import ScrapeTiming
from passkey import PasskeyClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def test_scrape(parallel: bool = True, max_concurrent: int = 2):
    """Run a test scrape and print timing results."""

    mode = "PARALLEL" if parallel else "SEQUENTIAL"
    print("\n" + "=" * 60)
    print(f"SCRAPER TIMING TEST - {mode} MODE (no database writes)")
    print("=" * 60 + "\n")

    # Initialize Passkey client
    client = PasskeyClient(
        token_url=config.passkey_token_url,
        event_id=config.passkey_event_id,
        owner_id=config.passkey_owner_id,
        max_concurrent=max_concurrent,
    )

    check_in = date.fromisoformat(config.default_check_in)
    check_out = date.fromisoformat(config.default_check_out)

    print(f"Scraping: {check_in} to {check_out}")
    print(f"Number of nights: {(check_out - check_in).days}")
    print(f"Mode: {mode} (max_concurrent={max_concurrent})")
    print("-" * 60 + "\n")

    timing = ScrapeTiming()

    import time
    wall_clock_start = time.perf_counter()

    try:
        result, timing = await client.scrape_individual_nights(
            check_in,
            check_out,
            timing=timing,
            parallel=parallel,
        )

        wall_clock_ms = int((time.perf_counter() - wall_clock_start) * 1000)

        if result is None:
            print("\nScrape failed - no results returned")
            return

        print("\n" + "=" * 60)
        print("RESULTS")
        print("=" * 60)
        print(f"Hotels found: {len(result.hotels)}")
        print(f"Room-night records: {len(result.nights)}")

        # Count unique hotel+room combinations
        unique_rooms = set((n.hotel_id, n.room_type) for n in result.nights)
        print(f"Unique room types: {len(unique_rooms)}")

        # Count rooms with availability
        rooms_with_avail = sum(1 for n in result.nights if n.available_count > 0)
        print(f"Room-nights with availability: {rooms_with_avail}")

        print("\n" + "=" * 60)
        print("TIMING BREAKDOWN")
        print("=" * 60)
        print(timing.log_summary())

        # Per-night breakdown
        print("\n" + "-" * 60)
        print("Per-night HTTP timing:")
        print("-" * 60)
        for nt in timing.nights:
            print(f"  {nt.night_date}: submit={nt.submit_ms}ms, fetch={nt.fetch_ms}ms, total={nt.total_ms}ms")

        # Summary stats
        print("\n" + "-" * 60)
        print("Summary:")
        print("-" * 60)
        print(f"  Wall-clock time: {wall_clock_ms}ms")
        print(f"  Session init: {timing.session_init_ms}ms")
        print(f"  Sum of HTTP times: {timing.total_http_ms}ms")

        if timing.nights:
            avg_night = sum(n.total_ms for n in timing.nights) / len(timing.nights)
            print(f"  Average per night: {avg_night:.0f}ms")

        # Rate limit state
        print("\n" + "-" * 60)
        print("Rate Limit State:")
        print("-" * 60)
        state = client._rate_limit_state
        print(f"  Consecutive 429s: {state.consecutive_429s}")
        print(f"  Delay multiplier: {state.delay_multiplier}")
        print(f"  Cautious mode: {state.cautious_mode}")
        print(f"  Current delay: {state.get_delay():.2f}s")

        if parallel:
            print("\n" + "=" * 60)
            print("PARALLEL MODE BENEFITS")
            print("=" * 60)
            # Estimate what sequential would have taken
            sequential_estimate = timing.session_init_ms + timing.total_http_ms + (len(timing.nights) * 500)  # 0.5s delays
            savings = sequential_estimate - wall_clock_ms
            print(f"  Estimated sequential time: {sequential_estimate}ms")
            print(f"  Actual parallel time: {wall_clock_ms}ms")
            print(f"  Time saved: {savings}ms ({100 * savings / sequential_estimate:.1f}%)")

    except Exception as e:
        logger.exception(f"Test scrape failed: {e}")
        print(f"\nPartial timing before error:")
        print(timing.log_summary())

    finally:
        await client.close()


async def compare_modes():
    """Run both sequential and parallel modes and compare."""
    print("\n" + "=" * 60)
    print("COMPARING SEQUENTIAL vs PARALLEL MODES")
    print("=" * 60)

    # Sequential first
    print("\n>>> Running SEQUENTIAL mode...")
    await test_scrape(parallel=False)

    # Wait a bit between tests
    print("\n\nWaiting 5 seconds before parallel test...\n")
    await asyncio.sleep(5)

    # Parallel second
    print("\n>>> Running PARALLEL mode...")
    await test_scrape(parallel=True, max_concurrent=2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test scraper timing")
    parser.add_argument("--sequential", "-s", action="store_true", help="Use sequential mode")
    parser.add_argument("--compare", "-c", action="store_true", help="Compare both modes")
    parser.add_argument("--concurrent", "-n", type=int, default=2, help="Max concurrent requests (default: 2)")

    args = parser.parse_args()

    if args.compare:
        asyncio.run(compare_modes())
    else:
        asyncio.run(test_scrape(parallel=not args.sequential, max_concurrent=args.concurrent))
