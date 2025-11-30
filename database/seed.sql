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
('demo_user', 250.00, 'auto_under_limit', 100.00, 
'{
  "milk": {
    "preferred": ["Organic Valley", "Horizon"],
    "acceptable": ["Great Value", "Kirkland"],
    "avoid": ["Generic Brand"]
  },
  "bread": {
    "preferred": ["Dave''s Killer Bread"],
    "acceptable": ["Nature''s Own", "Wonder"],
    "avoid": []
  },
  "coffee": {
    "preferred": ["Starbucks", "Peet''s"],
    "acceptable": ["Folgers", "Maxwell House"],
    "avoid": []
  },
  "eggs": {
    "preferred": ["Organic Free Range"],
    "acceptable": ["Cage Free"],
    "avoid": ["Conventional"]
  }
}'::jsonb,
'["walmart", "amazon"]'::jsonb);

-- ============================================
-- SEED INVENTORY DATA
-- ============================================
-- Dairy products
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity) VALUES
('Whole Milk', 0.5, 'gallon', 'dairy', CURRENT_TIMESTAMP + INTERVAL '1 day', 0.25, CURRENT_TIMESTAMP - INTERVAL '7 days', 1.0),
('Organic Eggs', 4, 'count', 'dairy', CURRENT_TIMESTAMP + INTERVAL '2 days', 2.0, CURRENT_TIMESTAMP - INTERVAL '5 days', 12),
('Cheddar Cheese', 0.3, 'lb', 'dairy', CURRENT_TIMESTAMP + INTERVAL '8 days', 0.05, CURRENT_TIMESTAMP - INTERVAL '10 days', 1.0),
('Greek Yogurt', 2, 'count', 'dairy', CURRENT_TIMESTAMP + INTERVAL '4 days', 0.5, CURRENT_TIMESTAMP - INTERVAL '3 days', 6);

-- Produce
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity) VALUES
('Bananas', 3, 'count', 'produce', CURRENT_TIMESTAMP + INTERVAL '2 days', 1.5, CURRENT_TIMESTAMP - INTERVAL '4 days', 6),
('Baby Spinach', 0.2, 'lb', 'produce', CURRENT_TIMESTAMP + INTERVAL '1 day', 0.15, CURRENT_TIMESTAMP - INTERVAL '6 days', 1.0),
('Tomatoes', 2, 'count', 'produce', CURRENT_TIMESTAMP + INTERVAL '3 days', 0.8, CURRENT_TIMESTAMP - INTERVAL '5 days', 5),
('Avocados', 1, 'count', 'produce', CURRENT_TIMESTAMP + INTERVAL '2 days', 0.5, CURRENT_TIMESTAMP - INTERVAL '2 days', 4);

-- Pantry staples
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity) VALUES
('Whole Wheat Bread', 0.5, 'loaf', 'pantry', CURRENT_TIMESTAMP + INTERVAL '2 days', 0.2, CURRENT_TIMESTAMP - INTERVAL '8 days', 2),
('Peanut Butter', 0.8, 'lb', 'pantry', CURRENT_TIMESTAMP + INTERVAL '15 days', 0.05, CURRENT_TIMESTAMP - INTERVAL '20 days', 1.0),
('Pasta', 1.5, 'lb', 'pantry', CURRENT_TIMESTAMP + INTERVAL '20 days', 0.1, CURRENT_TIMESTAMP - INTERVAL '30 days', 2.0),
('Canned Tomatoes', 2, 'count', 'pantry', CURRENT_TIMESTAMP + INTERVAL '25 days', 0.1, CURRENT_TIMESTAMP - INTERVAL '15 days', 6);

-- Beverages
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity) VALUES
('Ground Coffee', 0.3, 'lb', 'beverages', CURRENT_TIMESTAMP + INTERVAL '3 days', 0.08, CURRENT_TIMESTAMP - INTERVAL '10 days', 1.0),
('Orange Juice', 0.25, 'gallon', 'beverages', CURRENT_TIMESTAMP + INTERVAL '1 day', 0.15, CURRENT_TIMESTAMP - INTERVAL '5 days', 0.5),
('Sparkling Water', 4, 'count', 'beverages', CURRENT_TIMESTAMP + INTERVAL '5 days', 1.2, CURRENT_TIMESTAMP - INTERVAL '3 days', 12);

-- Frozen foods
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity) VALUES
('Frozen Vegetables', 1, 'lb', 'frozen', CURRENT_TIMESTAMP + INTERVAL '12 days', 0.1, CURRENT_TIMESTAMP - INTERVAL '8 days', 2.0),
('Ice Cream', 0.5, 'quart', 'frozen', CURRENT_TIMESTAMP + INTERVAL '6 days', 0.08, CURRENT_TIMESTAMP - INTERVAL '7 days', 1.0);

-- Household items
INSERT INTO inventory (item_name, quantity, unit, category, predicted_runout, average_daily_consumption, last_purchase_date, last_purchase_quantity) VALUES
('Paper Towels', 2, 'roll', 'household', CURRENT_TIMESTAMP + INTERVAL '10 days', 0.2, CURRENT_TIMESTAMP - INTERVAL '15 days', 6),
('Dish Soap', 0.4, 'bottle', 'household', CURRENT_TIMESTAMP + INTERVAL '8 days', 0.05, CURRENT_TIMESTAMP - INTERVAL '12 days', 1);

-- ============================================
-- SEED HISTORICAL ORDERS
-- ============================================
-- Recent approved and placed order
INSERT INTO orders (user_id, vendor, items, subtotal, tax, shipping, total, status, created_at, approved_at, placed_at, vendor_order_id) VALUES
('demo_user', 'walmart', 
'[
  {"item_name": "Whole Milk", "quantity": 2, "unit": "gallon", "price": 4.99, "brand": "Great Value"},
  {"item_name": "Organic Eggs", "quantity": 12, "unit": "count", "price": 5.99, "brand": "Eggland''s Best"},
  {"item_name": "Bananas", "quantity": 6, "unit": "count", "price": 0.59, "brand": "Fresh"}
]'::jsonb,
15.54, 1.24, 0.00, 16.78, 'placed',
CURRENT_TIMESTAMP - INTERVAL '7 days',
CURRENT_TIMESTAMP - INTERVAL '7 days' + INTERVAL '2 hours',
CURRENT_TIMESTAMP - INTERVAL '7 days' + INTERVAL '3 hours',
'WMT-2025-11-23-001');

-- Older delivered order
INSERT INTO orders (user_id, vendor, items, subtotal, tax, shipping, total, status, created_at, approved_at, placed_at, delivered_at, vendor_order_id, tracking_number) VALUES
('demo_user', 'amazon',
'[
  {"item_name": "Ground Coffee", "quantity": 1, "unit": "lb", "price": 12.99, "brand": "Starbucks"},
  {"item_name": "Peanut Butter", "quantity": 1, "unit": "lb", "price": 6.99, "brand": "Jif"},
  {"item_name": "Pasta", "quantity": 2, "unit": "lb", "price": 3.49, "brand": "Barilla"}
]'::jsonb,
26.96, 2.16, 5.99, 35.11, 'delivered',
CURRENT_TIMESTAMP - INTERVAL '30 days',
CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '1 hour',
CURRENT_TIMESTAMP - INTERVAL '30 days' + INTERVAL '4 hours',
CURRENT_TIMESTAMP - INTERVAL '28 days',
'AMZN-2025-10-31-789',
'1Z999AA10123456784');

-- Pending order awaiting approval (simulates current state)
INSERT INTO orders (user_id, vendor, items, subtotal, tax, shipping, total, status, created_at) VALUES
('demo_user', 'walmart',
'[
  {"item_name": "Whole Milk", "quantity": 1, "unit": "gallon", "price": 4.99, "brand": "Organic Valley"},
  {"item_name": "Baby Spinach", "quantity": 1, "unit": "lb", "price": 3.99, "brand": "Fresh Express"},
  {"item_name": "Orange Juice", "quantity": 1, "unit": "gallon", "price": 5.49, "brand": "Tropicana"},
  {"item_name": "Whole Wheat Bread", "quantity": 1, "unit": "loaf", "price": 3.99, "brand": "Dave''s Killer Bread"},
  {"item_name": "Ground Coffee", "quantity": 1, "unit": "lb", "price": 12.99, "brand": "Starbucks"}
]'::jsonb,
31.45, 2.52, 0.00, 33.97, 'pending',
CURRENT_TIMESTAMP - INTERVAL '2 hours');

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
END $$;
