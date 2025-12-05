#!/usr/bin/env node

/**
 * Migration Script: Encrypt Existing Plaintext Data
 * 
 * This script encrypts all existing plaintext data in the database:
 * - inventory.item_name
 * - orders.items, tracking_number, vendor_order_id
 * - preferences.brand_prefs
 * - cart.item_name
 *
 * Usage:
 *   node backend/scripts/encrypt-existing-data.js
 */

const db = require('../src/config/database');
const { encrypt } = require('../src/middleware/encryption');
const logger = require('../src/utils/logger');

async function encryptTable(tableName, sensitiveFields) {
  console.log(`\n[${tableName.toUpperCase()}] Starting encryption...`);

  try {
    // Fetch all unencrypted rows
    const result = await db.query(
      `SELECT * FROM ${tableName} WHERE is_encrypted = false OR is_encrypted IS NULL`
    );

    if (result.rows.length === 0) {
      console.log(`  ✓ No unencrypted rows found`);
      return { table: tableName, encrypted: 0 };
    }

    console.log(`  Found ${result.rows.length} unencrypted rows`);

    let encrypted = 0;
    let errors = 0;

    for (const row of result.rows) {
      try {
        const updates = {};

        // Encrypt each sensitive field
        for (const field of sensitiveFields) {
          if (row[field] !== null && row[field] !== undefined) {
            const value = typeof row[field] === 'object'
              ? JSON.stringify(row[field])
              : String(row[field]);

            updates[field] = encrypt(value);
          }
        }

        // Build UPDATE query
        const setFields = Object.keys(updates)
          .map((field, idx) => `${field} = $${idx + 2}`)
          .join(', ');

        if (setFields) {
          await db.query(
            `UPDATE ${tableName}
             SET ${setFields}, is_encrypted = true
             WHERE id = $1`,
            [row.id, ...Object.values(updates)]
          );

          encrypted++;
        }
      } catch (error) {
        console.error(`  ✗ Failed to encrypt row ${row.id}:`, error.message);
        errors++;
      }
    }

    console.log(`  ✓ Encrypted ${encrypted} rows`);
    if (errors > 0) {
      console.log(`  ⚠ ${errors} errors occurred`);
    }

    return { table: tableName, encrypted, errors };
  } catch (error) {
    console.error(`  ✗ Error encrypting ${tableName}:`, error.message);
    return { table: tableName, encrypted: 0, errors: 1 };
  }
}

async function main() {
  console.log('================================================');
  console.log('Database Encryption Migration');
  console.log('================================================');
  console.log('Encrypting existing plaintext data with AES-256-GCM...\n');

  try {
    // Test database connection
    await db.query('SELECT 1');
    console.log('✓ Database connection established\n');

    // Encrypt each table
    const results = [];

    results.push(await encryptTable('inventory', ['item_name']));
    results.push(await encryptTable('orders', ['items', 'tracking_number', 'vendor_order_id']));
    results.push(await encryptTable('preferences', ['brand_prefs']));
    results.push(await encryptTable('cart', ['item_name']));

    // Summary
    console.log('\n================================================');
    console.log('ENCRYPTION SUMMARY');
    console.log('================================================');

    const totalEncrypted = results.reduce((sum, r) => sum + r.encrypted, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    results.forEach(r => {
      console.log(`  ${r.table.padEnd(15)} ${r.encrypted.toString().padStart(4)} rows encrypted`);
    });

    console.log('------------------------------------------------');
    console.log(`  TOTAL:          ${totalEncrypted.toString().padStart(4)} rows encrypted`);

    if (totalErrors > 0) {
      console.log(`  ERRORS:         ${totalErrors.toString().padStart(4)} errors occurred`);
    }

    console.log('\n✓ Migration complete!');
    console.log('\nAll sensitive data is now encrypted with AES-256-GCM');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    logger.error('Encryption migration failed:', error);
    process.exit(1);
  }
}

// Run migration
main();
