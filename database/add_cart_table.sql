-- Migration: Add shopping cart table
-- This table stores items that users want to order before they become actual orders
-- Date: 2025-12-01

-- ============================================
-- CART TABLE
-- ============================================
-- Stores shopping cart/list items before they become orders
CREATE TABLE IF NOT EXISTS cart (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'demo_user',
    item_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    estimated_price DECIMAL(10, 2),
    notes TEXT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Track source of cart addition
    source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'trash', 'deplete', 'cart_icon'
    
    CONSTRAINT unique_user_cart_item UNIQUE(user_id, item_name)
);

-- Index for faster queries
CREATE INDEX idx_cart_user_id ON cart(user_id);
CREATE INDEX idx_cart_added_at ON cart(added_at);

-- Update timestamp on update
CREATE OR REPLACE FUNCTION update_cart_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cart_updated_at
    BEFORE UPDATE ON cart
    FOR EACH ROW
    EXECUTE FUNCTION update_cart_timestamp();
