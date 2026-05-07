-- FIX: notifications_sent_today is never reset, so the per-watcher daily
-- cap silently stops firings forever once hit. There's a
-- `reset_daily_notification_counts()` function from migration 001 but
-- nothing ever calls it (no pg_cron, no scheduler).
--
-- Adopt the self-healing pattern already used for phone_permissions
-- (migration 019): add a `last_reset_date` column and zero the counter at
-- the top of `record_watcher_notification` whenever a new local day
-- starts. No cron required — the next notification of the day pays the
-- one-row reset cost.

ALTER TABLE watchers
    ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE;

COMMENT ON COLUMN watchers.last_reset_date IS
  'Date of the last daily-counter reset. record_watcher_notification rolls notifications_sent_today back to 0 when this is older than CURRENT_DATE.';

-- Backfill existing rows so the first post-deploy notification triggers
-- a reset rather than appearing as "already-correct for today".
UPDATE watchers
SET last_reset_date = COALESCE(
        last_reset_date,
        last_notified_at::DATE,
        created_at::DATE,
        CURRENT_DATE
    )
WHERE last_reset_date IS NULL;

-- Also clear the stale lifetime accumulation on the existing Downtown
-- watcher so today's count starts at 0 instead of 9.
UPDATE watchers
SET notifications_sent_today = 0,
    last_reset_date = CURRENT_DATE
WHERE id = 'ee74bae1-6e08-4208-a6a3-782ac30174bc';

CREATE OR REPLACE FUNCTION record_watcher_notification(p_watcher_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE watchers
    SET
        -- If the local-day rolled over since the last stamp, zero the
        -- counter atomically so the very next notification of the day
        -- starts at 1, not at yesterday's leftover total.
        notifications_sent_today =
            CASE
                WHEN last_reset_date < CURRENT_DATE THEN 1
                ELSE COALESCE(notifications_sent_today, 0) + 1
            END,
        last_reset_date = CURRENT_DATE,
        last_notified_at = NOW()
    WHERE id = p_watcher_id;
END;
$$ LANGUAGE plpgsql;
