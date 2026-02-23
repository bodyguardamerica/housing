"""Database operations for the scraper using Supabase REST API."""

import json
import logging
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

    def _patch(self, table: str, data: dict, params: dict) -> list:
        """PATCH (update) request to Supabase."""
        url = f"{self.base_url}/{table}"
        response = self.client.patch(url, json=data, params=params)
        response.raise_for_status()
        return response.json()

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
        # First try to find existing hotel by name and year (more reliable than passkey_id)
        existing = self._get("hotels", {
            "name": f"eq.{data.name}",
            "year": f"eq.{data.year}",
            "select": "id,passkey_hotel_id",
        })

        if existing:
            hotel_id = existing[0]["id"]
            # Update existing with real passkey_hotel_id if we have a positive one
            # Note: Don't overwrite has_skywalk - it's manually set from Gen Con's hotel map
            update_data = {
                "distance_from_icc": data.distance_from_icc,
                "distance_unit": data.distance_unit,
                "updated_at": datetime.utcnow().isoformat(),
            }
            # Update passkey_hotel_id if the current one is a placeholder (negative)
            if existing[0]["passkey_hotel_id"] < 0 and data.passkey_hotel_id > 0:
                update_data["passkey_hotel_id"] = data.passkey_hotel_id

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
        Returns a dict mapping (hotel_id, room_type) -> snapshot data.
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

        # Get all snapshots from that scrape
        snapshots = self._get("room_snapshots", {
            "scrape_run_id": f"eq.{scrape_id}",
            "select": "hotel_id,room_type,check_in,check_out,nightly_rate,raw_block_data",
        })

        room_keys = {}
        for s in snapshots:
            key = (s["hotel_id"], s["room_type"])
            room_keys[key] = {
                "check_in": s["check_in"],
                "check_out": s["check_out"],
                "nightly_rate": s["nightly_rate"],
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
) -> tuple[int, int]:
    """
    Process a multi-night scrape result and store it in the database.

    Creates room snapshots comparing against the FULL requested date range.
    Also marks previously-available rooms as sold out if they're no longer in results.
    """
    from datetime import timedelta

    hotels_processed = set()
    rooms_found = 0
    processed_room_keys = set()  # Track (db_hotel_id, room_type) we've processed

    # Calculate the total nights in the requested range
    total_nights_in_range = (result.check_out - result.check_in).days

    # Get previously available room keys to detect sold-out rooms
    previous_room_keys = await db.get_latest_room_keys(year)

    # First, upsert all hotels to ensure we have their IDs
    hotel_id_map: dict[int, str] = {}  # passkey_id -> db UUID
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
        hotels_processed.add(hotel.id)

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

    # Create room snapshots for each hotel+room combination
    for (passkey_hotel_id, room_type), data in availability_map.items():
        db_hotel_id = hotel_id_map.get(passkey_hotel_id)
        if not db_hotel_id:
            logger.warning(f"No hotel ID found for passkey_id {passkey_hotel_id}")
            continue

        nights = data["nights"]
        if not nights:
            continue

        # Count nights with availability
        nights_available = sum(1 for n in nights if n["available"] > 0)

        # Partial availability = has some nights but not all requested nights
        # (and at least one night with availability)
        is_partial = nights_available < total_nights_in_range and nights_available > 0

        # For full availability, min_available must be > 0 for ALL nights in range
        # Since we only have data for nights that had rooms, if nights_available < total_nights_in_range,
        # then full-stay availability is 0
        if nights_available < total_nights_in_range:
            full_stay_available = 0
        else:
            full_stay_available = min(n["available"] for n in nights)

        # Calculate rates based on nights we have data for
        total_rate = sum(n["rate"] for n in nights)
        avg_nightly_rate = total_rate / len(nights) if nights else 0

        await db.create_room_snapshot(RoomSnapshotCreate(
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
        ))
        rooms_found += 1
        processed_room_keys.add((db_hotel_id, room_type))

    # Create "sold out" snapshots for rooms that were previously available but not in current results
    sold_out_count = 0
    for (prev_hotel_id, prev_room_type), prev_data in previous_room_keys.items():
        if (prev_hotel_id, prev_room_type) not in processed_room_keys:
            # This room was available before but not in current scrape - mark as sold out
            await db.create_room_snapshot(RoomSnapshotCreate(
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
            ))
            sold_out_count += 1
            logger.info(f"Marked {prev_room_type} at hotel {prev_hotel_id} as sold out")

    if sold_out_count > 0:
        logger.info(f"Marked {sold_out_count} room types as sold out")

    return len(hotels_processed), rooms_found


def compute_multi_night_hash(result: MultiNightScrapeResult, hotel_ids: dict[int, str]) -> str:
    """Compute a hash string for multi-night results deduplication."""
    parts = []
    # Sort nights for consistent hashing
    for night in sorted(result.nights, key=lambda n: (n.hotel_id, n.room_type, n.night_date)):
        hotel_id = hotel_ids.get(night.hotel_id, str(night.hotel_id))
        parts.append(f"{hotel_id}:{night.room_type}:{night.night_date}:{night.available_count}")
    return "|".join(parts)
