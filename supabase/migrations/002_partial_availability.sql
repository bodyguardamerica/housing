-- Migration: Support partial availability display
-- The original view filtered out rooms where available_count = 0,
-- which excludes partial availability (rooms available for some but not all nights)

-- Drop and recreate the view to include partial availability
DROP VIEW IF EXISTS latest_room_availability;

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
    rs.raw_block_data,
    -- Partial availability fields from raw_block_data
    COALESCE((rs.raw_block_data->>'partial_availability')::boolean, FALSE) AS partial_availability,
    COALESCE((rs.raw_block_data->>'nights_available')::integer, rs.num_nights) AS nights_available,
    COALESCE((rs.raw_block_data->>'total_nights')::integer, rs.num_nights) AS total_nights,
    EXTRACT(EPOCH FROM (NOW() - rs.scraped_at))::INTEGER AS seconds_ago
FROM room_snapshots rs
JOIN hotels h ON rs.hotel_id = h.id
JOIN latest_scrape ls ON rs.scrape_run_id = ls.id
WHERE
    -- Include rooms with full availability (available_count > 0)
    rs.available_count > 0
    -- OR include rooms with partial availability
    OR (rs.raw_block_data->>'partial_availability')::boolean = TRUE
ORDER BY h.distance_from_icc ASC, rs.total_price ASC;
