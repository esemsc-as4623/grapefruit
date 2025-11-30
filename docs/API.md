# Grapefruit API Documentation

**Version**: 1.0.0  
**Base URL**: `http://localhost:5000`  
**Last Updated**: 2025-11-30

## Overview
RESTful API for Grapefruit AI Shopping Assistant. Handles inventory management, user preferences, and order workflow.

## Authentication
**Demo Mode**: All endpoints use `user_id=demo_user` (no authentication required)  
**Production**: Will require JWT tokens (deferred for hackathon)

---

## Table of Contents
- [Health Check](#health-check)
- [Inventory Endpoints](#inventory-endpoints)
- [Preferences Endpoints](#preferences-endpoints)
- [Orders Endpoints](#orders-endpoints)
- [Simulation Endpoints](#simulation-endpoints)
- [Error Responses](#error-responses)

---

## Health Check

### GET /health
Check API server status.

**Response 200**
```json
{
  "status": "ok",
  "timestamp": "2025-11-30T12:00:00.000Z"
}
```

---

## Inventory Endpoints

### GET /inventory
Get all inventory items for user.

**Query Parameters**
- `user_id` (optional): User identifier (default: `demo_user`)

**Response 200**
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "demo_user",
      "item_name": "Whole Milk",
      "quantity": "0.5",
      "unit": "gallon",
      "category": "dairy",
      "predicted_runout": "2025-12-01T12:00:00.000Z",
      "average_daily_consumption": "0.25",
      "last_updated": "2025-11-30T12:00:00.000Z",
      "created_at": "2025-11-23T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

### GET /inventory/low
Get items running low (predicted to run out within 3 days).

**Query Parameters**
- `user_id` (optional): User identifier

**Response 200**
```json
{
  "items": [
    {
      "id": "uuid",
      "item_name": "Whole Milk",
      "quantity": "0.5",
      "unit": "gallon",
      "predicted_runout": "2025-12-01T12:00:00.000Z",
      "days_until_runout": 1.5
    }
  ],
  "count": 1
}
```

---

### GET /inventory/:id
Get single inventory item by ID.

**Response 200**
```json
{
  "id": "uuid",
  "user_id": "demo_user",
  "item_name": "Whole Milk",
  "quantity": "0.5",
  "unit": "gallon",
  "category": "dairy",
  "predicted_runout": "2025-12-01T12:00:00.000Z"
}
```

**Response 404**
```json
{
  "error": {
    "message": "Item not found"
  }
}
```

---

### POST /inventory
Add new inventory item.

**Request Body**
```json
{
  "item_name": "Whole Milk",
  "quantity": 2.0,
  "unit": "gallon",
  "category": "dairy",
  "average_daily_consumption": 0.25
}
```

**Required Fields**
- `item_name` (string, max 255)
- `quantity` (number, >= 0)
- `unit` (string, max 50)

**Optional Fields**
- `category` (string)
- `predicted_runout` (ISO date)
- `average_daily_consumption` (number)

**Response 201**
```json
{
  "id": "uuid",
  "user_id": "demo_user",
  "item_name": "Whole Milk",
  "quantity": "2.0",
  "unit": "gallon",
  "category": "dairy",
  "created_at": "2025-11-30T12:00:00.000Z"
}
```

**Response 400**
```json
{
  "error": {
    "message": "\"quantity\" is required"
  }
}
```

---

### PUT /inventory/:id
Update inventory item.

**Request Body** (partial update allowed)
```json
{
  "quantity": 1.5,
  "predicted_runout": "2025-12-02T12:00:00.000Z"
}
```

**Allowed Fields**
- `quantity`
- `unit`
- `category`
- `predicted_runout`
- `average_daily_consumption`

**Response 200**
```json
{
  "id": "uuid",
  "quantity": "1.5",
  "predicted_runout": "2025-12-02T12:00:00.000Z",
  "last_updated": "2025-11-30T12:05:00.000Z"
}
```

---

### DELETE /inventory/:id
Delete inventory item.

**Response 200**
```json
{
  "message": "Item deleted successfully",
  "item": {
    "id": "uuid",
    "item_name": "Whole Milk"
  }
}
```

---

## Preferences Endpoints

### GET /preferences
Get user preferences.

**Query Parameters**
- `user_id` (optional): User identifier

**Response 200**
```json
{
  "id": "uuid",
  "user_id": "demo_user",
  "max_spend": "250.00",
  "approval_mode": "auto_under_limit",
  "auto_approve_limit": "100.00",
  "brand_prefs": {
    "milk": {
      "preferred": ["Organic Valley"],
      "acceptable": ["Great Value"],
      "avoid": []
    }
  },
  "allowed_vendors": ["walmart", "amazon"],
  "notify_low_inventory": true,
  "notify_order_ready": true,
  "created_at": "2025-11-01T12:00:00.000Z",
  "updated_at": "2025-11-30T12:00:00.000Z"
}
```

---

### PUT /preferences
Update user preferences (partial update).

**Request Body** (all fields optional)
```json
{
  "max_spend": 300.00,
  "approval_mode": "manual",
  "brand_prefs": {
    "milk": {
      "preferred": ["Organic Valley", "Horizon"],
      "acceptable": ["Great Value"],
      "avoid": ["Generic"]
    }
  },
  "allowed_vendors": ["walmart"]
}
```

**Approval Modes**
- `manual`: All orders require manual approval
- `auto_under_limit`: Auto-approve if total <= `auto_approve_limit`
- `auto_all`: Auto-approve all orders

**Response 200**
```json
{
  "id": "uuid",
  "user_id": "demo_user",
  "max_spend": "300.00",
  "approval_mode": "manual",
  "updated_at": "2025-11-30T12:00:00.000Z"
}
```

---

## Orders Endpoints

### GET /orders
Get all orders for user.

**Query Parameters**
- `user_id` (optional): User identifier
- `status` (optional): Filter by status (pending, approved, rejected, placed, delivered, cancelled)

**Response 200**
```json
{
  "orders": [
    {
      "id": "uuid",
      "user_id": "demo_user",
      "vendor": "walmart",
      "items": [
        {
          "item_name": "Whole Milk",
          "quantity": 1,
          "unit": "gallon",
          "price": 4.99,
          "brand": "Organic Valley"
        }
      ],
      "subtotal": "4.99",
      "tax": "0.40",
      "shipping": "0.00",
      "total": "5.39",
      "status": "pending",
      "created_at": "2025-11-30T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

### GET /orders/pending
Get pending orders awaiting approval.

**Response 200**
```json
{
  "orders": [
    {
      "id": "uuid",
      "vendor": "walmart",
      "items": [...],
      "total": "33.97",
      "created_at": "2025-11-30T10:00:00.000Z",
      "hours_pending": 2
    }
  ],
  "count": 1
}
```

---

### GET /orders/:id
Get single order by ID.

**Response 200**
```json
{
  "id": "uuid",
  "user_id": "demo_user",
  "vendor": "walmart",
  "items": [...],
  "total": "33.97",
  "status": "approved",
  "approved_at": "2025-11-30T11:00:00.000Z"
}
```

---

### POST /orders
Create new order.

**Request Body**
```json
{
  "vendor": "walmart",
  "items": [
    {
      "item_name": "Whole Milk",
      "quantity": 1,
      "unit": "gallon",
      "price": 4.99,
      "brand": "Organic Valley"
    }
  ],
  "subtotal": 4.99,
  "tax": 0.40,
  "shipping": 0.00,
  "total": 5.39
}
```

**Required Fields**
- `vendor`: "amazon" | "walmart" | "other"
- `items`: Array of item objects (min 1)
  - `item_name` (string)
  - `quantity` (number, >= 0)
  - `unit` (string)
  - `price` (number, >= 0)
- `subtotal` (number, >= 0)
- `total` (number, >= 0)

**Response 201**
```json
{
  "id": "uuid",
  "vendor": "walmart",
  "total": "5.39",
  "status": "pending",
  "created_at": "2025-11-30T12:00:00.000Z"
}
```

**Response 400 - Exceeds Spending Limit**
```json
{
  "error": {
    "message": "Order exceeds spending limit",
    "limit": 250.00,
    "total": 300.00
  }
}
```

---

### PUT /orders/:id/approve
Approve pending order.

**Request Body**
```json
{
  "notes": "Approved - all items needed"
}
```

**Response 200**
```json
{
  "id": "uuid",
  "status": "approved",
  "approved_at": "2025-11-30T12:00:00.000Z",
  "approval_notes": "Approved - all items needed"
}
```

---

### PUT /orders/:id/reject
Reject pending order.

**Request Body**
```json
{
  "notes": "Too expensive this month"
}
```

**Response 200**
```json
{
  "id": "uuid",
  "status": "rejected",
  "approval_notes": "Too expensive this month"
}
```

---

### PUT /orders/:id/placed
Mark approved order as placed with vendor.

**Request Body**
```json
{
  "vendor_order_id": "WMT-2025-11-30-123",
  "tracking_number": "1Z999AA10123456784"
}
```

**Required Fields**
- `vendor_order_id` (string)

**Response 200**
```json
{
  "id": "uuid",
  "status": "placed",
  "placed_at": "2025-11-30T12:00:00.000Z",
  "vendor_order_id": "WMT-2025-11-30-123",
  "tracking_number": "1Z999AA10123456784"
}
```

---

## Simulation Endpoints

### POST /simulate/day
Trigger daily forecasting and order generation (replaces background scheduler for demo).

**Request Body**
```json
{
  "user_id": "demo_user"
}
```

**Response 200 - Order Created**
```json
{
  "message": "Day simulation complete",
  "low_items": [
    {
      "item_name": "Whole Milk",
      "quantity": "0.5",
      "days_until_runout": 1.5
    }
  ],
  "order_created": true,
  "order": {
    "id": "uuid",
    "vendor": "walmart",
    "total": "33.97",
    "status": "pending"
  }
}
```

**Response 200 - No Items Low**
```json
{
  "message": "No items running low",
  "low_items": [],
  "order_created": false
}
```

**Response 200 - Exceeds Limit**
```json
{
  "message": "Order exceeds spending limit - manual review required",
  "low_items": [...],
  "proposed_order": {
    "items": [...],
    "total": "350.00",
    "vendor": "walmart"
  },
  "order_created": false,
  "reason": "exceeds_spending_limit"
}
```

---

### POST /simulate/consumption
Simulate consumption of inventory items (fast-forward time for testing).

**Request Body**
```json
{
  "user_id": "demo_user",
  "days": 3
}
```

**Response 200**
```json
{
  "message": "Simulated 3 days of consumption",
  "items_updated": 15,
  "items": [
    {
      "id": "uuid",
      "item_name": "Whole Milk",
      "quantity": "0.75",
      "predicted_runout": "2025-12-03T12:00:00.000Z"
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
Invalid input data or constraint violation.

```json
{
  "error": {
    "message": "\"quantity\" must be greater than or equal to 0",
    "status": 400
  }
}
```

---

### 404 Not Found
Resource not found.

```json
{
  "error": {
    "message": "Item not found",
    "status": 404
  }
}
```

---

### 409 Conflict
Unique constraint violation.

```json
{
  "error": {
    "message": "Resource already exists",
    "status": 409
  }
}
```

---

### 500 Internal Server Error
Unhandled server error.

```json
{
  "error": {
    "message": "Internal Server Error",
    "status": 500
  }
}
```

*Note: Stack traces included in development mode only*

---

## Rate Limiting
**Current**: None (demo mode)  
**Production**: 100 requests/minute per IP

---

## CORS
**Current**: All origins allowed  
**Production**: Whitelist specific domains

---

## Example Workflows

### Complete Order Flow
```bash
# 1. Check low inventory
curl http://localhost:5000/inventory/low

# 2. Trigger day simulation
curl -X POST http://localhost:5000/simulate/day

# 3. Get pending order
curl http://localhost:5000/orders/pending

# 4. Approve order
curl -X PUT http://localhost:5000/orders/{id}/approve \
  -H "Content-Type: application/json" \
  -d '{"notes": "Looks good"}'

# 5. Mark as placed (after vendor API call)
curl -X PUT http://localhost:5000/orders/{id}/placed \
  -H "Content-Type: application/json" \
  -d '{"vendor_order_id": "WMT-123", "tracking_number": "TRACK-456"}'
```

---

## Changelog

### v1.0.0 (2025-11-30)
- Initial API release
- Core endpoints: inventory, preferences, orders
- Simulation endpoints for demo
- Basic error handling
- Health check endpoint

---

## Support
For questions or issues, open a GitHub issue at: https://github.com/esemsc-as4623/grapefruit
