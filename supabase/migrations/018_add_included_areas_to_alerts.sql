-- Migration: Replace require_downtown with included_areas array
-- This allows filtering by multiple areas (downtown, west/airport, east, north, south)

-- Add included_areas column as text array
ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS included_areas TEXT[];

-- Migrate existing require_downtown data to included_areas
UPDATE user_alerts
SET included_areas = ARRAY['downtown']
WHERE require_downtown = TRUE AND (included_areas IS NULL OR array_length(included_areas, 1) IS NULL);

-- Drop the old require_downtown column (optional - keeping for now for backward compatibility)
-- ALTER TABLE user_alerts DROP COLUMN IF EXISTS require_downtown;

-- Add comment
COMMENT ON COLUMN user_alerts.included_areas IS 'Array of area codes to match: downtown, west/airport, east, north, south. NULL or empty means all areas.';
