const crypto = require('crypto');
const logger = require('../utils/logger');

const ALGORITHM = 'aes-256-gcm';

// ============================================
// ENCRYPTION KEY MANAGEMENT
// AKEDO BOUNTY: Secure key handling with failsafe
// ============================================

/**
 * Get or generate encryption key with persistent storage
 * CRITICAL: Prevents data loss from random key generation
 */
function getEncryptionKey() {
  // 1. Check environment variable (production)
  if (process.env.ENCRYPTION_KEY) {
    if (process.env.ENCRYPTION_KEY.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    return process.env.ENCRYPTION_KEY;
  }

  // 2. Check persistent file (development failsafe)
  const keyPath = require('path').join(__dirname, '../../.encryption-key');
  const fs = require('fs');

  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath, 'utf8').trim();
    if (key.length === 64) {
      logger.warn('Using encryption key from .encryption-key file (DEV ONLY)');
      return key;
    }
  }

  // 3. Generate and persist new key (first run only)
  if (process.env.NODE_ENV !== 'production') {
    const newKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
    logger.warn('Generated NEW encryption key and saved to .encryption-key');
    logger.warn('IMPORTANT: Set ENCRYPTION_KEY env var in production!');
    return newKey;
  }

  // 4. Production must have ENCRYPTION_KEY set
  throw new Error(
    'ENCRYPTION_KEY environment variable is required in production. ' +
    'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

const ENCRYPTION_KEY = getEncryptionKey();

// ============================================
// AKEDO-INSPIRED PRIVACY PATTERNS
// Based on x402 protocol security model
// ============================================

/**
 * Sensitive field patterns that should always be redacted/encrypted in logs
 * Inspired by AKEDO's privacy-preserving computation approach
 */
const SENSITIVE_PATTERNS = {
  fields: ['item_name', 'items', 'user_id', 'brand_prefs', 'order_id', 'tracking_number', 'price', 'total'],
  patterns: [
    /api[_-]?key/i,
    /password/i,
    /secret/i,
    /token/i,
    /credit[_-]?card/i,
    /ssn/i,
  ],
};

/**
 * Authorization limits structure (inspired by AKEDO Section 4.3)
 * Enables user-controlled spending limits for automated orders
 */
const DEFAULT_AUTHORIZATION_LIMITS = {
  per_transaction: 50.00,
  daily_limit: 200.00,
  requires_approval_above: 25.00,
  expiration_hours: 24,
};

/**
 * Encrypt data using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text with IV and auth tag
 */
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return IV + authTag + encrypted data (all hex encoded)
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    logger.error('Encryption error:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encryptedText - Encrypted text with IV and auth tag
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption error:', error);
    throw new Error('Decryption failed');
  }
}

/**
 * Hash data using SHA-256
 * @param {string} data - Data to hash
 * @returns {string} - Hex-encoded hash
 */
function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Middleware to encrypt request body fields
 * @param {Array<string>} fields - Fields to encrypt
 */
function encryptRequestFields(fields = []) {
  return (req, res, next) => {
    if (req.body && fields.length > 0) {
      fields.forEach(field => {
        if (req.body[field]) {
          req.body[field] = encrypt(JSON.stringify(req.body[field]));
        }
      });
    }
    next();
  };
}

/**
 * Middleware to decrypt response data fields
 * @param {Array<string>} fields - Fields to decrypt
 */
function decryptResponseFields(fields = []) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      if (data && fields.length > 0) {
        fields.forEach(field => {
          if (data[field]) {
            try {
              data[field] = JSON.parse(decrypt(data[field]));
            } catch (error) {
              logger.warn(`Failed to decrypt field ${field}:`, error.message);
            }
          }
        });
      }
      originalJson(data);
    };
    
    next();
  };
}

/**
 * AKEDO-Inspired: Redact sensitive data for safe logging
 * Implements privacy-preserving audit trail (Section 7.2)
 * @param {object} data - Data object to redact
 * @returns {object} - Redacted copy safe for logging
 */
function redactForLogging(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const redacted = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key of Object.keys(redacted)) {
    // Check if field is sensitive
    const isSensitive = SENSITIVE_PATTERNS.fields.includes(key.toLowerCase()) ||
      SENSITIVE_PATTERNS.patterns.some(pattern => pattern.test(key));
    
    if (isSensitive) {
      if (typeof redacted[key] === 'string') {
        // Hash instead of showing plaintext (preserves audit capability)
        redacted[key] = `[REDACTED:${hash(redacted[key]).substring(0, 8)}]`;
      } else if (Array.isArray(redacted[key])) {
        redacted[key] = `[REDACTED_ARRAY:${redacted[key].length}_items]`;
      } else if (typeof redacted[key] === 'object') {
        redacted[key] = '[REDACTED_OBJECT]';
      }
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      // Recursively redact nested objects
      redacted[key] = redactForLogging(redacted[key]);
    }
  }
  
  return redacted;
}

/**
 * AKEDO-Inspired: Encrypted audit log entry
 * Complete recording of operations with encryption (Section 7.2)
 * @param {object} entry - Audit log entry
 * @returns {string} - Encrypted audit log entry
 */
function createEncryptedAuditLog(entry) {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
    checksum: hash(JSON.stringify(entry)),
  };
  
  return encrypt(JSON.stringify(auditEntry));
}

/**
 * AKEDO-Inspired: Decrypt and verify audit log entry
 * @param {string} encryptedEntry - Encrypted audit log
 * @returns {object|null} - Decrypted entry or null if tampered
 */
function decryptAuditLog(encryptedEntry) {
  try {
    const entry = JSON.parse(decrypt(encryptedEntry));
    const { checksum, ...data } = entry;
    
    // Verify integrity
    const expectedChecksum = hash(JSON.stringify({ timestamp: entry.timestamp, ...data }));
    if (checksum !== expectedChecksum) {
      logger.warn('Audit log integrity check failed');
      return null;
    }
    
    return entry;
  } catch (error) {
    logger.error('Failed to decrypt audit log:', error.message);
    return null;
  }
}

/**
 * AKEDO-Inspired: Authorization check for automated spending (Section 4.3 & 7.1)
 * Implements multi-signature pattern for large payments
 * @param {string} userId - User ID
 * @param {number} amount - Transaction amount
 * @param {object} userLimits - User's authorization limits
 * @returns {object} - Authorization result
 */
function checkSpendingAuthorization(userId, amount, userLimits = {}) {
  const limits = { ...DEFAULT_AUTHORIZATION_LIMITS, ...userLimits };
  
  const result = {
    authorized: true,
    requires_approval: false,
    reason: null,
    limit_type: null,
  };
  
  // Check per-transaction limit
  if (amount > limits.per_transaction) {
    result.authorized = false;
    result.reason = `Amount $${amount} exceeds per-transaction limit of $${limits.per_transaction}`;
    result.limit_type = 'per_transaction';
    return result;
  }
  
  // Check if approval required (multi-signature pattern)
  if (amount > limits.requires_approval_above) {
    result.requires_approval = true;
    result.reason = `Amount $${amount} requires user approval (above $${limits.requires_approval_above})`;
    result.limit_type = 'approval_threshold';
  }
  
  return result;
}

/**
 * AKEDO-Inspired: Generate secure payment header (Section 3.4.1)
 * @param {object} paymentData - Payment request data
 * @returns {string} - Encrypted payment header
 */
function generateSecurePaymentHeader(paymentData) {
  const header = {
    amount: paymentData.amount,
    currency: paymentData.currency || 'USD',
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
    checksum: hash(JSON.stringify(paymentData)),
  };
  
  return encrypt(JSON.stringify(header));
}

/**
 * AKEDO-Inspired: Verify payment header
 * @param {string} encryptedHeader - Encrypted payment header
 * @param {object} paymentData - Original payment data to verify against
 * @returns {boolean} - Whether header is valid
 */
function verifyPaymentHeader(encryptedHeader, paymentData) {
  try {
    const header = JSON.parse(decrypt(encryptedHeader));
    
    // Check timestamp (prevent replay attacks - 5 minute window)
    const age = Date.now() - header.timestamp;
    if (age > 5 * 60 * 1000) {
      return false;
    }
    
    // Verify checksum
    return header.checksum === hash(JSON.stringify(paymentData));
  } catch (error) {
    return false;
  }
}

/**
 * Middleware: Privacy-preserving request logging
 * Logs request metadata without exposing sensitive data
 */
function privacyPreservingLogger() {
  return (req, res, next) => {
    const safeLog = {
      method: req.method,
      path: req.path,
      user_id: req.body?.user_id ? `[HASHED:${hash(req.body.user_id).substring(0, 8)}]` : undefined,
      timestamp: new Date().toISOString(),
      has_body: !!req.body && Object.keys(req.body).length > 0,
    };
    
    logger.info('Request received', safeLog);
    next();
  };
}

module.exports = {
  // Core encryption
  encrypt,
  decrypt,
  hash,
  encryptRequestFields,
  decryptResponseFields,
  
  // AKEDO-inspired privacy features
  redactForLogging,
  createEncryptedAuditLog,
  decryptAuditLog,
  checkSpendingAuthorization,
  generateSecurePaymentHeader,
  verifyPaymentHeader,
  privacyPreservingLogger,
  
  // Constants
  SENSITIVE_PATTERNS,
  DEFAULT_AUTHORIZATION_LIMITS,
};
