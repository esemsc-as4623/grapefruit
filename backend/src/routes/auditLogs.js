/**
 * Audit Logs API Routes
 * Provides endpoints for querying audit logs with pagination, filtering, and aggregation
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const { readLimiter } = require('../middleware/rateLimiter');

/**
 * GET /audit-logs
 * Query audit logs with pagination and filtering
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 50, max: 500)
 * - userId: Filter by user ID
 * - action: Filter by action type
 * - resourceType: Filter by resource type
 * - status: Filter by status (success/failure/pending)
 * - startDate: Filter logs after this date (ISO 8601)
 * - endDate: Filter logs before this date (ISO 8601)
 * - sortBy: Sort field (default: created_at)
 * - sortOrder: Sort order (asc/desc, default: desc)
 */
router.get('/audit-logs', readLimiter, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      resourceType,
      status,
      startDate,
      endDate,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (userId) {
      paramCount++;
      conditions.push(`user_id = $${paramCount}`);
      values.push(userId);
    }

    if (action) {
      paramCount++;
      conditions.push(`action = $${paramCount}`);
      values.push(action);
    }

    if (resourceType) {
      paramCount++;
      conditions.push(`resource_type = $${paramCount}`);
      values.push(resourceType);
    }

    if (status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      values.push(status);
    }

    if (startDate) {
      paramCount++;
      conditions.push(`created_at >= $${paramCount}`);
      values.push(new Date(startDate));
    }

    if (endDate) {
      paramCount++;
      conditions.push(`created_at <= $${paramCount}`);
      values.push(new Date(endDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort fields
    const allowedSortFields = ['created_at', 'action', 'status', 'execution_time_ms', 'user_id'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM audit_logs ${whereClause}`;
    const countResult = await db.query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated results
    const dataQuery = `
      SELECT 
        id,
        user_id,
        action,
        resource_type,
        resource_id,
        status,
        ip_address,
        user_agent,
        request_method,
        request_path,
        metadata,
        error_message,
        execution_time_ms,
        created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY ${sortField} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    const dataResult = await db.query(dataQuery, [...values, limitNum, offset]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
      filters: {
        userId,
        action,
        resourceType,
        status,
        startDate,
        endDate,
      },
    });
  } catch (error) {
    logger.error('Failed to query audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit logs',
      message: error.message,
    });
  }
});

/**
 * GET /audit-logs/stats
 * Get aggregated statistics from audit logs
 * 
 * Query Parameters:
 * - groupBy: Group results by field (action/status/resourceType/userId)
 * - startDate: Filter logs after this date
 * - endDate: Filter logs before this date
 */
router.get('/audit-logs/stats', readLimiter, async (req, res) => {
  try {
    const { groupBy = 'action', startDate, endDate } = req.query;

    // Validate groupBy field
    const allowedGroupFields = {
      action: 'action',
      status: 'status',
      resourceType: 'resource_type',
      userId: 'user_id',
    };

    const groupField = allowedGroupFields[groupBy] || 'action';

    // Build WHERE clause for date filtering
    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (startDate) {
      paramCount++;
      conditions.push(`created_at >= $${paramCount}`);
      values.push(new Date(startDate));
    }

    if (endDate) {
      paramCount++;
      conditions.push(`created_at <= $${paramCount}`);
      values.push(new Date(endDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get aggregated statistics
    const statsQuery = `
      SELECT 
        ${groupField} as group_value,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'failure' THEN 1 END) as failure_count,
        AVG(execution_time_ms) as avg_execution_time,
        MAX(execution_time_ms) as max_execution_time,
        MIN(execution_time_ms) as min_execution_time
      FROM audit_logs
      ${whereClause}
      GROUP BY ${groupField}
      ORDER BY count DESC
      LIMIT 100
    `;

    const statsResult = await db.query(statsQuery, values);

    // Get overall statistics
    const overallQuery = `
      SELECT 
        COUNT(*) as total_logs,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as total_success,
        COUNT(CASE WHEN status = 'failure' THEN 1 END) as total_failure,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT action) as unique_actions,
        AVG(execution_time_ms) as avg_execution_time,
        MIN(created_at) as first_log,
        MAX(created_at) as last_log
      FROM audit_logs
      ${whereClause}
    `;

    const overallResult = await db.query(overallQuery, values);

    res.json({
      success: true,
      groupBy,
      statistics: statsResult.rows,
      overall: overallResult.rows[0],
      dateRange: {
        startDate,
        endDate,
      },
    });
  } catch (error) {
    logger.error('Failed to get audit log statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit log statistics',
      message: error.message,
    });
  }
});

/**
 * GET /audit-logs/:id
 * Get a specific audit log entry by ID
 */
router.get('/audit-logs/:id', readLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        id,
        user_id,
        action,
        resource_type,
        resource_id,
        status,
        ip_address,
        user_agent,
        request_method,
        request_path,
        metadata,
        error_message,
        error_stack,
        execution_time_ms,
        created_at
      FROM audit_logs
      WHERE id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Audit log not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Failed to get audit log:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit log',
      message: error.message,
    });
  }
});

/**
 * GET /audit-logs/user/:userId
 * Get audit logs for a specific user
 */
router.get('/audit-logs/user/:userId', readLimiter, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, page = 1 } = req.query;

    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
    const pageNum = Math.max(1, parseInt(page));
    const offset = (pageNum - 1) * limitNum;

    // Get total count for user
    const countResult = await db.query(
      'SELECT COUNT(*) FROM audit_logs WHERE user_id = $1',
      [userId]
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated logs
    const logsQuery = `
      SELECT 
        id,
        action,
        resource_type,
        resource_id,
        status,
        ip_address,
        execution_time_ms,
        created_at
      FROM audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const logsResult = await db.query(logsQuery, [userId, limitNum, offset]);

    res.json({
      success: true,
      userId,
      data: logsResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error) {
    logger.error('Failed to get user audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user audit logs',
      message: error.message,
    });
  }
});

module.exports = router;
