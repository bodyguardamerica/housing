-- Migration: Add cleanup function for old watchers
-- Watchers are cleaned up after the convention year ends or after 180 days of inactivity

-- Function to clean up old watchers
CREATE OR REPLACE FUNCTION cleanup_old_watchers()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
  current_year INTEGER;
BEGIN
  -- Get current year from app_config, default to extracting from current date
  SELECT COALESCE(
    (SELECT (value::text)::integer FROM app_config WHERE key = 'current_year'),
    EXTRACT(YEAR FROM CURRENT_DATE)::integer
  ) INTO current_year;

  -- Delete watchers that are:
  -- 1. From a previous year (convention is over)
  -- 2. OR older than 180 days AND have never sent a notification
  -- 3. OR inactive for 90+ days (last_notified_at is old)
  DELETE FROM watchers
  WHERE
    -- Previous year's watchers (convention is over)
    year < current_year
    -- OR created more than 180 days ago and never notified
    OR (created_at < NOW() - INTERVAL '180 days' AND last_notified_at IS NULL)
    -- OR last notification was more than 90 days ago
    OR (last_notified_at IS NOT NULL AND last_notified_at < NOW() - INTERVAL '90 days');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Log the cleanup
  RAISE NOTICE 'Cleaned up % old watchers', deleted_count;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_old_watchers() TO service_role;

-- Create a cron job to run cleanup daily at 3 AM UTC
-- Note: This requires pg_cron extension to be enabled in Supabase
-- You can enable it in the Supabase dashboard under Database > Extensions

-- To manually run the cleanup, call:
-- SELECT cleanup_old_watchers();

COMMENT ON FUNCTION cleanup_old_watchers() IS
'Cleans up old Discord watchers:
- Deletes watchers from previous convention years
- Deletes watchers older than 180 days that never sent notifications
- Deletes watchers inactive for 90+ days';
