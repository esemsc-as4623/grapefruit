/**
 * Audit Logger Service
 * Provides comprehensive audit trail for all user actions and system events
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Log an audit event
 * @param {Object} options - Audit event details
 * @param {string} options.userId - User ID performing the action
 * @param {string} options.action - Action type (e.g., 'receipt_upload', 'cart_review')
 * @param {string} options.resourceType - Type of resource (e.g., 'receipt', 'cart', 'order')
 * @param {string} options.resourceId - ID of the affected resource
 * @param {string} options.status - Status of the action ('success', 'failure', 'pending')
 * @param {Object} options.metadata - Additional action-specific metadata
 * @param {Object} options.request - Express request object (optional)
 * @param {Error} options.error - Error object if action failed (optional)
 * @param {number} options.executionTimeMs - Execution time in milliseconds (optional)
 */
async function logAudit({
  userId,
  action,
  resourceType = null,
  resourceId = null,
  status,
  metadata = {},
  request = null,
  error = null,
  executionTimeMs = null,
}) {
  try {
    const auditEntry = {
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      status,
      metadata: JSON.stringify(metadata),
      execution_time_ms: executionTimeMs,
    };

    // Extract request information if provided
    if (request) {
      auditEntry.ip_address = request.ip || request.connection?.remoteAddress;
      auditEntry.user_agent = request.headers['user-agent'];
      auditEntry.request_method = request.method;
      auditEntry.request_path = request.originalUrl || request.url;
    }

    // Extract error information if provided
    if (error) {
      auditEntry.error_message = error.message;
      auditEntry.error_stack = error.stack;
    }

    const query = `
      INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id, status,
        ip_address, user_agent, request_method, request_path,
        metadata, error_message, error_stack, execution_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;

    const values = [
      auditEntry.user_id,
      auditEntry.action,
      auditEntry.resource_type,
      auditEntry.resource_id,
      auditEntry.status,
      auditEntry.ip_address,
      auditEntry.user_agent,
      auditEntry.request_method,
      auditEntry.request_path,
      auditEntry.metadata,
      auditEntry.error_message,
      auditEntry.error_stack,
      auditEntry.execution_time_ms,
    ];

    const result = await db.query(query, values);
    
    // Also log to application logger for real-time monitoring
    logger.info('Audit event logged', {
      auditId: result.rows[0].id,
      userId,
      action,
      status,
      resourceType,
      resourceId,
    });

    return result.rows[0].id;
  } catch (err) {
    // Don't fail the main operation if audit logging fails
    // But log the error for investigation
    logger.error('Failed to write audit log', {
      error: err.message,
      userId,
      action,
    });
    return null;
  }
}

/**
 * Express middleware for automatic audit logging
 * Use this on routes that need comprehensive audit trails
 */
function auditMiddleware(action, resourceTypeExtractor = null) {
  return async (req, res, next) => {
    const startTime = Date.now();
    const userId = req.body.userId || req.query.userId || 'demo_user';

    // Store original end function
    const originalEnd = res.end;

    // Override end function to log after response
    res.end = function (...args) {
      const executionTimeMs = Date.now() - startTime;
      const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';

      // Extract resource information from response
      let resourceType = resourceTypeExtractor ? resourceTypeExtractor(req, res) : null;
      let resourceId = res.locals.resourceId || null;

      // Log audit asynchronously (don't block response)
      setImmediate(() => {
        logAudit({
          userId,
          action,
          resourceType,
          resourceId,
          status,
          metadata: {
            statusCode: res.statusCode,
            bodySize: res.get('Content-Length'),
          },
          request: req,
          executionTimeMs,
        });
      });

      // Call original end
      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Get audit logs for a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of logs to return
 * @param {number} options.offset - Offset for pagination
 * @param {string} options.action - Filter by action type
 * @param {Date} options.startDate - Filter by start date
 * @param {Date} options.endDate - Filter by end date
 */
async function getAuditLogs(userId, options = {}) {
  try {
    const {
      limit = 100,
      offset = 0,
      action = null,
      startDate = null,
      endDate = null,
    } = options;

    let query = 'SELECT * FROM audit_logs WHERE user_id = $1';
    const params = [userId];
    let paramCount = 1;

    if (action) {
      paramCount++;
      query += ` AND action = $${paramCount}`;
      params.push(action);
    }

    if (startDate) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      params.push(endDate);
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    throw error;
  }
}

/**
 * Get audit statistics for a user
 */
async function getAuditStats(userId, days = 30) {
  try {
    const query = `
      SELECT 
        action,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'failure' THEN 1 END) as failure_count,
        AVG(execution_time_ms) as avg_execution_time
      FROM audit_logs
      WHERE user_id = $1 
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'
      GROUP BY action
      ORDER BY count DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching audit stats:', error);
    throw error;
  }
}

module.exports = {
  logAudit,
  auditMiddleware,
  getAuditLogs,
  getAuditStats,
};
