# Analysis: `process_to_order` Function

## Overview

The `process_to_order` function is a **PostgreSQL stored procedure** that is part of the Grapefruit auto-ordering system. It processes pending order items from the `to_order` queue and creates Amazon orders by matching items with the Amazon catalog, calculating pricing, and generating tracking information.

## Location

**Primary Definition:** `database/migration-auto-ordering.sql` (lines 169-252)

## What It Does

The `process_to_order` function performs the following operations:

### 1. Groups Pending Items by User
- Retrieves all distinct `user_id` values from the `to_order` table where `status = 'pending'`
- Processes each user's pending items as a single batch order

### 2. Builds Order Items with Catalog Matching
For each user, the function:
- Joins the `to_order` table with `amazon_catalog` using case-insensitive item name matching
- Uses catalog pricing when available, defaults to `$5.99` for items not in catalog
- Uses catalog brand when available, defaults to `'Generic'` for items not in catalog
- Constructs a JSON array of order items with: `item_name`, `quantity`, `unit`, `price`, `brand`

### 3. Calculates Pricing
- **Subtotal**: Sum of (price × quantity) for all items
- **Tax**: 8% of subtotal (`ROUND(v_subtotal * 0.08, 2)`)
- **Shipping**: 
  - Free ($0) if subtotal ≥ $35
  - $5.99 if subtotal < $35
- **Total**: subtotal + tax + shipping

### 4. Generates Order Metadata
- **Tracking Number**: Mock Amazon format `AMZN-` followed by 12 random uppercase alphanumeric characters
- **Delivery Date**: 3-5 days in the future (random within that range)

### 5. Creates the Order
Inserts into the `orders` table with:
- Vendor set to `'amazon'`
- Status set to `'placed'` (auto-approved)
- Timestamps for `approved_at` and `placed_at`
- All calculated pricing and generated metadata

### 6. Updates Queue Status
Updates all processed `to_order` records for the user:
- Sets `status = 'ordered'`
- Sets `order_id` to the newly created order
- Sets `ordered_at` timestamp

### 7. Returns Results
Returns a table with:
- `orders_created`: Count of orders created
- `order_details`: JSONB array with order summaries including order_id, user_id, total, tracking_number, delivery_date, items_count

## Return Type

```sql
RETURNS TABLE (
    orders_created INTEGER,
    order_details JSONB
)
```

## Dependencies

### Database Tables Used

| Table | Usage |
|-------|-------|
| `to_order` | Read pending items; Update status to 'ordered' |
| `amazon_catalog` | Match items for pricing and brand info |
| `orders` | Insert new orders |

### Database Columns Required

**`to_order` table:**
- `id`, `user_id`, `item_name`, `reorder_quantity`, `unit`, `status`, `order_id`, `ordered_at`

**`amazon_catalog` table:**
- `item_name`, `price`, `brand`

**`orders` table:**
- `id`, `user_id`, `vendor`, `items`, `subtotal`, `tax`, `shipping`, `total`, `status`, `approved_at`, `placed_at`, `vendor_order_id`, `tracking_number`, `delivery_date`

## Components That Depend on This Function

### 1. **AutoOrderScheduler Service**
**File:** `backend/src/services/autoOrderScheduler.js`

The `processToOrder()` method (lines 112-146) is a JavaScript wrapper that:
- Logs job start to `background_jobs` table
- Executes `SELECT * FROM process_to_order()`
- Parses the results
- Logs job completion with metrics
- Returns order count and details

**Scheduled Execution:**
- Runs every 10 minutes via cron: `*/10 * * * *`
- Also runs immediately on scheduler startup

### 2. **Auto-Order API Routes**
**File:** `backend/src/routes/autoOrder.js`

**Endpoint:** `POST /auto-order/jobs/run`
- Accepts `job_name: 'process_to_order'` in request body
- Triggers manual execution via `autoOrderScheduler.runJob('process_to_order')`
- Returns job execution results

### 3. **Test Suites**
**File:** `backend/tests/amazon-ordering.test.js`

Multiple test cases invoke `process_to_order`:
- "Should match to_order items with Amazon catalog" (line 213)
- "Should calculate correct pricing" (line 278)
- "Should generate valid tracking numbers" (line 314)
- "Should set delivery date 3-5 days in future" (line 329)
- "Should auto-approve orders and set status to 'placed'" (line 348)
- "Should update to_order status to 'ordered'" (line 369)
- "Complete autonomous workflow" (line 561) - end-to-end test

### 4. **Manual Test Script**
**File:** `backend/tests/manual-ordering-test.sh`

The bash script (lines 74-92) calls the function via HTTP API to test the ordering workflow.

## Related Functions in the Auto-Ordering Workflow

### Upstream: `detect_zero_inventory()`
- Runs every 5 minutes
- Detects items at zero quantity or predicted to run out
- Populates the `to_order` table with `status = 'pending'`
- **Output feeds into** `process_to_order()`

### Downstream: `process_deliveries()`
- Runs every hour
- Processes orders where `delivery_date <= today` and `status = 'placed'`
- Updates inventory quantities when orders "arrive"
- Marks orders and `to_order` entries as `'delivered'`
- **Consumes output from** `process_to_order()`

## Complete Workflow Diagram

```
┌─────────────────────────┐
│    Inventory Items      │
│   (quantity = 0 or      │
│    low predicted_runout)│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ detect_zero_inventory() │  ← Runs every 5 minutes
│  Creates to_order       │
│  entries (pending)      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   process_to_order()    │  ← Runs every 10 minutes
│  - Matches with catalog │
│  - Calculates pricing   │
│  - Creates orders       │
│  - Updates to_order     │
│    (status → ordered)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Orders Table          │
│   (status = 'placed',   │
│    delivery_date set)   │
└───────────┬─────────────┘
            │
            ▼ (when delivery_date arrives)
┌─────────────────────────┐
│  process_deliveries()   │  ← Runs every hour
│  - Updates inventory    │
│  - Marks order delivered│
│  - Updates to_order     │
│    (status → delivered) │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│    Inventory Restocked! │
│    (quantity increased) │
└─────────────────────────┘
```

## Example Usage

### Direct SQL Execution
```sql
SELECT * FROM process_to_order();
```

### Via Node.js Backend
```javascript
const result = await db.query('SELECT * FROM process_to_order()');
const { orders_created, order_details } = result.rows[0];
```

### Via REST API
```bash
curl -X POST http://localhost:5000/auto-order/jobs/run \
  -H "Content-Type: application/json" \
  -d '{"job_name": "process_to_order"}'
```

## Sample Output

```json
{
  "orders_created": 1,
  "order_details": [
    {
      "order_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "user_id": "demo_user",
      "total": 12.46,
      "tracking_number": "AMZN-1A2B3C4D5E6F",
      "delivery_date": "2025-12-05",
      "items_count": 2
    }
  ]
}
```

## Configuration

The function behavior is influenced by:

1. **`amazon_catalog` table**: Pre-populated with 138 grocery items across categories
2. **Pricing rules**: 8% tax, $5.99 shipping under $35
3. **Delivery timing**: 3-5 days from order creation

## Summary

The `process_to_order` function is a critical piece of the autonomous ordering pipeline that:
- **Transforms** pending order requests into actual orders
- **Integrates** with the Amazon catalog for pricing
- **Automates** the approval and placement workflow
- **Enables** the complete detect → order → deliver cycle

It is called by the scheduler service every 10 minutes and can be manually triggered via the REST API for testing and debugging.
