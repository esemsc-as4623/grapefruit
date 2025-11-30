# Quick Start Guide - Database & Backend

**Branch**: `feature/database-and-core-api`  
**Time to Complete**: ~15 minutes  
**Prerequisites**: Docker, Node.js 18+, curl

---

## Step 1: Setup Environment (2 minutes)

```bash
# Navigate to project root
cd grapefruit

# Run automated setup script
./scripts/setup.sh
```

This script will:
- ✅ Create `.env` file with generated encryption key
- ✅ Install backend npm dependencies
- ✅ Start PostgreSQL and backend containers
- ✅ Initialize database with schema and seed data
- ✅ Verify health check

**Manual Alternative:**
```bash
# Copy environment template
cp .env.example .env

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output and paste into .env as ENCRYPTION_KEY

# Install backend dependencies
cd backend && npm install && cd ..

# Start Docker containers
docker-compose up -d

# Wait 10 seconds for database to initialize
sleep 10
```

---

## Step 2: Verify Setup (2 minutes)

```bash
# Check container status (should show 2 containers running)
docker-compose ps

# Test API health
curl http://localhost:5000/health
# Expected: {"status":"ok","timestamp":"..."}

# View inventory
curl http://localhost:5000/inventory
# Expected: JSON with 17+ inventory items

# Check low inventory
curl http://localhost:5000/inventory/low
# Expected: JSON with items running out within 3 days
```

**Troubleshooting:**
- If health check fails, view logs: `docker-compose logs backend`
- If no inventory, database may not be seeded: see "Reset Database" below

---

## Step 3: Run Tests (5 minutes)

```bash
cd backend

# Run integration tests
npm test

# Expected output:
# PASS tests/integration.test.js
#   ✓ Health Check (2 tests)
#   ✓ Inventory Endpoints (8 tests)
#   ✓ Preferences Endpoints (4 tests)
#   ✓ Orders Endpoints (6 tests)
#   ✓ Simulation Endpoints (2 tests)
#   ✓ Error Handling (3 tests)
#   ✓ Complete Workflow (1 test)
# 
# Test Suites: 1 passed, 1 total
# Tests:       25 passed, 25 total
# Coverage:    ~74% statements
```

**If tests fail:**
```bash
# Check database connection
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d
sleep 10

# Re-run tests
npm test
```

---

## Step 4: Test Manual Workflows (5 minutes)

### Workflow A: Add Inventory Item
```bash
curl -X POST http://localhost:5000/inventory \
  -H "Content-Type: application/json" \
  -d '{
    "item_name": "Test Coffee",
    "quantity": 1.0,
    "unit": "lb",
    "category": "beverages",
    "average_daily_consumption": 0.1
  }'
# Save the returned "id" for next steps
```

### Workflow B: Trigger Day Simulation
```bash
curl -X POST http://localhost:5000/simulate/day
# Expected: Returns low_items array and possibly created order
```

### Workflow C: Approve Pending Order
```bash
# Get pending orders
curl http://localhost:5000/orders/pending
# Note the order "id"

# Approve it
curl -X PUT http://localhost:5000/orders/{ORDER_ID}/approve \
  -H "Content-Type: application/json" \
  -d '{"notes": "Manual test approval"}'
```

### Workflow D: Update Preferences
```bash
curl -X PUT http://localhost:5000/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "max_spend": 300.00,
    "approval_mode": "manual"
  }'
```

---

## Step 5: Review Success Criteria (1 minute)

Open and review the comprehensive checklist:
```bash
open docs/SUCCESS_CRITERIA.md
# or
cat docs/SUCCESS_CRITERIA.md
```

Check off completed items as you verify each section.

**Key Acceptance Criteria:**
- [x] Database tables created
- [x] Seed data loaded
- [x] Backend server running
- [x] All core endpoints working
- [x] Tests passing (25/25 ✅)
- [x] Docker Compose working
- [x] CI/CD pipeline configured

---

## Step 6: Verify CI/CD Setup (Optional)

The project includes GitHub Actions workflows for automated testing:

### Available Workflows
1. **CI Pipeline** (`.github/workflows/ci.yml`)
   - Backend tests with PostgreSQL
   - Code linting
   - Docker build verification
   - Integration tests with docker-compose

2. **Test Coverage** (`.github/workflows/test-coverage.yml`)
   - Generates coverage reports
   - Uploads to Codecov
   - Comments on pull requests

### Setup GitHub Repository
```bash
# Add all changes
git add .

# Commit
git commit -m "feat: add CI/CD workflows and update docs"

# Push to GitHub
git push origin feature/database-and-core-api
```

### Configure Secrets (Optional)
In GitHub repository settings, add:
- `ENCRYPTION_KEY`: Random 32-byte hex string (auto-generated if missing)

The workflows will automatically run on:
- Push to main, develop, or feature/* branches
- Pull requests to main or develop

---

## Common Commands Reference

### Docker Management
```bash
# View all logs
docker-compose logs -f

# View backend logs only
docker-compose logs -f backend

# Restart backend
docker-compose restart backend

# Stop all services
docker-compose down

# Stop and remove volumes (full reset)
docker-compose down -v
```

### Database Access
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U grapefruit -d grapefruit

# Run query from command line
docker-compose exec postgres psql -U grapefruit -d grapefruit \
  -c "SELECT COUNT(*) FROM inventory;"

# Reset seed data
docker-compose exec postgres psql -U grapefruit -d grapefruit \
  -f /docker-entrypoint-initdb.d/02-seed.sql
```

### Backend Development
```bash
cd backend

# Install new package
npm install <package-name>

# Run in development mode (with auto-restart)
npm run dev

# Run tests in watch mode
npm run test:watch

# View test coverage
npm test -- --coverage
```

### API Testing
```bash
# Health check
curl http://localhost:5000/health

# Get all inventory
curl http://localhost:5000/inventory

# Get low inventory
curl http://localhost:5000/inventory/low

# Get preferences
curl http://localhost:5000/preferences

# Get all orders
curl http://localhost:5000/orders

# Get pending orders
curl http://localhost:5000/orders/pending

# Simulate consumption (3 days)
curl -X POST http://localhost:5000/simulate/consumption \
  -H "Content-Type: application/json" \
  -d '{"days": 3}'

# Simulate day (trigger forecasting)
curl -X POST http://localhost:5000/simulate/day
```

---

## Troubleshooting

### "Port 5000 already in use"
```bash
# Find what's using the port
lsof -i :5000

# Kill the process (replace PID)
kill -9 <PID>

# Or use different port
echo "BACKEND_PORT=5001" >> .env
docker-compose up -d
```

### "Database connection refused"
```bash
# Check if postgres is running
docker-compose ps postgres

# Restart postgres
docker-compose restart postgres

# Check postgres logs
docker-compose logs postgres

# Verify connection from host
psql postgresql://grapefruit:grapefruit@localhost:5432/grapefruit -c "SELECT 1;"
```

### "Tests timeout"
```bash
# Increase test timeout in package.json
# "jest": { "testTimeout": 30000 }

# Or run with explicit timeout
npm test -- --testTimeout=30000
```

### "No seed data in database"
```bash
# Manually run seed script
docker-compose exec postgres psql -U grapefruit -d grapefruit \
  -f /docker-entrypoint-initdb.d/02-seed.sql

# Verify
docker-compose exec postgres psql -U grapefruit -d grapefruit \
  -c "SELECT COUNT(*) FROM inventory;"
```

---

## Next Steps

After completing this quick start:

1. **Review API Documentation**
   ```bash
   open docs/API.md
   ```

2. **Complete Success Criteria Checklist**
   ```bash
   open docs/SUCCESS_CRITERIA.md
   ```

3. **Commit Your Work**
   ```bash
   git add .
   git commit -m "feat: complete database and backend core"
   git push origin feature/database-and-core-api
   ```

4. **Move to Next Component**
   - Frontend React UI
   - ML forecasting service
   - OCR input parser
   - Vendor API integrations

---

## Support

- **API Reference**: `docs/API.md`
- **Success Criteria**: `docs/SUCCESS_CRITERIA.md`
- **Test Documentation**: `docs/README.md`
- **Database Schema**: `database/README.md`

For issues, check logs first:
```bash
docker-compose logs -f
```

Happy building! 🍊
