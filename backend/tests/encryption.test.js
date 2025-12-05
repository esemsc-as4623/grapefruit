/**
 * Encryption Tests
 * Tests encryption utilities and privacy-preserving logging
 */

// Set test encryption key before loading modules
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const { encrypt, decrypt, hash } = require('../src/middleware/encryption');
const { encryptRow, decryptRow, decryptRows, prepareInsert, prepareUpdate } = require('../src/utils/dbEncryption');
const logger = require('../src/utils/logger');

describe('Encryption Middleware', () => {
  describe('encrypt/decrypt', () => {
    test('should encrypt and decrypt text correctly', () => {
      const original = 'Sensitive data';
      const encrypted = encrypt(original);
      
      expect(encrypted).not.toBe(original);
      expect(encrypted).toContain(':'); // Should have IV:authTag:ciphertext format
      
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    test('should handle different data types', () => {
      const testData = ['Milk', 'Eggs', 'Bread'];
      
      testData.forEach(item => {
        const encrypted = encrypt(item);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(item);
      });
    });

    test('should produce different ciphertexts for same input', () => {
      const text = 'Same input';
      const encrypted1 = encrypt(text);
      const encrypted2 = encrypt(text);
      
      // Different IVs should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same value
      expect(decrypt(encrypted1)).toBe(text);
      expect(decrypt(encrypted2)).toBe(text);
    });

    test('should fail to decrypt tampered data', () => {
      const encrypted = encrypt('Original');
      const tampered = encrypted.replace('a', 'b');
      
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('hash', () => {
    test('should produce consistent hashes', () => {
      const text = 'Consistent input';
      const hash1 = hash(text);
      const hash2 = hash(text);
      
      expect(hash1).toBe(hash2);
    });

    test('should produce different hashes for different inputs', () => {
      const hash1 = hash('Input 1');
      const hash2 = hash('Input 2');
      
      expect(hash1).not.toBe(hash2);
    });
  });
});

describe('Database Encryption Helpers', () => {
  describe('encryptRow', () => {
    test('should encrypt specified fields', () => {
      const row = {
        id: 1,
        item_name: 'Milk',
        quantity: 2,
        unit: 'gallon',
      };

      const encrypted = encryptRow(row, ['item_name']);
      
      expect(encrypted.id).toBe(1);
      expect(encrypted.quantity).toBe(2);
      expect(encrypted.unit).toBe('gallon');
      expect(encrypted.item_name).not.toBe('Milk');
      expect(encrypted.item_name).toContain(':');
      expect(encrypted.is_encrypted).toBe(true);
    });

    test('should handle JSONB fields', () => {
      const row = {
        id: 1,
        brand_prefs: { dairy: 'Organic Valley', meat: 'Local Farm' },
      };

      const encrypted = encryptRow(row, ['brand_prefs']);
      
      expect(typeof encrypted.brand_prefs).toBe('string');
      expect(encrypted.is_encrypted).toBe(true);
    });

    test('should not modify non-sensitive fields', () => {
      const row = {
        id: 1,
        item_name: 'Eggs',
        quantity: 12,
      };

      const encrypted = encryptRow(row, ['item_name']);
      
      expect(encrypted.id).toBe(1);
      expect(encrypted.quantity).toBe(12);
    });
  });

  describe('decryptRow', () => {
    test('should decrypt encrypted fields', () => {
      const row = {
        id: 1,
        item_name: 'Bread',
        quantity: 1,
      };

      const encrypted = encryptRow(row, ['item_name']);
      const decrypted = decryptRow(encrypted, ['item_name']);
      
      expect(decrypted.item_name).toBe('Bread');
      expect(decrypted.quantity).toBe(1);
    });

    test('should handle unencrypted rows (backward compatibility)', () => {
      const row = {
        id: 1,
        item_name: 'Milk',
        is_encrypted: false,
      };

      const result = decryptRow(row, ['item_name']);
      
      expect(result.item_name).toBe('Milk');
    });

    test('should handle JSONB decryption', () => {
      const row = {
        id: 1,
        brand_prefs: { dairy: 'Organic' },
      };

      const encrypted = encryptRow(row, ['brand_prefs']);
      const decrypted = decryptRow(encrypted, ['brand_prefs']);
      
      expect(decrypted.brand_prefs).toEqual({ dairy: 'Organic' });
    });
  });

  describe('decryptRows', () => {
    test('should decrypt array of rows', () => {
      const rows = [
        { id: 1, item_name: 'Milk' },
        { id: 2, item_name: 'Eggs' },
      ];

      const encrypted = rows.map(row => encryptRow(row, ['item_name']));
      const decrypted = decryptRows(encrypted, ['item_name']);
      
      expect(decrypted[0].item_name).toBe('Milk');
      expect(decrypted[1].item_name).toBe('Eggs');
    });
  });

  describe('prepareInsert', () => {
    test('should prepare data for INSERT with encryption', () => {
      const data = {
        user_id: 'demo_user',
        item_name: 'Chicken Breast',
        quantity: 2,
      };

      const prepared = prepareInsert(data, ['item_name']);
      
      expect(prepared.user_id).toBe('demo_user');
      expect(prepared.quantity).toBe(2);
      expect(prepared.item_name).not.toBe('Chicken Breast');
      expect(prepared.is_encrypted).toBe(true);
    });
  });

  describe('prepareUpdate', () => {
    test('should prepare UPDATE with encryption', () => {
      const updates = {
        quantity: 5,
        item_name: 'Updated Item',
      };

      const prepared = prepareUpdate(updates, ['item_name']);
      
      expect(prepared.quantity).toBe(5);
      expect(prepared.item_name).not.toBe('Updated Item');
      expect(prepared.is_encrypted).toBe(true);
    });

    test('should only encrypt fields that are present', () => {
      const updates = {
        quantity: 10,
      };

      const prepared = prepareUpdate(updates, ['item_name']);
      
      expect(prepared.quantity).toBe(10);
      expect(prepared.item_name).toBeUndefined();
    });
  });
});

describe('Privacy-Preserving Logger', () => {
  describe('redactSensitiveData', () => {
    test('should redact sensitive field names', () => {
      const data = {
        item_name: 'Milk',
        quantity: 2,
        user_id: 'test_user',
      };

      const redacted = logger.redact(data);
      
      expect(redacted.quantity).toBe(2);
      expect(redacted.item_name).toMatch(/\[REDACTED:/);
      expect(redacted.user_id).toMatch(/\[REDACTED:/);
    });

    test('should preserve non-sensitive data', () => {
      const data = {
        id: 123,
        status: 'active',
        count: 5,
      };

      const redacted = logger.redact(data);
      
      expect(redacted.id).toBe(123);
      expect(redacted.status).toBe('active');
      expect(redacted.count).toBe(5);
    });

    test('should handle nested objects', () => {
      const data = {
        order: {
          id: 1,
          items: [{ name: 'Milk' }, { name: 'Eggs' }],
        },
      };

      const redacted = logger.redact(data);
      
      expect(redacted.order.id).toBe(1);
      // 'items' is a sensitive field, so it gets redacted
      expect(redacted.order.items).toMatch(/\[REDACTED_ARRAY:2\]/);
    });

    test('should preserve non-sensitive nested data', () => {
      const data = {
        request: {
          id: 123,
          status: 'active',
          count: 5,
        },
      };

      const redacted = logger.redact(data);
      
      expect(redacted.request.id).toBe(123);
      expect(redacted.request.status).toBe('active');
      expect(redacted.request.count).toBe(5);
    });

    test('should handle arrays of objects', () => {
      const data = {
        items: [
          { item_name: 'Milk', price: 3.99 },
          { item_name: 'Eggs', price: 2.49 },
        ],
      };

      const redacted = logger.redact(data);
      
      // 'items' is a sensitive field name, so array is redacted
      expect(redacted.items).toMatch(/\[REDACTED_ARRAY:2\]/);
    });
  });
});
