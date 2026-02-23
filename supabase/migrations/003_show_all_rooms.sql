-- Show ALL rooms from latest scrape, regardless of availability status
-- Run this migration in your Supabase SQL editor

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
    EXTRACT(EPOCH FROM (NOW() - rs.scraped_at))::INTEGER AS seconds_ago,
    -- Partial availability fields from raw_block_data
    COALESCE((rs.raw_block_data->>'partial_availability')::BOOLEAN, FALSE) AS partial_availability,
    COALESCE((rs.raw_block_data->>'nights_available')::INTEGER, 0) AS nights_available,
    COALESCE((rs.raw_block_data->>'total_nights')::INTEGER, rs.num_nights) AS total_nights,
    COALESCE((rs.raw_block_data->>'sold_out')::BOOLEAN, FALSE) AS sold_out,
    rs.raw_block_data
FROM room_snapshots rs
JOIN hotels h ON rs.hotel_id = h.id
JOIN latest_scrape ls ON rs.scrape_run_id = ls.id
-- NO FILTER: Show all rooms regardless of availability
ORDER BY h.distance_from_icc ASC, rs.total_price ASC;
