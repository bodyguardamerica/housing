-- Add a manual skywalk override field that the scraper will never touch
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS skywalk_manual BOOLEAN DEFAULT FALSE;

-- Set the known skywalk hotels
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Courtyard%Marriott%Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Crowne Plaza%Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Embassy Suites%Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Fairfield Inn%Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Hyatt Regency Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%JW Marriott Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Le Meridien Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Omni Severin%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%SpringHill Suites%Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Westin Indianapolis%';
UPDATE hotels SET skywalk_manual = true WHERE name ILIKE '%Indianapolis Marriott Downtown%';

-- Update the view to use skywalk_manual instead of has_skywalk
DROP VIEW IF EXISTS latest_room_availability;

CREATE OR REPLACE VIEW latest_room_availability AS
WITH latest_scrape AS (
    SELECT id FROM scrape_runs
    WHERE status = 'success'
      AND rooms_found > 0
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
    h.skywalk_manual AS has_skywalk,
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
