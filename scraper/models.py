"""Pydantic models for the scraper."""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, field_validator


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
