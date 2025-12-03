/**
 * Request/Response Logging Middleware
 * Comprehensive logging of HTTP requests and responses for debugging and monitoring
 */

const logger = require('../utils/logger');

/**
 * Sanitize request body to remove sensitive information
 * @param {Object} body - Request body
 * @returns {Object} Sanitized body
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'encryptionKey'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }

  return sanitized;
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Request logger middleware - logs incoming requests
 */
function requestLogger(req, res, next) {
  req._startTime = Date.now();

  // Log incoming request
  logger.info('Incoming request', {
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: req.body && Object.keys(req.body).length > 0 ? sanitizeBody(req.body) : undefined,
  });

  next();
}

/**
 * Response logger middleware - logs outgoing responses
 */
function responseLogger(req, res, next) {
  // Capture original end function
  const originalEnd = res.end;
  const originalJson = res.json;
  let responseBody = null;

  // Override json method to capture response body
  res.json = function (body) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Override end function to log after response is sent
  res.end = function (...args) {
    const duration = Date.now() - (req._startTime || Date.now());
    const contentLength = res.get('Content-Length');

    // Prepare log data
    const logData = {
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: contentLength ? formatBytes(parseInt(contentLength)) : undefined,
      ip: req.ip || req.connection?.remoteAddress,
    };

    // Add response body for errors (4xx, 5xx) or if explicitly enabled
    if (res.statusCode >= 400 && responseBody) {
      logData.responseBody = responseBody;
    }

    // Add error details if present
    if (res.locals.error) {
      logData.error = {
        message: res.locals.error.message,
        stack: process.env.NODE_ENV === 'development' ? res.locals.error.stack : undefined,
      };
    }

    // Log with appropriate level based on status code
    if (res.statusCode >= 500) {
      logger.error('Response sent', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Response sent', logData);
    } else {
      logger.info('Response sent', logData);
    }

    // Call original end function
    return originalEnd.apply(res, args);
  };

  next();
}

/**
 * Combined request/response logger middleware
 */
function combinedLogger(req, res, next) {
  req._startTime = Date.now();

  // Capture original functions
  const originalEnd = res.end;
  const originalJson = res.json;
  let responseBody = null;

  // Override json method
  res.json = function (body) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Override end function
  res.end = function (...args) {
    const duration = Date.now() - req._startTime;
    const contentLength = res.get('Content-Length');

    // Single comprehensive log entry
    const logData = {
      // Request info
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      
      // Request data (if present)
      query: Object.keys(req.query || {}).length > 0 ? req.query : undefined,
      requestBody: req.body && Object.keys(req.body).length > 0 ? sanitizeBody(req.body) : undefined,
      
      // Response info
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: contentLength ? formatBytes(parseInt(contentLength)) : undefined,
      
      // Response body for errors
      responseBody: (res.statusCode >= 400 && responseBody) ? responseBody : undefined,
      
      // Error details
      error: res.locals.error ? {
        message: res.locals.error.message,
        stack: process.env.NODE_ENV === 'development' ? res.locals.error.stack : undefined,
      } : undefined,
    };

    // Log with appropriate level
    if (res.statusCode >= 500) {
      logger.error('HTTP Request/Response', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP Request/Response', logData);
    } else {
      logger.debug('HTTP Request/Response', logData);
    }

    return originalEnd.apply(res, args);
  };

  next();
}

/**
 * Slow request logger - warns about slow requests
 * @param {number} thresholdMs - Threshold in milliseconds (default: 1000ms)
 */
function slowRequestLogger(thresholdMs = 1000) {
  return (req, res, next) => {
    req._startTime = Date.now();

    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - req._startTime;

      if (duration > thresholdMs) {
        logger.warn('Slow request detected', {
          method: req.method,
          path: req.originalUrl || req.url,
          duration: `${duration}ms`,
          threshold: `${thresholdMs}ms`,
          statusCode: res.statusCode,
        });
      }

      return originalEnd.apply(res, args);
    };

    next();
  };
}

module.exports = {
  requestLogger,
  responseLogger,
  combinedLogger,
  slowRequestLogger,
  sanitizeBody,
};
