#!/usr/bin/env python3
"""
verify.py — Compare genconhotels.com availability against our Supabase DB.

Usage:
    python verify.py           # Full comparison report
    python verify.py --watch   # Re-run every 5 minutes
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

# Force UTF-8 output on Windows
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

import httpx

# ---------------------------------------------------------------------------
# Config — reads from environment or .env file if present
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "scraper/.env"))
except ImportError:
    pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qfrxhaiurggmqkmnkzpg.supabase.co")
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""),
)
if not SUPABASE_KEY:
    # Fall back to the anon key from frontend/.env.local
    SUPABASE_KEY = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
        ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmcnhoYWl1cmdnbXFrbW5renBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTA0NzYsImV4cCI6MjA4NzM2NjQ3Nn0"
        ".GnKSYTALImv-5kwi100ID-3ri-U3S3sRiRW7NBLvu2U"
    )

GENCON_DATA_URL = "https://genconhotels.com/data.json"
GENCON_TIMESTAMP_URL = "https://genconhotels.com/timestamp.txt"

NIGHT_DATES = {
    "wednesday": "2026-07-29",
    "thursday":  "2026-07-30",
    "friday":    "2026-07-31",
    "saturday":  "2026-08-01",
}


# ---------------------------------------------------------------------------
# Fetch genconhotels.com data
# ---------------------------------------------------------------------------
def fetch_gencon() -> tuple[list[dict], str]:
    """Returns (rooms, last_update_timestamp)."""
    with httpx.Client(timeout=15) as client:
        ts = client.get(GENCON_TIMESTAMP_URL).text.strip()
        rooms = client.get(GENCON_DATA_URL, headers={"Cache-Control": "no-store"}).json()
    return rooms, ts


def parse_gencon(rooms: list[dict]) -> dict[tuple[str, str], dict]:
    """
    Returns dict keyed by (hotel_name, room_name) ->
        { "nights": {day: status}, "rate": float, "distance": float }
    """
    result = {}
    for r in rooms:
        key = (r["hotel_name"].strip(), r["room_name"].strip())
        result[key] = {
            "nights": {
                day: r[day]
                for day in ("wednesday", "thursday", "friday", "saturday")
                if day in r
            },
            "rate": r.get("rate", 0),
            "distance": r.get("distance", 0),
        }
    return result


# ---------------------------------------------------------------------------
# Fetch our Supabase data
# ---------------------------------------------------------------------------
def fetch_our_data() -> tuple[dict[tuple[str, str], dict], dict]:
    """
    Returns (rooms, scrape_meta).
    rooms keyed by (hotel_name, room_type) ->
        { "nights_available": int, "open_dates": [str], "available_count": int, "rate": float }
    """
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    with httpx.Client(timeout=15, headers=headers) as client:
        # Latest successful change run
        run_resp = client.get(
            f"{SUPABASE_URL}/rest/v1/scrape_runs",
            params={
                "select": "id,started_at,no_changes,rooms_found,hotels_found",
                "no_changes": "eq.false",
                "status": "eq.success",
                "order": "started_at.desc",
                "limit": "1",
            },
        ).json()

        if not run_resp:
            return {}, {}

        run = run_resp[0]

        # All snapshots from that run
        snaps = client.get(
            f"{SUPABASE_URL}/rest/v1/room_snapshots",
            params={
                "select": "room_type,available_count,nightly_rate,raw_block_data,hotels(name)",
                "scrape_run_id": f"eq.{run['id']}",
                "order": "hotels(name)",
                "limit": "1000",
            },
        ).json()

    rooms = {}
    for s in snaps:
        hotel_name = (s.get("hotels") or {}).get("name", "?")
        room_type = s.get("room_type", "?")
        bd = s.get("raw_block_data") or {}
        nights = bd.get("nights", [])

        open_dates = [
            n["date"] for n in nights
            if n.get("available") == 10000 or 0 < n.get("available", 0) < 500
        ]

        rooms[(hotel_name, room_type)] = {
            "nights_available": bd.get("nights_available", 0),
            "open_dates": open_dates,
            "available_count": s.get("available_count", 0),
            "rate": s.get("nightly_rate", 0),
        }

    return rooms, run


# ---------------------------------------------------------------------------
# Comparison logic
# ---------------------------------------------------------------------------
def normalize_name(name: str) -> str:
    """Lowercase + strip special chars for fuzzy matching."""
    import re
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def compare(gencon: dict, ours: dict) -> dict:
    """
    Returns dict with:
        matched      — rooms in both, availability agrees
        we_missed    — gencon shows Open, we have 0 nights
        extra        — we show nights available, gencon shows nothing/WL/sold
        night_diff   — same room, different open nights
    """
    matched = []
    we_missed = []
    extra = []
    night_diff = []

    # Build normalized lookup for our data
    our_norm = {
        (normalize_name(h), normalize_name(r)): (key, data)
        for key, data in ours.items()
        for h, r in [key]
    }

    for (ghotel, groom), gdata in gencon.items():
        open_nights_gc = [
            NIGHT_DATES[day] for day, status in gdata["nights"].items()
            if status == "Open"
        ]

        # Try to find matching room in our data
        norm_key = (normalize_name(ghotel), normalize_name(groom))
        our_match = our_norm.get(norm_key)

        if our_match is None:
            # Try hotel-only match (room names sometimes differ slightly)
            our_match = next(
                (v for k, v in our_norm.items() if k[0] == normalize_name(ghotel)),
                None,
            )

        if our_match is None:
            if open_nights_gc:
                we_missed.append({
                    "hotel": ghotel,
                    "room": groom,
                    "gencon_open": open_nights_gc,
                    "gencon_rate": gdata["rate"],
                })
            continue

        _, our_data = our_match
        our_open = our_data["open_dates"]

        # Compare open nights
        gc_set = set(open_nights_gc)
        our_set = set(our_open)

        if gc_set == our_set:
            matched.append({"hotel": ghotel, "room": groom, "nights": sorted(gc_set)})
        elif gc_set and not our_set:
            we_missed.append({
                "hotel": ghotel,
                "room": groom,
                "gencon_open": sorted(gc_set),
                "our_open": [],
                "gencon_rate": gdata["rate"],
            })
        elif our_set and not gc_set:
            extra.append({
                "hotel": ghotel,
                "room": groom,
                "our_open": sorted(our_set),
                "our_rate": our_data["rate"],
            })
        else:
            night_diff.append({
                "hotel": ghotel,
                "room": groom,
                "gencon_open": sorted(gc_set),
                "our_open": sorted(our_set),
                "missing_nights": sorted(gc_set - our_set),
                "extra_nights": sorted(our_set - gc_set),
            })

    return {
        "matched": matched,
        "we_missed": we_missed,
        "extra": extra,
        "night_diff": night_diff,
    }


# ---------------------------------------------------------------------------
# Scraper health check
# ---------------------------------------------------------------------------
def check_scraper_health(run: dict) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    with httpx.Client(timeout=15, headers=headers) as client:
        latest = client.get(
            f"{SUPABASE_URL}/rest/v1/scrape_runs",
            params={
                "select": "started_at,status,no_changes,rooms_found",
                "order": "started_at.desc",
                "limit": "1",
            },
        ).json()[0]

    last_run_dt = datetime.fromisoformat(latest["started_at"].replace("Z", "+00:00"))
    age_seconds = (datetime.now(timezone.utc) - last_run_dt).total_seconds()

    last_change_dt = datetime.fromisoformat(run["started_at"].replace("Z", "+00:00"))
    change_age_hours = (datetime.now(timezone.utc) - last_change_dt).total_seconds() / 3600

    return {
        "last_run_age_seconds": int(age_seconds),
        "last_run_status": latest["status"],
        "last_change_run_age_hours": round(change_age_hours, 1),
        "rooms_in_last_change_run": run.get("rooms_found", 0),
        "scraper_ok": age_seconds < 300,  # Should run every 45s; warn if >5min stale
    }


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
def print_report(gencon_rooms, gencon_ts, our_rooms, our_run):
    result = compare(gencon_rooms, our_rooms)
    health = check_scraper_health(our_run)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n{'='*70}")
    print(f"  GenCon Hotels Verification Report — {now}")
    print(f"{'='*70}")

    # Scraper health
    age = health["last_run_age_seconds"]
    status_icon = "✅" if health["scraper_ok"] else "🚨"
    print(f"\n{status_icon} SCRAPER HEALTH")
    print(f"   Last run:          {age}s ago  (status: {health['last_run_status']})")
    print(f"   Last change run:   {health['last_change_run_age_hours']}h ago  ({health['rooms_in_last_change_run']} rooms changed)")
    if not health["scraper_ok"]:
        print(f"   ⚠️  SCRAPER MAY BE DOWN — last run was {age}s ago!")

    # Data timestamps
    print(f"\n📅 DATA TIMESTAMPS")
    print(f"   genconhotels.com:  {gencon_ts}")
    print(f"   Our last change:   {our_run.get('started_at', '?')[:19]} UTC")

    # Summary
    total_gc = len(gencon_rooms)
    open_gc = sum(
        1 for d in gencon_rooms.values()
        if any(v == "Open" for v in d["nights"].values())
    )
    print(f"\n📊 SUMMARY")
    print(f"   genconhotels rooms total:   {total_gc}")
    print(f"   genconhotels rooms w/ Open: {open_gc}")
    print(f"   Matched (agree):            {len(result['matched'])}")
    print(f"   We missed (false negative): {len(result['we_missed'])}")
    print(f"   Extra (false positive):     {len(result['extra'])}")
    print(f"   Night mismatch:             {len(result['night_diff'])}")

    # Missed rooms (most important — false negatives)
    if result["we_missed"]:
        print(f"\n🚨 WE MISSED — gencon shows Open, we have 0 nights ({len(result['we_missed'])} rooms)")
        for r in result["we_missed"]:
            nights_str = ", ".join(r.get("gencon_open", []))
            print(f"   • {r['hotel'][:45]:<45} | {r['room'][:35]:<35} | ${r.get('gencon_rate',0):.0f} | open: {nights_str}")
    else:
        print(f"\n✅ No false negatives — we're detecting all Open rooms gencon shows")

    # Night mismatches
    if result["night_diff"]:
        print(f"\n⚠️  NIGHT MISMATCHES — same room, different open nights ({len(result['night_diff'])})")
        for r in result["night_diff"]:
            print(f"   • {r['hotel'][:40]:<40} | {r['room'][:30]:<30}")
            if r["missing_nights"]:
                print(f"       gencon has but we don't: {r['missing_nights']}")
            if r["extra_nights"]:
                print(f"       we have but gencon doesn't: {r['extra_nights']}")

    # Extra rooms (false positives — lower priority)
    if result["extra"]:
        print(f"\n📋 EXTRA — we show nights available, gencon doesn't ({len(result['extra'])} rooms)")
        for r in result["extra"][:10]:
            print(f"   • {r['hotel'][:45]:<45} | {r['room'][:35]:<35} | open: {r['our_open']}")
        if len(result["extra"]) > 10:
            print(f"   ... and {len(result['extra']) - 10} more")

    print(f"\n{'='*70}\n")

    return len(result["we_missed"]) == 0 and health["scraper_ok"]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def run_supabase_only() -> bool:
    """
    Health check using only Supabase data — no external HTTP calls.
    Used by the scheduled cloud agent which cannot reach genconhotels.com.
    """
    print("Fetching Supabase...", end=" ", flush=True)
    our_rooms, our_run = fetch_our_data()
    print(f"{len(our_rooms)} snapshots")

    health = check_scraper_health(our_run)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n{'='*70}")
    print(f"  GenCon Scraper Health Report — {now}")
    print(f"{'='*70}")

    age = health["last_run_age_seconds"]
    status_icon = "✅" if health["scraper_ok"] else "🚨"
    print(f"\n{status_icon} SCRAPER STATUS: {'OK' if health['scraper_ok'] else 'WARNING'}")
    print(f"   Last run:         {age}s ago  (status: {health['last_run_status']})")
    print(f"   Last change run:  {health['last_change_run_age_hours']}h ago  ({health['rooms_in_last_change_run']} rooms changed)")

    if not health["scraper_ok"]:
        print(f"\n🚨 WARNING: Scraper appears down — last run was {age}s ago!")

    # Summarise current partial availability
    partial = [(h, r, d) for (h, r), d in our_rooms.items() if d["open_dates"]]
    sold_out = [(h, r) for (h, r), d in our_rooms.items() if not d["open_dates"]]

    print(f"\n📊 CURRENT AVAILABILITY SNAPSHOT")
    print(f"   Rooms with any open nights: {len(partial)}")
    print(f"   Rooms fully sold out:       {len(sold_out)}")
    print(f"   Total tracked:              {len(our_rooms)}")

    if partial:
        print(f"\n   Open rooms:")
        for hotel, room, data in sorted(partial, key=lambda x: x[0])[:20]:
            nights_str = ", ".join(d[-5:] for d in data["open_dates"])
            print(f"   • {hotel[:42]:<42} | {room[:32]:<32} | {nights_str}")
        if len(partial) > 20:
            print(f"   ... and {len(partial) - 20} more")

    overall_ok = health["scraper_ok"]
    print(f"\n{'✅ All systems nominal' if overall_ok else '🚨 Action required — see warnings above'}")
    print(f"\n{'='*70}\n")
    return overall_ok


def run_once() -> bool:
    print("Fetching genconhotels.com...", end=" ", flush=True)
    raw_gencon, gencon_ts = fetch_gencon()
    gencon_rooms = parse_gencon(raw_gencon)
    print(f"{len(gencon_rooms)} rooms")

    print("Fetching Supabase...", end=" ", flush=True)
    our_rooms, our_run = fetch_our_data()
    print(f"{len(our_rooms)} snapshots")

    return print_report(gencon_rooms, gencon_ts, our_rooms, our_run)


def main():
    parser = argparse.ArgumentParser(description="Verify GenCon hotel scraper accuracy")
    parser.add_argument("--watch", action="store_true", help="Re-run every 5 minutes")
    parser.add_argument("--interval", type=int, default=300, help="Watch interval in seconds (default: 300)")
    parser.add_argument("--supabase-only", action="store_true",
                        help="Skip genconhotels.com fetch — Supabase health check only (used by scheduled agent)")
    args = parser.parse_args()

    if args.supabase_only:
        ok = run_supabase_only()
        sys.exit(0 if ok else 1)
    elif args.watch:
        print(f"Watch mode — running every {args.interval}s. Press Ctrl+C to stop.")
        while True:
            try:
                run_once()
                time.sleep(args.interval)
            except KeyboardInterrupt:
                print("\nStopped.")
                sys.exit(0)
            except Exception as e:
                print(f"\n⚠️  Error: {e}")
                time.sleep(60)
    else:
        ok = run_once()
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
