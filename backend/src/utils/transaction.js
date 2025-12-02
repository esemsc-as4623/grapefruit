/**
 * Database Transaction Wrapper Utility
 * Provides transaction support for multi-step database operations
 */

const { pool } = require('../config/database');
const logger = require('./logger');

/**
 * Execute a function within a database transaction
 * Automatically handles BEGIN, COMMIT, and ROLLBACK
 * 
 * @param {Function} callback - Async function to execute within transaction
 *                              Receives a client object with query() method
 * @returns {Promise<any>} - Result from callback function
 * 
 * @example
 * const result = await withTransaction(async (client) => {
 *   await client.query('UPDATE inventory SET quantity = $1 WHERE id = $2', [10, id]);
 *   await client.query('INSERT INTO audit_log ...', [...]);
 *   return { success: true };
 * });
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    logger.debug('Transaction started');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    logger.debug('Transaction committed');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.warn('Transaction rolled back', {
      error: error.message,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute multiple queries within a transaction
 * Simpler interface for straightforward multi-query operations
 * 
 * @param {Array<{text: string, values: Array}>} queries - Array of query objects
 * @returns {Promise<Array>} - Array of query results
 * 
 * @example
 * const results = await executeTransaction([
 *   { text: 'UPDATE inventory SET quantity = $1 WHERE id = $2', values: [10, id] },
 *   { text: 'INSERT INTO orders (...) VALUES (...)', values: [...] }
 * ]);
 */
async function executeTransaction(queries) {
  return withTransaction(async (client) => {
    const results = [];
    
    for (const query of queries) {
      const result = await client.query(query.text, query.values);
      results.push(result);
    }
    
    return results;
  });
}

/**
 * Execute a callback with retry logic for transaction deadlocks
 * PostgreSQL serialization failures can be retried
 * 
 * @param {Function} callback - Transaction callback
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<any>} - Result from callback
 */
async function withTransactionRetry(callback, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTransaction(callback);
    } catch (error) {
      lastError = error;
      
      // Check if error is a serialization failure (deadlock)
      const isSerializationError = 
        error.code === '40001' || // serialization_failure
        error.code === '40P01';    // deadlock_detected
      
      if (!isSerializationError || attempt === maxRetries) {
        throw error;
      }
      
      logger.warn(`Transaction serialization failure, retrying (${attempt}/${maxRetries})`, {
        error: error.message,
        code: error.code,
      });
      
      // Wait a bit before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
    }
  }
  
  throw lastError;
}

/**
 * Create a savepoint within a transaction
 * Useful for nested transaction-like behavior
 * 
 * @param {object} client - Database client from withTransaction
 * @param {string} name - Savepoint name
 */
async function createSavepoint(client, name) {
  await client.query(`SAVEPOINT ${name}`);
  logger.debug(`Savepoint created: ${name}`);
}

/**
 * Release a savepoint
 * 
 * @param {object} client - Database client from withTransaction
 * @param {string} name - Savepoint name
 */
async function releaseSavepoint(client, name) {
  await client.query(`RELEASE SAVEPOINT ${name}`);
  logger.debug(`Savepoint released: ${name}`);
}

/**
 * Rollback to a savepoint
 * 
 * @param {object} client - Database client from withTransaction
 * @param {string} name - Savepoint name
 */
async function rollbackToSavepoint(client, name) {
  await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
  logger.debug(`Rolled back to savepoint: ${name}`);
}

module.exports = {
  withTransaction,
  executeTransaction,
  withTransactionRetry,
  createSavepoint,
  releaseSavepoint,
  rollbackToSavepoint,
};
