# GenCon Hotels — Full Project Specification

## Document Purpose

This document is a complete technical specification for building a replacement for [genconhotels.com](https://genconhotels.com/). It contains everything needed — architecture, database schema, API contracts, scraper logic, frontend requirements, and deployment config — so that a developer (or AI assistant) can build the entire project from this spec alone.

---

## 1. Project Overview

### What It Does

GenCon Hotels is a community tool that monitors the Gen Con housing portal (powered by Passkey/Q-Rooms at `book.passkey.com`) and displays real-time hotel room availability for Gen Con attendees. The housing portal is notoriously difficult to use during high-demand periods, and rooms appear and disappear within seconds. This tool scrapes the portal on an interval, stores results, and presents them in a user-friendly web interface with filtering, sorting, maps, historical data, and push notifications.

### Why It Exists

- The official housing portal has no "watch" or alert functionality
- Rooms get dropped back into the pool constantly as people change plans
- The existing genconhotels.com is a minimal Python/Docker app with no real-time updates, no notifications, no historical data, and a bare-bones HTML frontend
- The community (tabletop gaming) is highly engaged and would benefit from Discord webhooks, push notifications, and better UX

### Target Users

Gen Con attendees (50,000+ annually) looking for hotel rooms in the Indianapolis housing block, particularly after initial housing opens and rooms start cycling in and out.

---

## 2. Architecture

### Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | Next.js 14+ (App Router) + TypeScript | Vercel |
| UI | Tailwind CSS + shadcn/ui | (bundled with frontend) |
| Map | Leaflet (open source, no API key needed) | (client-side) |
| Charts | Recharts | (client-side) |
| Scraper | Python 3.11+ (FastAPI) | Railway |
| Database | PostgreSQL | Supabase |
| Realtime | Supabase Realtime (WebSocket subscriptions) | Supabase |
| Notifications | Supabase Edge Functions | Supabase |
| Push Notifications | Web Push API (VAPID) | Vercel/Supabase |

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Passkey API     │────▶│  Railway Scraper  │────▶│    Supabase     │
│  (book.passkey.  │     │  (Python/FastAPI) │     │   (PostgreSQL)  │
│   com)           │     │  Runs every 60s   │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                          ┌───────────────┼───────────────┐
                                          │               │               │
                                          ▼               ▼               ▼
                                   ┌────────────┐  ┌──────────┐  ┌──────────────┐
                                   │   Vercel    │  │ Realtime │  │ Edge Function│
                                   │  (Next.js)  │  │ (WS push │  │ (Notifier)   │
                                   │  Frontend   │  │ to browser│  │ Discord/SMS  │
                                   └────────────┘  └──────────┘  │ Web Push     │
                                                                  └──────────────┘
```

### How Realtime Works

1. Scraper writes new rows to `room_snapshots` table in Supabase
2. Supabase Realtime detects the INSERT via its built-in PostgreSQL publication
3. Frontend subscribes to the `room_snapshots` channel via Supabase JS client
4. Browser receives new data and updates the UI without polling
5. Separately, a Supabase database webhook (or trigger + edge function) fires to check if any watchers match the new availability, and sends Discord/SMS/push notifications

---

## 3. Database Schema (Supabase / PostgreSQL)

### Enable Required Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron"; -- for scheduled cleanup if needed
```

### Tables

#### `hotels`

Static reference table for hotels in the Gen Con block. Seeded manually or from first scrape. Updated yearly.

```sql
CREATE TABLE hotels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    passkey_hotel_id INTEGER NOT NULL,          -- ID from Passkey JSON
    name TEXT NOT NULL,
    address TEXT,
    city TEXT DEFAULT 'Indianapolis',
    state TEXT DEFAULT 'IN',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_from_icc DOUBLE PRECISION,         -- numeric distance
    distance_unit INTEGER NOT NULL DEFAULT 1,   -- 1=blocks, 2=yards, 3=miles, 4=meters, 5=km
    has_skywalk BOOLEAN DEFAULT FALSE,
    year INTEGER NOT NULL,                       -- e.g. 2026
    amenities JSONB DEFAULT '{}',               -- future: pool, parking, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(passkey_hotel_id, year)
);

CREATE INDEX idx_hotels_year ON hotels(year);
CREATE INDEX idx_hotels_distance ON hotels(distance_from_icc);
```

#### `scrape_runs`

Log of every scrape attempt. Used for monitoring health and debugging.

```sql
CREATE TABLE scrape_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',       -- 'running', 'success', 'error'
    error_message TEXT,
    hotels_found INTEGER DEFAULT 0,
    rooms_found INTEGER DEFAULT 0,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    duration_ms INTEGER,
    year INTEGER NOT NULL
);

CREATE INDEX idx_scrape_runs_status ON scrape_runs(status);
CREATE INDEX idx_scrape_runs_started ON scrape_runs(started_at DESC);
```

#### `room_snapshots`

The core table. Every scrape inserts one row per available room type per hotel. This is an **append-only log** — we never update or delete rows. This gives us full historical data for free.

```sql
CREATE TABLE room_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scrape_run_id UUID NOT NULL REFERENCES scrape_runs(id),
    hotel_id UUID NOT NULL REFERENCES hotels(id),
    room_type TEXT NOT NULL,                     -- e.g. "Queen/Queen Standard"
    room_description TEXT,                       -- full description from Passkey
    available_count INTEGER NOT NULL DEFAULT 0,
    nightly_rate NUMERIC(10,2),                  -- per night
    total_price NUMERIC(10,2),                   -- nightly_rate * num_nights
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    num_nights INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    year INTEGER NOT NULL,

    -- Passkey raw data preserved for debugging
    raw_block_data JSONB
);

CREATE INDEX idx_snapshots_hotel ON room_snapshots(hotel_id);
CREATE INDEX idx_snapshots_scraped ON room_snapshots(scraped_at DESC);
CREATE INDEX idx_snapshots_year ON room_snapshots(year);
CREATE INDEX idx_snapshots_available ON room_snapshots(available_count) WHERE available_count > 0;

-- Composite index for the most common query: "latest available rooms"
CREATE INDEX idx_snapshots_latest ON room_snapshots(year, scraped_at DESC, available_count);
```

#### `watchers`

Users who want to be notified when rooms matching their criteria become available.

```sql
CREATE TABLE watchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Contact info (at least one required — enforced at app level)
    email TEXT,
    discord_webhook_url TEXT,
    phone_number TEXT,                           -- for SMS via Twilio or similar
    push_subscription JSONB,                     -- Web Push API subscription object
    
    -- Filter criteria
    hotel_id UUID REFERENCES hotels(id),         -- NULL = any hotel
    max_price NUMERIC(10,2),                     -- NULL = no budget limit
    max_distance DOUBLE PRECISION,               -- NULL = no distance limit
    require_skywalk BOOLEAN DEFAULT FALSE,
    room_type_pattern TEXT,                       -- regex pattern for room type
    
    -- State
    active BOOLEAN DEFAULT TRUE,
    cooldown_minutes INTEGER DEFAULT 15,         -- don't re-notify for same match within this window
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    year INTEGER NOT NULL,
    
    -- Rate limiting
    notifications_sent_today INTEGER DEFAULT 0,
    max_notifications_per_day INTEGER DEFAULT 50
);

CREATE INDEX idx_watchers_active ON watchers(active) WHERE active = TRUE;
CREATE INDEX idx_watchers_year ON watchers(year);
```

#### `notifications_log`

Audit trail of every notification sent.

```sql
CREATE TABLE notifications_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watcher_id UUID NOT NULL REFERENCES watchers(id),
    room_snapshot_id UUID NOT NULL REFERENCES room_snapshots(id),
    channel TEXT NOT NULL,                        -- 'discord', 'email', 'sms', 'web_push'
    status TEXT NOT NULL DEFAULT 'sent',          -- 'sent', 'failed', 'skipped'
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_watcher ON notifications_log(watcher_id);
CREATE INDEX idx_notifications_sent ON notifications_log(sent_at DESC);
```

#### `app_config`

Runtime configuration so we don't have to redeploy for config changes.

```sql
CREATE TABLE app_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with required config
INSERT INTO app_config (key, value, description) VALUES
    ('passkey_event_id', '50910675', 'Passkey event ID for current year (changes yearly)'),
    ('passkey_owner_id', '10909638', 'Passkey owner ID for current year (changes yearly)'),
    ('passkey_token_url', '"https://book.passkey.com/entry?token=PLACEHOLDER"', 'Full Passkey entry URL with token'),
    ('scrape_interval_seconds', '60', 'How often the scraper runs'),
    ('current_year', '2026', 'Current convention year'),
    ('convention_start_date', '"2026-07-30"', 'First day of Gen Con'),
    ('convention_end_date', '"2026-08-02"', 'Last day of Gen Con'),
    ('housing_first_day', '"2026-07-25"', 'Earliest check-in in the housing block'),
    ('housing_last_day', '"2026-08-07"', 'Latest check-out in the housing block'),
    ('default_check_in', '"2026-07-29"', 'Default check-in (day before con, Wed)'),
    ('default_check_out', '"2026-08-03"', 'Default check-out (day after con, Sun)'),
    ('scraper_active', 'false', 'Master switch to enable/disable scraping'),
    ('site_banner_message', 'null', 'Optional banner message shown on the site');
```

### Views

#### `latest_room_availability`

The most important view — shows the most recent snapshot of each room type at each hotel.

```sql
CREATE OR REPLACE VIEW latest_room_availability AS
WITH latest_scrape AS (
    SELECT id FROM scrape_runs 
    WHERE status = 'success' 
    ORDER BY completed_at DESC 
    LIMIT 1
)
SELECT 
    rs.id AS snapshot_id,
    h.id AS hotel_id,
    h.name AS hotel_name,
    h.distance_from_icc,
    h.distance_unit,
    h.has_skywalk,
    h.latitude,
    h.longitude,
    rs.room_type,
    rs.available_count,
    rs.nightly_rate,
    rs.total_price,
    rs.check_in,
    rs.check_out,
    rs.num_nights,
    rs.scraped_at,
    -- Time since last scrape for freshness indicator
    EXTRACT(EPOCH FROM (NOW() - rs.scraped_at))::INTEGER AS seconds_ago
FROM room_snapshots rs
JOIN hotels h ON rs.hotel_id = h.id
JOIN latest_scrape ls ON rs.scrape_run_id = ls.id
WHERE rs.available_count > 0
ORDER BY h.distance_from_icc ASC, rs.total_price ASC;
```

#### `room_availability_history`

For charts — shows availability changes over time for a given hotel.

```sql
CREATE OR REPLACE VIEW room_availability_history AS
SELECT
    rs.hotel_id,
    h.name AS hotel_name,
    rs.room_type,
    rs.available_count,
    rs.total_price,
    rs.scraped_at,
    DATE_TRUNC('hour', rs.scraped_at) AS hour_bucket
FROM room_snapshots rs
JOIN hotels h ON rs.hotel_id = h.id
ORDER BY rs.scraped_at DESC;
```

### Supabase Realtime Configuration

Enable realtime on the `room_snapshots` table so the frontend receives live updates:

```sql
-- In Supabase dashboard or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE room_snapshots;
```

### Row-Level Security (RLS)

```sql
-- Hotels: public read
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hotels are publicly readable" ON hotels FOR SELECT USING (true);

-- Room snapshots: public read
ALTER TABLE room_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots are publicly readable" ON room_snapshots FOR SELECT USING (true);

-- Scrape runs: public read
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scrape runs are publicly readable" ON scrape_runs FOR SELECT USING (true);

-- Watchers: only the creator can read/modify (enforced via a secret token)
ALTER TABLE watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Watchers are accessible via service role only" ON watchers 
    USING (true) WITH CHECK (true);
-- Note: Watcher CRUD goes through API routes that use the service role key.
-- End users never directly query this table.

-- App config: public read, service role write
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Config is publicly readable" ON app_config FOR SELECT USING (true);
```

### Database Functions

#### Notification Matching Function

Called by a trigger or edge function after new room_snapshots are inserted.

```sql
CREATE OR REPLACE FUNCTION match_watchers_for_snapshot(snapshot_id UUID)
RETURNS TABLE(watcher_id UUID, channel TEXT, destination TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id AS watcher_id,
        CASE 
            WHEN w.discord_webhook_url IS NOT NULL THEN 'discord'
            WHEN w.email IS NOT NULL THEN 'email'
            WHEN w.phone_number IS NOT NULL THEN 'sms'
            WHEN w.push_subscription IS NOT NULL THEN 'web_push'
        END AS channel,
        COALESCE(
            w.discord_webhook_url, 
            w.email, 
            w.phone_number,
            w.push_subscription::TEXT
        ) AS destination
    FROM watchers w
    JOIN room_snapshots rs ON rs.id = snapshot_id
    JOIN hotels h ON rs.hotel_id = h.id
    WHERE w.active = TRUE
        AND w.year = rs.year
        AND rs.available_count > 0
        AND (w.hotel_id IS NULL OR w.hotel_id = rs.hotel_id)
        AND (w.max_price IS NULL OR rs.total_price <= w.max_price)
        AND (w.max_distance IS NULL OR h.distance_from_icc <= w.max_distance)
        AND (w.require_skywalk = FALSE OR h.has_skywalk = TRUE)
        AND (w.room_type_pattern IS NULL OR rs.room_type ~* w.room_type_pattern)
        AND (w.last_notified_at IS NULL 
             OR w.last_notified_at < NOW() - (w.cooldown_minutes || ' minutes')::INTERVAL)
        AND w.notifications_sent_today < w.max_notifications_per_day;
END;
$$ LANGUAGE plpgsql;
```

#### Daily Counter Reset

```sql
CREATE OR REPLACE FUNCTION reset_daily_notification_counts()
RETURNS void AS $$
BEGIN
    UPDATE watchers SET notifications_sent_today = 0 WHERE notifications_sent_today > 0;
END;
$$ LANGUAGE plpgsql;

-- Schedule via pg_cron (or call from an edge function on a cron)
-- SELECT cron.schedule('reset-notif-counts', '0 0 * * *', 'SELECT reset_daily_notification_counts()');
```

---

## 4. API Contracts

### Scraper → Supabase (Internal)

The scraper uses the Supabase service role key and writes directly via the PostgREST API or the Python supabase client.

### Frontend API Routes (Next.js `/app/api/`)

All public API routes are read-only. Write operations (watcher creation) use the Supabase service role key server-side.

---

#### `GET /api/rooms`

Returns current room availability (latest scrape).

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `year` | integer | current year | Convention year |
| `min_distance` | float | - | Minimum distance in blocks |
| `max_distance` | float | - | Maximum distance in blocks |
| `max_price` | float | - | Max total price |
| `skywalk_only` | boolean | false | Only skywalk-connected hotels |
| `hotel_name` | string | - | Partial match on hotel name |
| `room_type` | string | - | Partial match on room type |
| `sort_by` | string | "distance" | "distance", "price", "hotel_name", "available" |
| `sort_dir` | string | "asc" | "asc" or "desc" |

**Response:**
```json
{
    "data": [
        {
            "snapshot_id": "uuid",
            "hotel_id": "uuid",
            "hotel_name": "JW Marriott Indianapolis",
            "distance_from_icc": 0.0,
            "distance_label": "Skywalk",
            "has_skywalk": true,
            "latitude": 39.7654,
            "longitude": -86.1631,
            "room_type": "Queen/Queen Standard",
            "available_count": 2,
            "nightly_rate": 259.00,
            "total_price": 1295.00,
            "check_in": "2026-07-29",
            "check_out": "2026-08-03",
            "num_nights": 5,
            "scraped_at": "2026-03-15T14:32:00Z",
            "seconds_ago": 45
        }
    ],
    "meta": {
        "last_scrape_at": "2026-03-15T14:32:00Z",
        "last_scrape_status": "success",
        "total_rooms_available": 47,
        "total_hotels_with_availability": 12,
        "scraper_active": true
    }
}
```

---

#### `GET /api/rooms/history`

Returns historical availability for a specific hotel (for charts).

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `hotel_id` | uuid | yes | Hotel to get history for |
| `room_type` | string | no | Filter to specific room type |
| `hours` | integer | no (default 24) | How many hours back to look |
| `bucket` | string | no (default "5min") | Aggregation bucket: "1min", "5min", "15min", "1hour" |

**Response:**
```json
{
    "hotel_name": "JW Marriott Indianapolis",
    "data": [
        {
            "timestamp": "2026-03-15T14:00:00Z",
            "room_type": "Queen/Queen Standard",
            "available_count": 3,
            "total_price": 1295.00
        },
        {
            "timestamp": "2026-03-15T14:05:00Z",
            "room_type": "Queen/Queen Standard",
            "available_count": 1,
            "total_price": 1295.00
        }
    ]
}
```

---

#### `GET /api/hotels`

Returns all hotels in the block for the current year (for map, dropdowns).

**Response:**
```json
{
    "data": [
        {
            "id": "uuid",
            "name": "JW Marriott Indianapolis",
            "address": "10 S West St, Indianapolis, IN 46204",
            "latitude": 39.7654,
            "longitude": -86.1631,
            "distance_from_icc": 0.0,
            "distance_label": "Skywalk",
            "has_skywalk": true,
            "year": 2026
        }
    ]
}
```

---

#### `GET /api/status`

Health/status endpoint for the scraper and system.

**Response:**
```json
{
    "scraper_active": true,
    "last_scrape": {
        "started_at": "2026-03-15T14:32:00Z",
        "status": "success",
        "hotels_found": 45,
        "rooms_found": 128,
        "duration_ms": 2340
    },
    "scrapes_last_hour": 58,
    "error_rate_last_hour": 0.03,
    "database_size_mb": 142,
    "banner_message": null
}
```

---

#### `POST /api/watchers`

Create a new notification watcher.

**Request Body:**
```json
{
    "email": "user@example.com",
    "discord_webhook_url": "https://discord.com/api/webhooks/...",
    "phone_number": "+13175551234",
    "push_subscription": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } },
    "hotel_id": "uuid-or-null",
    "max_price": 1500.00,
    "max_distance": 5.0,
    "require_skywalk": false,
    "room_type_pattern": "queen|king",
    "cooldown_minutes": 15
}
```

**Response:**
```json
{
    "id": "uuid",
    "manage_token": "random-secret-token",
    "message": "Watcher created. Save your manage_token to modify or delete this watcher later."
}
```

**Notes:**
- At least one contact method is required
- `manage_token` is a random string returned only on creation; it's used to authenticate future updates/deletes
- Store `manage_token` hashed in the DB, return plaintext only once

---

#### `DELETE /api/watchers/:id`

Delete a watcher. Requires `manage_token` in the `Authorization` header.

---

#### `GET /api/config`

Returns public configuration values.

**Response:**
```json
{
    "current_year": 2026,
    "convention_start_date": "2026-07-30",
    "convention_end_date": "2026-08-02",
    "default_check_in": "2026-07-29",
    "default_check_out": "2026-08-03",
    "housing_first_day": "2026-07-25",
    "housing_last_day": "2026-08-07",
    "scraper_active": true,
    "site_banner_message": null
}
```

---

## 5. Scraper Service (Railway — Python)

### Overview

A Python FastAPI application that runs on Railway. It has two jobs:

1. **Scrape Loop** — Polls the Passkey API on an interval, parses results, writes to Supabase
2. **Health API** — Exposes `/health` so Railway (and our frontend status page) can monitor it

### Passkey Scraping Logic

This is reverse-engineered from the existing open-source tools (`mrozekma/gencon-hotel-check` and `overallcoma/genconhotels`). The Passkey system uses a multi-step flow:

#### Step 1: Initialize Session

```python
GET {passkey_token_url}
# e.g. https://book.passkey.com/entry?token=XXXXXXXX
# This sets session cookies including XSRF-TOKEN
```

#### Step 2: Submit Search

```python
POST https://book.passkey.com/event/{event_id}/owner/{owner_id}/rooms/select
Content-Type: application/x-www-form-urlencoded

Body:
    _csrf={XSRF-TOKEN from cookie}
    &hotelId=0
    &blockMap.blocks[0].blockId=0
    &blockMap.blocks[0].checkIn=2026-07-29
    &blockMap.blocks[0].checkOut=2026-08-03
    &blockMap.blocks[0].numberOfGuests=1
    &blockMap.blocks[0].numberOfRooms=1
    &blockMap.blocks[0].numberOfChildren=0
```

#### Step 3: Fetch Results

```python
GET https://book.passkey.com/event/{event_id}/owner/{owner_id}/list/hotels
# Returns HTML page containing a <script id="last-search-results"> tag
# The content of that script tag is a JSON array of hotel objects
```

#### Step 4: Parse the JSON

The JSON structure from Passkey (per hotel):

```json
{
    "id": 12345,
    "name": "JW Marriott Indianapolis",
    "distanceFromEvent": 0.0,
    "distanceUnit": 1,
    "messageMap": "Skywalk to ICC | ...",
    "blocks": [
        {
            "name": "Queen/Queen Standard",
            "inventory": [
                {
                    "date": "2026-07-29",
                    "rate": 259.00,
                    "available": 2
                },
                {
                    "date": "2026-07-30",
                    "rate": 259.00,
                    "available": 2
                }
            ]
        }
    ]
}
```

**Key parsing notes:**
- `distanceUnit`: 1=blocks, 2=yards, 3=miles, 4=meters, 5=kilometers
- Skywalk detection: check if `"Skywalk to ICC"` appears in `messageMap`
- Room availability: `min(inv['available'] for inv in block['inventory'])` — the minimum across all nights is the true availability (you need the room every night)
- Total price: `sum(inv['rate'] for inv in block['inventory'])`
- Nightly rate: `inventory[0]['rate']` (rates are typically the same each night but may vary)
- Rooms with `available: 0` should still be recorded (for historical "went to zero" tracking) but flagged

### Scraper Implementation Requirements

```
File: scraper/main.py

Dependencies (requirements.txt):
    fastapi
    uvicorn
    httpx           # async HTTP client (better than requests for this use case)
    supabase        # supabase-py
    beautifulsoup4  # more robust than HTMLParser for extracting the script tag
    apscheduler     # for cron-like scheduling within the process
    python-dotenv
```

**Environment Variables (Railway):**
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
PASSKEY_TOKEN_URL=https://book.passkey.com/entry?token=XXXXXXXX
PASSKEY_EVENT_ID=50910675
PASSKEY_OWNER_ID=10909638
SCRAPE_INTERVAL_SECONDS=60
DEFAULT_CHECK_IN=2026-07-29
DEFAULT_CHECK_OUT=2026-08-03
CURRENT_YEAR=2026
```

**Key Implementation Details:**

1. **Session management**: Use `httpx.AsyncClient` with cookie persistence. The Passkey session may expire; if a scrape fails with a 403 or redirect, re-initialize the session.

2. **Retry logic**: On failure, retry up to 3 times with exponential backoff (2s, 4s, 8s). If all retries fail, log the error to `scrape_runs` and wait for the next interval.

3. **Rate limiting awareness**: If Passkey returns 429 or the response seems throttled, back off to 2x the normal interval for the next cycle.

4. **Hotel upsert**: On first scrape of the year, hotels are inserted. On subsequent scrapes, hotel metadata is updated if changed (distance, name, etc.) via upsert on `(passkey_hotel_id, year)`.

5. **Deduplication**: The scraper should check if the previous scrape's results are identical (same hotels, same rooms, same availability counts). If nothing changed, still log the `scrape_run` but skip inserting duplicate `room_snapshots` to save database space. Set a flag like `no_changes: true` on the scrape run.

6. **Health endpoint**: `GET /health` returns `{"status": "healthy", "last_scrape": "...", "uptime": "..."}`. Railway can ping this.

7. **Graceful shutdown**: Handle SIGTERM properly (Railway sends this on deploy/restart).

### Scraper FastAPI Endpoints

```
GET  /health              — Health check for Railway
GET  /status              — Detailed status (last scrape, error rate, etc.)
POST /scrape/trigger      — Manually trigger a scrape (protected by API key)
POST /scrape/toggle       — Enable/disable the scrape loop (protected by API key)
```

---

## 6. Frontend (Vercel — Next.js)

### Pages

#### `/` — Main Dashboard

The primary page. Shows:

1. **Status bar** (top): "Last updated X seconds ago" with a colored dot (green = fresh <2min, yellow = stale 2-5min, red = stale >5min or error). Shows total available rooms count.

2. **Filter bar**: Collapsible/expandable filter panel with:
   - Distance slider (0-20 blocks, or "Skywalk only" toggle)
   - Price range slider
   - Hotel name search (text input with autocomplete)
   - Room type filter (text input)
   - Check-in / check-out date pickers (within the housing window)
   - "Clear filters" button

3. **Results table**: Sortable columns:
   - Distance (with "Skywalk" badge where applicable)
   - Hotel Name
   - Room Type
   - Available (count)
   - Nightly Rate
   - Total Price
   - Last Seen (relative timestamp)
   - Action: "Book Now" link → opens the Passkey housing portal

4. **Map view** (toggleable tab): Leaflet map centered on the ICC with hotel markers. Markers color-coded:
   - Green = rooms available
   - Red = no rooms available
   - Blue outline = skywalk connected
   - Clicking a marker shows a popup with hotel name, available rooms, and prices

5. **Notification bell** (corner): Opens a panel to set up a watcher (see Watcher UI below)

#### `/history` — Historical Data

- Select a hotel from a dropdown
- See a time-series chart (Recharts) of room availability over the last 24h / 7d / 30d
- Shows when rooms appeared and disappeared
- Optional: year-over-year comparison if historical data exists

#### `/about` — About Page

- How the site works
- FAQ (Is this official? No. Will it guarantee me a room? No. How often does it update? Every 60 seconds.)
- Link to the Gen Con housing portal
- Donor acknowledgments
- Open source credits

### Watcher UI (Notification Setup)

Accessible from the bell icon on the main page. A modal/slide-over with:

1. **What to watch for:**
   - Specific hotel (dropdown) or "Any hotel"
   - Max total price
   - Max distance
   - Skywalk only toggle
   - Room type keyword

2. **How to notify:**
   - Discord webhook URL (text input + "Test" button)
   - Browser push notifications (button to request permission + subscribe)
   - SMS/Phone number (text input — note: this may require Twilio and has cost implications)

3. **Settings:**
   - Cooldown between notifications (dropdown: 5min, 15min, 30min, 1hr)

4. On submit → calls `POST /api/watchers`, returns a manage token
5. Store the manage token in localStorage so the user can manage/delete their watcher later

### Realtime Integration (Supabase Client)

In the main dashboard component:

```typescript
// Pseudocode for the realtime subscription
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Subscribe to new room snapshots
supabase
  .channel('room-updates')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'room_snapshots',
    filter: `year=eq.${currentYear}`
  }, (payload) => {
    // Update the UI with new data
    // Either merge the new snapshot into the existing state
    // or trigger a re-fetch of /api/rooms
  })
  .subscribe()
```

### Mobile Responsiveness

The site MUST be mobile-first. Gen Con attendees will be checking this on their phones while at the convention. Key considerations:
- Table should become a card-based layout on mobile
- Map should be full-width on mobile
- Filters should be in a collapsible drawer
- Touch-friendly tap targets

### Web Push Notification Implementation

Use the Web Push API with VAPID keys:

1. Generate VAPID keys (one-time, store in env vars)
2. Frontend: Service worker registration + push subscription
3. On subscribe: send the subscription object to `POST /api/watchers`
4. Backend (edge function): Use `web-push` library to send notifications

**Service Worker (`public/sw.js`):**
```javascript
self.addEventListener('push', (event) => {
    const data = event.data.json();
    self.registration.showNotification('GenCon Hotels', {
        body: data.message,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        data: { url: data.url || '/' }
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

---

## 7. Notification Edge Functions (Supabase)

### Discord Webhook

```typescript
// supabase/functions/notify-discord/index.ts
// Triggered by database webhook on room_snapshots INSERT

interface DiscordPayload {
    content: string;
    embeds: [{
        title: string;
        description: string;
        color: number;         // green = 0x00ff00
        fields: Array<{
            name: string;
            value: string;
            inline: boolean;
        }>;
        footer: { text: string };
    }];
}

// Build a rich embed like:
// 🏨 Room Available!
// **JW Marriott Indianapolis** (Skywalk)
// Queen/Queen Standard — 2 rooms available
// $259/night ($1,295 total) | Wed 7/29 – Sun 8/3
// [Book Now →](https://book.passkey.com/...)
```

### Web Push

```typescript
// supabase/functions/notify-push/index.ts
// Uses web-push library (npm: web-push)
// Requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL in env

import webPush from 'web-push';

webPush.setVapidDetails(
    'mailto:' + VAPID_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Send to the subscription stored in watcher.push_subscription
await webPush.sendNotification(subscription, JSON.stringify({
    message: `${hotelName}: ${roomType} (${availableCount} rooms) - $${totalPrice}`,
    url: '/'
}));
```

### SMS (Future)

Via Twilio or a similar provider. Requires a paid account. The edge function would call the Twilio REST API. This can be deferred to a later phase.

---

## 8. Deployment Configuration

### Vercel (Frontend)

**`vercel.json`:**
```json
{
    "framework": "nextjs",
    "regions": ["iad1"],
    "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "@supabase-url",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key",
        "SUPABASE_SERVICE_ROLE_KEY": "@supabase-service-role-key",
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY": "@vapid-public-key",
        "VAPID_PRIVATE_KEY": "@vapid-private-key"
    }
}
```

**Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL         — Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    — Supabase anon/public key (safe for client)
SUPABASE_SERVICE_ROLE_KEY        — Supabase service role key (server-side only!)
NEXT_PUBLIC_VAPID_PUBLIC_KEY     — VAPID public key for web push
VAPID_PRIVATE_KEY                — VAPID private key (server-side only!)
VAPID_EMAIL                      — Contact email for VAPID
```

### Railway (Scraper)

**`Dockerfile`:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scraper/ .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**`railway.toml`:**
```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 5
```

**Environment Variables:**
```
SUPABASE_URL                     — Supabase project URL
SUPABASE_SERVICE_ROLE_KEY        — Supabase service role key
PASSKEY_TOKEN_URL                — Full Passkey entry URL with token
PASSKEY_EVENT_ID                 — Passkey event ID (changes yearly)
PASSKEY_OWNER_ID                 — Passkey owner ID (changes yearly)
SCRAPE_INTERVAL_SECONDS          — Polling interval (default 60)
DEFAULT_CHECK_IN                 — Default check-in date
DEFAULT_CHECK_OUT                — Default check-out date
CURRENT_YEAR                     — Convention year
SCRAPER_API_KEY                  — Secret key for admin endpoints
```

### Supabase

**Required configuration:**
1. Create a new Supabase project
2. Run all SQL from Section 3 (tables, views, functions, RLS policies)
3. Enable Realtime on the `room_snapshots` table
4. Create Edge Functions for notifications (Discord, Web Push)
5. Set up a Database Webhook: on INSERT to `room_snapshots`, call the notification matcher edge function

---

## 9. Repo Structure

```
gencon-hotels/
├── README.md
├── .gitignore
├── .env.example
│
├── frontend/                        # Next.js app (deployed to Vercel)
│   ├── package.json
│   ├── next.config.js
│   ├── vercel.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   ├── sw.js                    # Service worker for web push
│   │   ├── favicon.ico
│   │   └── icons/                   # PWA icons
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx             # Main dashboard
│   │   │   ├── history/
│   │   │   │   └── page.tsx         # Historical data & charts
│   │   │   ├── about/
│   │   │   │   └── page.tsx
│   │   │   └── api/
│   │   │       ├── rooms/
│   │   │       │   └── route.ts     # GET /api/rooms
│   │   │       ├── rooms/history/
│   │   │       │   └── route.ts     # GET /api/rooms/history
│   │   │       ├── hotels/
│   │   │       │   └── route.ts     # GET /api/hotels
│   │   │       ├── watchers/
│   │   │       │   └── route.ts     # POST/DELETE /api/watchers
│   │   │       ├── status/
│   │   │       │   └── route.ts     # GET /api/status
│   │   │       ├── config/
│   │   │       │   └── route.ts     # GET /api/config
│   │   │       └── push/
│   │   │           └── subscribe/
│   │   │               └── route.ts # POST push subscription
│   │   ├── components/
│   │   │   ├── RoomTable.tsx        # Sortable results table
│   │   │   ├── RoomCard.tsx         # Mobile card layout
│   │   │   ├── FilterBar.tsx        # Filter controls
│   │   │   ├── HotelMap.tsx         # Leaflet map component
│   │   │   ├── StatusBar.tsx        # Freshness indicator
│   │   │   ├── WatcherModal.tsx     # Notification setup modal
│   │   │   ├── AvailabilityChart.tsx # Recharts time series
│   │   │   └── BannerMessage.tsx    # Site-wide banner
│   │   ├── lib/
│   │   │   ├── supabase.ts          # Supabase client init
│   │   │   ├── types.ts             # TypeScript types
│   │   │   └── utils.ts             # Helpers (distance labels, etc.)
│   │   └── hooks/
│   │       ├── useRooms.ts          # Fetch + realtime rooms
│   │       ├── useStatus.ts         # Scraper status
│   │       └── usePushNotifications.ts
│   └── ...
│
├── scraper/                         # Python scraper (deployed to Railway)
│   ├── Dockerfile
│   ├── railway.toml
│   ├── requirements.txt
│   ├── main.py                      # FastAPI app + scrape loop
│   ├── passkey.py                   # Passkey API client (session, search, parse)
│   ├── database.py                  # Supabase write operations
│   ├── models.py                    # Pydantic models for parsed data
│   └── config.py                    # Environment variable loading
│
├── supabase/                        # Supabase config & edge functions
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # All SQL from Section 3
│   └── functions/
│       ├── notify-discord/
│       │   └── index.ts
│       ├── notify-push/
│       │   └── index.ts
│       └── match-watchers/
│           └── index.ts
│
└── docs/
    └── this-file.md                 # This specification
```

---

## 10. Indianapolis Hotel Reference Data

Seed data for the `hotels` table. These are the hotels commonly in the Gen Con housing block. Coordinates are approximate and should be verified.

```sql
-- ICC (Indiana Convention Center) reference point
-- Latitude: 39.7637, Longitude: -86.1603

INSERT INTO hotels (passkey_hotel_id, name, address, latitude, longitude, distance_from_icc, distance_unit, has_skywalk, year) VALUES
-- Skywalk-connected hotels
(0, 'JW Marriott Indianapolis', '10 S West St', 39.7654, -86.1631, 0, 1, TRUE, 2026),
(0, 'Indianapolis Marriott Downtown', '350 W Maryland St', 39.7635, -86.1651, 0, 1, TRUE, 2026),
(0, 'Westin Indianapolis', '241 W Washington St', 39.7680, -86.1612, 0, 1, TRUE, 2026),
(0, 'Crowne Plaza Indianapolis - Downtown Union Station', '123 W Louisiana St', 39.7615, -86.1618, 0, 1, TRUE, 2026),
(0, 'Hyatt Regency Indianapolis', '1 S Capitol Ave', 39.7668, -86.1627, 0, 1, TRUE, 2026),

-- Downtown (blocks away)
(0, 'Omni Severin Hotel', '40 W Jackson Pl', 39.7607, -86.1600, 2, 1, FALSE, 2026),
(0, 'Hilton Indianapolis Hotel & Suites', '120 W Market St', 39.7693, -86.1593, 3, 1, FALSE, 2026),
(0, 'Embassy Suites Downtown', '110 W Washington St', 39.7682, -86.1583, 3, 1, FALSE, 2026),
(0, 'Hampton Inn Indianapolis Downtown', '105 S Meridian St', 39.7658, -86.1580, 2, 1, FALSE, 2026),
(0, 'Courtyard by Marriott Indianapolis Downtown', '601 W Washington St', 39.7683, -86.1694, 4, 1, FALSE, 2026),
(0, 'Fairfield Inn & Suites Indianapolis Downtown', '501 W Washington St', 39.7681, -86.1672, 3, 1, FALSE, 2026),
(0, 'SpringHill Suites Indianapolis Downtown', '601 W Washington St', 39.7683, -86.1694, 4, 1, FALSE, 2026),
(0, 'Home2 Suites Indianapolis Downtown', '230 S Meridian St', 39.7640, -86.1578, 2, 1, FALSE, 2026),
(0, 'Residence Inn Indianapolis Downtown on the Canal', '350 W New York St', 39.7714, -86.1645, 4, 1, FALSE, 2026),
(0, 'Le Meridien Indianapolis', '123 S Illinois St', 39.7648, -86.1595, 1, 1, FALSE, 2026),
(0, 'Conrad Indianapolis', '50 W Washington St', 39.7682, -86.1575, 2, 1, FALSE, 2026);

-- NOTE: passkey_hotel_id values (set to 0 above) will be populated from the
-- first actual scrape. The scraper should upsert by matching on hotel name + year.
-- Lat/lng coordinates above are approximate — verify with Google Maps geocoding API.
-- The hotel list changes slightly year to year. This is a starting point.
```

---

## 11. Distance Unit Labels

Helper function for the frontend:

```typescript
export function getDistanceLabel(distance: number, unit: number, hasSkywalk: boolean): string {
    if (hasSkywalk) return 'Skywalk';
    
    const unitLabels: Record<number, string> = {
        1: 'blocks',
        2: 'yards',
        3: 'miles',
        4: 'meters',
        5: 'km'
    };
    
    return `${distance} ${unitLabels[unit] || 'units'}`;
}
```

---

## 12. Yearly Maintenance Checklist

Each year before housing opens:

1. **Get the new Passkey token URL** — Requires purchasing a Gen Con badge, going to My Housing, and copying the URL from "Go to Housing Portal"
2. **Update `event_id` and `owner_id`** — Extract from the new Passkey URL or the page's JavaScript
3. **Update dates** — Convention dates, housing window dates, default check-in/check-out
4. **Verify hotel list** — Some hotels may join or leave the block
5. **Update `app_config` table** with all new values
6. **Turn on the scraper** — Set `scraper_active` to `true`
7. **Test a manual scrape** — `POST /scrape/trigger` and verify data flows through
8. **Verify notifications** — Test a Discord webhook, web push, etc.

After the convention:
1. **Turn off the scraper** — Set `scraper_active` to `false`
2. **Export historical data** — Optional: dump `room_snapshots` for the year as a downloadable archive (like the existing site's `gchdata.zip`)
3. **Spin down Railway** — Stop the scraper container to save costs

---

## 13. Potential Future Enhancements

- **Room type normalization** — Passkey room descriptions vary; normalize "King Bed" vs "1 King" etc. for better filtering
- **Price history charts** — Track rate changes over time (unlikely for block hotels but possible)
- **Multi-event support** — Could be adapted for Origins, PAX, or any event using Passkey
- **User accounts** — Optional accounts to manage multiple watchers, save preferences
- **Twitter/X bot** — Auto-post when rare rooms (skywalk, suites) become available
- **Telegram notifications** — Popular in some gaming communities
- **API for third-party tools** — Let other developers build on top of the data
- **Embed widget** — An embeddable widget that Gen Con community sites could add to their pages
- **Room swap marketplace** — A community forum for people who want to trade rooms (legally complex, proceed with caution)
