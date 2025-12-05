const crypto = require('crypto');
const logger = require('../utils/logger');

const ALGORITHM = 'aes-256-gcm';

// Validate encryption key is set
if (!process.env.ENCRYPTION_KEY) {
  logger.error('ENCRYPTION_KEY environment variable is not set!');
  logger.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  throw new Error('ENCRYPTION_KEY is required. See .env.example for setup instructions.');
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

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

module.exports = {
  encrypt,
  decrypt,
  hash,
  encryptRequestFields,
  decryptResponseFields,
};
