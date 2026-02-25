"""Pydantic models for the scraper."""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, field_validator


@dataclass
class NightTiming:
    """Timing data for a single night's scrape."""

    night_date: date
    submit_ms: int = 0
    fetch_ms: int = 0
    total_ms: int = 0


@dataclass
class ScrapeTiming:
    """Timing data for a complete scrape operation."""

    session_init_ms: int = 0
    nights: list[NightTiming] = field(default_factory=list)
    total_http_ms: int = 0
    total_delay_ms: int = 0

    # Database timing
    get_previous_keys_ms: int = 0
    upsert_hotels_ms: int = 0
    create_snapshots_ms: int = 0
    trigger_notifications_ms: int = 0
    hash_computation_ms: int = 0

    @property
    def total_db_ms(self) -> int:
        """Total time spent on database operations."""
        return (
            self.get_previous_keys_ms +
            self.upsert_hotels_ms +
            self.create_snapshots_ms +
            self.trigger_notifications_ms +
            self.hash_computation_ms
        )

    def to_dict(self) -> dict:
        """Convert to dictionary for logging/storage."""
        return {
            "session_init_ms": self.session_init_ms,
            "total_http_ms": self.total_http_ms,
            "total_delay_ms": self.total_delay_ms,
            "nights_count": len(self.nights),
            "avg_night_ms": sum(n.total_ms for n in self.nights) // len(self.nights) if self.nights else 0,
            "db": {
                "get_previous_keys_ms": self.get_previous_keys_ms,
                "upsert_hotels_ms": self.upsert_hotels_ms,
                "create_snapshots_ms": self.create_snapshots_ms,
                "trigger_notifications_ms": self.trigger_notifications_ms,
                "hash_computation_ms": self.hash_computation_ms,
                "total_db_ms": self.total_db_ms,
            }
        }

    def log_summary(self) -> str:
        """Generate a human-readable timing summary."""
        lines = [
            f"Scrape Timing Summary:",
            f"  Session init: {self.session_init_ms}ms",
            f"  HTTP requests: {self.total_http_ms}ms ({len(self.nights)} nights)",
            f"  Delays: {self.total_delay_ms}ms",
            f"  Database operations: {self.total_db_ms}ms",
            f"    - Previous keys: {self.get_previous_keys_ms}ms",
            f"    - Upsert hotels: {self.upsert_hotels_ms}ms",
            f"    - Create snapshots: {self.create_snapshots_ms}ms",
            f"    - Notifications: {self.trigger_notifications_ms}ms",
            f"    - Hash computation: {self.hash_computation_ms}ms",
        ]
        return "\n".join(lines)


class InventoryDay(BaseModel):
    """A single day's inventory for a room type."""

    date: str
    rate: float
    available: int

    @field_validator("date", mode="before")
    @classmethod
    def coerce_date(cls, v):
        """Convert list format [year, month, day] to ISO string."""
        if isinstance(v, list) and len(v) == 3:
            return f"{v[0]}-{v[1]:02d}-{v[2]:02d}"
        return v


class RoomBlock(BaseModel):
    """A room type/block within a hotel."""

    name: str
    inventory: list[InventoryDay]

    @property
    def min_available(self) -> int:
        """Minimum availability across all nights (true availability)."""
        if not self.inventory:
            return 0
        return min(inv.available for inv in self.inventory)

    @property
    def total_price(self) -> float:
        """Sum of all nightly rates."""
        return sum(inv.rate for inv in self.inventory)

    @property
    def nightly_rate(self) -> float:
        """First night's rate (typically representative)."""
        if not self.inventory:
            return 0.0
        return self.inventory[0].rate


class HotelResult(BaseModel):
    """A hotel from the Passkey search results."""

    id: int
    name: str
    distance_from_event: float = 0.0
    distance_unit: int = 1
    message_map: str = ""
    blocks: list[RoomBlock] = []

    @field_validator("message_map", mode="before")
    @classmethod
    def coerce_message_map(cls, v):
        """Convert None to empty string."""
        return v if v is not None else ""

    @property
    def has_skywalk(self) -> bool:
        """Check if hotel has skywalk access based on message map."""
        if not self.message_map:
            return False
        return "skywalk" in self.message_map.lower()


class ScrapeResult(BaseModel):
    """Result of a scrape operation."""

    hotels: list[HotelResult]
    check_in: date
    check_out: date
    scraped_at: datetime


class NightAvailability(BaseModel):
    """Availability for a specific hotel/room on a specific night."""

    hotel_id: int  # Passkey hotel ID
    hotel_name: str
    room_type: str
    night_date: date
    available_count: int
    nightly_rate: float


class MultiNightScrapeResult(BaseModel):
    """Result of scraping individual nights for partial availability."""

    hotels: list[HotelResult]  # All hotels seen (with their metadata)
    nights: list[NightAvailability]  # Per-night availability
    check_in: date  # Original full date range
    check_out: date
    scraped_at: datetime

    def get_availability_summary(self) -> dict:
        """
        Group availability by hotel and room type.
        Returns dict like:
        {
            (hotel_id, room_type): {
                "hotel_name": "...",
                "nights": [(date, count, rate), ...]
            }
        }
        """
        summary = {}
        for night in self.nights:
            key = (night.hotel_id, night.room_type)
            if key not in summary:
                summary[key] = {
                    "hotel_name": night.hotel_name,
                    "nights": [],
                }
            summary[key]["nights"].append((
                night.night_date,
                night.available_count,
                night.nightly_rate,
            ))
        return summary


class ScrapeRunCreate(BaseModel):
    """Data for creating a scrape run record."""

    check_in: date
    check_out: date
    year: int


class ScrapeRunUpdate(BaseModel):
    """Data for updating a scrape run record."""

    completed_at: datetime
    status: str
    error_message: Optional[str] = None
    hotels_found: int = 0
    rooms_found: int = 0
    duration_ms: int = 0
    no_changes: bool = False


class RoomSnapshotCreate(BaseModel):
    """Data for creating a room snapshot record."""

    scrape_run_id: str
    hotel_id: str
    room_type: str
    room_description: Optional[str] = None
    available_count: int
    nightly_rate: float
    total_price: float
    check_in: date
    check_out: date
    year: int
    raw_block_data: Optional[dict] = None


class HotelUpsert(BaseModel):
    """Data for upserting a hotel record."""

    passkey_hotel_id: int
    name: str
    distance_from_icc: float
    distance_unit: int
    has_skywalk: bool
    year: int
