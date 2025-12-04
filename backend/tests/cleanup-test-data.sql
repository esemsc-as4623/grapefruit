-- Cleanup Test Data
-- Run this before tests to ensure clean state

-- Delete all test-related data
DELETE FROM to_order WHERE item_name LIKE 'Test%' OR item_name LIKE 'E2E%';
DELETE FROM inventory WHERE item_name LIKE 'Test%' OR item_name LIKE 'E2E%';
DELETE FROM orders WHERE items::text LIKE '%Test%' OR items::text LIKE '%E2E%';

-- Show remaining counts
SELECT 'inventory' as table_name, COUNT(*) as count FROM inventory
UNION ALL
SELECT 'to_order', COUNT(*) FROM to_order
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'amazon_catalog', COUNT(*) FROM amazon_catalog
ORDER BY table_name;
