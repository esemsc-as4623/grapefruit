const { encrypt, decrypt } = require('../middleware/encryption');
const logger = require('./logger');

/**
 * Database Column Encryption Utilities
 * Provides transparent encryption/decryption for sensitive database fields
 *
 * AKEDO Bounty Requirement #4: Encrypted data handling
 * - Automatically encrypts sensitive fields before INSERT/UPDATE
 * - Automatically decrypts on SELECT
 * - Backward compatible with plaintext data (checks is_encrypted flag)
 */

/**
 * Encrypt a database row's sensitive fields
 * @param {object} row - Database row object
 * @param {Array<string>} sensitiveFields - Fields to encrypt
 * @returns {object} - Row with encrypted fields and is_encrypted=true
 */
function encryptRow(row, sensitiveFields = []) {
  if (!row || sensitiveFields.length === 0) {
    return row;
  }

  const encrypted = { ...row };

  sensitiveFields.forEach(field => {
    if (encrypted[field] !== undefined && encrypted[field] !== null) {
      try {
        // Handle different data types
        const value = typeof encrypted[field] === 'object'
          ? JSON.stringify(encrypted[field])  // JSONB columns
          : String(encrypted[field]);          // Text/varchar columns

        encrypted[field] = encrypt(value);
      } catch (error) {
        logger.error(`Failed to encrypt field ${field}:`, error.message);
        // Don't fail the entire operation, just skip this field
      }
    }
  });

  // Mark as encrypted
  encrypted.is_encrypted = true;

  return encrypted;
}

/**
 * Decrypt a database row's sensitive fields
 * @param {object} row - Database row object
 * @param {Array<string>} sensitiveFields - Fields to decrypt
 * @returns {object} - Row with decrypted fields
 */
function decryptRow(row, sensitiveFields = []) {
  if (!row || sensitiveFields.length === 0) {
    return row;
  }

  // If row is not marked as encrypted, return as-is (backward compatibility)
  if (!row.is_encrypted) {
    return row;
  }

  const decrypted = { ...row };

  sensitiveFields.forEach(field => {
    if (decrypted[field] !== undefined && decrypted[field] !== null) {
      try {
        const decryptedValue = decrypt(decrypted[field]);

        // Try to parse as JSON (for JSONB columns)
        try {
          decrypted[field] = JSON.parse(decryptedValue);
        } catch {
          // Not JSON, use as string
          decrypted[field] = decryptedValue;
        }
      } catch (error) {
        logger.warn(`Failed to decrypt field ${field}:`, error.message);
        // Leave encrypted value in place (don't expose error to client)
        decrypted[field] = '[ENCRYPTED]';
      }
    }
  });

  return decrypted;
}

/**
 * Decrypt an array of database rows
 * @param {Array<object>} rows - Array of database rows
 * @param {Array<string>} sensitiveFields - Fields to decrypt
 * @returns {Array<object>} - Array with decrypted rows
 */
function decryptRows(rows, sensitiveFields = []) {
  if (!Array.isArray(rows)) {
    return rows;
  }

  return rows.map(row => decryptRow(row, sensitiveFields));
}

/**
 * Prepare INSERT values with encryption
 * @param {object} data - Data object to insert
 * @param {Array<string>} sensitiveFields - Fields to encrypt
 * @returns {object} - Data with encrypted fields
 */
function prepareInsert(data, sensitiveFields = []) {
  return encryptRow(data, sensitiveFields);
}

/**
 * Prepare UPDATE values with encryption
 * @param {object} updates - Update object
 * @param {Array<string>} sensitiveFields - Fields to encrypt if present
 * @returns {object} - Updates with encrypted fields
 */
function prepareUpdate(updates, sensitiveFields = []) {
  // Only encrypt fields that are present in the update
  const fieldsToEncrypt = sensitiveFields.filter(field =>
    updates[field] !== undefined
  );

  if (fieldsToEncrypt.length === 0) {
    return updates;
  }

  const encrypted = { ...updates };

  fieldsToEncrypt.forEach(field => {
    if (encrypted[field] !== null) {
      try {
        const value = typeof encrypted[field] === 'object'
          ? JSON.stringify(encrypted[field])
          : String(encrypted[field]);

        encrypted[field] = encrypt(value);
      } catch (error) {
        logger.error(`Failed to encrypt update field ${field}:`, error.message);
      }
    }
  });

  // Mark as encrypted if any sensitive fields were updated
  encrypted.is_encrypted = true;

  return encrypted;
}

/**
 * Sensitive field definitions for each table
 */
const SENSITIVE_FIELDS = {
  inventory: ['item_name'],
  orders: ['items', 'tracking_number', 'vendor_order_id'],
  preferences: ['brand_prefs'],
  to_order: ['item_name'],
  cart: ['item_name'],
};

module.exports = {
  encryptRow,
  decryptRow,
  decryptRows,
  prepareInsert,
  prepareUpdate,
  SENSITIVE_FIELDS,
};
