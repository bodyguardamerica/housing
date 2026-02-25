-- Add discord_mention column to watchers table
-- Stores Discord mention string like <@123456789> or <@&987654321>

ALTER TABLE watchers ADD COLUMN IF NOT EXISTS discord_mention TEXT;

-- Add comment
COMMENT ON COLUMN watchers.discord_mention IS 'Discord mention string (e.g., <@USER_ID> or <@&ROLE_ID>) to ping when notification is sent';
