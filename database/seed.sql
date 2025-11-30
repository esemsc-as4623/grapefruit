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
-- Simple starter inventory (3 items only for testing add functionality)
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity) VALUES
('Whole Milk', 1.0, 'gallon', 'dairy', CURRENT_TIMESTAMP + INTERVAL '4 days', 0.25, CURRENT_TIMESTAMP - INTERVAL '2 days', 1.0),
('Bananas', 6, 'count', 'produce', CURRENT_TIMESTAMP + INTERVAL '3 days', 2.0, CURRENT_TIMESTAMP - INTERVAL '1 day', 6),
('Ground Coffee', 0.5, 'lb', 'beverages', CURRENT_TIMESTAMP + INTERVAL '6 days', 0.08, CURRENT_TIMESTAMP - INTERVAL '5 days', 1.0);

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
