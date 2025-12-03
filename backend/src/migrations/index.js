/**
 * Application-Level Database Migration Runner
 * Handles schema migrations at application startup to avoid race conditions
 * with Docker entrypoint scripts
 */

const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Initialize migrations table if it doesn't exist
 */
async function initMigrationsTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64),
      execution_time_ms INTEGER
    );
    
    CREATE INDEX IF NOT EXISTS idx_migration_name ON schema_migrations(migration_name);
  `;
  
  await db.query(createTableSQL);
  logger.info('Migrations table initialized');
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations() {
  const result = await db.query(
    'SELECT migration_name FROM schema_migrations ORDER BY id'
  );
  return result.rows.map(row => row.migration_name);
}

/**
 * Record a migration as applied
 */
async function recordMigration(name, checksum, executionTimeMs) {
  await db.query(
    `INSERT INTO schema_migrations (migration_name, checksum, execution_time_ms) 
     VALUES ($1, $2, $3)
     ON CONFLICT (migration_name) DO NOTHING`,
    [name, checksum, executionTimeMs]
  );
}

/**
 * Calculate simple checksum for migration content
 */
function calculateChecksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Run a single migration file
 */
async function runMigration(migrationPath, migrationName) {
  const startTime = Date.now();
  
  try {
    const content = await fs.readFile(migrationPath, 'utf8');
    const checksum = calculateChecksum(content);
    
    logger.info(`Running migration: ${migrationName}`);
    
    // Run migration in a transaction
    await db.query('BEGIN');
    try {
      await db.query(content);
      await recordMigration(migrationName, checksum, Date.now() - startTime);
      await db.query('COMMIT');
      
      logger.info(`Migration completed: ${migrationName} (${Date.now() - startTime}ms)`);
      return true;
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (error) {
    logger.error(`Migration failed: ${migrationName}`, error);
    throw error;
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
  try {
    logger.info('Starting database migrations...');
    
    // Initialize migrations table
    await initMigrationsTable();
    
    // Get list of applied migrations
    const appliedMigrations = await getAppliedMigrations();
    logger.info(`Applied migrations: ${appliedMigrations.length}`);
    
    // Get all migration files
    const migrationsDir = __dirname;
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort(); // Alphabetical order
    
    logger.info(`Found ${migrationFiles.length} migration files`);
    
    // Run pending migrations
    let appliedCount = 0;
    for (const file of migrationFiles) {
      const migrationName = file.replace('.sql', '');
      
      if (!appliedMigrations.includes(migrationName)) {
        const migrationPath = path.join(migrationsDir, file);
        await runMigration(migrationPath, migrationName);
        appliedCount++;
      }
    }
    
    if (appliedCount === 0) {
      logger.info('All migrations up to date');
    } else {
      logger.info(`Applied ${appliedCount} new migration(s)`);
    }
    
    return true;
  } catch (error) {
    logger.error('Migration process failed:', error);
    throw error;
  }
}

/**
 * Get migration status for health checks
 */
async function getMigrationStatus() {
  try {
    // Check if migrations table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      return {
        status: 'not_initialized',
        appliedCount: 0,
        pendingCount: 0,
        lastMigration: null,
      };
    }

    // Get applied migrations
    const appliedResult = await db.query(`
      SELECT 
        COUNT(*) as count,
        MAX(applied_at) as last_applied,
        MAX(migration_name) as last_migration
      FROM schema_migrations
    `);

    // Get all migration files
    const migrationsDir = __dirname;
    const files = await fs.readdir(migrationsDir);
    const totalMigrations = files.filter(f => f.endsWith('.sql')).length;

    const appliedCount = parseInt(appliedResult.rows[0].count);
    const pendingCount = totalMigrations - appliedCount;

    return {
      status: pendingCount > 0 ? 'pending' : 'up_to_date',
      appliedCount,
      pendingCount,
      totalCount: totalMigrations,
      lastMigration: appliedResult.rows[0].last_migration,
      lastApplied: appliedResult.rows[0].last_applied,
    };
  } catch (error) {
    logger.error('Failed to get migration status:', error);
    return {
      status: 'error',
      error: error.message,
    };
  }
}

module.exports = {
  runMigrations,
  getMigrationStatus,
  getAppliedMigrations,
};
