# Database Migrations

## Overview

This directory contains application-level database migrations that run automatically when the backend server starts. This approach prevents race conditions that can occur with Docker entrypoint-based migrations.

## How It Works

1. **Server Startup**: When `backend/src/server.js` starts, it calls `runMigrations()` before accepting requests
2. **Migration Detection**: The system scans `backend/src/migrations/` for `.sql` files
3. **Tracking**: Applied migrations are recorded in the `schema_migrations` table
4. **Idempotency**: Each migration runs only once, tracked by filename
5. **Transactions**: Each migration runs in a transaction (auto-rollback on error)

## Creating New Migrations

### Naming Convention

Use sequential numbering with descriptive names:
```
001_create_audit_logs.sql
002_create_llm_cache.sql
003_add_user_preferences.sql
```

### Template

```sql
-- Migration: 003_add_user_preferences
-- Description: Add new user preference columns
-- Author: Your Name
-- Date: YYYY-MM-DD

-- Your migration SQL here
ALTER TABLE preferences ADD COLUMN notification_email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_preferences_email ON preferences(notification_email);

-- Add comments for documentation
COMMENT ON COLUMN preferences.notification_email IS 'Email for order notifications';
```

### Best Practices

1. **Idempotent SQL**: Use `IF NOT EXISTS` / `IF EXISTS` where possible
2. **Comments**: Document what the migration does
3. **Indexes**: Create indexes for new columns that will be queried
4. **Data migrations**: Use transactions for data updates
5. **Reversible**: Consider how to undo if needed

## Migration Files

### 001_create_audit_logs.sql
Creates comprehensive audit logging table for tracking all user actions:
- User actions (receipt upload, cart operations, etc.)
- Request details (IP, user agent, method, path)
- Error tracking (message, stack trace)
- Performance metrics (execution time)
- Flexible JSONB metadata

### 002_create_llm_cache.sql
Creates LLM response caching system:
- Cache key (SHA-256 hash of prompts + config)
- Prompt storage (for debugging)
- Response and metadata
- Hit counting and statistics
- TTL support with cleanup function

## Migration System Details

### schema_migrations Table

```sql
CREATE TABLE schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64),
    execution_time_ms INTEGER
);
```

### Migration Runner (`backend/src/migrations/index.js`)

Key features:
- **Automatic detection**: Scans directory for `.sql` files
- **Checksum tracking**: Detects if migration file changed
- **Transaction wrapping**: Each migration is atomic
- **Logging**: Detailed progress and error reporting
- **Retry support**: Database connection retries before migration

### Execution Order

Migrations execute in **alphabetical order** of filenames. This is why the numeric prefix is important.

## Viewing Migration Status

### Check Applied Migrations

```sql
-- List all applied migrations
SELECT * FROM schema_migrations ORDER BY id;

-- Check if specific migration applied
SELECT * FROM schema_migrations WHERE migration_name = '001_create_audit_logs';
```

### Check Migration Logs

```bash
# During startup
docker compose logs backend | grep migration

# Specific migration details
docker compose logs backend | grep "001_create_audit_logs"
```

## Troubleshooting

### Migration Failed

If a migration fails:
1. **Check logs**: `docker compose logs backend`
2. **Review error**: Migration runs in transaction, so DB state is unchanged
3. **Fix SQL**: Update the migration file
4. **Remove from tracking**: 
   ```sql
   DELETE FROM schema_migrations WHERE migration_name = 'failed_migration_name';
   ```
5. **Restart**: `docker compose restart backend`

### Migration Skipped

If a migration isn't running:
1. **Check filename**: Must be `.sql` extension
2. **Check location**: Must be in `backend/src/migrations/`
3. **Check tracking**: Query `schema_migrations` table
4. **Check logs**: Look for "All migrations up to date" message

### Manual Migration

To run a migration manually:
```bash
docker exec -i grapefruit-db psql -U grapefruit -d grapefruit < backend/src/migrations/001_create_audit_logs.sql
```

Then track it:
```sql
INSERT INTO schema_migrations (migration_name) VALUES ('001_create_audit_logs');
```

## Testing Migrations

### Local Testing

1. **Clean database**:
   ```bash
   docker compose down -v
   ```

2. **Start with migrations**:
   ```bash
   docker compose up -d
   ```

3. **Verify**:
   ```bash
   docker compose logs backend | grep migration
   ```

### Production Testing

Test migrations in staging environment before production:
1. Copy production database to staging
2. Deploy new code with migrations
3. Verify migration success
4. Test application functionality
5. Deploy to production

## Performance Considerations

- **Large tables**: For big tables, consider adding indexes after migration
- **Data migrations**: Run heavy updates during low-traffic periods
- **Timeouts**: Adjust healthcheck `start_period` for long migrations
- **Batching**: For large data migrations, process in batches

## Adding Tables

When adding new tables:
1. Create migration file
2. Include table creation
3. Add indexes
4. Add comments
5. Consider foreign keys and constraints

Example:
```sql
-- Migration: 003_create_user_sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

COMMENT ON TABLE user_sessions IS 'User authentication sessions';
```

## Future Improvements

Potential enhancements:
- Migration rollback support
- Migration dependencies
- Dry-run mode
- Migration validation
- Auto-generated migration files

## Resources

- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- [PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
