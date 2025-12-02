-- Grapefruit Database Seed Data
-- Loads sample inventory, preferences, and orders for demo/testing
-- Author: Akedo AI Shopping Assistant Team
-- Date: 2025-11-30

-- Clear existing data (for re-seeding during development)
-- Use DO block to handle case where tables might be empty on first run
DO $$
BEGIN
    -- Only truncate if tables exist and have data
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory') THEN
        TRUNCATE TABLE inventory, preferences, orders CASCADE;
    END IF;
END $$;

-- ============================================
-- SEED USER PREFERENCES
-- ============================================
INSERT INTO preferences (user_id, brand_prefs, allowed_vendors) VALUES
('demo_user', 
'{
  "dairy": {
    "preferred": ["Organic Valley", "Horizon"],
    "acceptable": ["Great Value", "Kirkland"],
    "avoid": []
  },
  "produce": {
    "preferred": ["Organic", "Fresh Local"],
    "acceptable": ["Conventional"],
    "avoid": []
  },
  "meat": {
    "preferred": ["Organic", "Free Range"],
    "acceptable": ["Conventional"],
    "avoid": []
  },
  "pantry": {
    "preferred": ["King Arthur", "Barilla"],
    "acceptable": ["Store Brand"],
    "avoid": []
  },
  "bread": {
    "preferred": ["Dave''s Killer Bread", "Local Bakery"],
    "acceptable": ["Nature''s Own", "Wonder"],
    "avoid": []
  }
}'::jsonb,
'["amazon"]'::jsonb);

-- ============================================
-- SEED INVENTORY DATA
-- ============================================
-- Starting inventory with varying amounts
-- No consumption rates specified (all NULL) - will be learned from usage
-- Items spread across different categories

-- DAIRY
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Eggs', 8.0, 'count', 'dairy', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 days', 12.0, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days'),
('Milk', 0.75, 'gallon', 'dairy', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '3 days', 1.0, CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days'),
('Butter', 12.0, 'ounce', 'dairy', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '1 week', 16.0, CURRENT_TIMESTAMP - INTERVAL '1 week', CURRENT_TIMESTAMP - INTERVAL '1 week');

-- PRODUCE
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Peppers', 3.0, 'count', 'produce', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 days', 4.0, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days'),
('Lemon', 2.0, 'count', 'produce', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '4 days', 3.0, CURRENT_TIMESTAMP - INTERVAL '4 days', CURRENT_TIMESTAMP - INTERVAL '4 days'),
('Onion', 1.2, 'pound', 'produce', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '5 days', 2.0, CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '5 days'),
('Garlic', 4.0, 'count', 'produce', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '1 week', 10.0, CURRENT_TIMESTAMP - INTERVAL '1 week', CURRENT_TIMESTAMP - INTERVAL '1 week'),
('Ginger', 4.5, 'ounce', 'produce', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '6 days', 6.0, CURRENT_TIMESTAMP - INTERVAL '6 days', CURRENT_TIMESTAMP - INTERVAL '6 days'),
('Tomatoes', 1.5, 'pound', 'produce', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '3 days', 2.0, CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days'),
('Grapes', 1.0, 'pound', 'produce', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 days', 1.5, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days');

-- BREAD
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Bread', 1.5, 'loaf', 'bread', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '1 day', 2.0, CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day');

-- PANTRY
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('White Wine Vinegar', 18.0, 'ounce', 'pantry', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 weeks', 24.0, CURRENT_TIMESTAMP - INTERVAL '2 weeks', CURRENT_TIMESTAMP - INTERVAL '2 weeks'),
('Pasta', 2.5, 'pound', 'pantry', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '1 week', 3.0, CURRENT_TIMESTAMP - INTERVAL '1 week', CURRENT_TIMESTAMP - INTERVAL '1 week');

-- MEAT
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Chicken Breast', 1.75, 'pound', 'meat', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '1 day', 2.0, CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day'),
('Salmon', 1.25, 'pound', 'meat', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 days', 1.5, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
DO $$
DECLARE
    inventory_count INTEGER;
    orders_count INTEGER;
    low_inv_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO inventory_count FROM inventory;
    SELECT COUNT(*) INTO orders_count FROM orders;
    SELECT COUNT(*) INTO low_inv_count FROM low_inventory;
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Grapefruit database seeded successfully!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Inventory items: %', inventory_count;
    RAISE NOTICE 'Orders: %', orders_count;
    RAISE NOTICE 'Items running low (< 3 days): %', low_inv_count;
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Demo user: demo_user';
    RAISE NOTICE 'Max spend: $250.00';
    RAISE NOTICE 'Approval mode: auto_under_limit ($100)';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Ready to demo!';
    RAISE NOTICE '===========================================';
END $$;
