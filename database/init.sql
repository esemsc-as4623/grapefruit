-- Grapefruit Database Schema
-- Creates core tables for inventory tracking, user preferences, and order management
-- Author: Akedo AI Shopping Assistant Team
-- Date: 2025-11-30

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types for better data integrity
CREATE TYPE order_status AS ENUM ('pending', 'approved', 'rejected', 'placed', 'delivered', 'cancelled');
CREATE TYPE vendor_type AS ENUM ('amazon', 'walmart', 'other');

-- ============================================
-- INVENTORY TABLE
-- ============================================
-- Stores current inventory items with consumption tracking
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'demo_user', -- Simplified for hackathon (no auth)
    item_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity >= 0),
    unit VARCHAR(50) NOT NULL, -- gallon, lb, oz, count, etc.
    category VARCHAR(100), -- dairy, produce, pantry, frozen, etc.
    predicted_runout TIMESTAMP, -- ML-predicted date when item runs out
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata for consumption tracking
    average_daily_consumption DECIMAL(10, 4), -- Used by ML forecasting
    last_purchase_date TIMESTAMP,
    last_purchase_quantity DECIMAL(10, 2),
    
    -- Encryption support (encrypted fields stored as bytea in production)
    is_encrypted BOOLEAN DEFAULT false,
    
    CONSTRAINT unique_user_item UNIQUE(user_id, item_name)
);

-- Index for faster queries
CREATE INDEX idx_inventory_user_id ON inventory(user_id);
CREATE INDEX idx_inventory_category ON inventory(category);
CREATE INDEX idx_inventory_runout ON inventory(predicted_runout) WHERE predicted_runout IS NOT NULL;

-- ============================================
-- PREFERENCES TABLE
-- ============================================
-- Stores user preferences for brand preferences, and vendors
CREATE TABLE preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL UNIQUE DEFAULT 'demo_user',
    
    -- Brand preferences (JSON format)
    -- Example: {"milk": {"preferred": ["Organic Valley"], "acceptable": ["Great Value"], "avoid": ["Generic"]}}
    brand_prefs JSONB DEFAULT '{}'::jsonb,
    
    -- Vendor allowlist (JSON array)
    -- Example: ["amazon"]
    allowed_vendors JSONB DEFAULT '["amazon"]'::jsonb,
    
    -- Notification preferences
    notify_low_inventory BOOLEAN DEFAULT true,
    notify_order_ready BOOLEAN DEFAULT true,
    
    -- Encryption metadata
    is_encrypted BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ORDERS TABLE
-- ============================================
-- Stores order history and pending approvals
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'demo_user',
    vendor vendor_type NOT NULL,
    
    -- Order items (JSON array)
    -- Example: [{"item_name": "Whole Milk", "quantity": 2, "unit": "gallon", "price": 4.99, "brand": "Organic Valley"}]
    items JSONB NOT NULL,
    
    -- Financial data
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    tax DECIMAL(10, 2) DEFAULT 0.00,
    shipping DECIMAL(10, 2) DEFAULT 0.00,
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    
    -- Order lifecycle
    status order_status DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    placed_at TIMESTAMP,
    delivered_at TIMESTAMP,
    
    -- Audit trail (basic for demo)
    approval_notes TEXT,
    vendor_order_id VARCHAR(255), -- ID from Amazon/Walmart API
    tracking_number VARCHAR(255),
    
    -- Encryption metadata
    is_encrypted BOOLEAN DEFAULT false
);

-- Indexes for order queries
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_vendor ON orders(vendor);

-- ============================================
-- TRIGGERS
-- ============================================
-- Auto-update timestamp on inventory changes
CREATE OR REPLACE FUNCTION update_inventory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_update_timestamp
    BEFORE UPDATE ON inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_timestamp();

-- Auto-update timestamp on preferences changes
CREATE OR REPLACE FUNCTION update_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER preferences_update_timestamp
    BEFORE UPDATE ON preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_preferences_timestamp();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================
-- View for items running low (within 3 days)
CREATE OR REPLACE VIEW low_inventory AS
SELECT 
    id,
    user_id,
    item_name,
    quantity,
    unit,
    category,
    predicted_runout,
    EXTRACT(DAY FROM (predicted_runout - CURRENT_TIMESTAMP)) AS days_until_runout
FROM inventory
WHERE predicted_runout IS NOT NULL
  AND predicted_runout <= CURRENT_TIMESTAMP + INTERVAL '3 days'
  AND quantity > 0
ORDER BY predicted_runout ASC;

-- View for pending orders awaiting approval
CREATE OR REPLACE VIEW pending_orders AS
SELECT 
    id,
    user_id,
    vendor,
    items,
    total,
    created_at,
    EXTRACT(HOUR FROM (CURRENT_TIMESTAMP - created_at)) AS hours_pending
FROM orders
WHERE status = 'pending'
ORDER BY created_at ASC;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE inventory IS 'Stores current inventory items with ML-predicted runout dates';
COMMENT ON TABLE preferences IS 'User preferences for spending limits, brands, and vendors';
COMMENT ON TABLE orders IS 'Order history and approval workflow';
COMMENT ON VIEW low_inventory IS 'Items predicted to run out within 3 days';
COMMENT ON VIEW pending_orders IS 'Orders awaiting user approval';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Grapefruit database schema initialized successfully!';
    RAISE NOTICE 'Tables created: inventory, preferences, orders';
    RAISE NOTICE 'Views created: low_inventory, pending_orders';
END $$;

-- ============================================
-- CONSUMPTION HISTORY TABLE (for ML learning)
-- ============================================
-- Stores detailed consumption events for ML learning
-- Added: 2025-12-01
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
    category VARCHAR(100)
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

DO $$
BEGIN
    RAISE NOTICE 'Consumption history table created successfully!';
END $$;
