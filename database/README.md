# Database Schema Documentation

## Overview
PostgreSQL database schema for Grapefruit AI Shopping Assistant. Designed for demo/hackathon with focus on core functionality and extensibility.

## Schema Design

### Tables

#### `inventory`
Stores current inventory items with ML-predicted consumption patterns.

**Columns:**
- `id` (UUID, PK): Unique identifier
- `user_id` (VARCHAR): User identifier (simplified for demo)
- `item_name` (VARCHAR): Product name
- `quantity` (DECIMAL): Current quantity in stock
- `unit` (VARCHAR): Measurement unit (gallon, lb, oz, count)
- `category` (VARCHAR): Product category (dairy, produce, pantry, etc.)
- `predicted_runout` (TIMESTAMP): ML-predicted depletion date
- `average_daily_consumption` (DECIMAL): Used for forecasting
- `last_purchase_date` (TIMESTAMP): Last replenishment date
- `last_purchase_quantity` (DECIMAL): Amount purchased last time
- `is_encrypted` (BOOLEAN): Encryption status flag

**Constraints:**
- `quantity >= 0`
- `UNIQUE(user_id, item_name)` - One entry per item per user

#### `preferences`
User preferences for spending, brands, and vendors.

**Columns:**
- `id` (UUID, PK): Unique identifier
- `user_id` (VARCHAR, UNIQUE): User identifier
- `max_spend` (DECIMAL): Maximum order amount
- `approval_mode` (ENUM): manual | auto_under_limit | auto_all
- `auto_approve_limit` (DECIMAL): Auto-approve threshold
- `brand_prefs` (JSONB): Nested brand preferences by product
- `allowed_vendors` (JSONB): Array of permitted vendors
- `notify_low_inventory` (BOOLEAN): Low stock alerts
- `notify_order_ready` (BOOLEAN): Order approval notifications

**Brand Preferences Format:**
```json
{
  "milk": {
    "preferred": ["Organic Valley"],
    "acceptable": ["Great Value"],
    "avoid": ["Generic"]
  }
}
```

#### `orders`
Order history and approval workflow.

**Columns:**
- `id` (UUID, PK): Unique identifier
- `user_id` (VARCHAR): User identifier
- `vendor` (ENUM): amazon | walmart | other
- `items` (JSONB): Array of order items
- `subtotal`, `tax`, `shipping`, `total` (DECIMAL): Financial breakdown
- `status` (ENUM): pending | approved | rejected | placed | delivered | cancelled
- `created_at`, `approved_at`, `placed_at`, `delivered_at` (TIMESTAMP): Lifecycle tracking
- `vendor_order_id` (VARCHAR): External order reference
- `tracking_number` (VARCHAR): Shipping tracker

**Items Format:**
```json
[
  {
    "item_name": "Whole Milk",
    "quantity": 2,
    "unit": "gallon",
    "price": 4.99,
    "brand": "Organic Valley"
  }
]
```

### Views

#### `low_inventory`
Items predicted to run out within 3 days.

**Columns:**
- All inventory columns
- `days_until_runout` (calculated)

#### `pending_orders`
Orders awaiting approval with pending duration.

**Columns:**
- Order summary columns
- `hours_pending` (calculated)

### Triggers

- `inventory_update_timestamp`: Auto-updates `last_updated` on inventory changes
- `preferences_update_timestamp`: Auto-updates `updated_at` on preference changes

## Setup Instructions

### 1. Initialize Database

```bash
# Using Docker Compose (recommended)
docker-compose up -d postgres
docker-compose exec postgres psql -U grapefruit -d grapefruit -f /docker-entrypoint-initdb.d/init.sql

# Or manually
psql -U grapefruit -d grapefruit -f init.sql
```

### 2. Load Sample Data

```bash
# Using Docker Compose
docker-compose exec postgres psql -U grapefruit -d grapefruit -f /docker-entrypoint-initdb.d/seed.sql

# Or manually
psql -U grapefruit -d grapefruit -f seed.sql
```

### 3. Verify Setup

```sql
-- Check table counts
SELECT 'inventory' AS table_name, COUNT(*) FROM inventory
UNION ALL
SELECT 'preferences', COUNT(*) FROM preferences
UNION ALL
SELECT 'orders', COUNT(*) FROM orders;

-- Check low inventory
SELECT * FROM low_inventory;

-- Check pending orders
SELECT * FROM pending_orders;
```

## Common Queries

### Get Items Running Low
```sql
SELECT item_name, quantity, unit, predicted_runout
FROM low_inventory
ORDER BY predicted_runout ASC;
```

### Get User Preferences
```sql
SELECT max_spend, approval_mode, brand_prefs, allowed_vendors
FROM preferences
WHERE user_id = 'demo_user';
```

### Get Order History
```sql
SELECT id, vendor, total, status, created_at
FROM orders
WHERE user_id = 'demo_user'
ORDER BY created_at DESC;
```

### Check Spending Cap Compliance
```sql
SELECT 
    o.total,
    p.max_spend,
    CASE 
        WHEN o.total <= p.max_spend THEN 'Within limit'
        ELSE 'Exceeds limit'
    END AS compliance
FROM orders o
JOIN preferences p ON o.user_id = p.user_id
WHERE o.id = '<order_id>';
```

## Future Enhancements

### Deferred Tables (Post-Hackathon)
- `consumption_log`: Detailed daily consumption tracking for ML training
- `audit_log`: Immutable log of all system actions
- `users`: Full authentication and user management
- `notifications`: Notification queue and delivery tracking

### Planned Schema Changes
- Add enum type for `category` (currently VARCHAR for flexibility)
- Add foreign key constraints when users table exists
- Add partial indexes for common filtered queries
- Add GIN indexes on JSONB columns for faster searches

## Testing

See `/backend/tests/database.test.js` for integration tests.

## Encryption Notes

For demo purposes, `is_encrypted` flag indicates intent. Production implementation would:
1. Store sensitive fields as `bytea` 
2. Encrypt in application layer before INSERT/UPDATE
3. Decrypt on SELECT using AES-256-GCM
4. Implement envelope encryption for per-user keys

## Maintenance

### Reset Database
```bash
docker-compose down -v  # Destroys volumes
docker-compose up -d
# Re-run init.sql and seed.sql
```

### Backup
```bash
docker-compose exec postgres pg_dump -U grapefruit grapefruit > backup.sql
```

### Restore
```bash
docker-compose exec -T postgres psql -U grapefruit grapefruit < backup.sql
```

## License
GNU GPL v3 - See LICENSE file
