/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse with configurable rate limits
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * General API rate limiter (100 requests per 15 minutes per IP)
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Strict rate limiter for resource-intensive endpoints like LLM calls
 * (10 requests per 15 minutes per IP)
 */
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many requests to this endpoint, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Strict rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many requests to this endpoint, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Authentication/Login rate limiter (5 requests per 15 minutes per IP)
 * Prevents brute force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful auth attempts
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

/**
 * Lenient rate limiter for read-only operations
 * (300 requests per 15 minutes per IP)
 */
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed requests
});

/**
 * Create a custom rate limiter with specific configuration
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express middleware function
 */
function createRateLimiter(options = {}) {
  const defaults = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Custom rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        limit: options.max || 100
      });
      res.status(429).json({
        error: 'Too many requests, please try again later.',
        retryAfter: `${(options.windowMs || 900000) / 60000} minutes`
      });
    }
  };

  return rateLimit({ ...defaults, ...options });
}

module.exports = {
  apiLimiter,
  strictLimiter,
  authLimiter,
  readLimiter,
  createRateLimiter
};
