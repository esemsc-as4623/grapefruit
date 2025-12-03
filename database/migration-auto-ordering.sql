-- Migration: Auto-Ordering System for Zero Inventory
-- Adds support for automatic reordering when items run out
-- Author: Grapefruit Auto-Ordering System
-- Date: 2025-12-01

-- ============================================
-- TABLE: amazon_catalog
-- Mock Amazon grocery catalog
-- ============================================
CREATE TABLE IF NOT EXISTS amazon_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_name VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100),
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    unit VARCHAR(50) NOT NULL,
    brand VARCHAR(100),
    in_stock BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_amazon_catalog_category ON amazon_catalog(category);
CREATE INDEX idx_amazon_catalog_in_stock ON amazon_catalog(in_stock);

-- ============================================
-- TABLE: to_order
-- Items that have run out and need reordering
-- ============================================
CREATE TABLE IF NOT EXISTS to_order (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL DEFAULT 'demo_user',
    inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    reorder_quantity DECIMAL(10, 2) NOT NULL CHECK (reorder_quantity > 0),

    -- Order tracking
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, ordered, delivered, cancelled

    -- Timestamps
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ordered_at TIMESTAMP,
    delivered_at TIMESTAMP,

    -- Metadata
    notes TEXT
);

CREATE INDEX idx_to_order_user_id ON to_order(user_id);
CREATE INDEX idx_to_order_status ON to_order(status);
CREATE INDEX idx_to_order_inventory_id ON to_order(inventory_id);
CREATE INDEX idx_to_order_order_id ON to_order(order_id);

-- ============================================
-- ADD delivery_date to orders table
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'delivery_date'
    ) THEN
        ALTER TABLE orders ADD COLUMN delivery_date DATE;
        CREATE INDEX idx_orders_delivery_date ON orders(delivery_date) WHERE delivery_date IS NOT NULL;
    END IF;
END $$;

-- ============================================
-- TABLE: background_jobs
-- Track background job execution
-- ============================================
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'running', -- running, completed, failed
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,

    -- Job results
    items_processed INTEGER DEFAULT 0,
    items_created INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_background_jobs_name ON background_jobs(job_name);
CREATE INDEX idx_background_jobs_started_at ON background_jobs(started_at DESC);

-- ============================================
-- ALTER preferences table for auto-ordering
-- ============================================
ALTER TABLE preferences
ADD COLUMN IF NOT EXISTS auto_order_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_order_threshold_days INTEGER DEFAULT 3 CHECK (auto_order_threshold_days >= 0);

CREATE INDEX IF NOT EXISTS idx_preferences_auto_order ON preferences(user_id, auto_order_enabled);

COMMENT ON COLUMN preferences.auto_order_enabled IS 'Enable automatic ordering when inventory runs low';
COMMENT ON COLUMN preferences.auto_order_threshold_days IS 'Number of days before runout to trigger auto-order (default: 3)';

-- ============================================
-- NOTE: Amazon catalog is populated by seed-grocery-catalog.sql
-- which runs after this migration (06-seed-grocery-catalog.sql)
-- ============================================

-- ============================================
-- FUNCTION: Auto-detect low inventory items based on user preferences
-- ============================================
CREATE OR REPLACE FUNCTION detect_zero_inventory()
RETURNS TABLE (
    items_added INTEGER,
    items JSONB
) AS $$
DECLARE
    v_items_added INTEGER := 0;
    v_items JSONB := '[]'::jsonb;
    v_item RECORD;
    v_pref RECORD;
BEGIN
    -- Find inventory items that meet auto-order criteria
    FOR v_item IN
        SELECT i.id, i.user_id, i.item_name, i.unit, i.category,
               i.last_purchase_quantity,
               i.predicted_runout,
               -- Default reorder quantity: last purchase quantity or 1
               COALESCE(i.last_purchase_quantity, 1.0) as reorder_qty,
               p.auto_order_enabled,
               p.auto_order_threshold_days
        FROM inventory i
        LEFT JOIN to_order t ON t.inventory_id = i.id AND t.status IN ('pending', 'ordered')
        LEFT JOIN preferences p ON p.user_id = i.user_id
        WHERE t.id IS NULL  -- Not already in to_order
          AND (
            -- Check if auto-order is enabled for this user
            (p.auto_order_enabled = true AND i.predicted_runout IS NOT NULL
             AND i.predicted_runout <= CURRENT_DATE + INTERVAL '1 day' * COALESCE(p.auto_order_threshold_days, 3))
            OR
            -- Always add items at zero quantity regardless of auto-order setting
            (i.quantity <= 0)
          )
    LOOP
        -- Insert into to_order
        INSERT INTO to_order (
            user_id, inventory_id, item_name, unit, category, reorder_quantity, status
        ) VALUES (
            v_item.user_id, v_item.id, v_item.item_name, v_item.unit,
            v_item.category, v_item.reorder_qty, 'pending'
        );

        v_items_added := v_items_added + 1;
        v_items := v_items || jsonb_build_object(
            'item_name', v_item.item_name,
            'quantity', v_item.reorder_qty,
            'unit', v_item.unit,
            'predicted_runout', v_item.predicted_runout
        );
    END LOOP;

    RETURN QUERY SELECT v_items_added, v_items;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Process to_order and create Amazon orders
-- ============================================
CREATE OR REPLACE FUNCTION process_to_order()
RETURNS TABLE (
    orders_created INTEGER,
    order_details JSONB
) AS $$
DECLARE
    v_orders_created INTEGER := 0;
    v_order_details JSONB := '[]'::jsonb;
    v_user_id VARCHAR(255);
    v_items JSONB;
    v_subtotal DECIMAL(10,2);
    v_tax DECIMAL(10,2);
    v_shipping DECIMAL(10,2);
    v_total DECIMAL(10,2);
    v_order_id UUID;
    v_tracking_number VARCHAR(255);
    v_delivery_date DATE;
    v_to_order_item RECORD;
BEGIN
    -- Group pending to_order items by user
    FOR v_user_id IN
        SELECT DISTINCT user_id FROM to_order WHERE status = 'pending'
    LOOP
        v_items := '[]'::jsonb;
        v_subtotal := 0;

        -- Build order items from to_order and amazon_catalog
        FOR v_to_order_item IN
            SELECT t.id as to_order_id, t.item_name, t.reorder_quantity, t.unit,
                   COALESCE(a.price, 5.99) as price,
                   COALESCE(a.brand, 'Generic') as brand
            FROM to_order t
            LEFT JOIN amazon_catalog a ON LOWER(t.item_name) = LOWER(a.item_name)
            WHERE t.user_id = v_user_id AND t.status = 'pending'
        LOOP
            v_items := v_items || jsonb_build_object(
                'item_name', v_to_order_item.item_name,
                'quantity', v_to_order_item.reorder_quantity,
                'unit', v_to_order_item.unit,
                'price', v_to_order_item.price,
                'brand', v_to_order_item.brand
            );
            v_subtotal := v_subtotal + (v_to_order_item.price * v_to_order_item.reorder_quantity);
        END LOOP;

        -- Calculate tax (8%), shipping (free over $35)
        v_tax := ROUND(v_subtotal * 0.08, 2);
        v_shipping := CASE WHEN v_subtotal >= 35 THEN 0 ELSE 5.99 END;
        v_total := v_subtotal + v_tax + v_shipping;

        -- Generate mock tracking number and delivery date (3-5 days)
        v_tracking_number := 'AMZN-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 12));
        v_delivery_date := CURRENT_DATE + INTERVAL '3 days' + (RANDOM() * 2)::INTEGER * INTERVAL '1 day';

        -- Create order (auto-approved for automated orders)
        INSERT INTO orders (
            user_id, vendor, items, subtotal, tax, shipping, total,
            status, approved_at, placed_at, vendor_order_id, tracking_number, delivery_date
        ) VALUES (
            v_user_id, 'amazon', v_items, v_subtotal, v_tax, v_shipping, v_total,
            'placed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, v_tracking_number, v_tracking_number, v_delivery_date
        ) RETURNING id INTO v_order_id;

        -- Update to_order records
        UPDATE to_order
        SET order_id = v_order_id,
            status = 'ordered',
            ordered_at = CURRENT_TIMESTAMP
        WHERE user_id = v_user_id AND status = 'pending';

        v_orders_created := v_orders_created + 1;
        v_order_details := v_order_details || jsonb_build_object(
            'order_id', v_order_id,
            'user_id', v_user_id,
            'total', v_total,
            'tracking_number', v_tracking_number,
            'delivery_date', v_delivery_date,
            'items_count', jsonb_array_length(v_items)
        );
    END LOOP;

    RETURN QUERY SELECT v_orders_created, v_order_details;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Process delivered orders and update inventory
-- ============================================
CREATE OR REPLACE FUNCTION process_deliveries()
RETURNS TABLE (
    deliveries_processed INTEGER,
    delivery_details JSONB
) AS $$
DECLARE
    v_deliveries_processed INTEGER := 0;
    v_delivery_details JSONB := '[]'::jsonb;
    v_order RECORD;
    v_item JSONB;
    v_inventory_item RECORD;
BEGIN
    -- Find orders with delivery_date <= today and status = 'placed'
    FOR v_order IN
        SELECT id, user_id, items, delivery_date, tracking_number
        FROM orders
        WHERE status = 'placed'
          AND delivery_date IS NOT NULL
          AND delivery_date <= CURRENT_DATE
    LOOP
        -- Process each item in the order
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
        LOOP
            -- Find matching inventory item
            SELECT * INTO v_inventory_item
            FROM inventory
            WHERE user_id = v_order.user_id
              AND LOWER(item_name) = LOWER(v_item->>'item_name')
            LIMIT 1;

            IF FOUND THEN
                -- Add quantity to existing inventory
                UPDATE inventory
                SET quantity = quantity + (v_item->>'quantity')::DECIMAL,
                    last_purchase_date = CURRENT_TIMESTAMP,
                    last_purchase_quantity = (v_item->>'quantity')::DECIMAL,
                    last_updated = CURRENT_TIMESTAMP
                WHERE id = v_inventory_item.id;
            ELSE
                -- Item doesn't exist in inventory anymore, create it
                INSERT INTO inventory (
                    user_id, item_name, quantity, unit, category
                ) VALUES (
                    v_order.user_id,
                    v_item->>'item_name',
                    (v_item->>'quantity')::DECIMAL,
                    v_item->>'unit',
                    'grocery'
                );
            END IF;
        END LOOP;

        -- Mark order as delivered
        UPDATE orders
        SET status = 'delivered',
            delivered_at = CURRENT_TIMESTAMP
        WHERE id = v_order.id;

        -- Update to_order records
        UPDATE to_order
        SET status = 'delivered',
            delivered_at = CURRENT_TIMESTAMP
        WHERE order_id = v_order.id;

        v_deliveries_processed := v_deliveries_processed + 1;
        v_delivery_details := v_delivery_details || jsonb_build_object(
            'order_id', v_order.id,
            'tracking_number', v_order.tracking_number,
            'delivery_date', v_order.delivery_date,
            'items_count', jsonb_array_length(v_order.items)
        );
    END LOOP;

    RETURN QUERY SELECT v_deliveries_processed, v_delivery_details;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================
CREATE OR REPLACE VIEW pending_to_order AS
SELECT t.*, a.price, a.brand, a.in_stock
FROM to_order t
LEFT JOIN amazon_catalog a ON LOWER(t.item_name) = LOWER(a.item_name)
WHERE t.status = 'pending'
ORDER BY t.detected_at ASC;

CREATE OR REPLACE VIEW orders_pending_delivery AS
SELECT o.*,
       (o.delivery_date - CURRENT_DATE) as days_until_delivery
FROM orders o
WHERE o.status = 'placed'
  AND o.delivery_date IS NOT NULL
ORDER BY o.delivery_date ASC;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
DECLARE
    catalog_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO catalog_count FROM amazon_catalog;

    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Auto-Ordering System Migration Complete!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'New tables created:';
    RAISE NOTICE '  - amazon_catalog (% items)', catalog_count;
    RAISE NOTICE '  - to_order';
    RAISE NOTICE '  - background_jobs';
    RAISE NOTICE '';
    RAISE NOTICE 'New functions created:';
    RAISE NOTICE '  - detect_zero_inventory()';
    RAISE NOTICE '  - process_to_order()';
    RAISE NOTICE '  - process_deliveries()';
    RAISE NOTICE '';
    RAISE NOTICE 'New views created:';
    RAISE NOTICE '  - pending_to_order';
    RAISE NOTICE '  - orders_pending_delivery';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Ready to auto-order groceries!';
    RAISE NOTICE '===========================================';
END $$;
