# Testing Documentation

## Overview

This document describes the testing strategy, test suites, and CI/CD pipeline for the Grapefruit backend.

**Current Status**: ✅ All tests passing (25/25)  
**Code Coverage**: 74% statements, 65% branches  
**Last Updated**: 2025-11-30

---

## Test Suite Summary

### Integration Tests (`tests/integration.test.js`)

**Total Tests**: 25  
**Test Suites**: 1  
**Average Runtime**: ~1 second

#### Test Categories

| Category | Tests | Description |
|----------|-------|-------------|
| Health Check | 2 | API server status and availability |
| Inventory Endpoints | 8 | CRUD operations for inventory items |
| Preferences Endpoints | 4 | User preference management |
| Orders Endpoints | 6 | Order creation, approval, and status |
| Simulation Endpoints | 2 | Day simulation and consumption tracking |
| Error Handling | 3 | Invalid input and edge cases |
| Complete Workflow | 1 | End-to-end user journey |

---

## Running Tests

### Local Development

```bash
# Navigate to backend
cd backend

# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npm test integration.test.js

# Run with verbose output
npm test -- --verbose
```

### Expected Output

```
PASS tests/integration.test.js
  Grapefruit Backend Integration Tests
    Health Check
      ✓ GET /health should return 200 OK (24 ms)
    Inventory Endpoints
      ✓ GET /inventory should return user inventory (15 ms)
      ✓ GET /inventory/low should return items running low (12 ms)
      ✓ POST /inventory should add new item (20 ms)
      ✓ POST /inventory should fail with invalid data (10 ms)
      ✓ GET /inventory/:id should return specific item (8 ms)
      ✓ PUT /inventory/:id should update item quantity (12 ms)
      ✓ DELETE /inventory/:id should remove item (10 ms)
    Preferences Endpoints
      ✓ GET /preferences should return user preferences (8 ms)
      ✓ PUT /preferences should update max_spend (10 ms)
      ✓ PUT /preferences should update brand preferences (9 ms)
      ✓ PUT /preferences should update allowed vendors (8 ms)
    Orders Endpoints
      ✓ GET /orders should return all orders (10 ms)
      ✓ GET /orders/pending should return pending orders (9 ms)
      ✓ POST /orders should create new order (15 ms)
      ✓ PUT /orders/:id/approve should approve order (12 ms)
      ✓ PUT /orders/:id/reject should reject order (11 ms)
      ✓ GET /orders/:id should return order details (8 ms)
    Simulation Endpoints
      ✓ POST /simulate/consumption should reduce inventory (18 ms)
      ✓ POST /simulate/day should trigger forecasting (45 ms)
    Error Handling
      ✓ Should return 404 for non-existent route (5 ms)
      ✓ Should return 404 for non-existent item (5 ms)
      ✓ Should return 400 for invalid UUID (20 ms)
    Complete Workflow
      ✓ End-to-end: Add item -> Simulate -> Order -> Approve (90 ms)

Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
Time:        1.08 s
```

---

## Code Coverage

### Current Coverage (2025-11-30)

```
File              | % Stmts | % Branch | % Funcs | % Lines |
------------------|---------|----------|---------|---------|
All files         |   74.00 |    65.77 |   88.00 |   73.65 |
 src              |  100.00 |   100.00 |  100.00 |  100.00 |
  app.js          |  100.00 |   100.00 |  100.00 |  100.00 |
 src/config       |   80.00 |   100.00 |   66.66 |   80.00 |
  database.js     |   80.00 |   100.00 |   66.66 |   80.00 |
 src/middleware   |   69.56 |    61.11 |  100.00 |   69.56 |
  errorHandler.js |   69.56 |    61.11 |  100.00 |   69.56 |
 src/models       |   58.19 |    33.33 |   83.33 |   56.77 |
  db.js           |   58.19 |    33.33 |   83.33 |   56.77 |
 src/routes       |   80.71 |    70.96 |   95.00 |   80.61 |
  index.js        |   76.59 |    70.49 |   93.75 |   76.59 |
  simulation.js   |   91.07 |    71.87 |  100.00 |   90.90 |
 src/utils        |  100.00 |    75.00 |  100.00 |  100.00 |
  logger.js       |  100.00 |    75.00 |  100.00 |  100.00 |
```

### Coverage Goals

- **Current**: 74% statements
- **Target for MVP**: 80% statements
- **Production Target**: 90% statements

### Uncovered Areas

Priority areas for additional test coverage:
1. Error handling edge cases in `errorHandler.js`
2. Database model error scenarios in `db.js`
3. Vendor-specific order placement logic
4. Encryption/decryption edge cases

---

## CI/CD Pipeline

### GitHub Actions Workflows

#### 1. Main CI Pipeline (`.github/workflows/ci.yml`)

Triggers on:
- Push to `main`, `develop`, or `feature/*` branches
- Pull requests to `main` or `develop`

**Jobs**:

1. **Backend Tests**
   - Sets up PostgreSQL service
   - Installs dependencies
   - Initializes database with schema and seed data
   - Runs full test suite
   - Uploads coverage to Codecov

2. **Linting**
   - Runs ESLint on codebase
   - Continues on non-critical errors

3. **Docker Build Test**
   - Verifies Dockerfile builds successfully
   - Tests backend container creation
   - Uses build cache for speed

4. **Integration Test**
   - Starts full docker-compose stack
   - Tests health endpoint
   - Tests inventory endpoint
   - Verifies services communicate correctly

**Estimated Runtime**: ~5-7 minutes

#### 2. Test Coverage Report (`.github/workflows/test-coverage.yml`)

Triggers on:
- Push to `main` or `develop`
- Pull requests to `main`

**Jobs**:

1. **Coverage Generation**
   - Runs tests with detailed coverage
   - Generates lcov report
   - Uploads to Codecov
   - Comments coverage diff on PRs

**Estimated Runtime**: ~3-4 minutes

### Required GitHub Secrets

| Secret | Required | Description | Default |
|--------|----------|-------------|---------|
| `ENCRYPTION_KEY` | No | 32-byte hex encryption key | Auto-generated test key |

### Viewing CI Results

1. **GitHub Actions Tab**: View all workflow runs
2. **PR Checks**: See status on pull request page
3. **Codecov Dashboard**: Detailed coverage reports at codecov.io

---

## Test Environment Setup

### Prerequisites

- PostgreSQL 15+ (via Docker)
- Node.js 18+
- npm 9+

### Environment Variables

Tests use the following environment:

```bash
NODE_ENV=test
DB_HOST=localhost
DB_PORT=5432
DB_NAME=grapefruit
DB_USER=grapefruit
DB_PASSWORD=grapefruit
ENCRYPTION_KEY=test-encryption-key-32-bytes-1234567890abcdef
LOG_LEVEL=error  # Reduces noise during tests
```

### Database Setup

Tests expect:
1. PostgreSQL running on localhost:5432
2. Database `grapefruit` created
3. Schema initialized (`init.sql`)
4. Seed data loaded (`seed.sql`)

Quick setup:
```bash
docker-compose up -d postgres
sleep 5
psql postgresql://grapefruit:grapefruit@localhost:5432/grapefruit -f database/init.sql
psql postgresql://grapefruit:grapefruit@localhost:5432/grapefruit -f database/seed.sql
```

---

## Writing New Tests

### Test Structure

```javascript
describe('Feature Name', () => {
  // Setup
  beforeAll(async () => {
    // Initialize resources
  });

  afterAll(async () => {
    // Cleanup
  });

  // Test cases
  test('should do something', async () => {
    const response = await request(app).get('/endpoint');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('expectedField');
  });
});
```

### Best Practices

1. **Descriptive Test Names**: Use clear, action-oriented descriptions
2. **Arrange-Act-Assert**: Structure tests with setup, execution, verification
3. **Independent Tests**: Each test should be runnable in isolation
4. **Cleanup**: Always clean up test data after tests
5. **Realistic Data**: Use data that resembles production scenarios
6. **Edge Cases**: Test boundary conditions and error scenarios

### Example Test

```javascript
test('POST /inventory should validate required fields', async () => {
  // Arrange
  const invalidItem = { item_name: 'Test' }; // Missing required fields
  
  // Act
  const response = await request(app)
    .post('/inventory')
    .send(invalidItem);
  
  // Assert
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('error');
  expect(response.body.error).toContain('required');
});
```

---

## Troubleshooting Tests

### Common Issues

#### 1. Database Connection Errors

**Symptom**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
docker-compose up -d postgres
docker-compose ps postgres  # Verify running
```

#### 2. Tests Timeout

**Symptom**: `Timeout - Async callback was not invoked`

**Solution**:
- Increase timeout in `package.json`: `"testTimeout": 30000`
- Check database is responding
- Verify no hanging connections

#### 3. Seed Data Missing

**Symptom**: Tests fail with "No inventory items found"

**Solution**:
```bash
docker-compose exec postgres psql -U grapefruit -d grapefruit \
  -f /docker-entrypoint-initdb.d/02-seed.sql
```

#### 4. Port Already in Use

**Symptom**: `Error: listen EADDRINUSE: address already in use :::5000`

**Solution**:
```bash
lsof -i :5000
kill -9 <PID>
```

#### 5. Stale Test Data

**Symptom**: Unexpected test failures after manual testing

**Solution**:
```bash
docker-compose down -v
docker-compose up -d
npm test
```

---

## Performance Benchmarks

### Test Execution Time

| Test Suite | Average Time | Slowest Test |
|------------|--------------|--------------|
| Health Check | 0.05s | - |
| Inventory | 0.12s | DELETE operation |
| Preferences | 0.08s | - |
| Orders | 0.10s | Create order |
| Simulation | 0.15s | Simulate day |
| Error Handling | 0.06s | - |
| Complete Workflow | 0.09s | Full E2E |

**Total Average**: ~1 second for full suite

### Optimization Tips

1. **Parallel Execution**: Jest runs tests in parallel by default
2. **Database Pooling**: Reuse connections where possible
3. **Mock External Services**: Don't hit real vendor APIs in tests
4. **Selective Testing**: Use `.only()` for debugging specific tests

---

## Future Test Enhancements

### Planned Additions

1. **Unit Tests**
   - Individual function testing
   - Model validation tests
   - Utility function tests

2. **E2E Tests**
   - Full user workflows
   - Multi-user scenarios
   - Edge case journeys

3. **Performance Tests**
   - Load testing with artillery/k6
   - Stress testing database
   - Concurrency testing

4. **Security Tests**
   - SQL injection prevention
   - XSS protection
   - Input sanitization
   - Encryption verification

5. **Contract Tests**
   - Vendor API mocking
   - Schema validation
   - API compatibility

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Guide](https://github.com/ladjs/supertest)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Codecov Integration](https://about.codecov.io/)

---

## Maintenance

### Updating Tests

When adding new features:
1. Write tests first (TDD)
2. Ensure tests pass locally
3. Verify CI passes before merging
4. Update this documentation

### Reviewing Test Failures

1. Check GitHub Actions logs
2. Reproduce locally
3. Review recent changes
4. Check database state
5. Verify environment variables

---

**Questions or Issues?** 
- Check `docs/QUICKSTART.md` for setup help
- Review `docs/API.md` for endpoint specifications
- Examine test logs in GitHub Actions
