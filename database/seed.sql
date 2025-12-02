-- Grapefruit Database Seed Data
-- Loads sample inventory, preferences, and orders for demo/testing
-- Author: Akedo AI Shopping Assistant Team
-- Date: 2025-11-30

-- Clear existing data (for re-seeding during development)
TRUNCATE TABLE inventory, preferences, orders CASCADE;

-- ============================================
-- SEED USER PREFERENCES
-- ============================================
INSERT INTO preferences (user_id, max_spend, approval_mode, auto_approve_limit, brand_prefs, allowed_vendors) VALUES
('demo_user', 250.00, 'auto_under_limit', 20.00, 
'{
  "dairy": {
    "preferred": ["Organic Valley", "Horizon"],
    "acceptable": ["Great Value", "Kirkland"],
    "avoid": ["Generic Brand"]
  },
  "pantry": {
    "preferred": ["Dave''s Killer Bread", "King Arthur"],
    "acceptable": ["Nature''s Own", "Wonder"],
    "avoid": []
  },
  "beverages": {
    "preferred": ["Starbucks", "Peet''s"],
    "acceptable": ["Folgers", "Maxwell House"],
    "avoid": []
  },
  "produce": {
    "preferred": ["Organic", "Fresh Local"],
    "acceptable": ["Conventional"],
    "avoid": []
  },
  "frozen": {
    "preferred": ["Organic", "Name Brand"],
    "acceptable": ["Generic"],
    "avoid": []
  },
  "household": {
    "preferred": ["Seventh Generation", "Method"],
    "acceptable": ["Generic", "Store Brand"],
    "avoid": []
  }
}'::jsonb,
'["walmart", "amazon"]'::jsonb);

-- ============================================
-- SEED INVENTORY DATA
-- ============================================
-- Inventory items added across the last week to demonstrate different creation dates
-- Items are spread across 7 days, with varying consumption rates and predicted runouts

-- Items added 7 days ago
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Whole Milk', 2.0, 'liter', 'dairy', CURRENT_TIMESTAMP + INTERVAL '8 days', 0.25, CURRENT_TIMESTAMP - INTERVAL '7 days', 2.0, CURRENT_TIMESTAMP - INTERVAL '7 days', CURRENT_TIMESTAMP - INTERVAL '7 days'),
('Thai Jasmine Rice', 5.0, 'pound', 'pantry', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '7 days', 5.0, CURRENT_TIMESTAMP - INTERVAL '7 days', CURRENT_TIMESTAMP - INTERVAL '7 days');

-- Items added 5 days ago
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Mayo', 12.4, 'ounce', 'pantry', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '5 days', 12.4, CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '5 days'),
('Soy Sauce', 4.1, 'ounce', 'pantry', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '5 days', 4.1, CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '5 days');

-- Items added 3 days ago
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Japanese Sweet Potatoes', 2.3, 'pound', 'produce', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '3 days', 2.3, CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days'),
('Tofu', 14.0, 'ounce', 'other', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '3 days', 14.0, CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '3 days');

-- Items added 2 days ago
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Mandu Dumplings', 16.0, 'ounce', 'other', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 days', 16.0, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days'),
('Nori Seaweed', 3.0, 'count', 'other', NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 days', 3.0, CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '2 days');

-- Items added today (within last 24 hours) - these will have green background
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity, created_at, last_updated) VALUES
('Baguette', 1.0, 'count', 'pantry', CURRENT_TIMESTAMP + INTERVAL '1 day', 1.0, CURRENT_TIMESTAMP - INTERVAL '2 hours', 1.0, CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP - INTERVAL '2 hours'),
('Ground Coffee', 0.14, 'lb', 'beverages', CURRENT_TIMESTAMP + INTERVAL '2 days', 0.07, CURRENT_TIMESTAMP - INTERVAL '5 hours', 0.5, CURRENT_TIMESTAMP - INTERVAL '5 hours', CURRENT_TIMESTAMP - INTERVAL '5 hours');

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
    RAISE NOTICE 'Ready to test adding new inventory items!';
    RAISE NOTICE '===========================================';
END $$;
