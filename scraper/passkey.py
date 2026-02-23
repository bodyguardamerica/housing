"""Passkey API client for scraping hotel availability."""

import json
import re
import logging
from datetime import date, datetime
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from models import HotelResult, RoomBlock, InventoryDay, ScrapeResult, MultiNightScrapeResult, NightAvailability

logger = logging.getLogger(__name__)


class PasskeyClient:
    """Client for interacting with the Passkey housing portal."""

    BASE_URL = "https://book.passkey.com"

    def __init__(
        self,
        token_url: str,
        event_id: str,
        owner_id: str,
    ):
        self.token_url = token_url
        self.event_id = event_id
        self.owner_id = owner_id
        self._client: Optional[httpx.AsyncClient] = None
        self._csrf_token: Optional[str] = None

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
    ) -> bool:
        """Submit a search query to the Passkey portal."""
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

            # Check for redirect or error
            if response.status_code in (403, 401):
                logger.warning("Session expired, need to reinitialize")
                return False

            response.raise_for_status()
            return True

        except httpx.HTTPError as e:
            logger.error(f"Failed to submit search: {e}")
            return False

    async def fetch_results(self) -> Optional[list[HotelResult]]:
        """Fetch hotel results from the search results page."""
        client = await self._get_client()

        url = f"{self.BASE_URL}/event/{self.event_id}/owner/{self.owner_id}/list/hotels"

        try:
            logger.info("Fetching search results")
            response = await client.get(url)
            response.raise_for_status()

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
                                return self._parse_hotels(data)
                            except json.JSONDecodeError:
                                continue

                logger.warning("Could not find search results in page")
                return None

            try:
                data = json.loads(script_tag.string)
                return self._parse_hotels(data)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON: {e}")
                return None

        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch results: {e}")
            return None

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
                    name=block_data.get("name", "Unknown Room"),
                    inventory=inventory,
                ))

            hotels.append(HotelResult(
                id=hotel_data.get("id", 0),
                name=hotel_data.get("name", "Unknown Hotel"),
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
                # Initialize session if needed
                if self._csrf_token is None:
                    if not await self.initialize_session():
                        continue

                # Submit search
                if not await self.submit_search(check_in, check_out):
                    # Session might have expired, reinitialize
                    self._csrf_token = None
                    continue

                # Fetch results
                hotels = await self.fetch_results()
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
                    import asyncio
                    await asyncio.sleep(2 ** (attempt + 1))

        return None

    async def scrape_individual_nights(
        self,
        check_in: date,
        check_out: date,
        max_retries: int = 3,
    ) -> Optional[MultiNightScrapeResult]:
        """
        Scrape each individual night separately to find partial availability.

        For a 5-night stay (July 29 - Aug 3), this searches:
        - July 29-30
        - July 30-31
        - July 31-Aug 1
        - Aug 1-2
        - Aug 2-3

        Returns aggregated results showing which nights each hotel/room has availability.
        """
        from datetime import timedelta

        all_nights: list[NightAvailability] = []
        all_hotels: dict[int, HotelResult] = {}  # passkey_id -> hotel info

        # Generate individual night ranges
        current = check_in
        nights = []
        while current < check_out:
            next_day = current + timedelta(days=1)
            nights.append((current, next_day))
            current = next_day

        logger.info(f"Scraping {len(nights)} individual nights from {check_in} to {check_out}")

        # Initialize session once
        if self._csrf_token is None:
            if not await self.initialize_session():
                logger.error("Failed to initialize session for multi-night scrape")
                return None

        for night_check_in, night_check_out in nights:
            logger.info(f"Scraping night: {night_check_in} to {night_check_out}")

            for attempt in range(max_retries):
                try:
                    # Submit search for this single night
                    if not await self.submit_search(night_check_in, night_check_out):
                        # Session might have expired, reinitialize
                        self._csrf_token = None
                        if not await self.initialize_session():
                            continue
                        if not await self.submit_search(night_check_in, night_check_out):
                            continue

                    # Fetch results
                    hotels = await self.fetch_results()
                    if hotels is None:
                        continue

                    # Collect hotels with availability for this night
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
                            # Get availability count for this night
                            available = block.min_available if block.inventory else 0
                            rate = block.nightly_rate if block.inventory else 0.0

                            all_nights.append(NightAvailability(
                                hotel_id=hotel.id,
                                hotel_name=hotel.name,
                                room_type=block.name,
                                night_date=night_check_in,
                                available_count=available,
                                nightly_rate=rate,
                            ))

                    logger.info(f"Night {night_check_in}: {len(hotels)} hotels, {hotels_with_blocks} with blocks, {total_blocks} total blocks")

                    # Success for this night
                    break

                except Exception as e:
                    logger.error(f"Attempt {attempt + 1} failed for {night_check_in}: {e}")
                    if attempt < max_retries - 1:
                        import asyncio
                        await asyncio.sleep(2 ** (attempt + 1))

            # Small delay between nights to avoid rate limiting
            import asyncio
            await asyncio.sleep(0.5)

        if not all_nights:
            logger.warning("No availability found for any night")
            # Still return the hotel list even without availability
            return MultiNightScrapeResult(
                hotels=list(all_hotels.values()),
                nights=all_nights,
                check_in=check_in,
                check_out=check_out,
                scraped_at=datetime.utcnow(),
            )

        logger.info(f"Found {len(all_nights)} room-night availability records across {len(all_hotels)} hotels")

        return MultiNightScrapeResult(
            hotels=list(all_hotels.values()),
            nights=all_nights,
            check_in=check_in,
            check_out=check_out,
            scraped_at=datetime.utcnow(),
        )

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
