/**
 * Jest Global Setup
 * Runs once before all test suites
 */

const { runMigrations } = require('../src/migrations');
const logger = require('../src/utils/logger');

module.exports = async () => {
  logger.info('Running global test setup...');
  
  try {
    // Run database migrations before any tests
    logger.info('Running application-level migrations...');
    await runMigrations();
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Failed to run migrations in test setup:', error);
    throw error;
  }
};
