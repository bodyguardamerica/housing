-- Migration: Add area column to hotels for categorizing by location
-- Downtown hotels are within walking distance of the convention center

-- Add area column
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS area TEXT;

-- Mark downtown hotels (from Gen Con's official hotel list)
-- Using ILIKE for flexible matching since Passkey names may vary slightly

UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Aloft Indianapolis Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Bottleworks Hotel%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Candlewood Suites%Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Candlewood Suites%Medical District%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Columbia Club%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Conrad Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Courtyard%Capitol%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Courtyard%Marriott%Downtown%Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Crowne Plaza%Indianapolis%Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Crowne Plaza%Union Station%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Embassy Suites%Indianapolis%Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Fairfield Inn%Indianapolis Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Hampton Inn%Canal%IUPUI%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Hampton Inn%Indianapolis Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Hilton Garden Inn%Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Hilton Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Holiday Inn Express%Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Holiday Inn%Indianapolis Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Home2 Suites%Indianapolis Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Homewood Suites%Canal%IUPUI%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Hotel Indy%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Hyatt House%Indianapolis%Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Hyatt Place%Indianapolis%Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Hyatt Regency%Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Indianapolis Marriott Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%JW Marriott%Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Le Meridien%Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Omni Severin%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Residence Inn%Indianapolis%Canal%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Sheraton%Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Sleep Inn%Suites%Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%SpringHill Suites%Indianapolis Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Staybridge Suites%Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Alexander%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%TownePlace Suites%Indianapolis Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Westin%Indianapolis%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%Tru by Hilton%Indianapolis Downtown%';
UPDATE hotels SET area = 'downtown' WHERE name ILIKE '%InterContinental%Indianapolis%';

-- Add index for filtering by area
CREATE INDEX IF NOT EXISTS idx_hotels_area ON hotels(area);

-- Add comment
COMMENT ON COLUMN hotels.area IS 'Location area: downtown, suburbs, airport, etc. Downtown hotels are within walking distance of ICC.';

-- Update the view to include area
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
    h.passkey_hotel_id,
    h.name AS hotel_name,
    h.address,
    h.distance_from_icc,
    h.distance_unit,
    h.skywalk_manual AS has_skywalk,
    h.latitude,
    h.longitude,
    h.area,
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
