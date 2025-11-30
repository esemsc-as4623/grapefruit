# Grapefruit: Akedo AI Shopping Assistant

> Autonomous home shopping agent for smart grocery management with AI-powered inventory tracking, receipt parsing via LLM, and intelligent item matching.

![CI Pipeline](https://github.com/esemsc-as4623/grapefruit/actions/workflows/ci.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-59%20passing-success)
![Coverage](https://img.shields.io/badge/coverage-47%25-yellow)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/esemsc-as4623/grapefruit.git
cd grapefruit

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys (especially ASI_API_KEY for LLM)

# Start all services with Docker
docker compose up -d

# Wait for services to be healthy, then test
curl http://localhost:5000/health
curl http://localhost:5000/inventory

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
```

### Database Management

```bash
# Reseed database with fresh demo data
cat database/seed.sql | docker exec -i grapefruit-db psql -U grapefruit -d grapefruit

# Or reinitialize completely
docker compose down -v  # Remove volumes
docker compose up -d    # Recreate with fresh data
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
- **Database**: PostgreSQL with 3 core tables (inventory, preferences, orders)
- **Backend API**: Express.js with comprehensive RESTful endpoints
  - `/api/inventory` - Full CRUD for inventory management
  - `/api/receipts` - Complete receipt processing workflow
  - `/api/orders` - Order creation and approval
  - `/api/preferences` - User preference management
  - `/api/simulate` - Demo forecasting and consumption simulation
- **Receipt Processing Pipeline**: 
  - ✅ LLM-powered parsing (ASI Cloud integration)
  - ✅ Rule-based fallback parser
  - ✅ Fuzzy matching to existing inventory
  - ✅ Semantic item categorization
  - ✅ Confidence scoring and review workflow
- **Frontend UI**: React with TailwindCSS
  - ✅ Receipt upload and review interface
  - ✅ Inventory dashboard
  - ✅ Manual item entry
  - ✅ Preferences panel
  - ✅ Cart review (partial)
- **Tests**: 59 passing tests with 47% coverage
  - ✅ Integration tests (37 tests)
  - ✅ Receipt workflow tests (12 tests)
  - ✅ Inventory addition tests (10 tests)
- **Docker**: Fully containerized with docker-compose
- **LLM Integration**: Production-ready ASI Cloud integration
  - Retry logic with exponential backoff
  - Token usage tracking
  - Comprehensive error handling
  - Debug mode for troubleshooting

### 🚧 Work in Progress
- **Order Fulfillment**: Vendor API integration (Amazon/Walmart)
- **ML Forecasting**: Consumption prediction models
- **Frontend Polish**: Cart review completion, preferences UI improvements
- **Advanced Matching**: LLM-based semantic matching (implemented but optional)

### 📋 Future Enhancements
- Email receipt parsing
- Real-time inventory updates (WebSocket)
- Advanced forecasting with seasonal models
- Multi-vendor order optimization
- Mobile app

---

## 📁 Project Structure

```
grapefruit/
├── README.md
├── docker-compose.yml        # ✅ Orchestrates all services
├── .env                       # ✅ Environment configuration
├── .env.example              # ✅ Template with all required vars
│
├── frontend/                 # ✅ React UI (TailwindCSS)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ReceiptUpload.jsx      # ✅ Receipt upload interface
│   │   │   ├── ReceiptReview.jsx      # ✅ Parse results review/edit
│   │   │   ├── ManualEntry.jsx        # ✅ Manual item addition
│   │   │   ├── InventoryDashboard.jsx # ✅ Inventory display
│   │   │   ├── PreferencesPanel.jsx   # ✅ User preferences
│   │   │   └── CartReview.jsx         # 🚧 Order review (partial)
│   │   ├── services/
│   │   │   └── api.js                 # ✅ API client
│   │   ├── App.jsx                    # ✅ Main app with routing
│   │   └── index.jsx
│   ├── package.json
│   ├── Dockerfile                     # ✅ Production build
│   └── tailwind.config.js
│
├── backend/                  # ✅ Node.js/Express API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── index.js              # ✅ Main inventory/orders routes
│   │   │   ├── receipts.js           # ✅ Receipt processing workflow
│   │   │   └── simulation.js         # ✅ Demo forecasting
│   │   ├── services/
│   │   │   ├── receiptParser.js      # ✅ LLM + rule-based parsing
│   │   │   ├── inventoryMatcher.js   # ✅ Fuzzy + semantic matching
│   │   │   └── llmClient.js          # ✅ ASI Cloud integration
│   │   ├── utils/
│   │   │   ├── itemNormalizer.js     # ✅ Item parsing & normalization
│   │   │   ├── categoryInference.js  # ✅ Category detection
│   │   │   └── logger.js             # ✅ Winston logging
│   │   ├── models/
│   │   │   └── db.js                 # ✅ Database operations
│   │   ├── middleware/
│   │   │   ├── errorHandler.js       # ✅ Global error handling
│   │   │   └── encryption.js         # ⏳ Planned
│   │   ├── config/
│   │   │   ├── database.js           # ✅ PostgreSQL config
│   │   │   └── llm.js                # ✅ LLM config & prompts
│   │   ├── app.js                    # ✅ Express app setup
│   │   └── server.js                 # ✅ Server entry point
│   ├── prompts/
│   │   ├── receipt_parsing.txt       # ✅ LLM system prompt
│   │   ├── item_matching.txt         # ✅ Semantic matching prompt
│   │   └── README.md
│   ├── tests/
│   │   ├── integration.test.js       # ✅ 37 API tests
│   │   ├── receipt-workflow.test.js  # ✅ 12 receipt tests
│   │   └── inventory-add.test.js     # ✅ 10 inventory tests
│   ├── logs/                         # ✅ Application logs
│   ├── package.json
│   └── Dockerfile                    # ✅ Production build
│
├── database/                 # ✅ PostgreSQL setup
│   ├── init.sql              # ✅ Schema creation
│   ├── seed.sql              # ✅ Demo data
│   └── README.md
│
├── examples/                 # ✅ Sample receipts for testing
│   ├── generic.txt           # ✅ Standard grocery receipt
│   ├── delivery.txt
│   ├── discounts.txt
│   └── ... (9+ receipt examples)
│
└── docs/                     # ✅ Documentation
    ├── API.md                # ✅ API endpoints reference
    ├── QUICKSTART.md
    └── TESTING.md
```

**Legend:**
- ✅ Implemented and tested
- 🚧 Partial implementation / Work in progress
- ⏳ Planned for future

---

## 📋 Key Features

### 🧾 Receipt Processing (Completed)

**LLM-Powered Parsing:**
- Upload receipt text via web interface
- ASI Cloud API integration (asi1-mini model)
- Intelligent extraction of grocery items only
- Filters out store info, headers, totals, taxes
- Confidence scoring for each parsed item
- Automatic fallback to rule-based parsing on LLM failure

**Smart Item Matching:**
- Fuzzy matching against existing inventory (Levenshtein distance)
- Category-aware matching (beverages, produce, meat, etc.)
- Unit normalization (lb→pound, gal→gallon)
- Quantity aggregation for duplicate items
- Confidence thresholds for auto-approval

**Production Features:**
- Retry logic with exponential backoff
- Token usage and latency tracking
- Debug mode (`LLM_DEBUG=true`) for troubleshooting
- Comprehensive error handling
- Raw response logging

**Workflow:**
1. Upload → Parse (LLM) → Review/Edit → Match → Apply to Inventory

---

### 📦 Inventory Management (Completed)

**Core Operations:**
- Full CRUD for inventory items
- Automatic predicted runout calculation
- Category-based organization
- Low inventory alerts
- Bulk operations support

**Data Model:**
```javascript
{
  id: UUID,
  user_id: string,
  item_name: string,
  quantity: decimal,
  unit: string,
  category: string,
  predicted_runout: date,
  average_daily_consumption: decimal,
  last_purchase_date: date,
  created_at: timestamp,
  last_updated: timestamp
}
```

---

### 🛒 Order Management (Partial)

**Implemented:**
- Order creation and storage
- Spending cap validation
- Order approval workflow
- Order status tracking

**In Progress:**
- Vendor API integration (Amazon/Walmart)
- Multi-vendor order splitting
- Price comparison

---

### ⚙️ User Preferences (Completed)

**Settings:**
- Maximum spending limit
- Brand preferences (preferred/acceptable/avoid)
- Allowed vendors list
- Approval mode (auto/manual)

**Persistence:**
- PostgreSQL storage with JSON fields
- User-specific preferences
- Default values for new users

---

## 🧪 Testing

The project includes comprehensive test coverage across three test suites:

### Test Suites

1. **Integration Tests** (`integration.test.js`) - 37 tests
   - API endpoint testing
   - Database operations
   - Error handling
   - End-to-end workflows

2. **Receipt Workflow Tests** (`receipt-workflow.test.js`) - 12 tests
   - Receipt upload and parsing
   - LLM integration
   - Item matching
   - Error scenarios

3. **Inventory Tests** (`inventory-add.test.js`) - 10 tests
   - Item creation
   - Validation rules
   - Runout predictions
   - Data persistence

### Running Tests

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
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=grapefruit
DB_USER=grapefruit
DB_PASSWORD=grapefruit

# Backend
BACKEND_PORT=5000
NODE_ENV=development
LOG_LEVEL=info

# LLM / AI Services (Required for receipt parsing)
ASI_API_KEY=your-asi-cloud-api-key-here
ASI_BASE_URL=https://inference.asicloud.cudos.org/v1
ASI_MODEL=asi1-mini
LLM_DEBUG=false  # Set to 'true' for debugging

# Security
ENCRYPTION_KEY=your-32-byte-hex-key-here
```

**Get ASI Cloud API Key:**
1. Sign up at [ASI Cloud](https://asicloud.cudos.org)
2. Generate API key
3. Add to `.env` file

---

## � Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | React 18, TailwindCSS | User interface |
| **Backend** | Node.js/Express | REST API server |
| **Database** | PostgreSQL 15 | Data persistence |
| **LLM** | ASI Cloud (asi1-mini) | Receipt parsing |
| **Testing** | Jest, Supertest | Automated testing |
| **Logging** | Winston | Application logs |
| **Containerization** | Docker, Docker Compose | Deployment |

---

## 🚧 Future Enhancements

### Planned Features
- **ML Forecasting**: Consumption prediction models (moving average, seasonal)
- **Vendor Integration**: Amazon/Walmart API connections
- **Email Parsing**: Automatic receipt extraction from email
- **Mobile App**: React Native companion app
- **Advanced Matching**: LLM-based semantic item matching
- **Real-time Updates**: WebSocket for live inventory changes
- **Multi-user Support**: User authentication and isolation

### Infrastructure
- Redis caching layer
- Background job queue (Bull/BullMQ)
- Prometheus metrics
- Grafana dashboards
---

## 📡 API Endpoints

### Inventory Management
- `GET /api/inventory` - List all inventory items
- `GET /api/inventory/low` - Items running low
- `GET /api/inventory/:id` - Get specific item
- `POST /api/inventory` - Add new item
- `PUT /api/inventory/:id` - Update item
- `DELETE /api/inventory/:id` - Remove item

### Receipt Processing
- `POST /api/receipts/upload` - Upload receipt text
- `POST /api/receipts/:id/parse` - Parse with LLM/rules
- `POST /api/receipts/:id/match` - Match to inventory
- `POST /api/receipts/:id/apply` - Apply to inventory
- `GET /api/receipts/:id` - Get receipt status

### Orders
- `GET /api/orders` - List all orders
- `GET /api/orders/pending` - Pending approvals
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/approve` - Approve order
- `PUT /api/orders/:id/placed` - Mark as placed

### Preferences
- `GET /api/preferences` - Get user preferences
- `PUT /api/preferences` - Update preferences

### Simulation (Demo)
- `POST /api/simulate/day` - Run daily forecast
- `POST /api/simulate/consumption` - Simulate usage

Full API documentation: [`docs/API.md`](docs/API.md)

---

## 🤝 Contributing

This is a demo project for the Akedo AI Shopping Assistant Bounty. For questions or suggestions open an issue on GitHub
---

## 📄 License

GNU GPL v3 License - See [LICENSE](LICENSE) file for details.

This project is built for educational and demonstration purposes as part of the Akedo AI hackathon.

---

## Acknowledgments

- **Akedo** for the hackathon opportunity
- **ASI Cloud** for LLM API access

---

**Built for Akedo AI-Robot Shopping Assistant Bounty**  
*Autonomous home shopping with AI-powered receipt parsing and inventory management*
