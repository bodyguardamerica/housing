"""Configuration management for the scraper."""

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    """Application configuration loaded from environment variables."""

    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Passkey
    passkey_token_url: str
    passkey_event_id: str
    passkey_owner_id: str

    # Scraper settings
    scrape_interval_seconds: int
    default_check_in: str
    default_check_out: str
    current_year: int

    # API key for protected endpoints
    scraper_api_key: str

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        return cls(
            supabase_url=os.environ["SUPABASE_URL"],
            supabase_service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            passkey_token_url=os.environ["PASSKEY_TOKEN_URL"],
            passkey_event_id=os.environ.get("PASSKEY_EVENT_ID", "50910675"),
            passkey_owner_id=os.environ.get("PASSKEY_OWNER_ID", "10909638"),
            scrape_interval_seconds=int(os.environ.get("SCRAPE_INTERVAL_SECONDS", "60")),
            default_check_in=os.environ.get("DEFAULT_CHECK_IN", "2026-07-29"),
            default_check_out=os.environ.get("DEFAULT_CHECK_OUT", "2026-08-03"),
            current_year=int(os.environ.get("CURRENT_YEAR", "2026")),
            scraper_api_key=os.environ.get("SCRAPER_API_KEY", ""),
        )


config = Config.from_env() if os.environ.get("SUPABASE_URL") else None
