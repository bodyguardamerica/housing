-- FIX: match_watchers_for_snapshot was silently ignoring partial availability rooms.
--
-- ROOT CAUSE: The old function had AND rs.available_count > 0, which is the
-- full-stay availability count. When a hotel has rooms on only SOME of the
-- requested nights (e.g., July 29-31 but not July 31-Aug 3), the scraper sets
-- available_count = 0 and partial_availability = true in raw_block_data.
-- These partial rooms were never matched against watchers, so no Discord /
-- push notification was ever sent for them.
--
-- FIX: Also match when raw_block_data indicates partial_availability = true
-- with at least one night available.

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
        AND (w.max_price IS NULL OR rs.total_price <= w.max_price)
        AND (w.max_distance IS NULL OR h.distance_from_icc <= w.max_distance)
        AND (w.require_skywalk = FALSE OR h.has_skywalk = TRUE)
        AND (w.room_type_pattern IS NULL OR rs.room_type ~* w.room_type_pattern)
        AND (w.last_notified_at IS NULL
             OR w.last_notified_at < NOW() - (w.cooldown_minutes || ' minutes')::INTERVAL)
        AND w.notifications_sent_today < w.max_notifications_per_day;
END;
$$ LANGUAGE plpgsql;
