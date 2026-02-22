-- GenCon Hotels Database Schema
-- Run this migration in your Supabase SQL editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Hotels: Static reference table for hotels in the Gen Con block
CREATE TABLE hotels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    passkey_hotel_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT DEFAULT 'Indianapolis',
    state TEXT DEFAULT 'IN',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_from_icc DOUBLE PRECISION,
    distance_unit INTEGER NOT NULL DEFAULT 1, -- 1=blocks, 2=yards, 3=miles, 4=meters, 5=km
    has_skywalk BOOLEAN DEFAULT FALSE,
    year INTEGER NOT NULL,
    amenities JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(passkey_hotel_id, year)
);

CREATE INDEX idx_hotels_year ON hotels(year);
CREATE INDEX idx_hotels_distance ON hotels(distance_from_icc);

-- Scrape Runs: Log of every scrape attempt
CREATE TABLE scrape_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'error'
    error_message TEXT,
    hotels_found INTEGER DEFAULT 0,
    rooms_found INTEGER DEFAULT 0,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    duration_ms INTEGER,
    year INTEGER NOT NULL,
    no_changes BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_scrape_runs_status ON scrape_runs(status);
CREATE INDEX idx_scrape_runs_started ON scrape_runs(started_at DESC);

-- Room Snapshots: Core table (append-only log of availability)
CREATE TABLE room_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scrape_run_id UUID NOT NULL REFERENCES scrape_runs(id),
    hotel_id UUID NOT NULL REFERENCES hotels(id),
    room_type TEXT NOT NULL,
    room_description TEXT,
    available_count INTEGER NOT NULL DEFAULT 0,
    nightly_rate NUMERIC(10,2),
    total_price NUMERIC(10,2),
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    num_nights INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    year INTEGER NOT NULL,
    raw_block_data JSONB
);

CREATE INDEX idx_snapshots_hotel ON room_snapshots(hotel_id);
CREATE INDEX idx_snapshots_scraped ON room_snapshots(scraped_at DESC);
CREATE INDEX idx_snapshots_year ON room_snapshots(year);
CREATE INDEX idx_snapshots_available ON room_snapshots(available_count) WHERE available_count > 0;
CREATE INDEX idx_snapshots_latest ON room_snapshots(year, scraped_at DESC, available_count);

-- Watchers: Users who want notifications
CREATE TABLE watchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Contact info (at least one required)
    email TEXT,
    discord_webhook_url TEXT,
    phone_number TEXT,
    push_subscription JSONB,

    -- Manage token (hashed)
    manage_token_hash TEXT NOT NULL,

    -- Filter criteria
    hotel_id UUID REFERENCES hotels(id),
    max_price NUMERIC(10,2),
    max_distance DOUBLE PRECISION,
    require_skywalk BOOLEAN DEFAULT FALSE,
    room_type_pattern TEXT,

    -- State
    active BOOLEAN DEFAULT TRUE,
    cooldown_minutes INTEGER DEFAULT 15,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    year INTEGER NOT NULL,

    -- Rate limiting
    notifications_sent_today INTEGER DEFAULT 0,
    max_notifications_per_day INTEGER DEFAULT 50
);

CREATE INDEX idx_watchers_active ON watchers(active) WHERE active = TRUE;
CREATE INDEX idx_watchers_year ON watchers(year);

-- Notifications Log: Audit trail
CREATE TABLE notifications_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watcher_id UUID NOT NULL REFERENCES watchers(id),
    room_snapshot_id UUID NOT NULL REFERENCES room_snapshots(id),
    channel TEXT NOT NULL, -- 'discord', 'email', 'sms', 'web_push'
    status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'skipped'
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_watcher ON notifications_log(watcher_id);
CREATE INDEX idx_notifications_sent ON notifications_log(sent_at DESC);

-- App Config: Runtime configuration
CREATE TABLE app_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with required config
INSERT INTO app_config (key, value, description) VALUES
    ('passkey_event_id', '"50910675"', 'Passkey event ID for current year'),
    ('passkey_owner_id', '"10909638"', 'Passkey owner ID for current year'),
    ('scrape_interval_seconds', '60', 'How often the scraper runs'),
    ('current_year', '2026', 'Current convention year'),
    ('convention_start_date', '"2026-07-30"', 'First day of Gen Con'),
    ('convention_end_date', '"2026-08-02"', 'Last day of Gen Con'),
    ('housing_first_day', '"2026-07-25"', 'Earliest check-in in the housing block'),
    ('housing_last_day', '"2026-08-07"', 'Latest check-out in the housing block'),
    ('default_check_in', '"2026-07-29"', 'Default check-in (day before con)'),
    ('default_check_out', '"2026-08-03"', 'Default check-out (day after con)'),
    ('scraper_active', 'false', 'Master switch to enable/disable scraping'),
    ('site_banner_message', 'null', 'Optional banner message shown on the site');

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Latest Room Availability: Most recent snapshot of each room type at each hotel
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
    h.address,
    h.distance_from_icc,
    h.distance_unit,
    h.has_skywalk,
    h.latitude,
    h.longitude,
    rs.room_type,
    rs.room_description,
    rs.available_count,
    rs.nightly_rate,
    rs.total_price,
    rs.check_in,
    rs.check_out,
    rs.num_nights,
    rs.scraped_at,
    EXTRACT(EPOCH FROM (NOW() - rs.scraped_at))::INTEGER AS seconds_ago
FROM room_snapshots rs
JOIN hotels h ON rs.hotel_id = h.id
JOIN latest_scrape ls ON rs.scrape_run_id = ls.id
WHERE rs.available_count > 0
ORDER BY h.distance_from_icc ASC, rs.total_price ASC;

-- Room Availability History: For charts
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

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Match watchers for a given snapshot
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

-- Reset daily notification counts
CREATE OR REPLACE FUNCTION reset_daily_notification_counts()
RETURNS void AS $$
BEGIN
    UPDATE watchers SET notifications_sent_today = 0 WHERE notifications_sent_today > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Hotels: public read
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hotels are publicly readable" ON hotels FOR SELECT USING (true);

-- Room snapshots: public read
ALTER TABLE room_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Snapshots are publicly readable" ON room_snapshots FOR SELECT USING (true);

-- Scrape runs: public read
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scrape runs are publicly readable" ON scrape_runs FOR SELECT USING (true);

-- Watchers: service role only (accessed via API)
ALTER TABLE watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Watchers service role access" ON watchers USING (true) WITH CHECK (true);

-- Notifications log: service role only
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notifications service role access" ON notifications_log USING (true) WITH CHECK (true);

-- App config: public read
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Config is publicly readable" ON app_config FOR SELECT USING (true);

-- ============================================================================
-- REALTIME
-- ============================================================================

-- Enable realtime on room_snapshots (run this in Supabase dashboard if needed)
-- ALTER PUBLICATION supabase_realtime ADD TABLE room_snapshots;

-- ============================================================================
-- SEED DATA: Indianapolis Hotels
-- ============================================================================

-- ICC (Indiana Convention Center) reference point: 39.7637, -86.1603

INSERT INTO hotels (passkey_hotel_id, name, address, latitude, longitude, distance_from_icc, distance_unit, has_skywalk, year) VALUES
-- Skywalk-connected hotels (using negative placeholder IDs until real scrape populates them)
(-1, 'JW Marriott Indianapolis', '10 S West St', 39.7654, -86.1631, 0, 1, TRUE, 2026),
(-2, 'Indianapolis Marriott Downtown', '350 W Maryland St', 39.7635, -86.1651, 0, 1, TRUE, 2026),
(-3, 'Westin Indianapolis', '241 W Washington St', 39.7680, -86.1612, 0, 1, TRUE, 2026),
(-4, 'Crowne Plaza Indianapolis - Downtown Union Station', '123 W Louisiana St', 39.7615, -86.1618, 0, 1, TRUE, 2026),
(-5, 'Hyatt Regency Indianapolis', '1 S Capitol Ave', 39.7668, -86.1627, 0, 1, TRUE, 2026),

-- Downtown (blocks away)
(-6, 'Omni Severin Hotel', '40 W Jackson Pl', 39.7607, -86.1600, 2, 1, FALSE, 2026),
(-7, 'Hilton Indianapolis Hotel & Suites', '120 W Market St', 39.7693, -86.1593, 3, 1, FALSE, 2026),
(-8, 'Embassy Suites Downtown', '110 W Washington St', 39.7682, -86.1583, 3, 1, FALSE, 2026),
(-9, 'Hampton Inn Indianapolis Downtown', '105 S Meridian St', 39.7658, -86.1580, 2, 1, FALSE, 2026),
(-10, 'Courtyard by Marriott Indianapolis Downtown', '601 W Washington St', 39.7683, -86.1694, 4, 1, FALSE, 2026),
(-11, 'Fairfield Inn & Suites Indianapolis Downtown', '501 W Washington St', 39.7681, -86.1672, 3, 1, FALSE, 2026),
(-12, 'SpringHill Suites Indianapolis Downtown', '601 W Washington St', 39.7683, -86.1694, 4, 1, FALSE, 2026),
(-13, 'Home2 Suites Indianapolis Downtown', '230 S Meridian St', 39.7640, -86.1578, 2, 1, FALSE, 2026),
(-14, 'Residence Inn Indianapolis Downtown on the Canal', '350 W New York St', 39.7714, -86.1645, 4, 1, FALSE, 2026),
(-15, 'Le Meridien Indianapolis', '123 S Illinois St', 39.7648, -86.1595, 1, 1, FALSE, 2026),
(-16, 'Conrad Indianapolis', '50 W Washington St', 39.7682, -86.1575, 2, 1, FALSE, 2026);

-- Note: passkey_hotel_id values (negative placeholders) will be updated from the first actual scrape
