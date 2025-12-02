# Grapefruit: Akedo AI Shopping Assistant

> Autonomous home shopping agent for smart grocery management with AI-powered inventory tracking, receipt parsing via LLM, intelligent item matching, and automated reordering.

![CI Pipeline](https://github.com/esemsc-as4623/grapefruit/actions/workflows/ci.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-passing-success)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

## Table of Contents

- [Quick Start](#-quick-start)
- [Production Deployment](#-production-deployment)
- [Current Status](#-current-status)
- [Architecture](#-architecture)
- [API Documentation](#-api-documentation)

## Quick Start

```bash
# Clone repository
git clone https://github.com/esemsc-as4623/grapefruit.git
cd grapefruit

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys (especially ASI_API_KEY for LLM)

# Start all services with Docker (fresh installation)
docker compose up -d

# Wait ~15 seconds for database initialization to complete
sleep 15

# Verify the application is running
curl http://localhost:5000/health
curl http://localhost:5000/inventory

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
```

### ⚠️ Important: First-Time Setup

The database is **automatically initialized** on first startup. However, if you experience issues or the database already exists from a previous installation:

```bash
# RECOMMENDED: Complete reset for a fresh start
docker compose down              # Stop all containers
docker volume rm grapefruit_postgres_data  # Remove old database
docker compose up -d             # Start fresh with auto-initialization

# Wait for initialization (all 6 SQL scripts run automatically)
sleep 15

# Verify database is properly initialized
docker exec -it grapefruit-db psql -U grapefruit -d grapefruit -c "\dt"
# Should show 8 tables: inventory, cart, orders, preferences, 
#                       consumption_history, amazon_catalog, to_order, background_jobs

# Check inventory has sample data
docker exec -it grapefruit-db psql -U grapefruit -d grapefruit -c "SELECT COUNT(*) FROM inventory;"
# Should return 15 items
```

## 🏭 Production Deployment

**New!** Production-ready with Docker multi-stage builds, database migrations, audit logging, and LLM caching.

### Quick Production Deploy

```bash
# 1. Configure environment
cp .env.production.example .env
# Edit .env with your production settings

# 2. Deploy
docker compose -f docker-compose.prod.yml up -d --build

# 3. Verify
curl http://localhost:5000/health
docker compose -f docker-compose.prod.yml logs | grep migration
```

### Production Features

- ✅ **Multi-stage Docker builds** - Optimized images with production dependencies only
- ✅ **Application-level migrations** - No race conditions, runs on startup
- ✅ **Audit logging** - Complete trail of all user actions with queryable API
- ✅ **LLM response caching** - Reduces API costs by ~80%
- ✅ **Transaction support** - Atomic multi-step operations
- ✅ **Rate limiting** - Protects API from abuse (100 req/15min general, 10 req/15min for LLM)
- ✅ **SSL/TLS support** - HTTPS encryption for production deployments
- ✅ **Request/response logging** - Comprehensive HTTP logging with sensitive data redaction
- ✅ **Enhanced health checks** - Migration status, database health, and system metrics
- ✅ **Improved healthchecks** - Proper startup delays and retries
- ✅ **Graceful shutdown** - Clean database closure
- ✅ **Resource limits** - CPU and memory constraints
- ✅ **Security hardening** - Non-root users, no dev mounts

**📖 Full documentation**: 
- [`PRODUCTION.md`](./PRODUCTION.md) - Detailed deployment guide
- [`SECURITY_MONITORING.md`](./SECURITY_MONITORING.md) - Security features and monitoring


### Database Management

```bash
# To completely reset the database with fresh data
docker compose down
docker volume rm grapefruit_postgres_data
docker compose up -d

# To inspect the database
docker exec -it grapefruit-db psql -U grapefruit -d grapefruit

# List all tables
docker exec -it grapefruit-db psql -U grapefruit -d grapefruit -c "\dt"

# Check table row counts
docker exec -it grapefruit-db psql -U grapefruit -d grapefruit -c "
  SELECT 'inventory' as table_name, COUNT(*) FROM inventory 
  UNION ALL SELECT 'amazon_catalog', COUNT(*) FROM amazon_catalog
  UNION ALL SELECT 'preferences', COUNT(*) FROM preferences;"

# To manually run a SQL script (if needed)
docker exec -i grapefruit-db psql -U grapefruit -d grapefruit < database/your-script.sql
```

**Initialization Order:**
1. `01-init.sql` - Core schema (inventory, preferences, orders tables)
2. `02-add-cart.sql` - Shopping cart table
3. `03-add-consumption.sql` - Consumption tracking table
4. `04-auto-ordering.sql` - Auto-ordering system (amazon_catalog, to_order, background_jobs tables + functions)
5. `05-seed.sql` - Demo data for inventory and preferences (15 items)
6. `06-seed-grocery-catalog.sql` - Amazon grocery catalog (138 items)

**What Gets Created:**
- **8 Tables**: `inventory`, `cart`, `orders`, `preferences`, `consumption_history`, `amazon_catalog`, `to_order`, `background_jobs`
- **3 Functions**: `detect_zero_inventory()`, `process_to_order()`, `process_deliveries()`
- **Sample Data**: 15 inventory items, 1 user preference profile, 138 Amazon catalog items

**Verify Initialization:**
```bash
# Check that all tables were created
docker exec -it grapefruit-db psql -U grapefruit -d grapefruit -c "\dt"

# Verify data was seeded
docker exec -it grapefruit-db psql -U grapefruit -d grapefruit -c "
  SELECT 'inventory' as table_name, COUNT(*) as rows FROM inventory 
  UNION ALL SELECT 'amazon_catalog', COUNT(*) FROM amazon_catalog 
  UNION ALL SELECT 'preferences', COUNT(*) FROM preferences;"
# Expected: inventory=15, amazon_catalog=138, preferences=1

# Check auto-ordering functions exist
docker exec -it grapefruit-db psql -U grapefruit -d grapefruit -c "
  SELECT routine_name FROM information_schema.routines 
  WHERE routine_schema = 'public' 
  AND routine_name IN ('detect_zero_inventory', 'process_to_order', 'process_deliveries');"
# Expected: 3 functions
```

**Troubleshooting:**
If your inventory is empty or tables are missing:
```bash
# The database volume persisted from a previous run - reset it:
docker compose down
docker volume rm grapefruit_postgres_data
docker compose up -d
sleep 15  # Wait for initialization

# Check logs if issues persist:
docker logs grapefruit-db 2>&1 | grep -E "(ERROR|running /docker)"
```

### Running Tests

```bash
cd backend
npm test                              # Run all tests
npm test tests/receipt-workflow.test.js  # Test receipt parsing
npm test -- --coverage                # With coverage report
```

---

## ✅ Current Status

**Branch**: `dev`

### ✅ Completed Features

#### Database & Schema
- **PostgreSQL with 8 tables**:
  - `inventory` - Current inventory with consumption tracking
  - `preferences` - User settings including auto-order configuration
  - `orders` - Order history and pending approvals
  - `cart` - Shopping cart management
  - `consumption_history` - Historical consumption data
  - `amazon_catalog` - Mock Amazon grocery catalog (138 items)
  - `to_order` - Auto-order queue for items needing reorder
  - `background_jobs` - Job execution tracking
- **3 automated database functions**:
  - `detect_zero_inventory()` - Detects items at zero quantity
  - `process_to_order()` - Creates orders from the queue
  - `process_deliveries()` - Updates inventory when orders arrive
- **Automated initialization** via Docker with 6 SQL scripts

#### Backend API (Node.js/Express)
- **Comprehensive RESTful API** with 30+ endpoints:
  - **Inventory**: Full CRUD operations, low inventory alerts, bulk operations
  - **Receipts**: Complete 4-step processing workflow (upload → parse → match → apply)
  - **Orders**: Creation, approval, status tracking, delivery management
  - **Preferences**: User settings management with auto-order controls
  - **Cart**: Shopping cart operations with LLM-powered pricing
  - **Simulation**: Demo forecasting and consumption modeling
  - **Auto-Order**: Queue management, catalog search, scheduler control
- **Production-grade features**:
  - Helmet security headers
  - CORS configuration
  - Joi validation schemas
  - Winston logging
  - Comprehensive error handling
  - Health check endpoints

#### Auto-Ordering System
- ✅ **User-configurable settings**:
  - Toggle to enable/disable automatic ordering
  - Adjustable threshold (1-30 days before predicted runout)
  - Configurable via preferences API and UI
- ✅ **Background scheduler** (node-cron):
  - Runs every 5 minutes
  - Detects items at zero quantity
  - Checks items predicted to run out within threshold
  - Automatically queues items for ordering
- ✅ **Complete workflow**:
  - Detection → Queue → Order Creation → Delivery → Inventory Update
  - Job logging to `background_jobs` table
  - Detailed execution metrics
- ✅ **Amazon catalog integration**:
  - 138 grocery items pre-seeded
  - Category-based matching
  - Price and availability tracking
  - Catalog search API

#### Receipt Processing Pipeline
- ✅ **LLM-powered parsing**:
  - ASI Cloud integration (asi1-mini model)
  - Intelligent extraction of grocery items
  - Filters non-grocery content (taxes, totals, headers)
  - Confidence scoring for each item
  - Token usage and latency tracking
  - Debug mode for troubleshooting
- ✅ **Rule-based fallback parser**:
  - Regex-based extraction
  - Works when LLM is unavailable
  - Handles various receipt formats
- ✅ **Smart item matching**:
  - Fuzzy matching (Levenshtein distance)
  - Category-aware matching
  - Unit normalization (lb→pound, gal→gallon)
  - Quantity aggregation for duplicates
  - Confidence thresholds for auto-approval
- ✅ **Complete workflow** with 4 endpoints:
  - Upload → Parse → Match → Apply to Inventory
  - Retry logic with exponential backoff
  - Comprehensive error handling

#### Frontend UI (React + TailwindCSS)
- ✅ **6 fully functional components**:
  - **ReceiptUpload** - Receipt upload and text input interface
  - **ReceiptReview** - Parse results review and editing
  - **ManualEntry** - Manual item addition with smart defaults
  - **InventoryDashboard** - Real-time inventory display with auto-order controls
  - **PreferencesPanel** - User preferences configuration
  - **CartReview** - Shopping cart management
- ✅ **Features**:
  - Real-time API integration
  - Responsive design (mobile + desktop)
  - Status indicators and notifications
  - Category-based filtering
  - Low inventory alerts
  - Auto-order toggle and threshold controls

#### Testing & Quality Assurance
- ✅ **Comprehensive test suite** with Jest + Supertest:
  - **Integration tests** - 37 API endpoint tests
  - **Receipt workflow tests** - 12 receipt processing tests
  - **Inventory tests** - 10 CRUD and validation tests
- ✅ **Test utilities**:
  - Database cleanup scripts
  - Mock data generators
  - Automated CI/CD with GitHub Actions

#### DevOps & Infrastructure
- ✅ **Docker containerization**:
  - Multi-service docker-compose setup
  - Frontend, backend, and PostgreSQL containers
  - Health checks and auto-restart
  - Volume persistence for database
- ✅ **Automated database initialization**:
  - 6 SQL scripts run on first startup
  - Creates schema, seeds data, and populates catalog
  - Idempotent migrations
- ✅ **Environment configuration**:
  - Comprehensive .env.example template
  - All required variables documented
  - Secure default values

#### LLM Integration
- ✅ **Production-ready ASI Cloud integration**:
  - Configurable model selection
  - Retry logic with exponential backoff
  - Token usage tracking
  - Latency monitoring
  - Debug mode for development
  - Graceful fallback to rule-based parsing

### 🚧 In Progress
- **Vendor API Integration**: Real Amazon/Walmart API connections (currently using mock catalog)
- **Advanced ML Forecasting**: Seasonal models and trend analysis
- **Email Receipt Parsing**: Automatic extraction from email forwarding
- **Cart Optimization**: Multi-vendor order splitting and price comparison

### 📋 Future Enhancements
- Real-time inventory updates via WebSocket
- Mobile app (React Native)
- Multi-user authentication and isolation
- Advanced analytics dashboard
- Voice interface integration
- Nutritional tracking and meal planning

---

## 📁 Project Structure

```
grapefruit/
├── README.md
├── docker-compose.yml        # ✅ Multi-service orchestration (frontend, backend, postgres)
├── .env.example              # ✅ Environment configuration template
├── LICENSE                   # ✅ GPL-3.0 license
│
├── frontend/                 # ✅ React UI with TailwindCSS
│   ├── src/
│   │   ├── components/
│   │   │   ├── ReceiptUpload.jsx      # ✅ Receipt upload interface
│   │   │   ├── ReceiptReview.jsx      # ✅ Parse results review/edit
│   │   │   ├── ManualEntry.jsx        # ✅ Manual item addition
│   │   │   ├── InventoryDashboard.jsx # ✅ Inventory display + auto-order controls
│   │   │   ├── PreferencesPanel.jsx   # ✅ User preferences & auto-order settings
│   │   │   └── CartReview.jsx         # ✅ Shopping cart management
│   │   ├── services/
│   │   │   └── api.js                 # ✅ Axios API client
│   │   ├── App.jsx                    # ✅ Main app with React Router
│   │   ├── index.jsx
│   │   └── index.css                  # ✅ TailwindCSS configuration
│   ├── package.json
│   ├── Dockerfile                     # ✅ Production-ready container
│   └── tailwind.config.js
│
├── backend/                  # ✅ Node.js/Express REST API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── index.js              # ✅ Core API (inventory, orders, preferences)
│   │   │   ├── receipts.js           # ✅ 4-step receipt processing workflow
│   │   │   ├── simulation.js         # ✅ Demo forecasting endpoints
│   │   │   └── autoOrder.js          # ✅ Auto-ordering system API
│   │   ├── services/
│   │   │   ├── receiptParser.js      # ✅ LLM + rule-based parsing
│   │   │   ├── inventoryMatcher.js   # ✅ Fuzzy + semantic matching
│   │   │   ├── llmClient.js          # ✅ ASI Cloud integration
│   │   │   ├── autoOrderScheduler.js # ✅ Background cron jobs (5-min interval)
│   │   │   ├── cartPricer.js         # ✅ LLM-powered price/quantity suggestions
│   │   │   ├── consumptionLearner.js # ✅ Consumption tracking
│   │   │   └── priceService.js       # ✅ Price estimation
│   │   ├── utils/
│   │   │   ├── itemNormalizer.js     # ✅ Item parsing & normalization
│   │   │   ├── categoryInference.js  # ✅ Automatic category detection
│   │   │   └── logger.js             # ✅ Winston logging (file + console)
│   │   ├── models/
│   │   │   └── db.js                 # ✅ Database models & operations
│   │   ├── middleware/
│   │   │   ├── errorHandler.js       # ✅ Global error handling
│   │   │   └── encryption.js         # ✅ Data encryption utilities
│   │   ├── config/
│   │   │   ├── database.js           # ✅ PostgreSQL connection config
│   │   │   └── llm.js                # ✅ LLM configuration & prompts
│   │   ├── app.js                    # ✅ Express app setup
│   │   └── server.js                 # ✅ Server entry point
│   ├── prompts/
│   │   ├── receipt_parsing.txt       # ✅ LLM system prompt for receipts
│   │   ├── item_matching.txt         # ✅ Semantic matching prompt
│   │   ├── cart_pricing.txt          # ✅ Price/quantity suggestion prompt
│   │   └── README.md
│   ├── tests/
│   │   ├── integration.test.js       # ✅ 37 API endpoint tests
│   │   ├── receipt-workflow.test.js  # ✅ 12 receipt processing tests
│   │   ├── inventory-add.test.js     # ✅ 10 inventory CRUD tests
│   │   ├── amazon-ordering.test.js   # ✅ Auto-ordering system tests
│   │   └── cleanup-test-data.sql     # ✅ Test database cleanup
│   ├── coverage/                     # ✅ Jest coverage reports
│   ├── logs/                         # ✅ Application logs
│   ├── package.json
│   └── Dockerfile                    # ✅ Production-ready container
│
├── database/                 # ✅ PostgreSQL schema & migrations
│   ├── init.sql              # ✅ Core schema (inventory, orders, preferences)
│   ├── add_cart_table.sql    # ✅ Shopping cart schema
│   ├── add_consumption_history.sql  # ✅ Consumption tracking
│   ├── migration-auto-ordering.sql  # ✅ Auto-order system (catalog, queue, jobs)
│   ├── seed.sql              # ✅ Demo data (15 inventory items + preferences)
│   ├── seed-grocery-catalog.sql     # ✅ Amazon catalog (138 items)
│   └── README.md
│
└── examples/                # ✅ Sample receipts for testing
    ├── generic.txt          # ✅ Standard grocery receipt
    ├── delivery.txt         # ✅ Delivery receipt format
    ├── discounts.txt        # ✅ Receipt with promotions
    ├── pharmacy.txt         # ✅ Pharmacy receipt
    ├── email.txt            # ✅ Email receipt format
    └── ... (14+ examples)
```

**Legend:**
- ✅ Fully implemented and tested
- 🚧 Partial implementation / Work in progress
- ⏳ Planned for future

---

## 📋 Key Features

### 🧾 Receipt Processing (Production-Ready)

**LLM-Powered Parsing:**
- Upload receipt text via web interface or API
- ASI Cloud integration with asi1-mini model
- Intelligent extraction of grocery items only
- Automatic filtering of non-grocery content (store info, headers, totals, taxes, payment details)
- Per-item confidence scoring
- Comprehensive error handling with retry logic

**Rule-Based Fallback Parser:**
- Regex-based pattern matching
- Automatic activation when LLM is unavailable
- Handles multiple receipt formats
- No external dependencies

**Smart Item Matching:**
- Fuzzy matching against existing inventory using Levenshtein distance
- Category-aware matching (beverages, produce, meat, dairy, etc.)
- Intelligent unit normalization (lb→pound, gal→gallon, oz→ounce)
- Automatic quantity aggregation for duplicate items
- Configurable confidence thresholds for auto-approval
- Manual review interface for low-confidence matches

**Production Features:**
- Exponential backoff retry logic (3 attempts, 1s/2s/4s delays)
- Token usage tracking and cost monitoring
- Latency measurement and performance logging
- Debug mode (`LLM_DEBUG=true`) for development troubleshooting
- Raw LLM response logging for audit trails
- Graceful degradation when LLM is unavailable

**Complete 4-Step Workflow:**
1. **Upload** - Submit receipt text (file or direct input)
2. **Parse** - Extract items using LLM or rule-based parser
3. **Match** - Fuzzy match to existing inventory with confidence scores
4. **Apply** - Update inventory quantities with user approval

**Supported Receipt Formats:**
- Standard grocery receipts
- Online delivery receipts (Amazon Fresh, Instacart, etc.)
- Pharmacy receipts (grocery items only)
- Warehouse club receipts (Costco, Sam's Club)
- International receipts
- Email receipts
- Receipts with discounts, coupons, and promotions

---

### 📦 Inventory Management (Full CRUD)

**Core Operations:**
- Create, read, update, delete inventory items
- Bulk item import from receipts
- Real-time quantity tracking
- Automatic predicted runout calculation
- Category-based organization (15+ categories)
- Low inventory alerts and notifications
- Historical purchase tracking

**Smart Features:**
- Automatic daily consumption rate calculation
- Predicted runout dates based on usage patterns
- Duplicate detection with smart merging
- Unit standardization across items
- Last purchase tracking for reorder suggestions

**Data Model:**
```javascript
{
  id: UUID,                          // Unique identifier
  user_id: string,                   // User identifier (demo: 'demo_user')
  item_name: string,                 // Product name
  quantity: decimal,                 // Current quantity
  unit: string,                      // gallon, lb, oz, count, etc.
  category: string,                  // dairy, produce, pantry, frozen, etc.
  predicted_runout: timestamp,       // ML-predicted depletion date
  average_daily_consumption: decimal, // Consumption rate for forecasting
  last_purchase_date: timestamp,     // Last time item was purchased
  last_purchase_quantity: decimal,   // Quantity from last purchase
  created_at: timestamp,             // Item creation date
  last_updated: timestamp            // Last modification date
}
```

**API Endpoints:**
- `GET /inventory` - List all items with filtering
- `GET /inventory/low` - Items running low
- `GET /inventory/:id` - Get specific item
- `POST /inventory` - Add new item
- `POST /inventory/bulk` - Bulk import
- `PUT /inventory/:id` - Update item
- `DELETE /inventory/:id` - Remove item

---

### 🤖 Auto-Ordering System (Fully Automated)

**User Controls:**
- **Enable/Disable Toggle**: Turn auto-ordering on/off per user
- **Threshold Configuration**: Set how many days before runout to trigger order (1-30 days)
- **Configurable via**:
  - Preferences API (`PUT /preferences`)
  - Preferences Panel UI
  - Inventory Dashboard quick toggle

**Automated Detection:**
- Background scheduler runs every 5 minutes (node-cron)
- Detects items at zero quantity immediately
- Checks items predicted to run out within user threshold
- Respects user's auto-order enabled/disabled setting
- Logs all detection events to `background_jobs` table

**Complete Workflow:**
1. **Detection** - Scheduler identifies items needing reorder
2. **Queue** - Items added to `to_order` table with metadata
3. **Order Creation** - Matches items to Amazon catalog and creates orders
4. **Delivery Processing** - Updates inventory when orders arrive
5. **Cleanup** - Marks completed items as delivered

**Amazon Catalog Integration:**
- 138 pre-seeded grocery items across all categories
- Real-time price and availability tracking
- Category-based item matching
- Brand preference support
- Search API for catalog exploration

**Background Jobs:**
- Job execution logging with status tracking
- Performance metrics (items processed, created, updated)
- Error handling with detailed logging
- Metadata storage for debugging
- Job history for audit trails

**API Endpoints:**
- `GET /auto-order/status` - Scheduler status
- `GET /auto-order/to-order` - View order queue
- `GET /auto-order/pending` - Pending items with catalog info
- `GET /auto-order/deliveries` - Orders awaiting delivery
- `GET /auto-order/catalog` - Search Amazon catalog
- `POST /auto-order/trigger` - Manual scheduler trigger
- `POST /auto-order/simulate-delivery` - Test delivery processing

**Database Tables:**
- `to_order` - Queue of items needing reorder
- `amazon_catalog` - Mock retailer product catalog
- `background_jobs` - Job execution tracking
- `orders` - Order history with delivery dates

---

### 🛒 Shopping Cart & Order Management

**Cart Features:**
- Add items manually or from "trash can" gesture
- LLM-powered price and quantity suggestions
- Automatic cart total calculation
- Category grouping for organized shopping
- Remove/edit items before checkout
- Persist cart across sessions

**Order Workflow:**
- Create orders from cart or auto-order queue
- Vendor selection (Amazon, Walmart, Other)
- Spending cap validation against user preferences
- Order approval workflow (auto or manual)
- Status tracking: pending → approved → placed → delivered
- Order history with search and filtering

**Financial Tracking:**
- Subtotal, tax, shipping calculations
- Total cost validation
- Price estimation for unknown items
- Budget compliance checks

**Order Data Model:**
```javascript
{
  id: UUID,
  user_id: string,
  vendor: 'amazon' | 'walmart' | 'other',
  items: [
    {
      item_name: string,
      quantity: number,
      unit: string,
      price: number,
      brand: string
    }
  ],
  subtotal: decimal,
  tax: decimal,
  shipping: decimal,
  total: decimal,
  status: 'pending' | 'approved' | 'placed' | 'delivered' | 'cancelled',
  delivery_date: date,
  vendor_order_id: string,
  tracking_number: string
}
```

---

### ⚙️ User Preferences & Configuration

**Preference Settings:**
- **Brand Preferences**: Preferred, acceptable, and avoided brands per category
- **Vendor Allowlist**: Enabled vendors (Amazon, Walmart, etc.)
- **Spending Limits**: Maximum order amount caps
- **Notifications**:
  - Low inventory alerts
  - Order ready notifications
- **Auto-Order Settings**:
  - Enable/disable automatic ordering
  - Threshold days before runout (1-30)

**Persistence:**
- PostgreSQL storage with JSONB fields for flexible data
- User-specific settings with `user_id` isolation
- Default values for new users
- Timestamp tracking for auditing

**API Access:**
- `GET /preferences` - Retrieve user preferences
- `PUT /preferences` - Update any preference field
- Partial updates supported
- Validation with Joi schemas

---

## 🧪 Testing

The project includes a comprehensive test suite with **59+ passing tests** covering integration, receipt processing, inventory management, and auto-ordering workflows.

### Test Suites

#### 1. Integration Tests (`integration.test.js`) - 37 tests
**Coverage:**
- Complete API endpoint testing (30+ endpoints)
- Database CRUD operations
- Error handling and validation
- End-to-end workflows
- Authentication and authorization (demo mode)

**Key Test Areas:**
- Inventory management (create, read, update, delete, bulk operations)
- Order lifecycle (creation, approval, status updates)
- Preferences management (get, update, validation)
- Health check endpoints
- Error scenarios and edge cases

#### 2. Receipt Workflow Tests (`receipt-workflow.test.js`) - 12 tests
**Coverage:**
- Complete 4-step receipt processing workflow
- LLM integration and response parsing
- Fallback to rule-based parser
- Item matching algorithms
- Fuzzy matching and confidence scoring
- Error handling and retry logic

**Key Test Areas:**
- Receipt upload and validation
- LLM-powered parsing with various receipt formats
- Rule-based parsing when LLM unavailable
- Item matching to existing inventory
- Confidence threshold validation
- Inventory application and updates

#### 3. Inventory Addition Tests (`inventory-add.test.js`) - 10 tests
**Coverage:**
- Item creation with required fields
- Validation rules and constraints
- Predicted runout calculations
- Data persistence and timestamps
- Category-specific handling
- Unit type support
- Duplicate detection

**Key Test Areas:**
- Basic item creation
- Field validation (required vs optional)
- Negative quantity rejection
- Data type validation
- Consumption rate calculations
- Timestamp generation (created_at, last_updated)
- UUID generation and format
- Category and unit variety
- Duplicate item handling

#### 4. Auto-Ordering Tests (`amazon-ordering.test.js`)
**Coverage:**
- Background scheduler functionality
- Zero inventory detection
- Threshold-based ordering
- Amazon catalog matching
- Order creation from queue
- Delivery processing
- Job logging and metrics

### Running Tests

```bash
cd backend

# Run all tests (59+ tests)
npm test

# Run all tests with coverage report
npm test -- --coverage

# Run specific test suite
npm test tests/integration.test.js        # 37 tests
npm test tests/receipt-workflow.test.js   # 12 tests
npm test tests/inventory-add.test.js      # 10 tests
npm test tests/amazon-ordering.test.js    # Auto-order tests

# Watch mode for development
npm run test:watch

# Debug mode (shows LLM responses and detailed logs)
LLM_DEBUG=true npm test tests/receipt-workflow.test.js

# Run auto-ordering tests with database cleanup
npm run test:amazon
```

### Test Infrastructure

**Database Management:**
- Automatic test database setup and teardown
- Data cleanup scripts (`cleanup-test-data.sql`)
- Isolated test transactions
- Seed data for consistent testing

**Mocking & Fixtures:**
- Sample receipt files in `examples/` directory
- Mock LLM responses for offline testing
- Mock Amazon catalog data
- Test user preferences

**CI/CD Integration:**
- GitHub Actions workflow
- Automated test runs on push/PR
- Coverage reporting
- Build status badges

### Coverage Reports

Test coverage is tracked using Jest's built-in coverage tool:

```bash
# Generate coverage report
npm test -- --coverage

# Coverage files generated in backend/coverage/
# - HTML report: coverage/lcov-report/index.html
# - JSON report: coverage/coverage-final.json
# - LCOV format: coverage/lcov.info
```

**Current Coverage Areas:**
- Routes and API endpoints
- Service layer (receipt parsing, matching, scheduling)
- Database models and operations
- Utility functions (normalization, categorization)
- Error handling middleware

```bash
cd backend

# Run all tests
npm test

# Run specific test suite
npm test tests/receipt-workflow.test.js

# Run with coverage
npm test -- --coverage

# Debug mode (shows LLM responses)
LLM_DEBUG=true npm test tests/receipt-workflow.test.js
```

---

## 🔐 Environment Configuration

Create a `.env` file in the project root with these required variables:

```bash
# ============================================
# DATABASE
# ============================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=grapefruit
DB_USER=grapefruit
DB_PASSWORD=grapefruit

# ============================================
# BACKEND API
# ============================================
BACKEND_PORT=5000
NODE_ENV=development
HOST=0.0.0.0
LOG_LEVEL=info

# ============================================
# LLM / AI SERVICES (Required for receipt parsing)
# ============================================
# ASI Cloud API - Get your key at https://asicloud.cudos.org
ASI_API_KEY=your-asi-cloud-api-key-here
ASI_BASE_URL=https://inference.asicloud.cudos.org/v1
ASI_MODEL=asi1-mini

# LLM Debug Mode - Set to 'true' to see detailed LLM requests/responses
LLM_DEBUG=false

# ============================================
# SECURITY
# ============================================
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-32-byte-hex-encryption-key-here

# ============================================
# VENDOR API KEYS (Optional - for future use)
# ============================================
# Amazon Product Advertising API
AMAZON_ACCESS_KEY=your-amazon-access-key
AMAZON_SECRET_KEY=your-amazon-secret-key
AMAZON_PARTNER_TAG=your-amazon-partner-tag

# Walmart Open API
WALMART_API_KEY=your-walmart-api-key
```

### Getting API Keys

**ASI Cloud (Required):**
1. Visit [https://asicloud.cudos.org](https://asicloud.cudos.org)
2. Sign up for a free account
3. Generate an API key from your dashboard
4. Add to `.env` file as `ASI_API_KEY`

**Encryption Key (Required):**
```bash
# Generate a secure 32-byte encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Amazon & Walmart APIs (Optional):**
- Currently using mock catalog
- Real API integration planned for future releases
- Keys can be left as placeholders for now

### Environment File Template

A complete `.env.example` file is provided in the repository root. Copy it to get started:

```bash
cp .env.example .env
# Edit .env with your actual values
```

---

## 🛠️ Tech Stack

| Component | Technology | Purpose | Status |
|-----------|-----------|---------|--------|
| **Frontend** | React 18 + TailwindCSS | Modern responsive UI | ✅ Production |
| **Routing** | React Router v6 | Client-side navigation | ✅ Production |
| **Icons** | Lucide React | UI icons and graphics | ✅ Production |
| **Backend** | Node.js 18 + Express.js | REST API server | ✅ Production |
| **Database** | PostgreSQL 15 | Primary data store | ✅ Production |
| **ORM** | pg (node-postgres) | Database client | ✅ Production |
| **LLM** | ASI Cloud (asi1-mini) | Receipt parsing & cart pricing | ✅ Production |
| **Validation** | Joi | Request validation | ✅ Production |
| **Logging** | Winston | Application logging | ✅ Production |
| **Testing** | Jest + Supertest | Unit & integration tests | ✅ 59+ tests |
| **Scheduler** | node-cron | Background jobs (auto-order) | ✅ Production |
| **Security** | Helmet | HTTP security headers | ✅ Production |
| **File Upload** | Multer | Receipt file handling | ✅ Production |
| **HTTP Client** | Axios | LLM API requests | ✅ Production |
| **Containerization** | Docker + Docker Compose | Multi-service deployment | ✅ Production |
| **CI/CD** | GitHub Actions | Automated testing | ✅ Configured |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + TailwindCSS)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │Inventory │ │ Receipt  │ │  Cart    │ │Preferences│       │
│  │Dashboard │ │ Upload   │ │ Review   │ │  Panel   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                            ↓ HTTP/REST                       │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│              Backend API (Node.js + Express)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Routes   │ │ Services │ │  Models  │ │Middleware│       │
│  │(30+ APIs)│ │(Parsers) │ │   (DB)   │ │ (Error)  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│       ↓              ↓              ↓          ↓             │
└───────┼──────────────┼──────────────┼──────────┼────────────┘
        ↓              ↓              ↓          ↓
   ┌─────────┐   ┌─────────┐   ┌─────────┐  ┌─────────┐
   │PostgreSQL│   │ASI Cloud│   │ Cron    │  │ Winston │
   │ (8 tables)│  │  (LLM)  │   │Scheduler│  │  Logs   │
   └─────────┘   └─────────┘   └─────────┘  └─────────┘
```

### Key Libraries & Versions

**Backend (`backend/package.json`):**
```json
{
  "express": "^4.18.2",
  "pg": "^8.11.3",
  "axios": "^1.13.2",
  "joi": "^17.11.0",
  "winston": "^3.11.0",
  "node-cron": "^3.0.3",
  "helmet": "^7.1.0",
  "multer": "^1.4.5-lts.1",
  "jest": "^29.7.0",
  "supertest": "^6.3.3"
}
```

**Frontend (`frontend/package.json`):**
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.20.0",
  "axios": "^1.6.2",
  "lucide-react": "^0.294.0",
  "tailwindcss": "^3.3.5"
}
```

---

## 🚧 Future Enhancements

### Planned Features

#### Phase 1: Enhanced Intelligence
- **Advanced ML Forecasting**:
  - Seasonal consumption models (holidays, weather-dependent items)
  - Multi-variate prediction (household size, events, trends)
  - ARIMA/Prophet time series models
  - Anomaly detection for unusual consumption patterns
- **LLM-Based Semantic Matching**:
  - Deep semantic similarity for receipt items
  - Brand inference from product descriptions
  - Handle misspellings and abbreviations
  - Cross-language receipt support

#### Phase 2: Vendor Integration
- **Real Amazon API Integration**:
  - Product Advertising API connection
  - Real-time price checking
  - Prime delivery optimization
  - Subscribe & Save integration
- **Walmart API Integration**:
  - Multi-vendor price comparison
  - Availability checking across vendors
  - Delivery time estimation
  - Pickup vs delivery options
- **Multi-Vendor Order Optimization**:
  - Automatic order splitting for best prices
  - Shipping cost optimization
  - Delivery window consolidation

#### Phase 3: Advanced Features
- **Email Receipt Parsing**:
  - Gmail/Outlook integration
  - Automatic receipt extraction from email
  - PDF receipt parsing with OCR
  - Image-based receipt scanning
- **Mobile Application**:
  - React Native app for iOS/Android
  - Barcode scanning for quick item addition
  - Voice commands for hands-free operation
  - Push notifications for deliveries
- **Real-Time Updates**:
  - WebSocket for live inventory changes
  - Real-time order status updates
  - Live delivery tracking
  - Multi-device synchronization

#### Phase 4: User Experience
- **Multi-User Support**:
  - User authentication (OAuth2, JWT)
  - Household sharing and permissions
  - Shopping list collaboration
  - Separate inventories per user
- **Advanced Analytics**:
  - Spending trends and insights
  - Category-wise consumption charts
  - Budget tracking and forecasting
  - Waste reduction metrics
- **Nutritional Tracking**:
  - Calorie and macro tracking
  - Dietary restriction support
  - Meal planning integration
  - Recipe suggestions based on inventory

#### Phase 5: Infrastructure & Scale
- **Performance Optimization**:
  - Redis caching layer
  - Database query optimization
  - CDN for frontend assets
  - API rate limiting and throttling
- **Background Job Queue**:
  - Bull/BullMQ for job processing
  - Retry strategies for failed jobs
  - Job prioritization
  - Job monitoring dashboard
- **Monitoring & Observability**:
  - Prometheus metrics collection
  - Grafana dashboards
  - Error tracking (Sentry)
  - Performance monitoring (New Relic)
  - Log aggregation (ELK stack)

### Technical Debt & Improvements

- **Testing**:
  - Increase test coverage to 80%+
  - Add E2E tests with Playwright/Cypress
  - Performance benchmarking
  - Load testing with k6
- **Security**:
  - Implement full encryption for sensitive data
  - Add rate limiting per user
  - API key rotation mechanism
  - Security audit and penetration testing
- **Documentation**:
  - OpenAPI/Swagger specification
  - Architecture decision records (ADRs)
  - Deployment guides for AWS/GCP/Azure
  - Video tutorials and demos

### Community & Ecosystem

- **Plugin System**:
  - Extensible architecture for custom integrations
  - Community recipe parsers
  - Custom vendor adapters
  - Third-party notification channels
- **API Ecosystem**:
  - Public API for third-party apps
  - Webhook support for integrations
  - GraphQL API alternative
  - gRPC for high-performance clients
---

## 📡 API Endpoints

### Core API Endpoints (30+ routes)

#### Inventory Management
- `GET /health` - API health check
- `GET /inventory` - List all inventory items (supports filtering)
- `GET /inventory/low` - Items running low or out of stock
- `GET /inventory/:id` - Get specific item details
- `POST /inventory` - Add new inventory item
- `POST /inventory/bulk` - Bulk import items (from receipt parsing)
- `PUT /inventory/:id` - Update existing item
- `DELETE /inventory/:id` - Remove item from inventory

#### Receipt Processing (4-Step Workflow)
- `POST /receipts/upload` - Upload receipt text (step 1)
- `POST /receipts/:id/parse` - Parse receipt with LLM/rules (step 2)
- `POST /receipts/:id/match` - Match items to inventory (step 3)
- `POST /receipts/:id/apply` - Apply matched items to inventory (step 4)
- `GET /receipts/:id` - Get receipt processing status
- `DELETE /receipts/:id` - Delete receipt data

#### Order Management
- `GET /orders` - List all orders with filtering
- `GET /orders/pending` - Orders awaiting approval
- `GET /orders/:id` - Get order details
- `POST /orders` - Create new order
- `PUT /orders/:id/approve` - Approve pending order
- `PUT /orders/:id/placed` - Mark order as placed with vendor
- `PUT /orders/:id/delivered` - Mark order as delivered

#### Cart Operations
- `GET /cart` - Get current shopping cart
- `POST /cart` - Add item to cart (with LLM pricing)
- `PUT /cart/:id` - Update cart item
- `DELETE /cart/:id` - Remove item from cart
- `DELETE /cart` - Clear entire cart
- `POST /cart/checkout` - Convert cart to order

#### User Preferences
- `GET /preferences` - Get user preferences
- `PUT /preferences` - Update preferences (supports partial updates)

#### Auto-Ordering System
- `GET /auto-order/status` - Scheduler status and configuration
- `GET /auto-order/to-order` - View items in order queue
- `GET /auto-order/pending` - Pending items with catalog matches
- `GET /auto-order/deliveries` - Orders pending delivery
- `GET /auto-order/catalog` - Search Amazon grocery catalog
- `POST /auto-order/trigger` - Manually trigger scheduler jobs
- `POST /auto-order/simulate-delivery` - Test delivery processing

#### Simulation & Demo
- `POST /simulate/day` - Simulate daily consumption forecast
- `POST /simulate/consumption` - Simulate item usage
- `POST /simulate/week` - Run week-long simulation

### Request/Response Examples

#### Add Inventory Item
```bash
POST /inventory
Content-Type: application/json

{
  "item_name": "Whole Milk",
  "quantity": 2,
  "unit": "gallon",
  "category": "dairy",
  "average_daily_consumption": 0.25
}

# Response
{
  "item": {
    "id": "a1b2c3d4-...",
    "item_name": "Whole Milk",
    "quantity": 2,
    "unit": "gallon",
    "category": "dairy",
    "predicted_runout": "2025-12-10T12:00:00Z",
    "created_at": "2025-12-02T10:30:00Z"
  }
}
```

#### Upload and Parse Receipt
```bash
# Step 1: Upload
POST /receipts/upload
Content-Type: application/json

{
  "text": "WHOLE FOODS\n2% Milk $4.99\nBread $3.49\nBananas 3lb $2.99\nTotal: $11.47"
}

# Response
{
  "receipt_id": "e5f6g7h8-...",
  "status": "uploaded"
}

# Step 2: Parse
POST /receipts/e5f6g7h8-.../parse

# Response
{
  "items": [
    {
      "item_name": "2% Milk",
      "quantity": 1,
      "unit": "gallon",
      "confidence": 0.95
    },
    {
      "item_name": "Bread",
      "quantity": 1,
      "unit": "loaf",
      "confidence": 0.90
    },
    {
      "item_name": "Bananas",
      "quantity": 3,
      "unit": "lb",
      "confidence": 0.98
    }
  ]
}
```

#### Update Preferences
```bash
PUT /preferences
Content-Type: application/json

{
  "auto_order_enabled": true,
  "auto_order_threshold_days": 5,
  "brand_prefs": {
    "milk": {
      "preferred": ["Organic Valley"],
      "avoid": ["Generic"]
    }
  }
}

# Response
{
  "preferences": {
    "auto_order_enabled": true,
    "auto_order_threshold_days": 5,
    "brand_prefs": {...},
    "updated_at": "2025-12-02T10:35:00Z"
  }
}
```

#### Get Auto-Order Status
```bash
GET /auto-order/status

# Response
{
  "scheduler": {
    "isRunning": true,
    "jobCount": 3,
    "schedule": "*/5 * * * *",
    "lastRun": "2025-12-02T10:30:00Z",
    "nextRun": "2025-12-02T10:35:00Z"
  },
  "timestamp": "2025-12-02T10:32:00Z"
}
```

### Error Handling

All endpoints return consistent error responses:

```json
{
  "error": {
    "message": "Item not found",
    "code": "ITEM_NOT_FOUND",
    "details": {
      "item_id": "a1b2c3d4-..."
    }
  }
}
```

**Standard HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

---

## 🤝 Contributing

This project was built for the **Akedo AI Shopping Assistant Bounty**. 

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/esemsc-as4623/grapefruit.git
   cd grapefruit
   ```

2. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start development environment**:
   ```bash
   docker compose up -d
   ```

4. **Run tests**:
   ```bash
   cd backend
   npm test
   ```

### Code Style

- **Backend**: ESLint with standard configuration
- **Frontend**: React best practices
- **Database**: SQL with proper indexing and constraints
- **Testing**: Jest with descriptive test names

### Submitting Issues

For bugs or feature requests:
1. Check existing issues first
2. Provide detailed reproduction steps
3. Include system information (OS, Node version, etc.)
4. Attach relevant logs if applicable

---

## 📄 License

**GNU General Public License v3.0**

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

See the [LICENSE](LICENSE) file for the full license text.

**Note**: This project is built for educational and demonstration purposes as part of the Akedo AI hackathon.

---

## 🙏 Acknowledgments

- **Akedo** - For hosting the AI Shopping Assistant bounty and providing the opportunity to build innovative solutions
- **ASI Cloud** - For providing LLM API access that powers our intelligent receipt parsing
- **PostgreSQL Community** - For the robust database system
- **Node.js & React Communities** - For excellent frameworks and libraries
- **Open Source Contributors** - For the many libraries that made this project possible

---

## 📞 Contact & Support

- **GitHub**: [esemsc-as4623/grapefruit](https://github.com/esemsc-as4623/grapefruit)
- **Issues**: [GitHub Issues](https://github.com/esemsc-as4623/grapefruit/issues)
- **Branch**: `dev` (main development)

---

**Built for Akedo AI-Robot Shopping Assistant Bounty**  
*Autonomous home shopping with AI-powered receipt parsing, intelligent inventory management, and automated reordering*

🍊 **Grapefruit** - Making grocery shopping smarter, one receipt at a time.
