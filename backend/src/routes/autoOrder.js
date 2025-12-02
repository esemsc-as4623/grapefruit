const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const autoOrderScheduler = require('../services/autoOrderScheduler');

const router = express.Router();

// ============================================
// AUTO-ORDER ROUTES
// ============================================

/**
 * GET /auto-order/status
 * Get scheduler status
 */
router.get('/auto-order/status', (req, res) => {
  const status = autoOrderScheduler.getStatus();
  res.json({
    scheduler: status,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /auto-order/to-order
 * Get all items in to_order queue
 */
router.get('/auto-order/to-order', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';
    const status = req.query.status || null;

    let query = 'SELECT * FROM to_order WHERE user_id = $1';
    const params = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY detected_at DESC';

    const result = await db.query(query, params);

    res.json({
      items: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auto-order/pending
 * Get pending items to order (with catalog info)
 */
router.get('/auto-order/pending', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';

    const result = await db.query(
      'SELECT * FROM pending_to_order WHERE user_id = $1',
      [userId]
    );

    res.json({
      items: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auto-order/deliveries
 * Get orders pending delivery
 */
router.get('/auto-order/deliveries', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';

    const result = await db.query(
      `SELECT * FROM orders_pending_delivery WHERE user_id = $1`,
      [userId]
    );

    res.json({
      orders: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auto-order/catalog
 * Get Amazon catalog items (with optional search)
 */
router.get('/auto-order/catalog', async (req, res, next) => {
  try {
    const category = req.query.category || null;
    const search = req.query.search || null;
    const inStockOnly = req.query.in_stock === 'true';

    let query = 'SELECT * FROM amazon_catalog WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }

    if (search) {
      paramCount++;
      query += ` AND LOWER(item_name) LIKE $${paramCount}`;
      params.push(`%${search.toLowerCase()}%`);
    }

    if (inStockOnly) {
      query += ' AND in_stock = true';
    }

    query += ' ORDER BY category, item_name';

    const result = await db.query(query, params);

    res.json({
      items: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auto-order/jobs
 * Get background job execution history
 */
router.get('/auto-order/jobs', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const jobName = req.query.job_name || null;

    let query = 'SELECT * FROM background_jobs';
    const params = [];

    if (jobName) {
      query += ' WHERE job_name = $1';
      params.push(jobName);
    }

    query += ' ORDER BY started_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await db.query(query, params);

    res.json({
      jobs: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auto-order/jobs/run
 * Manually trigger a specific job (for testing)
 */
router.post('/auto-order/jobs/run', async (req, res, next) => {
  try {
    const { job_name } = req.body;

    if (!job_name) {
      return res.status(400).json({ error: { message: 'job_name required' } });
    }

    const validJobs = [
      'detect_zero_inventory',
      'process_to_order',
      'process_deliveries',
      'auto_add_low_stock_to_cart',
    ];

    if (!validJobs.includes(job_name)) {
      return res.status(400).json({
        error: {
          message: `Invalid job_name. Valid options: ${validJobs.join(', ')}`,
        },
      });
    }

    logger.info(`Manually triggering job: ${job_name}`);
    const result = await autoOrderScheduler.runJob(job_name);

    res.json({
      message: `Job ${job_name} executed successfully`,
      result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auto-order/scheduler/start
 * Start the auto-order scheduler
 */
router.post('/auto-order/scheduler/start', (req, res) => {
  try {
    autoOrderScheduler.start();
    res.json({
      message: 'Auto-order scheduler started',
      status: autoOrderScheduler.getStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * POST /auto-order/scheduler/stop
 * Stop the auto-order scheduler
 */
router.post('/auto-order/scheduler/stop', (req, res) => {
  try {
    autoOrderScheduler.stop();
    res.json({
      message: 'Auto-order scheduler stopped',
      status: autoOrderScheduler.getStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

module.exports = router;
