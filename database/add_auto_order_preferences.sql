-- Add auto-order preferences to the preferences table
-- Date: 2025-12-02

-- Add auto-order columns to preferences table
ALTER TABLE preferences
ADD COLUMN IF NOT EXISTS auto_order_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_order_threshold_days INTEGER DEFAULT 3 CHECK (auto_order_threshold_days >= 0);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_preferences_auto_order ON preferences(user_id, auto_order_enabled);

-- Add comment for documentation
COMMENT ON COLUMN preferences.auto_order_enabled IS 'Enable automatic ordering when inventory runs low';
COMMENT ON COLUMN preferences.auto_order_threshold_days IS 'Number of days before runout to trigger auto-order (default: 3)';

-- Update seed data to include auto-order preferences
UPDATE preferences 
SET auto_order_enabled = false,
    auto_order_threshold_days = 3
WHERE user_id = 'demo_user';

DO $$
BEGIN
    RAISE NOTICE 'Auto-order preferences added successfully!';
    RAISE NOTICE '  - auto_order_enabled (default: false)';
    RAISE NOTICE '  - auto_order_threshold_days (default: 3 days)';
END $$;
