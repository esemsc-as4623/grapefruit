-- Add consumption_history table for ML-based consumption learning
-- Tracks all inventory changes to learn consumption patterns
-- Date: 2025-12-01

-- ============================================
-- CONSUMPTION HISTORY TABLE
-- ============================================
-- Stores detailed consumption events for ML learning
CREATE TABLE IF NOT EXISTS consumption_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    
    -- Quantity tracking
    quantity_before DECIMAL(10, 2) NOT NULL,
    quantity_after DECIMAL(10, 2) NOT NULL,
    quantity_consumed DECIMAL(10, 2) NOT NULL, -- Can be negative for additions
    
    -- Time tracking
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    days_elapsed DECIMAL(10, 4), -- Days since last event for this item
    days_in_inventory DECIMAL(10, 4), -- Days item has been in inventory
    
    -- Event metadata
    event_type VARCHAR(50) NOT NULL, -- 'simulation', 'manual_update', 'deletion', 'purchase', 'receipt_scan'
    source VARCHAR(50), -- 'user', 'simulation', 'api'
    
    -- Item context at time of event
    unit VARCHAR(50),
    category VARCHAR(100),
    
    -- Indexes for fast queries
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES inventory(user_id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_consumption_user_item ON consumption_history(user_id, item_name);
CREATE INDEX IF NOT EXISTS idx_consumption_timestamp ON consumption_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_user_timestamp ON consumption_history(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_event_type ON consumption_history(event_type);

-- Add comment for documentation
COMMENT ON TABLE consumption_history IS 'Tracks all inventory consumption events for ML-based learning of consumption patterns';
COMMENT ON COLUMN consumption_history.days_elapsed IS 'Days since last consumption event for this specific item (used for rate calculation)';
COMMENT ON COLUMN consumption_history.days_in_inventory IS 'Total days item has existed in inventory (used for confidence weighting)';
