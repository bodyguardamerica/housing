-- Migration: Admin system and phone notification permissions
-- This creates an admin whitelist and permission system for SMS/call notifications

-- Admin users table (simple email whitelist)
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phone notification permissions (admin-granted)
CREATE TABLE IF NOT EXISTS phone_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT, -- Denormalized for display in admin UI
    granted_by UUID REFERENCES admin_users(id),
    sms_enabled BOOLEAN DEFAULT FALSE,
    call_enabled BOOLEAN DEFAULT FALSE,
    daily_sms_limit INTEGER DEFAULT 10,
    daily_call_limit INTEGER DEFAULT 3,
    sms_sent_today INTEGER DEFAULT 0,
    calls_made_today INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Add phone fields to user_alerts
ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS call_enabled BOOLEAN DEFAULT FALSE;

-- RLS: Admin check function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admin_users
        WHERE email = auth.jwt()->>'email'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies for admin_users table
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check if they are admin"
    ON admin_users FOR SELECT
    USING (true);

CREATE POLICY "Only admins can manage admin_users"
    ON admin_users FOR ALL
    USING (is_admin());

-- RLS policies for phone_permissions
ALTER TABLE phone_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own permissions"
    ON phone_permissions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all permissions"
    ON phone_permissions FOR SELECT
    USING (is_admin());

CREATE POLICY "Admins can insert permissions"
    ON phone_permissions FOR INSERT
    WITH CHECK (is_admin());

CREATE POLICY "Admins can update permissions"
    ON phone_permissions FOR UPDATE
    USING (is_admin());

CREATE POLICY "Admins can delete permissions"
    ON phone_permissions FOR DELETE
    USING (is_admin());

-- Trigger to update updated_at on phone_permissions
CREATE OR REPLACE FUNCTION update_phone_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER phone_permissions_updated_at
    BEFORE UPDATE ON phone_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_phone_permissions_updated_at();

-- Function to reset daily counters (call this via cron or on check)
CREATE OR REPLACE FUNCTION reset_daily_phone_counters()
RETURNS void AS $$
BEGIN
    UPDATE phone_permissions
    SET sms_sent_today = 0,
        calls_made_today = 0,
        last_reset_date = CURRENT_DATE
    WHERE last_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to increment SMS counter and check limit
CREATE OR REPLACE FUNCTION increment_sms_counter(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_limit INTEGER;
    v_count INTEGER;
BEGIN
    -- Reset if needed
    PERFORM reset_daily_phone_counters();

    -- Get current values
    SELECT daily_sms_limit, sms_sent_today
    INTO v_limit, v_count
    FROM phone_permissions
    WHERE user_id = p_user_id AND sms_enabled = true;

    IF NOT FOUND THEN
        RETURN FALSE; -- No permission
    END IF;

    IF v_count >= v_limit THEN
        RETURN FALSE; -- Limit reached
    END IF;

    -- Increment counter
    UPDATE phone_permissions
    SET sms_sent_today = sms_sent_today + 1
    WHERE user_id = p_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to increment call counter and check limit
CREATE OR REPLACE FUNCTION increment_call_counter(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_limit INTEGER;
    v_count INTEGER;
BEGIN
    -- Reset if needed
    PERFORM reset_daily_phone_counters();

    -- Get current values
    SELECT daily_call_limit, calls_made_today
    INTO v_limit, v_count
    FROM phone_permissions
    WHERE user_id = p_user_id AND call_enabled = true;

    IF NOT FOUND THEN
        RETURN FALSE; -- No permission
    END IF;

    IF v_count >= v_limit THEN
        RETURN FALSE; -- Limit reached
    END IF;

    -- Increment counter
    UPDATE phone_permissions
    SET calls_made_today = calls_made_today + 1
    WHERE user_id = p_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE admin_users IS 'Whitelist of admin users by email';
COMMENT ON TABLE phone_permissions IS 'Per-user permissions for SMS and phone call notifications';
COMMENT ON FUNCTION is_admin() IS 'Check if current JWT user is an admin';
COMMENT ON FUNCTION increment_sms_counter(UUID) IS 'Increment SMS counter, returns false if limit reached';
COMMENT ON FUNCTION increment_call_counter(UUID) IS 'Increment call counter, returns false if limit reached';
