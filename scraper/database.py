"""Database operations for the scraper using Supabase REST API."""

import json
import logging
import time
from datetime import datetime, timedelta
from typing import Optional

import httpx

from models import (
    ScrapeResult,
    MultiNightScrapeResult,
    ScrapeRunCreate,
    ScrapeRunUpdate,
    RoomSnapshotCreate,
    HotelUpsert,
    ScrapeTiming,
)

logger = logging.getLogger(__name__)


class Database:
    """Database operations using Supabase REST API directly."""

    def __init__(self, url: str, service_role_key: str):
        self.url = url  # Store full URL for edge function calls
        self.service_role_key = service_role_key
        self.base_url = f"{url}/rest/v1"
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        self.client = httpx.Client(headers=self.headers, timeout=30.0)

    def _get(self, table: str, params: dict = None) -> list:
        """GET request to Supabase."""
        url = f"{self.base_url}/{table}"
        response = self.client.get(url, params=params or {})
        response.raise_for_status()
        return response.json()

    def _post(self, table: str, data: dict) -> list:
        """POST (insert) request to Supabase."""
        url = f"{self.base_url}/{table}"
        response = self.client.post(url, json=data)
        response.raise_for_status()
        return response.json()

    def _post_batch(self, table: str, data: list[dict]) -> list:
        """POST (bulk insert) request to Supabase. Accepts array of records."""
        if not data:
            return []
        url = f"{self.base_url}/{table}"
        response = self.client.post(url, json=data)
        response.raise_for_status()
        return response.json()

    def _patch(self, table: str, data: dict, params: dict) -> list:
        """PATCH (update) request to Supabase."""
        url = f"{self.base_url}/{table}"
        response = self.client.patch(url, json=data, params=params)
        response.raise_for_status()
        return response.json()

    def get_all_hotel_ids(self, year: int) -> dict[int, str]:
        """
        Get all hotel IDs for a year in a single query.
        Returns dict mapping passkey_hotel_id -> database UUID.
        """
        result = self._get("hotels", {
            "year": f"eq.{year}",
            "select": "id,passkey_hotel_id,name",
        })

        hotel_map = {}
        for h in result:
            if h["passkey_hotel_id"] and h["passkey_hotel_id"] > 0:
                hotel_map[h["passkey_hotel_id"]] = h["id"]
            # Also map by name for fallback (hotels with placeholder IDs)
            hotel_map[f"name:{h['name']}"] = h["id"]

        return hotel_map

    def ensure_hotels_exist(self, hotels: list[HotelUpsert], hotel_cache: dict[int, str]) -> dict[int, str]:
        """
        Ensure all hotels exist in database, using cached IDs where possible.
        Only inserts truly new hotels. Returns updated hotel_id map.

        Args:
            hotels: List of HotelUpsert objects from scrape
            hotel_cache: Existing cache from get_all_hotel_ids()

        Returns:
            Dict mapping passkey_hotel_id -> database UUID
        """
        result_map = {}
        hotels_to_insert = []

        for hotel in hotels:
            # Check cache by passkey_id first
            if hotel.passkey_hotel_id > 0 and hotel.passkey_hotel_id in hotel_cache:
                result_map[hotel.passkey_hotel_id] = hotel_cache[hotel.passkey_hotel_id]
                continue

            # Check cache by name (for placeholder IDs)
            name_key = f"name:{hotel.name}"
            if name_key in hotel_cache:
                result_map[hotel.passkey_hotel_id] = hotel_cache[name_key]
                continue

            # Truly new hotel - queue for insert
            hotels_to_insert.append(hotel)

        # Batch insert new hotels
        if hotels_to_insert:
            logger.info(f"Inserting {len(hotels_to_insert)} new hotels")
            insert_data = [{
                "passkey_hotel_id": h.passkey_hotel_id,
                "name": h.name,
                "distance_from_icc": h.distance_from_icc,
                "distance_unit": h.distance_unit,
                "has_skywalk": h.has_skywalk,
                "year": h.year,
            } for h in hotels_to_insert]

            try:
                inserted = self._post_batch("hotels", insert_data)
                for i, h in enumerate(hotels_to_insert):
                    result_map[h.passkey_hotel_id] = inserted[i]["id"]
            except Exception as e:
                # Fallback to individual inserts on conflict
                logger.warning(f"Batch insert failed ({e}), using individual inserts")
                for h in hotels_to_insert:
                    hotel_id = self.upsert_hotel_simple(h)
                    result_map[h.passkey_hotel_id] = hotel_id

        return result_map

    def upsert_hotel_simple(self, data: HotelUpsert) -> str:
        """Simple hotel upsert without update - just ensure it exists."""
        # Check by passkey_id
        if data.passkey_hotel_id > 0:
            existing = self._get("hotels", {
                "passkey_hotel_id": f"eq.{data.passkey_hotel_id}",
                "year": f"eq.{data.year}",
                "select": "id",
            })
            if existing:
                return existing[0]["id"]

        # Check by name
        existing = self._get("hotels", {
            "name": f"eq.{data.name}",
            "year": f"eq.{data.year}",
            "select": "id",
        })
        if existing:
            return existing[0]["id"]

        # Insert new
        result = self._post("hotels", {
            "passkey_hotel_id": data.passkey_hotel_id,
            "name": data.name,
            "distance_from_icc": data.distance_from_icc,
            "distance_unit": data.distance_unit,
            "has_skywalk": data.has_skywalk,
            "year": data.year,
        })
        return result[0]["id"]

    async def trigger_notifications(self, snapshot_id: str, snapshot_data: dict):
        """
        Call the match-watchers edge function to trigger notifications for a new snapshot.
        Only called when available_count > 0.
        """
        try:
            url = f"{self.url}/functions/v1/match-watchers"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.service_role_key}",
            }
            payload = {
                "type": "INSERT",
                "table": "room_snapshots",
                "record": {
                    "id": snapshot_id,
                    "hotel_id": snapshot_data["hotel_id"],
                    "room_type": snapshot_data["room_type"],
                    "available_count": snapshot_data["available_count"],
                    "nightly_rate": snapshot_data["nightly_rate"],
                    "total_price": snapshot_data["total_price"],
                    "check_in": snapshot_data["check_in"],
                    "check_out": snapshot_data["check_out"],
                    "year": snapshot_data["year"],
                }
            }
            response = self.client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Notifications triggered for snapshot {snapshot_id}: {result.get('message', 'OK')}")
            else:
                logger.warning(f"Failed to trigger notifications: {response.status_code} - {response.text}")
        except Exception as e:
            logger.error(f"Error triggering notifications for snapshot {snapshot_id}: {e}")

    async def get_config(self, key: str) -> Optional[str]:
        """Get a configuration value."""
        result = self._get("app_config", {"key": f"eq.{key}", "select": "value"})
        if result:
            return result[0].get("value")
        return None

    async def is_scraper_active(self) -> bool:
        """Check if the scraper is enabled."""
        value = await self.get_config("scraper_active")
        return value == "true" or value is True

    async def create_scrape_run(self, data: ScrapeRunCreate) -> str:
        """Create a new scrape run record and return its ID."""
        result = self._post("scrape_runs", {
            "check_in": data.check_in.isoformat(),
            "check_out": data.check_out.isoformat(),
            "year": data.year,
            "status": "running",
        })
        return result[0]["id"]

    async def update_scrape_run(self, run_id: str, data: ScrapeRunUpdate):
        """Update a scrape run record."""
        update_data = {
            "completed_at": data.completed_at.isoformat(),
            "status": data.status,
            "hotels_found": data.hotels_found,
            "rooms_found": data.rooms_found,
            "duration_ms": data.duration_ms,
            "no_changes": data.no_changes,
        }
        if data.error_message:
            update_data["error_message"] = data.error_message

        self._patch("scrape_runs", update_data, {"id": f"eq.{run_id}"})

    async def upsert_hotel(self, data: HotelUpsert) -> str:
        """Upsert a hotel record and return its ID."""
        # First, check if a hotel with this passkey_id already exists (most reliable)
        if data.passkey_hotel_id > 0:
            existing_by_passkey = self._get("hotels", {
                "passkey_hotel_id": f"eq.{data.passkey_hotel_id}",
                "year": f"eq.{data.year}",
                "select": "id",
            })
            if existing_by_passkey:
                hotel_id = existing_by_passkey[0]["id"]
                # Update with latest distance info
                update_data = {
                    "distance_from_icc": data.distance_from_icc,
                    "distance_unit": data.distance_unit,
                    "updated_at": datetime.utcnow().isoformat(),
                }
                self._patch("hotels", update_data, {"id": f"eq.{hotel_id}"})
                return hotel_id

        # Fall back to name-based lookup for hotels with placeholder passkey_ids
        existing = self._get("hotels", {
            "name": f"eq.{data.name}",
            "year": f"eq.{data.year}",
            "select": "id,passkey_hotel_id",
        })

        if existing:
            hotel_id = existing[0]["id"]
            # Update existing - but DON'T try to update passkey_hotel_id
            # to avoid conflicts with hotels that already have the real ID
            # Note: Don't overwrite has_skywalk - it's manually set from Gen Con's hotel map
            update_data = {
                "distance_from_icc": data.distance_from_icc,
                "distance_unit": data.distance_unit,
                "updated_at": datetime.utcnow().isoformat(),
            }
            self._patch("hotels", update_data, {"id": f"eq.{hotel_id}"})
            return hotel_id
        else:
            # Insert new
            result = self._post("hotels", {
                "passkey_hotel_id": data.passkey_hotel_id,
                "name": data.name,
                "distance_from_icc": data.distance_from_icc,
                "distance_unit": data.distance_unit,
                "has_skywalk": data.has_skywalk,
                "year": data.year,
            })
            return result[0]["id"]

    async def get_hotel_id_by_passkey_id(self, passkey_id: int, year: int) -> Optional[str]:
        """Get a hotel's UUID by its Passkey ID."""
        result = self._get("hotels", {
            "passkey_hotel_id": f"eq.{passkey_id}",
            "year": f"eq.{year}",
            "select": "id",
        })
        if result:
            return result[0]["id"]
        return None

    async def create_room_snapshot(self, data: RoomSnapshotCreate) -> Optional[str]:
        """Create a room snapshot record and trigger notifications if available."""
        insert_data = {
            "scrape_run_id": data.scrape_run_id,
            "hotel_id": data.hotel_id,
            "room_type": data.room_type,
            "available_count": data.available_count,
            "nightly_rate": float(data.nightly_rate),
            "total_price": float(data.total_price),
            "check_in": data.check_in.isoformat(),
            "check_out": data.check_out.isoformat(),
            "year": data.year,
        }
        if data.room_description:
            insert_data["room_description"] = data.room_description
        if data.raw_block_data:
            insert_data["raw_block_data"] = data.raw_block_data

        result = self._post("room_snapshots", insert_data)
        snapshot_id = result[0]["id"] if result else None

        # Trigger notifications if there's availability (full or partial)
        has_availability = data.available_count > 0
        has_partial = (
            data.raw_block_data
            and data.raw_block_data.get("partial_availability")
            and data.raw_block_data.get("nights_available", 0) > 0
        )

        if snapshot_id and (has_availability or has_partial):
            await self.trigger_notifications(snapshot_id, {
                "hotel_id": data.hotel_id,
                "room_type": data.room_type,
                "available_count": data.available_count,
                "nightly_rate": float(data.nightly_rate),
                "total_price": float(data.total_price),
                "check_in": data.check_in.isoformat(),
                "check_out": data.check_out.isoformat(),
                "year": data.year,
            })

        return snapshot_id

    def _snapshot_to_dict(self, data: RoomSnapshotCreate) -> dict:
        """Convert a RoomSnapshotCreate to a dict for database insert."""
        insert_data = {
            "scrape_run_id": data.scrape_run_id,
            "hotel_id": data.hotel_id,
            "room_type": data.room_type,
            "available_count": data.available_count,
            "nightly_rate": float(data.nightly_rate),
            "total_price": float(data.total_price),
            "check_in": data.check_in.isoformat(),
            "check_out": data.check_out.isoformat(),
            "year": data.year,
        }
        if data.room_description:
            insert_data["room_description"] = data.room_description
        if data.raw_block_data:
            insert_data["raw_block_data"] = data.raw_block_data
        return insert_data

    async def create_room_snapshots_batch(self, snapshots: list[RoomSnapshotCreate]) -> list[str]:
        """
        Batch insert room snapshots in a single POST request.
        Returns list of snapshot IDs in the same order as input.

        Note: This does NOT trigger notifications - caller must handle that separately.
        """
        if not snapshots:
            return []

        try:
            insert_data = [self._snapshot_to_dict(s) for s in snapshots]
            result = self._post_batch("room_snapshots", insert_data)
            return [r["id"] for r in result]
        except Exception as e:
            logger.warning(f"Batch insert failed ({e}), falling back to individual inserts")
            # Fallback to individual inserts (without triggering notifications here)
            ids = []
            for snapshot in snapshots:
                try:
                    result = self._post("room_snapshots", self._snapshot_to_dict(snapshot))
                    ids.append(result[0]["id"] if result else None)
                except Exception as inner_e:
                    logger.error(f"Individual insert failed: {inner_e}")
                    ids.append(None)
            return ids

    async def trigger_notifications_batch(
        self,
        notifications: list[tuple[str, dict]],  # List of (snapshot_id, snapshot_data)
        max_concurrent: int = 5,
    ):
        """
        Trigger notifications for multiple snapshots in parallel with controlled concurrency.

        Args:
            notifications: List of (snapshot_id, snapshot_data) tuples
            max_concurrent: Maximum concurrent notification calls (default 5)
        """
        import asyncio

        if not notifications:
            return

        semaphore = asyncio.Semaphore(max_concurrent)

        async def notify_one(snapshot_id: str, snapshot_data: dict):
            async with semaphore:
                await self.trigger_notifications(snapshot_id, snapshot_data)

        tasks = [notify_one(sid, data) for sid, data in notifications if sid]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def get_last_scrape_hash(self, year: int) -> Optional[str]:
        """Get a hash of the last successful scrape's data for deduplication."""
        result = self._get("scrape_runs", {
            "status": "eq.success",
            "year": f"eq.{year}",
            "no_changes": "eq.false",
            "select": "id",
            "order": "completed_at.desc",
            "limit": "1",
        })

        if not result:
            return None

        scrape_id = result[0]["id"]

        snapshots = self._get("room_snapshots", {
            "scrape_run_id": f"eq.{scrape_id}",
            "select": "hotel_id,room_type,available_count",
            "order": "hotel_id,room_type",
        })

        if not snapshots:
            return None

        parts = []
        for s in snapshots:
            parts.append(f"{s['hotel_id']}:{s['room_type']}:{s['available_count']}")

        return "|".join(parts)

    async def get_last_scrape_status(self) -> Optional[dict]:
        """Get the status of the last scrape run."""
        result = self._get("scrape_runs", {
            "select": "*",
            "order": "started_at.desc",
            "limit": "1",
        })
        if result:
            return result[0]
        return None

    async def get_scrapes_last_hour(self) -> int:
        """Count scrapes in the last hour."""
        one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat()

        # Use HEAD request with Prefer: count=exact
        url = f"{self.base_url}/scrape_runs"
        headers = {**self.headers, "Prefer": "count=exact"}
        response = self.client.head(url, params={
            "started_at": f"gte.{one_hour_ago}",
        }, headers=headers)

        count = response.headers.get("content-range", "").split("/")[-1]
        return int(count) if count and count != "*" else 0

    async def get_error_rate_last_hour(self) -> float:
        """Get the error rate for scrapes in the last hour."""
        one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat()

        total = await self.get_scrapes_last_hour()
        if total == 0:
            return 0.0

        # Count errors
        url = f"{self.base_url}/scrape_runs"
        headers = {**self.headers, "Prefer": "count=exact"}
        response = self.client.head(url, params={
            "started_at": f"gte.{one_hour_ago}",
            "status": "eq.error",
        }, headers=headers)

        count = response.headers.get("content-range", "").split("/")[-1]
        error_count = int(count) if count and count != "*" else 0

        return error_count / total

    async def get_latest_room_keys(self, year: int) -> dict[tuple[str, str], dict]:
        """
        Get all (hotel_id, room_type) combinations from the latest successful scrape.
        Returns a dict mapping (hotel_id, room_type) -> snapshot data including availability.
        """
        # Get the latest successful scrape with changes
        result = self._get("scrape_runs", {
            "status": "eq.success",
            "year": f"eq.{year}",
            "no_changes": "eq.false",
            "select": "id",
            "order": "completed_at.desc",
            "limit": "1",
        })

        if not result:
            return {}

        scrape_id = result[0]["id"]

        # Get all snapshots from that scrape (include available_count for change detection)
        snapshots = self._get("room_snapshots", {
            "scrape_run_id": f"eq.{scrape_id}",
            "select": "hotel_id,room_type,check_in,check_out,nightly_rate,available_count,raw_block_data",
        })

        room_keys = {}
        for s in snapshots:
            key = (s["hotel_id"], s["room_type"])
            room_keys[key] = {
                "check_in": s["check_in"],
                "check_out": s["check_out"],
                "nightly_rate": s["nightly_rate"],
                "available_count": s.get("available_count", 0),
                "raw_block_data": s.get("raw_block_data", {}),
            }

        return room_keys


async def process_scrape_result(
    db: Database,
    result: ScrapeResult,
    scrape_run_id: str,
    year: int,
) -> tuple[int, int]:
    """Process a scrape result and store it in the database."""
    hotels_found = 0
    rooms_found = 0

    for hotel in result.hotels:
        hotel_id = await db.upsert_hotel(HotelUpsert(
            passkey_hotel_id=hotel.id,
            name=hotel.name,
            distance_from_icc=hotel.distance_from_event,
            distance_unit=hotel.distance_unit,
            has_skywalk=hotel.has_skywalk,
            year=year,
        ))

        hotels_found += 1

        for block in hotel.blocks:
            await db.create_room_snapshot(RoomSnapshotCreate(
                scrape_run_id=scrape_run_id,
                hotel_id=hotel_id,
                room_type=block.name,
                available_count=block.min_available,
                nightly_rate=block.nightly_rate,
                total_price=block.total_price,
                check_in=result.check_in,
                check_out=result.check_out,
                year=year,
                raw_block_data={
                    "inventory": [
                        {"date": inv.date, "rate": inv.rate, "available": inv.available}
                        for inv in block.inventory
                    ]
                },
            ))
            rooms_found += 1

    return hotels_found, rooms_found


def compute_result_hash(result: ScrapeResult, hotel_ids: dict[int, str]) -> str:
    """Compute a hash string for deduplication."""
    parts = []
    for hotel in sorted(result.hotels, key=lambda h: h.id):
        hotel_id = hotel_ids.get(hotel.id, str(hotel.id))
        for block in sorted(hotel.blocks, key=lambda b: b.name):
            parts.append(f"{hotel_id}:{block.name}:{block.min_available}")
    return "|".join(parts)


async def process_multi_night_result(
    db: Database,
    result: MultiNightScrapeResult,
    scrape_run_id: str,
    year: int,
    timing: Optional[ScrapeTiming] = None,
    hotel_cache: Optional[dict[int, str]] = None,
) -> tuple[int, int]:
    """
    Process a multi-night scrape result and store it in the database.

    Creates room snapshots comparing against the FULL requested date range.
    Also marks previously-available rooms as sold out if they're no longer in results.

    If timing is provided, populates it with detailed timing metrics.
    If hotel_cache is provided, uses it instead of individual lookups.
    """
    from datetime import timedelta

    hotels_processed = set()
    rooms_found = 0
    processed_room_keys = set()  # Track (db_hotel_id, room_type) we've processed

    # Calculate the total nights in the requested range
    total_nights_in_range = (result.check_out - result.check_in).days

    # Get previously available room keys to detect sold-out rooms (with timing)
    prev_keys_start = time.perf_counter()
    previous_room_keys = await db.get_latest_room_keys(year)
    if timing:
        timing.get_previous_keys_ms = int((time.perf_counter() - prev_keys_start) * 1000)

    # Ensure all hotels exist in database (optimized with cache)
    upsert_hotels_start = time.perf_counter()

    hotel_upserts = [HotelUpsert(
        passkey_hotel_id=hotel.id,
        name=hotel.name,
        distance_from_icc=hotel.distance_from_event,
        distance_unit=hotel.distance_unit,
        has_skywalk=hotel.has_skywalk,
        year=year,
    ) for hotel in result.hotels]

    if hotel_cache:
        # Use optimized batch method with cache
        hotel_id_map = db.ensure_hotels_exist(hotel_upserts, hotel_cache)
    else:
        # Fallback to individual upserts (slower)
        hotel_id_map = {}
        for hotel in result.hotels:
            hotel_id = await db.upsert_hotel(HotelUpsert(
                passkey_hotel_id=hotel.id,
                name=hotel.name,
                distance_from_icc=hotel.distance_from_event,
                distance_unit=hotel.distance_unit,
                has_skywalk=hotel.has_skywalk,
                year=year,
            ))
            hotel_id_map[hotel.id] = hotel_id

    hotels_processed = set(hotel_id_map.keys())
    if timing:
        timing.upsert_hotels_ms = int((time.perf_counter() - upsert_hotels_start) * 1000)

    # Group nights by hotel+room to create aggregate snapshots
    availability_map: dict[tuple, list] = {}  # (hotel_id, room_type) -> list of night data

    for night in result.nights:
        key = (night.hotel_id, night.room_type)
        if key not in availability_map:
            availability_map[key] = {
                "hotel_name": night.hotel_name,
                "nights": [],
            }
        availability_map[key]["nights"].append({
            "date": night.night_date.isoformat(),
            "available": night.available_count,
            "rate": night.nightly_rate,
        })

    # PHASE 1: Collect all snapshots to insert (don't insert yet)
    snapshots_to_insert: list[RoomSnapshotCreate] = []
    notification_indices: list[int] = []  # Indices of snapshots that need notifications

    for (passkey_hotel_id, room_type), data in availability_map.items():
        db_hotel_id = hotel_id_map.get(passkey_hotel_id)
        if not db_hotel_id:
            logger.warning(f"No hotel ID found for passkey_id {passkey_hotel_id}")
            continue

        nights = data["nights"]
        if not nights:
            continue

        # Passkey returns very large numbers (9999, 10000) as placeholders
        # when there's no real availability data. Treat these as "not available".
        MAX_REASONABLE_AVAILABILITY = 500

        def is_valid_availability(avail: int) -> bool:
            return 0 < avail < MAX_REASONABLE_AVAILABILITY

        # Count nights with VALID availability (not placeholder values)
        nights_available = sum(1 for n in nights if is_valid_availability(n["available"]))

        # Partial availability = has some nights but not all requested nights
        # (and at least one night with valid availability)
        is_partial = nights_available < total_nights_in_range and nights_available > 0

        # For full availability, min_available must be valid for ALL nights in range
        # Since we only have data for nights that had rooms, if nights_available < total_nights_in_range,
        # then full-stay availability is 0
        if nights_available < total_nights_in_range:
            full_stay_available = 0
        else:
            # Only consider valid availability values when calculating min
            valid_nights = [n["available"] for n in nights if is_valid_availability(n["available"])]
            full_stay_available = min(valid_nights) if valid_nights else 0

        # Calculate rates based on nights we have data for
        total_rate = sum(n["rate"] for n in nights)
        avg_nightly_rate = total_rate / len(nights) if nights else 0

        snapshot = RoomSnapshotCreate(
            scrape_run_id=scrape_run_id,
            hotel_id=db_hotel_id,
            room_type=room_type,
            available_count=full_stay_available,
            nightly_rate=avg_nightly_rate,
            total_price=avg_nightly_rate * total_nights_in_range,  # Estimate for full stay
            check_in=result.check_in,  # Use the FULL requested range
            check_out=result.check_out,
            year=year,
            raw_block_data={
                "nights": nights,
                "partial_availability": is_partial,
                "nights_available": nights_available,
                "total_nights": total_nights_in_range,
            },
        )
        snapshots_to_insert.append(snapshot)

        # Check if availability has CHANGED from previous scrape
        prev_data = previous_room_keys.get((db_hotel_id, room_type))
        prev_available = prev_data.get("available_count", 0) if prev_data else 0
        prev_nights = prev_data.get("raw_block_data", {}).get("nights_available", 0) if prev_data else 0

        # Only notify if:
        # 1. New availability appeared (was 0, now > 0)
        # 2. Or partial availability changed (different nights available)
        availability_changed = (
            (prev_available == 0 and full_stay_available > 0) or  # Newly available
            (prev_nights == 0 and nights_available > 0) or  # Newly partial
            (prev_nights != nights_available and nights_available > 0)  # Different partial nights
        )

        if availability_changed:
            notification_indices.append(len(snapshots_to_insert) - 1)

        rooms_found += 1
        processed_room_keys.add((db_hotel_id, room_type))

    # Add "sold out" snapshots for rooms that were previously available but not in current results
    sold_out_count = 0
    for (prev_hotel_id, prev_room_type), prev_data in previous_room_keys.items():
        if (prev_hotel_id, prev_room_type) not in processed_room_keys:
            # This room was available before but not in current scrape - mark as sold out
            snapshot = RoomSnapshotCreate(
                scrape_run_id=scrape_run_id,
                hotel_id=prev_hotel_id,
                room_type=prev_room_type,
                available_count=0,
                nightly_rate=prev_data.get("nightly_rate", 0),
                total_price=prev_data.get("nightly_rate", 0) * total_nights_in_range,
                check_in=result.check_in,
                check_out=result.check_out,
                year=year,
                raw_block_data={
                    "nights": [],
                    "partial_availability": False,
                    "nights_available": 0,
                    "total_nights": total_nights_in_range,
                    "sold_out": True,
                },
            )
            snapshots_to_insert.append(snapshot)
            sold_out_count += 1
            logger.info(f"Marked {prev_room_type} at hotel {prev_hotel_id} as sold out")

    if sold_out_count > 0:
        logger.info(f"Marked {sold_out_count} room types as sold out")

    # PHASE 2: Batch insert all snapshots at once (with timing)
    create_snapshots_start = time.perf_counter()
    snapshot_ids = await db.create_room_snapshots_batch(snapshots_to_insert)

    if timing:
        timing.create_snapshots_ms = int((time.perf_counter() - create_snapshots_start) * 1000)

    logger.info(f"Batch inserted {len(snapshot_ids)} snapshots in {timing.create_snapshots_ms if timing else 'N/A'}ms")

    # PHASE 3: Batch trigger notifications for snapshots with availability
    notify_start = time.perf_counter()
    notifications_to_send = []
    for idx in notification_indices:
        snapshot_id = snapshot_ids[idx] if idx < len(snapshot_ids) else None
        if snapshot_id:
            snapshot = snapshots_to_insert[idx]
            notifications_to_send.append((snapshot_id, {
                "hotel_id": snapshot.hotel_id,
                "room_type": snapshot.room_type,
                "available_count": snapshot.available_count,
                "nightly_rate": float(snapshot.nightly_rate),
                "total_price": float(snapshot.total_price),
                "check_in": snapshot.check_in.isoformat(),
                "check_out": snapshot.check_out.isoformat(),
                "year": snapshot.year,
            }))

    if notifications_to_send:
        await db.trigger_notifications_batch(notifications_to_send, max_concurrent=5)

    if timing:
        timing.trigger_notifications_ms = int((time.perf_counter() - notify_start) * 1000)
        logger.info(
            f"DB timing: prev_keys={timing.get_previous_keys_ms}ms, "
            f"upsert_hotels={timing.upsert_hotels_ms}ms, "
            f"create_snapshots={timing.create_snapshots_ms}ms, "
            f"notifications={timing.trigger_notifications_ms}ms ({len(notifications_to_send)} sent)"
        )

    return len(hotels_processed), rooms_found


def compute_multi_night_hash(result: MultiNightScrapeResult, hotel_ids: dict[int, str]) -> str:
    """Compute a hash string for multi-night results deduplication."""
    parts = []
    # Sort nights for consistent hashing
    for night in sorted(result.nights, key=lambda n: (n.hotel_id, n.room_type, n.night_date)):
        hotel_id = hotel_ids.get(night.hotel_id, str(night.hotel_id))
        parts.append(f"{hotel_id}:{night.room_type}:{night.night_date}:{night.available_count}")
    return "|".join(parts)
