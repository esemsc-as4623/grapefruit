-- ============================================
-- Seed Additional Grocery Items for Mock Amazon Catalog
-- ============================================
-- This file adds 50+ common grocery items to the amazon_catalog table
-- Run this after migration-auto-ordering.sql
-- Purpose: Expand the mock "Amazon API" for better price lookups

-- Usage: psql -d grapefruit -f seed-grocery-catalog.sql

INSERT INTO amazon_catalog (id, item_name, category, price, unit, brand, in_stock) VALUES

-- Common Generic Items (for better fuzzy matching)
(gen_random_uuid(), 'Milk', 'dairy', 5.99, 'gallon', 'Great Value', true),
(gen_random_uuid(), 'Cream', 'dairy', 5.49, 'pint', 'Horizon', true),
(gen_random_uuid(), 'Cheese', 'dairy', 6.99, 'lb', 'Tillamook', true),
(gen_random_uuid(), 'Chocolate', 'pantry', 3.99, 'bar', 'Hershey''s', true),

-- Meat & Seafood
(gen_random_uuid(), 'Chicken Breast', 'meat', 7.99, 'lb', 'Tyson', true),
(gen_random_uuid(), 'Ground Beef', 'meat', 5.99, 'lb', '80/20 Lean', true),
(gen_random_uuid(), 'Pork Chops', 'meat', 6.99, 'lb', 'Smithfield', true),
(gen_random_uuid(), 'Bacon', 'meat', 8.99, 'pack', 'Wright Brand', true),
(gen_random_uuid(), 'Turkey Breast', 'meat', 9.99, 'lb', 'Jennie-O', true),
(gen_random_uuid(), 'Salmon Fillet', 'seafood', 12.99, 'lb', 'Atlantic', true),
(gen_random_uuid(), 'Shrimp', 'seafood', 14.99, 'lb', 'Wild Caught', true),
(gen_random_uuid(), 'Tilapia', 'seafood', 8.99, 'lb', 'Fresh', true),

-- Deli & Cheese
(gen_random_uuid(), 'Sliced Turkey', 'deli', 7.99, 'lb', 'Boar''s Head', true),
(gen_random_uuid(), 'Sliced Ham', 'deli', 6.99, 'lb', 'Boar''s Head', true),
(gen_random_uuid(), 'Mozzarella Cheese', 'dairy', 5.99, 'lb', 'Galbani', true),
(gen_random_uuid(), 'Swiss Cheese', 'dairy', 7.99, 'lb', 'Boar''s Head', true),
(gen_random_uuid(), 'Parmesan Cheese', 'dairy', 9.99, 'block', 'BelGioioso', true),
(gen_random_uuid(), 'Feta Cheese', 'dairy', 6.99, 'container', 'Athenos', true),

-- More Produce
(gen_random_uuid(), 'Bell Peppers', 'produce', 1.99, 'lb', 'Fresh', true),
(gen_random_uuid(), 'Cucumbers', 'produce', 1.49, 'each', 'Fresh', true),
(gen_random_uuid(), 'Celery', 'produce', 2.49, 'bunch', 'Fresh', true),
(gen_random_uuid(), 'Mushrooms', 'produce', 3.99, 'lb', 'Baby Bella', true),
(gen_random_uuid(), 'Sweet Potatoes', 'produce', 1.99, 'lb', 'Fresh', true),
(gen_random_uuid(), 'Zucchini', 'produce', 1.99, 'lb', 'Fresh', true),
(gen_random_uuid(), 'Cauliflower', 'produce', 3.99, 'head', 'Fresh', true),
(gen_random_uuid(), 'Grapes', 'produce', 3.99, 'lb', 'Red Seedless', true),
(gen_random_uuid(), 'Watermelon', 'produce', 5.99, 'each', 'Fresh', true),
(gen_random_uuid(), 'Cantaloupe', 'produce', 3.99, 'each', 'Fresh', true),
(gen_random_uuid(), 'Lemons', 'produce', 0.79, 'each', 'Fresh', true),
(gen_random_uuid(), 'Limes', 'produce', 0.69, 'each', 'Fresh', true),
(gen_random_uuid(), 'Cilantro', 'produce', 1.49, 'bunch', 'Fresh', true),
(gen_random_uuid(), 'Parsley', 'produce', 1.49, 'bunch', 'Fresh', true),

-- Bakery
(gen_random_uuid(), 'Bagels', 'bakery', 4.99, 'pack', '6-count Plain', true),
(gen_random_uuid(), 'English Muffins', 'bakery', 3.99, 'pack', 'Thomas', true),
(gen_random_uuid(), 'Tortillas', 'bakery', 3.49, 'pack', 'Mission', true),
(gen_random_uuid(), 'Croissants', 'bakery', 5.99, 'pack', '4-count', true),
(gen_random_uuid(), 'Dinner Rolls', 'bakery', 3.99, 'pack', 'King''s Hawaiian', true),

-- Snacks & Chips
(gen_random_uuid(), 'Potato Chips', 'snacks', 3.99, 'bag', 'Lay''s Classic', true),
(gen_random_uuid(), 'Tortilla Chips', 'snacks', 3.49, 'bag', 'Tostitos', true),
(gen_random_uuid(), 'Pretzels', 'snacks', 3.99, 'bag', 'Rold Gold', true),
(gen_random_uuid(), 'Popcorn', 'snacks', 4.99, 'box', 'Orville', true),
(gen_random_uuid(), 'Crackers', 'snacks', 3.49, 'box', 'Ritz', true),
(gen_random_uuid(), 'Cookies', 'snacks', 4.49, 'pack', 'Oreo', true),
(gen_random_uuid(), 'Granola Bars', 'snacks', 5.99, 'box', 'Nature Valley', true),
(gen_random_uuid(), 'Trail Mix', 'snacks', 6.99, 'bag', 'Kirkland', true),

-- Canned & Jarred
(gen_random_uuid(), 'Canned Tomatoes', 'pantry', 1.99, 'can', 'Hunt''s', true),
(gen_random_uuid(), 'Tomato Sauce', 'pantry', 2.49, 'jar', 'Rao''s', true),
(gen_random_uuid(), 'Chicken Broth', 'pantry', 2.99, 'carton', 'Swanson', true),
(gen_random_uuid(), 'Beef Broth', 'pantry', 2.99, 'carton', 'Swanson', true),
(gen_random_uuid(), 'Canned Beans', 'pantry', 1.49, 'can', 'Bush''s', true),
(gen_random_uuid(), 'Canned Corn', 'pantry', 1.29, 'can', 'Green Giant', true),
(gen_random_uuid(), 'Salsa', 'pantry', 3.99, 'jar', 'Pace', true),
(gen_random_uuid(), 'Pickles', 'pantry', 3.49, 'jar', 'Claussen', true),
(gen_random_uuid(), 'Mayo', 'pantry', 5.99, 'jar', 'Hellmann''s', true),
(gen_random_uuid(), 'Mustard', 'pantry', 2.99, 'bottle', 'French''s', true),
(gen_random_uuid(), 'Ketchup', 'pantry', 3.49, 'bottle', 'Heinz', true),
(gen_random_uuid(), 'Soy Sauce', 'pantry', 3.99, 'bottle', 'Kikkoman', true),

-- More Beverages
(gen_random_uuid(), 'Almond Milk', 'beverages', 3.99, 'carton', 'Silk', true),
(gen_random_uuid(), 'Oat Milk', 'beverages', 4.99, 'carton', 'Oatly', true),
(gen_random_uuid(), 'Coconut Water', 'beverages', 2.99, 'bottle', 'Vita Coco', true),
(gen_random_uuid(), 'Sports Drink', 'beverages', 1.99, 'bottle', 'Gatorade', true),
(gen_random_uuid(), 'Energy Drink', 'beverages', 2.49, 'can', 'Red Bull', true),
(gen_random_uuid(), 'Iced Tea', 'beverages', 1.79, 'bottle', 'Pure Leaf', true),
(gen_random_uuid(), 'Lemonade', 'beverages', 3.99, 'carton', 'Simply', true),
(gen_random_uuid(), 'Cranberry Juice', 'beverages', 4.99, 'bottle', 'Ocean Spray', true),

-- Frozen Foods
(gen_random_uuid(), 'Frozen Chicken Nuggets', 'frozen', 7.99, 'bag', 'Tyson', true),
(gen_random_uuid(), 'Frozen French Fries', 'frozen', 3.99, 'bag', 'Ore-Ida', true),
(gen_random_uuid(), 'Frozen Waffles', 'frozen', 3.49, 'box', 'Eggo', true),
(gen_random_uuid(), 'Frozen Burrito', 'frozen', 6.99, 'pack', 'El Monterey', true),
(gen_random_uuid(), 'Frozen Meatballs', 'frozen', 8.99, 'bag', 'Cooked Perfect', true),
(gen_random_uuid(), 'Frozen Shrimp', 'frozen', 13.99, 'bag', 'Seapak', true),

-- Condiments & Spices
(gen_random_uuid(), 'Black Pepper', 'spices', 4.99, 'container', 'McCormick', true),
(gen_random_uuid(), 'Salt', 'spices', 2.49, 'container', 'Morton', true),
(gen_random_uuid(), 'Garlic Powder', 'spices', 3.99, 'bottle', 'McCormick', true),
(gen_random_uuid(), 'Onion Powder', 'spices', 3.99, 'bottle', 'McCormick', true),
(gen_random_uuid(), 'Cinnamon', 'spices', 4.99, 'bottle', 'McCormick', true),
(gen_random_uuid(), 'Italian Seasoning', 'spices', 3.49, 'bottle', 'McCormick', true),
(gen_random_uuid(), 'Ranch Dressing', 'condiments', 3.99, 'bottle', 'Hidden Valley', true),
(gen_random_uuid(), 'BBQ Sauce', 'condiments', 3.49, 'bottle', 'Sweet Baby Ray''s', true),
(gen_random_uuid(), 'Hot Sauce', 'condiments', 2.99, 'bottle', 'Tabasco', true),

-- Personal Care (sometimes bought with groceries)
(gen_random_uuid(), 'Shampoo', 'personal', 6.99, 'bottle', 'Pantene', true),
(gen_random_uuid(), 'Conditioner', 'personal', 6.99, 'bottle', 'Pantene', true),
(gen_random_uuid(), 'Body Wash', 'personal', 5.99, 'bottle', 'Dove', true),
(gen_random_uuid(), 'Toothpaste', 'personal', 4.99, 'tube', 'Crest', true),
(gen_random_uuid(), 'Toothbrush', 'personal', 3.99, 'pack', 'Oral-B', true),
(gen_random_uuid(), 'Deodorant', 'personal', 5.99, 'stick', 'Dove', true)

ON CONFLICT (item_name) DO NOTHING;

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify the catalog size:
-- SELECT category, COUNT(*) as item_count FROM amazon_catalog GROUP BY category ORDER BY category;
--
-- Expected result: ~90-100 total items across all categories
