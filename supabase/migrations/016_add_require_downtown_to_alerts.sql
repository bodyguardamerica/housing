-- Add require_downtown column to user_alerts table
-- Allows users to filter alerts to only match downtown hotels

ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS require_downtown BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN user_alerts.require_downtown IS 'If true, only match hotels in the downtown area';
