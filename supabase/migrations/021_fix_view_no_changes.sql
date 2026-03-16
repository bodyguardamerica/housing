-- FIX: latest_room_availability view was returning EMPTY data after every no_changes scrape.
--
-- ROOT CAUSE: When the scraper detects no data changes (hash matches), it creates a
-- scrape_run with status='success', rooms_found=len(result.nights) (which is > 0),
-- and no_changes=TRUE. Crucially, it does NOT insert any room_snapshots for that run.
--
-- The old view's CTE picked the latest scrape with status='success' AND rooms_found > 0.
-- This selected the most recent no_changes scrape, whose scrape_run_id has zero
-- associated room_snapshots. The JOIN then returned zero rows -- view was empty.
--
-- Since scrapes run every 60 seconds and most scrapes are no_changes (data rarely
-- changes minute-to-minute), the view was ALMOST ALWAYS EMPTY. Rooms only appeared
-- for the brief ~0-60s window right after a real change was detected, then vanished
-- as soon as the next no_changes scrape ran.
--
-- FIX: Add AND no_changes = FALSE to the CTE so we always pick the latest scrape
-- that actually inserted room_snapshots.

DROP VIEW IF EXISTS latest_room_availability;

CREATE OR REPLACE VIEW latest_room_availability AS
WITH latest_scrape AS (
    -- Get the latest successful scrape that actually inserted room snapshots.
    -- MUST exclude no_changes=TRUE runs: they have rooms_found > 0 (rooms were
    -- fetched and hashed) but NO room_snapshots were inserted (data was identical
    -- to the previous run). Without this filter the view returns empty rows.
    SELECT id FROM scrape_runs
    WHERE status = 'success'
      AND rooms_found > 0
      AND no_changes = FALSE
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
    EXTRACT(EPOCH FROM (NOW() - rs.scraped_at))::INTEGER AS seconds_ago,
    COALESCE((rs.raw_block_data->>'partial_availability')::BOOLEAN, FALSE) AS partial_availability,
    COALESCE((rs.raw_block_data->>'nights_available')::INTEGER, 0) AS nights_available,
    COALESCE((rs.raw_block_data->>'total_nights')::INTEGER, rs.num_nights) AS total_nights,
    COALESCE((rs.raw_block_data->>'sold_out')::BOOLEAN, FALSE) AS sold_out,
    rs.raw_block_data
FROM room_snapshots rs
JOIN hotels h ON rs.hotel_id = h.id
JOIN latest_scrape ls ON rs.scrape_run_id = ls.id
ORDER BY h.distance_from_icc ASC, rs.total_price ASC;
