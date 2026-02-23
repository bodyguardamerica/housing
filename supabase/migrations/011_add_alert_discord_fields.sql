-- Add full_screen_enabled and discord_watcher_id columns to user_alerts

ALTER TABLE user_alerts
ADD COLUMN IF NOT EXISTS full_screen_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE user_alerts
ADD COLUMN IF NOT EXISTS discord_watcher_id UUID REFERENCES watchers(id) ON DELETE SET NULL;

-- Index for looking up alerts by watcher
CREATE INDEX IF NOT EXISTS idx_user_alerts_discord_watcher_id ON user_alerts(discord_watcher_id);
