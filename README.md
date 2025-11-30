# Grapefruit: Akedo AI Shopping Assistant

> Autonomous home shopping agent for smart grocery management with AI-powered inventory tracking, need prediction, and seamless ordering.

![CI Pipeline](https://github.com/esemsc-as4623/grapefruit/actions/workflows/ci.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-25%2F25%20passing-success)
![Coverage](https://img.shields.io/badge/coverage-74%25-yellow)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/esemsc-as4623/grapefruit.git
cd grapefruit
bash scripts/setup.sh

# Test the API
curl http://localhost:5000/health
curl http://localhost:5000/inventory
```

**📖 Full Guide**: See [`docs/QUICKSTART.md`](docs/QUICKSTART.md)

---

## ✅ Current Status

**Branch**: `feature/database-and-core-api`

- ✅ **Database**: PostgreSQL with 3 core tables (inventory, preferences, orders)
- ✅ **Backend API**: Express.js with RESTful endpoints
- ✅ **Tests**: 25/25 passing with 74% code coverage
- ✅ **CI/CD**: GitHub Actions workflows configured
- ✅ **Docker**: Containerized with docker-compose
- ✅ **Documentation**: API docs, quick start guide, testing guide

**Next Steps**: Frontend UI, ML forecasting, OCR parsing

---

```
grapefruit/
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── frontend/                      # User interface (React)
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── InventoryDashboard/
│   │   │   │   ├── InventoryDashboard.jsx
│   │   │   │   ├── ItemCard.jsx
│   │   │   │   └── RunOutAlert.jsx
│   │   │   ├── CartReview/
│   │   │   │   ├── CartReview.jsx
│   │   │   │   └── ApprovalModal.jsx      # Simple approval flow
│   │   │   ├── PreferencesPanel/
│   │   │   │   └── PreferencesPanel.jsx    # Spending limit + brand prefs only
│   │   │   └── InputManagement/
│   │   │       ├── ReceiptUpload.jsx       # OCR only
│   │   │       └── ManualEntry.jsx
│   │   │   # FUTURE: EmailSync.jsx, AuditLog/, VendorSettings
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   └── encryption.js               # Basic AES-256 only
│   │   ├── App.jsx
│   │   └── index.jsx
│   ├── package.json
│   └── Dockerfile
│
├── backend/                       # API server (Node.js/Express)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── index.js                    # Consolidated routes
│   │   │   └── simulation.js               # /simulate/day endpoint
│   │   ├── services/
│   │   │   └── Service.js                  # Single service file (consolidated logic)
│   │   ├── integrations/
│   │   │   ├── AmazonAdapter.js            # Stub responses except placeOrder
│   │   │   └── WalmartAdapter.js           # Stub responses except placeOrder
│   │   ├── middleware/
│   │   │   ├── errorHandler.js
│   │   │   └── encryption.js               # AES-256 only (no envelope encryption)
│   │   ├── models/
│   │   │   └── db.js                       # Sequelize/Knex models
│   │   ├── utils/
│   │   │   └── logger.js
│   │   ├── config/
│   │   │   └── database.js
│   │   ├── app.js
│   │   └── server.js
│   │   # FUTURE: Full MVC split, envelope encryption, NotificationService
│   ├── package.json
│   └── Dockerfile
│
├── ml-services/                   # Simplified forecasting (Python)
│   ├── forecaster.py              # Single file: moving avg + rule-based ranking
│   ├── sample_data.json           # Preloaded synthetic data
│   ├── requirements.txt
│   └── README.md                  # "Simple baseline, architected for extensibility"
│   # FUTURE: seasonal_adjuster.py, collaborative_filter.py, training pipeline
│
├── input-parsers/                 # OCR only (Tesseract)
│   ├── src/
│   │   ├── receipt_parser.js      # Tesseract OCR wrapper
│   │   └── item_normalizer.js     # Hardcoded mappings ("milk" → "whole milk 1gal")
│   ├── sample_receipts/           # 1-2 test receipt images
│   └── package.json
│   # FUTURE: EmailParser, advanced normalization, separate microservice
│
├── database/                      # Minimal schema (3 tables)
│   ├── init.sql                   # Creates inventory, preferences, orders tables
│   ├── seed.sql                   # Auto-loads sample data
│   └── README.md
│   # FUTURE: consumption_log, audit_log, full migration system
│
├── shared/                        # Shared utilities
│   ├── constants/
│   │   ├── categories.js
│   │   ├── vendors.js
│   │   └── units.js
│   └── utils/
│       └── date_helpers.js
│
├── docs/                          # Documentation
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── SETUP.md
│   └── DEMO_SCRIPT.md
│
└── scripts/                       # Setup utilities
    ├── setup.sh
    └── generate_test_data.js
```

**Note**: This structure prioritizes demo functionality over production completeness. Commented "FUTURE" items indicate production-ready extensions.

## 📋 Component Details

### Frontend (`/frontend`)
**Purpose**: User interface for inventory management, order approval, and preferences configuration.

**Key Responsibilities**:
- Display real-time inventory with predicted run-out dates
- Present proposed orders for user approval/rejection via simple modal
- Manage preferences (spending caps + brand preferences only)
- Provide receipt upload (OCR) and manual entry interfaces

**Tech Stack**: React, TailwindCSS, Axios
**Encryption**: Basic AES-256 before API calls

**Deferred for Demo**:
- Email sync integration
- Advanced vendor settings
- Separate audit log view (optional: embed in preferences)
- Multi-step approval wizards

---

## 🚧 Future Work & Production Enhancements

The following features are architected but deferred for post-hackathon development:

### Frontend
- Email sync integration for automatic order tracking
- Comprehensive audit log viewer with filtering
- Advanced vendor preference settings
- Multi-step approval wizards with undo capability

### Backend  
- Full MVC controller separation for maintainability
- Per-user envelope encryption with key management service
- Push notification service for order alerts
- WebSocket support for real-time inventory updates
- Comprehensive unit and integration test suite

### ML Services
- Seasonal adjustment models (holidays, weather patterns)
- Collaborative filtering for cross-household insights
- Reinforcement learning for adaptive brand preferences
- Full training pipeline with model versioning
- A/B testing framework for algorithm improvements

### Input Processing
- IMAP/API email parsing for receipts
- Advanced NLP for item normalization
- Image preprocessing pipeline for low-quality receipts
- Barcode scanning integration

### Database & Infrastructure
- Complete migration system with rollback support
- Separate consumption_log table for detailed analytics
- Immutable audit_log with cryptographic verification
- Redis caching layer for API responses
- Background job queue (Bull/BullMQ) for async processing

### Scheduler
- Cron-based daily forecasting automation
- Intelligent notification timing based on user patterns
- Auto-retry logic for failed order placements
- Batch processing for multi-user deployments

### E-Commerce
- Full vendor catalog integration
- Real-time inventory availability checking
- Price comparison across vendors
- Deal detection and coupon application
- Multi-vendor order splitting

### Security & Privacy
- OAuth2 authentication
- Role-based access control
- Differential privacy for aggregate analytics
- GDPR compliance tooling (data export, right to deletion)
- Security audit logging with anomaly detection

---

### Backend (`/backend`)
**Purpose**: Core API server handling business logic, integrations, and data management.

**Key Responsibilities**:
- Three main endpoints: `/inventory`, `/orders`, `/preferences`
- Single consolidated Service.js for all business logic
- Order workflow (propose → review → approve → submit)
- User preference enforcement (spending caps, brand filters)
- Basic AES-256 encryption for data at rest
- Integration with Amazon/Walmart APIs (stub responses except `placeOrder()`)
- Special `/simulate/day` endpoint to trigger forecasting + order generation for demo

**Tech Stack**: Node.js/Express, PostgreSQL, basic crypto library
**Security**: AES-256 encryption only (envelope encryption deferred)

**Deferred for Demo**:
- Full MVC controller split
- Per-user envelope encryption (explain as "future enhancement")
- Notification service
- Background Redis queue
- Advanced audit logging system

---

### ML Services (`/ml-services`)
**Purpose**: Simplified forecasting for consumption prediction and brand ranking.

**Implementation**:
- **Single file** (`forecaster.py`) containing:
  - Moving average algorithm for consumption forecasting
  - Rule-based brand ranking system
- Preloaded synthetic data in `sample_data.json`
- No training step required for demo
- Simple REST endpoint for predictions

**Tech Stack**: Python, pandas, Flask/FastAPI (minimal)
**Approach**: "Simple ML baseline architected for extensibility"

**Deferred for Demo**:
- Seasonal adjustment models
- Collaborative filtering
- Reinforcement learning for brand preferences
- Full training pipeline
- TensorFlow/scikit-learn models
- Separate microservice deployment

---

### Input Parsers (`/input-parsers`)
**Purpose**: OCR processing for receipt images only.

**Implementation**:
- Tesseract.js wrapper for OCR extraction
- Hardcoded item normalization mapping ("milk" → "whole milk 1 gallon")
- 1-2 sample grocery receipts for testing
- Output standardized format: `{item_name, quantity, unit, category, timestamp, source}`

**Tech Stack**: Node.js, Tesseract.js

**Deferred for Demo**:
- Email parsing (IMAP/API integration)
- Advanced normalization algorithms
- Separate microservice deployment
- Complex text preprocessing pipelines

---

### Database (`/database`)
**Purpose**: Minimal schema for hackathon demo with encrypted storage.

**Schema** (3 core tables):
- **inventory**: `id, user_id, item_name, quantity, unit, category, predicted_runout, last_updated`
- **preferences**: `id, user_id, max_spend, brand_prefs (JSON), allowed_vendors (JSON)`
- **orders**: `id, user_id, vendor, items (JSON), total, status, created_at, approved_at`

**Setup**: Single `init.sql` file creates all tables, `seed.sql` auto-loads sample data

**Tech Stack**: PostgreSQL with basic encryption

**Deferred for Demo**:
- Consumption log table (for detailed ML training)
- Audit log table (optional: basic logging to orders table)
- Full migration system (001_create_users.sql, etc.)
- Separate users table with authentication

---

### Scheduler (`/scheduler`)
**Purpose**: Background jobs for automated forecasting and order generation.

**Jobs**:
- **Daily Forecasting**: Run prediction models on all user inventories
- **Order Generation**: Create proposed orders for items running low (within 3 days)
- **Notifications**: Alert users of pending approvals
- **Cleanup**: Archive old audit logs

**Tech Stack**: Node.js, Bull (Redis-based queue), Cron

---

### Shared (`/shared`)
**Purpose**: Common utilities, constants, and types used across services.

**Contents**:
- Item categories (dairy, produce, pantry, etc.)
- Vendor constants (API endpoints, test credentials)
- Date helpers and formatters
- Unit conversion utilities

**Status**: Keep as-is - perfect for hackathon scope.

---

## 🔐 Privacy Implementation (Simplified for Demo)

**Encryption**:
- AES-256 encryption for sensitive data at rest
- Client-side encryption before transmission where appropriate

**Demo Approach**:
- Focus on demonstrating encryption of preferences and order data
- Explain envelope encryption as "future enhancement" during presentation

**Audit Transparency** (Optional):
- Basic logging to orders table (status transitions)
- Can mention full immutable audit log as production feature

**Deferred**:
- Per-user encryption keys with envelope encryption
- Advanced key management service
- TensorFlow.js for on-device ML inference
- Separate audit_log microservice

---

## 🛒 E-Commerce Integrations (Stubbed for Demo)

### Amazon Adapter
- Product search using Amazon Product Advertising API
- **Stub responses** for search and price checking
- **Real implementation** for `placeOrder()` only
- Rate limiting and basic error handling

### Walmart Adapter
- Product search using Walmart Open API  
- **Stub responses** for search and price checking
- **Real implementation** for `placeOrder()` only
- Fallback error handling

**Common Interface**: Both implement `searchProduct()`, `addToCart()`, `getCartTotal()`, `placeOrder()`

**Demo Strategy**: Use hardcoded product data for cart building, but demonstrate actual order placement with test accounts to satisfy requirement.

**Deferred**:
- Full vendor catalog integration
- Real-time inventory checking
- Advanced retry logic with exponential backoff

---

## 🎯 User Control Mechanisms

1. **Spending Caps**: Orders exceeding limits are blocked or items deferred
2. **Vendor Allowlists**: Only approved vendors used for orders
3. **Approval Modes**:
   - Approve all automatically
   - Approve if under $X
   - Manual approval for everything
4. **Brand Preferences**: Ranked list (preferred, acceptable, avoid)
5. **Audit Log**: Complete transparency of system decisions

---

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/esemsc-as4623/grapefruit.git
cd grapefruit

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys (Amazon/Walmart test accounts)

# Start all services with Docker Compose
docker-compose up -d

# Initialize database with sample data
docker-compose exec backend npm run db:init

# Access application
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
```

**Quick Demo Flow**:
```bash
# 1. Manually add some inventory items via UI
# 2. Upload a sample receipt (in /input-parsers/sample_receipts/)
# 3. Trigger forecast: POST http://localhost:5000/simulate/day
# 4. Review proposed order in UI and approve
# 5. Watch order placement with vendor API
```

---

## 📹 Demo Video Flow

1. **Setup**: Show initial inventory entry (receipt upload + manual)
2. **Learning**: Display system tracking consumption over time
3. **Forecasting**: Dashboard shows items predicted to run out soon
4. **Order Generation**: System proposes order with preferred brands
5. **Approval**: User reviews, checks against spending cap, approves
6. **Execution**: Order placed with Walmart API (show confirmation)
7. **Audit**: View complete audit log of the transaction

---

## 🧪 Testing with Synthetic Data

```bash
# Database automatically loads sample data on init
npm run db:init

# Test ML forecasting
cd ml-services && python forecaster.py

# Simulate time progression for demo
curl -X POST http://localhost:5000/simulate/day
```

**Note**: `/simulate/day` replaces background scheduler - triggers forecasting and order generation on-demand for judges.

---

## 📦 Deployment on Akedo

The project is containerized for straightforward deployment:
- Frontend, backend, and database containers defined in `docker-compose.yml`
- Environment-based configuration via `.env`
- Health checks for container orchestration
- Single command deployment: `docker-compose up`

Upload to Akedo platform per their deployment guidelines.

---

## 📚 Tech Stack Summary

| Component | Technology |
|-----------|-----------|
| Frontend | React, TailwindCSS |
| Backend | Node.js/Express |
| Database | PostgreSQL |
| ML | Python, pandas, simple algorithms |
| OCR | Tesseract.js |
| Containerization | Docker, Docker Compose |
| Encryption | AES-256 (crypto library) |

**Simplified vs Production**: Removed Redis, complex ML libraries, background queue systems.

---

## 🏆 Judging Criteria Alignment

- **Technical Depth (30%)**: Moving average forecasting, rule-based brand ranking, working API integrations with stubbed search
- **Usability (25%)**: Clean UI with 3 core views, simple modal approval flow, intuitive preference controls
- **Privacy (20%)**: AES-256 encryption demonstrated, envelope encryption documented as future work
- **Theme Relevance (15%)**: Full grocery inventory with OCR + manual input, forecasting, order placement
- **Documentation (10%)**: Clear README, demo video, well-commented code

**Positioning**: "Working MVP with simple but extensible architecture - production features documented for future implementation"

---

## 📄 License

GNU GPL v3 License - See LICENSE file for details

---

## 🤝 Contributing

This is a hackathon project. For questions or collaboration, reach out via GitHub issues.

---

**Built for Akedo AI-Robot Shopping Assistant Bounty**  
Prize Pool: $15,000 USDT | Theme: Autonomous Home Shopping
