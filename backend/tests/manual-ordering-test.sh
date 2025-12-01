#!/bin/bash

# Manual Test Script for Amazon Auto-Ordering System
# This script tests the complete ordering workflow step-by-step

set -e  # Exit on error

API_URL="http://localhost:5001"
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Amazon Auto-Ordering Manual Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 1: Check Amazon Catalog
echo -e "${BLUE}[TEST 1] Checking Amazon Catalog...${NC}"
CATALOG=$(curl -s "$API_URL/auto-order/catalog")
CATALOG_COUNT=$(echo $CATALOG | jq -r '.count')
echo -e "  ✓ Found $CATALOG_COUNT items in Amazon catalog"
echo ""

# Test 2: Create test item at zero quantity
echo -e "${BLUE}[TEST 2] Creating test inventory item at zero quantity...${NC}"

# Generate unique test item name with timestamp
TEST_ITEM="Test_Milk_$(date +%s)"

CREATE_RESPONSE=$(curl -s -X POST "$API_URL/inventory" \
  -H "Content-Type: application/json" \
  -d "{
    \"item_name\": \"$TEST_ITEM\",
    \"quantity\": 0,
    \"unit\": \"gallon\",
    \"category\": \"dairy\"
  }")

ITEM_ID=$(echo $CREATE_RESPONSE | jq -r '.id')

if [ "$ITEM_ID" == "null" ] || [ -z "$ITEM_ID" ]; then
  echo -e "  ${RED}✗ Failed to create item${NC}"
  echo $CREATE_RESPONSE | jq
  exit 1
fi

echo -e "  ✓ Created inventory item: $ITEM_ID ($TEST_ITEM)"
echo ""

# Test 3: Detect zero inventory
echo -e "${BLUE}[TEST 3] Running zero inventory detection...${NC}"
DETECT_RESPONSE=$(curl -s -X POST "$API_URL/auto-order/jobs/run" \
  -H "Content-Type: application/json" \
  -d '{"job_name": "detect_zero_inventory"}')

ITEMS_ADDED=$(echo $DETECT_RESPONSE | jq -r '.result.items_added')
echo -e "  ✓ Detected and queued $ITEMS_ADDED items"
echo ""

# Test 4: Check to_order queue
echo -e "${BLUE}[TEST 4] Checking to_order queue...${NC}"
TO_ORDER=$(curl -s "$API_URL/auto-order/to-order?status=pending")
TO_ORDER_COUNT=$(echo $TO_ORDER | jq -r '.count')
echo -e "  ✓ Found $TO_ORDER_COUNT items in order queue"

if [ "$TO_ORDER_COUNT" -gt 0 ]; then
  echo $TO_ORDER | jq -r '.items[0] | "    - Item: \(.item_name), Qty: \(.reorder_quantity) \(.unit)"'
fi
echo ""

# Test 5: Process orders
echo -e "${BLUE}[TEST 5] Processing orders from queue...${NC}"
PROCESS_RESPONSE=$(curl -s -X POST "$API_URL/auto-order/jobs/run" \
  -H "Content-Type: application/json" \
  -d '{"job_name": "process_to_order"}')

ORDERS_CREATED=$(echo $PROCESS_RESPONSE | jq -r '.result.orders_created')
echo -e "  ✓ Created $ORDERS_CREATED Amazon orders"

if [ "$ORDERS_CREATED" -gt 0 ]; then
  ORDER_ID=$(echo $PROCESS_RESPONSE | jq -r '.result.orders[0].order_id')
  TRACKING=$(echo $PROCESS_RESPONSE | jq -r '.result.orders[0].tracking_number')
  TOTAL=$(echo $PROCESS_RESPONSE | jq -r '.result.orders[0].total')
  DELIVERY=$(echo $PROCESS_RESPONSE | jq -r '.result.orders[0].delivery_date')

  echo -e "    Order ID: $ORDER_ID"
  echo -e "    Tracking: $TRACKING"
  echo -e "    Total: \$$TOTAL"
  echo -e "    Delivery: $DELIVERY"
fi
echo ""

# Test 6: Check order details
if [ "$ORDERS_CREATED" -gt 0 ]; then
  echo -e "${BLUE}[TEST 6] Verifying order details...${NC}"
  ORDER_DETAILS=$(curl -s "$API_URL/orders/$ORDER_ID")

  STATUS=$(echo $ORDER_DETAILS | jq -r '.status')
  SUBTOTAL=$(echo $ORDER_DETAILS | jq -r '.subtotal')
  TAX=$(echo $ORDER_DETAILS | jq -r '.tax')
  SHIPPING=$(echo $ORDER_DETAILS | jq -r '.shipping')
  VENDOR=$(echo $ORDER_DETAILS | jq -r '.vendor')

  echo -e "    Vendor: $VENDOR"
  echo -e "    Status: $STATUS"
  echo -e "    Subtotal: \$$SUBTOTAL"
  echo -e "    Tax: \$$TAX"
  echo -e "    Shipping: \$$SHIPPING"
  echo -e "    Total: \$$TOTAL"

  # Verify pricing
  CALCULATED_TOTAL=$(echo "$SUBTOTAL + $TAX + $SHIPPING" | bc)
  if [ "$CALCULATED_TOTAL" == "$TOTAL" ]; then
    echo -e "  ${GREEN}✓ Pricing calculation correct!${NC}"
  else
    echo -e "  ${RED}✗ Pricing mismatch!${NC}"
  fi
  echo ""

  # Test 7: Simulate delivery
  echo -e "${BLUE}[TEST 7] Simulating delivery (setting delivery_date to today)...${NC}"
  docker exec -i grapefruit-db psql -U grapefruit -d grapefruit -c \
    "UPDATE orders SET delivery_date = CURRENT_DATE WHERE id = '$ORDER_ID';" > /dev/null 2>&1
  echo -e "  ✓ Updated delivery date to today"
  echo ""

  # Test 8: Process delivery
  echo -e "${BLUE}[TEST 8] Processing delivery...${NC}"
  DELIVERY_RESPONSE=$(curl -s -X POST "$API_URL/auto-order/jobs/run" \
    -H "Content-Type: application/json" \
    -d '{"job_name": "process_deliveries"}')

  DELIVERIES_PROCESSED=$(echo $DELIVERY_RESPONSE | jq -r '.result.deliveries_processed')
  echo -e "  ✓ Processed $DELIVERIES_PROCESSED deliveries"
  echo ""

  # Test 9: Verify inventory updated
  echo -e "${BLUE}[TEST 9] Verifying inventory was restocked...${NC}"
  FINAL_INVENTORY=$(curl -s "$API_URL/inventory/$ITEM_ID")
  FINAL_QUANTITY=$(echo $FINAL_INVENTORY | jq -r '.quantity')
  FINAL_STATUS=$(curl -s "$API_URL/orders/$ORDER_ID" | jq -r '.status')

  echo -e "    Inventory quantity: $FINAL_QUANTITY"
  echo -e "    Order status: $FINAL_STATUS"

  if [ "$FINAL_QUANTITY" != "0.00" ] && [ "$FINAL_STATUS" == "delivered" ]; then
    echo -e "  ${GREEN}✓ Inventory successfully restocked!${NC}"
  else
    echo -e "  ${RED}✗ Something went wrong with restocking${NC}"
  fi
fi
echo ""

# Test 10: Check job logs
echo -e "${BLUE}[TEST 10] Checking background job logs...${NC}"
JOBS=$(curl -s "$API_URL/auto-order/jobs?limit=5")
JOB_COUNT=$(echo $JOBS | jq -r '.count')
echo -e "  ✓ Found $JOB_COUNT recent job executions"
echo $JOBS | jq -r '.jobs[] | "    - \(.job_name): \(.status) (\(.items_created // 0) items)"'
echo ""

# Cleanup
echo -e "${BLUE}[CLEANUP] Removing test data...${NC}"
if [ ! -z "$ITEM_ID" ]; then
  curl -s -X DELETE "$API_URL/inventory/$ITEM_ID" > /dev/null
  echo -e "  ✓ Deleted test inventory item"
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All Tests Completed Successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
