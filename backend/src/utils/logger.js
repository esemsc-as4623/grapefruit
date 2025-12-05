const winston = require('winston');
const crypto = require('crypto');

// ============================================
// PRIVACY-PRESERVING LOGGER
// Redacts sensitive fields to prevent PII leakage in logs
// ============================================

/**
 * Sensitive fields that must be redacted in logs
 */
const SENSITIVE_FIELDS = [
  'item_name', 'items', 'user_id', 'userId', 'user',
  'tracking_number', 'trackingNumber', 'order_id', 'orderId',
  'price', 'total', 'amount', 'brand_prefs', 'brandPrefs',
  'api_key', 'apiKey', 'password', 'secret', 'token',
  'email', 'phone', 'address', 'credit_card',
];

/**
 * Hash function for consistent redaction
 * @param {any} data - Data to hash
 * @returns {string|null} - 8-char hash or null
 */
function quickHash(data) {
  if (data === undefined || data === null) return null;
  return crypto.createHash('sha256')
    .update(String(data))
    .digest('hex')
    .substring(0, 8);
}

/**
 * Recursively redact sensitive fields from log data
 * @param {any} obj - Object to redact
 * @param {number} depth - Current recursion depth
 * @returns {any} - Redacted copy
 */
function redactSensitiveData(obj, depth = 0) {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH]';
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    // Check for IP addresses in strings
    if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(obj)) {
      return obj.replace(/(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}/g, '$1.xxx.xxx');
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    // For arrays of sensitive items, just show count
    if (obj.length > 0 && typeof obj[0] === 'object') {
      return `[ARRAY:${obj.length}_items]`;
    }
    return obj.map(item => redactSensitiveData(item, depth + 1));
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  const redacted = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field => 
      keyLower.includes(field.toLowerCase())
    );
    
    if (isSensitive) {
      if (typeof value === 'string') {
        redacted[key] = `[REDACTED:${quickHash(value)}]`;
      } else if (Array.isArray(value)) {
        redacted[key] = `[REDACTED_ARRAY:${value.length}]`;
      } else if (typeof value === 'number') {
        redacted[key] = '[REDACTED_NUM]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = '[REDACTED_OBJ]';
      } else {
        redacted[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Custom format for privacy-preserving logs
 */
const privacyFormat = winston.format((info) => {
  // Redact the message if it's an object
  if (typeof info.message === 'object') {
    info.message = redactSensitiveData(info.message);
  }
  
  // Redact any additional metadata
  const sensitiveKeys = Object.keys(info).filter(key => 
    !['level', 'message', 'timestamp', 'service'].includes(key)
  );
  
  for (const key of sensitiveKeys) {
    if (typeof info[key] === 'object') {
      info[key] = redactSensitiveData(info[key]);
    } else if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      info[key] = `[REDACTED:${quickHash(info[key])}]`;
    }
  }
  
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    privacyFormat(),  // Apply privacy redaction
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'grapefruit-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Console logging in development (also redacted)
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      privacyFormat(),
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Export helper for explicit redaction
logger.redact = redactSensitiveData;

module.exports = logger;
