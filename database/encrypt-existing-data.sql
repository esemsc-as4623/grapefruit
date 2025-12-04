-- Migration: Encrypt Existing Plaintext Data
-- AKEDO BOUNTY: Demonstrates encryption of existing data at rest
--
-- This script is for documentation purposes to show encryption capability.
-- Actual encryption is done via the Node.js encryption middleware (AES-256-GCM)
--
-- Usage:
--   node backend/scripts/encrypt-existing-data.js

-- Add is_encrypted column if not exists (already in init.sql)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;
ALTER TABLE cart ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;

-- Create indexes for encrypted flag lookups
CREATE INDEX IF NOT EXISTS idx_inventory_encrypted ON inventory(is_encrypted) WHERE is_encrypted = false;
CREATE INDEX IF NOT EXISTS idx_orders_encrypted ON orders(is_encrypted) WHERE is_encrypted = false;
CREATE INDEX IF NOT EXISTS idx_preferences_encrypted ON preferences(is_encrypted) WHERE is_encrypted = false;
CREATE INDEX IF NOT EXISTS idx_cart_encrypted ON cart(is_encrypted) WHERE is_encrypted = false;

-- Mark all existing data as unencrypted (to be encrypted by Node.js script)
UPDATE inventory SET is_encrypted = false WHERE is_encrypted IS NULL OR is_encrypted = true;
UPDATE orders SET is_encrypted = false WHERE is_encrypted IS NULL OR is_encrypted = true;
UPDATE preferences SET is_encrypted = false WHERE is_encrypted IS NULL OR is_encrypted = true;
UPDATE cart SET is_encrypted = false WHERE is_encrypted IS NULL OR is_encrypted = true;

-- Show counts of unencrypted data
SELECT
  'inventory' as table_name,
  COUNT(*) as unencrypted_rows
FROM inventory WHERE is_encrypted = false
UNION ALL
SELECT
  'orders' as table_name,
  COUNT(*) as unencrypted_rows
FROM orders WHERE is_encrypted = false
UNION ALL
SELECT
  'preferences' as table_name,
  COUNT(*) as unencrypted_rows
FROM preferences WHERE is_encrypted = false
UNION ALL
SELECT
  'cart' as table_name,
  COUNT(*) as unencrypted_rows
FROM cart WHERE is_encrypted = false;
