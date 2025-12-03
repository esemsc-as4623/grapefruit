# Production Deployment Guide

## Overview

This document describes the production-ready improvements made to the Grapefruit application, including Docker optimizations, database migrations, audit logging, LLM caching, and transaction handling.

## Production Improvements

### 1. Docker Multi-Stage Builds

#### Backend (`backend/Dockerfile`)
- **Multi-stage build**: Separates dependency installation from production runtime
- **Production dependencies only**: Uses `npm ci --only=production` to exclude dev dependencies
- **Security**: Runs as non-root user (`node`)
- **Healthcheck**: Uses `curl` instead of `wget` for better compatibility
- **Resource efficiency**: Smaller image size and faster builds

#### Frontend (`frontend/Dockerfile`)
- **Multi-stage build**: 
  - `build` stage: Compiles React application
  - `production` stage: Serves with nginx
  - `development` stage: For local development with hot reload
- **Nginx configuration**: Custom config for React Router support
- **Healthcheck endpoint**: `/health` for monitoring
- **Optimized**: Serves static files efficiently

### 2. Docker Compose Configurations

#### Development (`docker-compose.yml`)
- Uses `development` target for frontend
- No source volume mounts for backend (production-like)
- Logs directory mounted for debugging
- Improved healthchecks with `start_period`
- Backend healthcheck depends on migrations

#### Production (`docker-compose.prod.yml`)
- Uses `production` targets for all services
- **No dev volume mounts**: Code baked into images
- **Resource limits**: CPU and memory constraints
- **Always restart policy**: For high availability
- **Named volumes**: For data persistence
- **Healthcheck improvements**: Longer `start_period` for migrations

### 3. Application-Level Migrations

#### Migration System (`backend/src/migrations/`)
- **Automatic migration runner**: Runs on application startup
- **Race condition prevention**: Migrations run before accepting requests
- **Idempotent**: Can run multiple times safely
- **Checksums**: Tracks migration file changes
- **Transaction-wrapped**: Each migration runs in a transaction

#### Migration Files:
1. **`001_create_audit_logs.sql`**: Comprehensive audit trail table
2. **`002_create_llm_cache.sql`**: LLM response caching table

#### Startup Sequence (`backend/src/server.js`):
1. Test database connection (with retries and exponential backoff)
2. Run pending migrations
3. Start auto-order scheduler
4. Start HTTP server
5. Graceful shutdown handlers

### 4. Audit Logging System

#### Service (`backend/src/services/auditLogger.js`)
- **Comprehensive tracking**: All user actions logged
- **Structured data**: JSONB metadata for flexibility
- **Request context**: IP, user agent, method, path
- **Error tracking**: Captures error messages and stack traces
- **Performance metrics**: Execution time tracking
- **Middleware support**: Easy integration with Express routes

#### Logged Actions:
- `receipt_upload`: Receipt file/text uploads
- `receipt_apply`: Applying receipts to inventory
- `cart_add_item`: Adding items to cart
- Additional actions can be easily added

#### Database Schema:
```sql
- user_id: Who performed the action
- action: Type of action
- resource_type: Type of resource (receipt, cart, order)
- resource_id: ID of affected resource
- status: success/failure/pending
- metadata: JSONB for action-specific details
- request details: IP, user agent, method, path
- error tracking: message and stack
- execution_time_ms: Performance metrics
```

### 5. LLM Response Caching

#### Cache System (`backend/src/services/llmClient.js`)
- **Automatic caching**: All LLM responses cached by prompt hash
- **Cache key**: SHA-256 hash of system prompt + user prompt + model + temperature
- **TTL support**: 30-day expiration (configurable)
- **Hit counting**: Tracks cache effectiveness
- **Cost reduction**: Avoids redundant API calls
- **Performance**: Instant response for cached queries

#### Cache Configuration:
- Enable/disable: `LLM_CACHE_ENABLED` env variable (default: true)
- TTL: 30 days
- Cleanup function: `cleanup_expired_llm_cache()` for maintenance

#### Benefits:
- Reduced API costs
- Faster response times
- Better user experience
- Supports offline mode for cached queries

### 6. Transaction Support

#### Transaction Wrapper (`backend/src/utils/transaction.js`)
- **`withTransaction()`**: Execute functions in a transaction
- **`executeTransaction()`**: Run multiple queries transactionally
- **`withTransactionRetry()`**: Auto-retry on serialization failures
- **Savepoint support**: Nested transaction-like behavior
- **Automatic rollback**: On errors

#### Usage Example:
```javascript
const result = await withTransaction(async (client) => {
  await client.query('UPDATE inventory SET quantity = $1 WHERE id = $2', [10, id]);
  await client.query('INSERT INTO audit_logs ...', [...]);
  return { success: true };
});
```

#### Integrated in:
- `Inventory.bulkUpdateFromReceipt()`: Atomic receipt processing
- Can be added to any multi-step operation

### 7. Database Connection Improvements

#### Retry Logic:
- **Max retries**: 10 attempts
- **Exponential backoff**: 2s, 4s, 8s, up to 30s
- **Better logging**: Detailed connection status

#### Graceful Shutdown:
- Stops accepting new requests
- Stops scheduled tasks
- Closes database pool
- Clean exit codes

## Deployment Instructions

### Production Deployment

1. **Set environment variables** (create `.env` file):
```bash
# Database
DB_USER=grapefruit
DB_PASSWORD=your_secure_password
DB_NAME=grapefruit
DB_PORT=5432

# Backend
NODE_ENV=production
BACKEND_PORT=5000
ENCRYPTION_KEY=your_encryption_key_32_chars
LOG_LEVEL=info

# LLM
ASI_API_KEY=your_asi_api_key
ASI_BASE_URL=https://inference.asicloud.cudos.org/v1
ASI_MODEL=asi1-mini
LLM_CACHE_ENABLED=true

# Frontend
REACT_APP_API_URL=http://your-domain.com:5000
```

2. **Build and start production containers**:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

3. **Verify deployment**:
```bash
# Check container status
docker compose -f docker-compose.prod.yml ps

# Check backend logs
docker compose -f docker-compose.prod.yml logs backend

# Test healthcheck
curl http://localhost:5000/health
curl http://localhost:80/health
```

4. **Monitor migrations**:
```bash
# View migration logs
docker compose -f docker-compose.prod.yml logs backend | grep migration

# Check migration status in database
docker exec -it grapefruit-db-prod psql -U grapefruit -d grapefruit -c "SELECT * FROM schema_migrations;"
```

### Development Deployment

For development with hot reload on frontend only:

```bash
docker compose up -d --build
```

Note: Backend uses production build even in dev mode (no hot reload for backend).

## Monitoring and Maintenance

### Healthchecks
- Backend: `http://localhost:5000/health`
- Frontend: `http://localhost:80/health` (production) or `http://localhost:3000` (dev)
- Database: `pg_isready` command

### Audit Logs
Query audit logs:
```sql
-- Recent actions by user
SELECT * FROM audit_logs 
WHERE user_id = 'demo_user' 
ORDER BY created_at DESC 
LIMIT 100;

-- Action statistics
SELECT action, COUNT(*), AVG(execution_time_ms)
FROM audit_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY action;
```

### LLM Cache
Check cache effectiveness:
```sql
-- Cache statistics
SELECT 
  model,
  COUNT(*) as cached_responses,
  SUM(hit_count) as total_hits,
  AVG(response_time_ms) as avg_response_time
FROM llm_cache
GROUP BY model;

-- Most popular cached queries
SELECT 
  user_prompt,
  hit_count,
  created_at,
  last_used_at
FROM llm_cache
ORDER BY hit_count DESC
LIMIT 10;

-- Clean up expired cache
SELECT cleanup_expired_llm_cache();
```

### Database Migrations
View migration history:
```sql
SELECT * FROM schema_migrations ORDER BY id;
```

## Security Considerations

1. **Environment variables**: Never commit `.env` files
2. **Non-root user**: All containers run as non-root
3. **Encryption key**: Use strong 32+ character encryption key
4. **Database credentials**: Use strong passwords in production
5. **Network isolation**: Docker network isolates services
6. **Resource limits**: Prevents resource exhaustion

## Performance Optimizations

1. **Multi-stage builds**: Smaller images, faster deployments
2. **LLM caching**: Reduced API costs and latency
3. **Database indexes**: On audit logs and cache tables
4. **Connection pooling**: Configured in database.js
5. **Healthcheck intervals**: Balanced for responsiveness and resource usage

## Rollback Strategy

If issues occur:

1. **Stop containers**:
```bash
docker compose -f docker-compose.prod.yml down
```

2. **Restore from volume backup** (if needed):
```bash
docker run --rm -v grapefruit_postgres_data:/data -v $(pwd):/backup alpine tar -xzvf /backup/postgres_backup.tar.gz -C /data
```

3. **Restart with previous version**:
```bash
git checkout <previous-commit>
docker compose -f docker-compose.prod.yml up -d --build
```

## Support

For issues or questions:
1. Check logs: `docker compose -f docker-compose.prod.yml logs`
2. Check healthchecks: `curl http://localhost:5000/health`
3. Review audit logs in database
4. Check migration status

## License

GPL-3.0
