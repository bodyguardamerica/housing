-- Bring server-side watchers to parity with the alert UI's filter set.
--
-- The alert modal (UnifiedAlertModal.tsx) collects 5 filters:
--   1. Hotel Name Contains       - dropped on the wire (no column)
--   2. Max Price/Night ($)       - already supported
--   3. Max Distance (blocks)     - already supported
--   4. Require skywalk access    - already supported
--   5. Include Areas (multi)     - dropped on the wire (no column)
-- Plus the human-readable Alert Name was never persisted, so notifications and
-- admin views couldn't tell the watchers apart.
--
-- Without #1 and #5 a watcher with "Downtown only" silently fired on every
-- newly available room across every area. This adds the missing columns and
-- updates match_watchers_for_snapshot to honor them.

ALTER TABLE watchers ADD COLUMN IF NOT EXISTS alert_name TEXT;
ALTER TABLE watchers ADD COLUMN IF NOT EXISTS hotel_name_pattern TEXT;
ALTER TABLE watchers ADD COLUMN IF NOT EXISTS included_areas TEXT[];

COMMENT ON COLUMN watchers.alert_name IS
  'Human-readable name from the alert UI. Not used for matching; surfaced in admin/Discord copy.';
COMMENT ON COLUMN watchers.hotel_name_pattern IS
  'Case-insensitive substring match against hotels.name. NULL = no constraint.';
COMMENT ON COLUMN watchers.included_areas IS
  'Hotel area allow-list (e.g. {downtown,north}). NULL or empty = no constraint. Values must match hotels.area exactly.';

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
        -- Match full availability OR partial availability (some nights available)
        AND (
            rs.available_count > 0
            OR (
                (rs.raw_block_data->>'partial_availability')::boolean = TRUE
                AND (rs.raw_block_data->>'nights_available')::int > 0
            )
        )
        AND (w.hotel_id IS NULL OR w.hotel_id = rs.hotel_id)
        AND (w.hotel_name_pattern IS NULL
             OR h.name ILIKE '%' || w.hotel_name_pattern || '%')
        AND (w.max_price IS NULL OR rs.total_price <= w.max_price)
        AND (w.max_distance IS NULL OR h.distance_from_icc <= w.max_distance)
        AND (w.require_skywalk = FALSE OR h.has_skywalk = TRUE)
        AND (w.room_type_pattern IS NULL OR rs.room_type ~* w.room_type_pattern)
        AND (w.included_areas IS NULL
             OR array_length(w.included_areas, 1) IS NULL
             OR h.area = ANY(w.included_areas))
        AND (w.last_notified_at IS NULL
             OR w.last_notified_at < NOW() - (w.cooldown_minutes || ' minutes')::INTERVAL)
        AND w.notifications_sent_today < w.max_notifications_per_day;
END;
$$ LANGUAGE plpgsql;

-- Backfill: the user's existing "Downtown" alert lost its area filter at
-- creation time. Restore it so the next scrape doesn't fan out non-downtown
-- pings again.
UPDATE watchers
SET included_areas = ARRAY['downtown'],
    alert_name = COALESCE(alert_name, 'Downtown')
WHERE id = 'ee74bae1-6e08-4208-a6a3-782ac30174bc';
