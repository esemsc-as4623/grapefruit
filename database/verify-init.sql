-- Database Initialization Verification Script
-- Run this to verify that all tables were created and seeded correctly
-- Usage: docker exec -i grapefruit-db psql -U grapefruit -d grapefruit < database/verify-init.sql

\echo '=== Database Initialization Verification ==='
\echo ''

-- Check PostgreSQL version and extensions
\echo '--- PostgreSQL Version ---'
SELECT version();
\echo ''

\echo '--- Installed Extensions ---'
SELECT extname, extversion FROM pg_extension WHERE extname = 'uuid-ossp';
\echo ''

-- Check all tables exist
\echo '--- Tables Created ---'
SELECT 
    schemaname as schema,
    tablename as table_name,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
\echo ''

-- Check record counts in each table
\echo '--- Table Row Counts ---'
SELECT 'inventory' as table_name, COUNT(*) as row_count FROM inventory
UNION ALL
SELECT 'preferences', COUNT(*) FROM preferences
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'cart', COUNT(*) FROM cart
UNION ALL
SELECT 'consumption_history', COUNT(*) FROM consumption_history
UNION ALL
SELECT 'to_order', COUNT(*) FROM to_order
UNION ALL
SELECT 'amazon_catalog', COUNT(*) FROM amazon_catalog
ORDER BY table_name;
\echo ''

-- Check views exist
\echo '--- Views Created ---'
SELECT 
    schemaname as schema,
    viewname as view_name
FROM pg_views 
WHERE schemaname = 'public'
ORDER BY viewname;
\echo ''

-- Check sample data from key tables
\echo '--- Sample Inventory (first 5 items) ---'
SELECT item_name, quantity, unit, category 
FROM inventory 
ORDER BY item_name 
LIMIT 5;
\echo ''

\echo '--- User Preferences ---'
SELECT 
    user_id, 
    max_spend, 
    approval_mode, 
    auto_approve_limit,
    jsonb_object_keys(brand_prefs) as product_type
FROM preferences;
\echo ''

\echo '--- Amazon Catalog Sample (first 5 items) ---'
SELECT item_name, category, price, unit, brand, in_stock
FROM amazon_catalog 
ORDER BY item_name 
LIMIT 5;
\echo ''

\echo '=== Verification Complete ==='
\echo 'If all tables show data, the database was initialized successfully!'
\echo ''
