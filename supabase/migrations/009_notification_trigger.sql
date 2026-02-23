-- NOTE: pg_net extension must be enabled in your Supabase project first!
-- Go to Database > Extensions in Supabase Dashboard and enable "pg_net"

-- Create the function that will be called by the trigger
CREATE OR REPLACE FUNCTION notify_on_room_insert()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
  request_id BIGINT;
BEGIN
  -- Only notify if there's actual availability
  IF NEW.available_count <= 0 THEN
    RETURN NEW;
  END IF;

  -- Get config from app_config table
  SELECT value#>>'{}' INTO supabase_url FROM app_config WHERE key = 'supabase_url';
  SELECT value#>>'{}' INTO service_key FROM app_config WHERE key = 'service_role_key';

  -- Call the match-watchers edge function using pg_net
  IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/match-watchers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'room_snapshots',
        'record', jsonb_build_object(
          'id', NEW.id,
          'hotel_id', NEW.hotel_id,
          'room_type', NEW.room_type,
          'available_count', NEW.available_count,
          'nightly_rate', NEW.nightly_rate,
          'total_price', NEW.total_price,
          'check_in', NEW.check_in,
          'check_out', NEW.check_out,
          'year', NEW.year
        )
      )
    ) INTO request_id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'notify_on_room_insert failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS room_snapshot_notify ON room_snapshots;
CREATE TRIGGER room_snapshot_notify
  AFTER INSERT ON room_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_room_insert();

-- Add config entries for the edge function URL (these need to be set manually)
-- Update these values after running the migration!
INSERT INTO app_config (key, value, description)
VALUES
  ('supabase_url', '"https://YOUR_PROJECT_ID.supabase.co"', 'Supabase project URL for edge function calls'),
  ('service_role_key', '"YOUR_SERVICE_ROLE_KEY"', 'Service role key for edge function authentication')
ON CONFLICT (key) DO NOTHING;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION notify_on_room_insert() TO service_role;
