-- FIX: match-watchers edge function was calling a non-existent RPC
-- (increment_notification_count) and passing its unawaited builder as a
-- column value. Both the increment and the last_notified_at stamp silently
-- failed, breaking watcher cooldowns.
--
-- Replace with a single RPC that atomically stamps last_notified_at and
-- increments notifications_sent_today.

CREATE OR REPLACE FUNCTION record_watcher_notification(p_watcher_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE watchers
    SET last_notified_at = NOW(),
        notifications_sent_today = COALESCE(notifications_sent_today, 0) + 1
    WHERE id = p_watcher_id;
END;
$$ LANGUAGE plpgsql;
