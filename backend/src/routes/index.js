const express = require('express');
const Joi = require('joi');
const { Inventory, Preferences, Orders } = require('../models/db');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================
// MIDDLEWARE
// ============================================
/**
 * Validate UUID format in route parameters
 */
const validateUUID = (paramName) => (req, res, next) => {
  const uuid = req.params[paramName];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(uuid)) {
    return res.status(400).json({ 
      error: { message: `Invalid UUID format for ${paramName}` } 
    });
  }
  
  next();
};

// ============================================
// VALIDATION SCHEMAS
// ============================================
const inventorySchema = Joi.object({
  item_name: Joi.string().required().max(255),
  quantity: Joi.number().min(0).required(),
  unit: Joi.string().required().max(50),
  category: Joi.string().max(100),
  predicted_runout: Joi.date().optional(),
  average_daily_consumption: Joi.number().min(0).optional(),
});

const preferencesSchema = Joi.object({
  max_spend: Joi.number().min(0).optional(),
  approval_mode: Joi.string().valid('manual', 'auto_under_limit', 'auto_all').optional(),
  auto_approve_limit: Joi.number().min(0).optional(),
  brand_prefs: Joi.object().optional(),
  allowed_vendors: Joi.array().items(Joi.string()).optional(),
  notify_low_inventory: Joi.boolean().optional(),
  notify_order_ready: Joi.boolean().optional(),
});

const orderSchema = Joi.object({
  vendor: Joi.string().valid('amazon', 'walmart', 'other').required(),
  items: Joi.array().items(Joi.object({
    item_name: Joi.string().required(),
    quantity: Joi.number().min(0).required(),
    unit: Joi.string().required(),
    price: Joi.number().min(0).required(),
    brand: Joi.string().optional(),
  })).min(1).required(),
  subtotal: Joi.number().min(0).required(),
  tax: Joi.number().min(0).optional(),
  shipping: Joi.number().min(0).optional(),
  total: Joi.number().min(0).required(),
});

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// INVENTORY ROUTES
// ============================================

/**
 * GET /inventory
 * Get all inventory items for user
 */
router.get('/inventory', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';
    const items = await Inventory.findByUser(userId);
    
    res.json({
      items,
      count: items.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /inventory/low
 * Get items running low (< 3 days)
 */
router.get('/inventory/low', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';
    const items = await Inventory.findLowInventory(userId);
    
    res.json({
      items,
      count: items.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /inventory/:id
 * Get single inventory item
 */
router.get('/inventory/:id', validateUUID('id'), async (req, res, next) => {
  try {
    const item = await Inventory.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: { message: 'Item not found' } });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /inventory
 * Add new inventory item
 */
router.post('/inventory', async (req, res, next) => {
  try {
    const { error, value } = inventorySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }
    
    const item = await Inventory.create({
      ...value,
      user_id: req.body.user_id || 'demo_user',
    });
    
    logger.info(`Inventory item created: ${item.id}`);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /inventory/bulk
 * Add or update multiple inventory items
 * Body: { items: Array<InventoryItem>, mode: 'create' | 'update' | 'upsert' }
 */
router.post('/inventory/bulk', async (req, res, next) => {
  try {
    const { items, mode = 'create' } = req.body;
    const userId = req.body.user_id || 'demo_user';
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: { message: 'items array is required and must not be empty' }
      });
    }
    
    const results = {
      created: [],
      updated: [],
      errors: [],
    };
    
    for (const item of items) {
      try {
        // Validate item
        const { error, value } = inventorySchema.validate(item);
        if (error) {
          results.errors.push({
            item,
            error: error.details[0].message,
          });
          continue;
        }
        
        // Handle different modes
        if (mode === 'create') {
          const created = await Inventory.create({
            ...value,
            user_id: userId,
          });
          results.created.push(created);
        } else if (mode === 'update' && item.id) {
          const updated = await Inventory.update(item.id, value);
          if (updated) {
            results.updated.push(updated);
          } else {
            results.errors.push({
              item,
              error: 'Item not found',
            });
          }
        } else if (mode === 'upsert') {
          // Try to find existing item by name and unit
          const existing = await Inventory.findByNameAndUnit(
            userId,
            value.item_name,
            value.unit
          );
          
          if (existing) {
            // Update quantity (add to existing)
            const updated = await Inventory.update(existing.id, {
              quantity: existing.quantity + value.quantity,
            });
            results.updated.push(updated);
          } else {
            // Create new
            const created = await Inventory.create({
              ...value,
              user_id: userId,
            });
            results.created.push(created);
          }
        }
      } catch (err) {
        logger.error('Error processing bulk item:', err);
        results.errors.push({
          item,
          error: err.message,
        });
      }
    }
    
    logger.info('Bulk operation completed', {
      created: results.created.length,
      updated: results.updated.length,
      errors: results.errors.length,
    });
    
    res.status(200).json({
      summary: {
        total: items.length,
        created: results.created.length,
        updated: results.updated.length,
        errors: results.errors.length,
      },
      results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /inventory/:id
 * Update inventory item
 */
router.put('/inventory/:id', validateUUID('id'), async (req, res, next) => {
  try {
    const item = await Inventory.update(req.params.id, req.body);
    
    if (!item) {
      return res.status(404).json({ error: { message: 'Item not found' } });
    }
    
    logger.info(`Inventory item updated: ${item.id}`);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /inventory/:id
 * Delete inventory item
 */
router.delete('/inventory/:id', validateUUID('id'), async (req, res, next) => {
  try {
    const item = await Inventory.delete(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: { message: 'Item not found' } });
    }
    
    logger.info(`Inventory item deleted: ${item.id}`);
    res.json({ message: 'Item deleted successfully', item });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PREFERENCES ROUTES
// ============================================

/**
 * GET /preferences
 * Get user preferences
 */
router.get('/preferences', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';
    const prefs = await Preferences.findByUser(userId);
    
    if (!prefs) {
      return res.status(404).json({ error: { message: 'Preferences not found' } });
    }
    
    res.json(prefs);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /preferences
 * Update user preferences
 */
router.put('/preferences', async (req, res, next) => {
  try {
    const { error, value } = preferencesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }
    
    const userId = req.body.user_id || 'demo_user';
    const prefs = await Preferences.update(userId, value);
    
    if (!prefs) {
      return res.status(404).json({ error: { message: 'Preferences not found' } });
    }
    
    logger.info(`Preferences updated for user: ${userId}`);
    res.json(prefs);
  } catch (error) {
    next(error);
  }
});

// ============================================
// ORDERS ROUTES
// ============================================

/**
 * GET /orders
 * Get all orders for user (optionally filter by status)
 */
router.get('/orders', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';
    const status = req.query.status || null;
    
    const orders = await Orders.findByUser(userId, status);
    
    res.json({
      orders,
      count: orders.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /orders/pending
 * Get pending orders awaiting approval
 */
router.get('/orders/pending', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';
    const orders = await Orders.findPending(userId);
    
    res.json({
      orders,
      count: orders.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /orders/:id
 * Get single order
 */
router.get('/orders/:id', validateUUID('id'), async (req, res, next) => {
  try {
    const order = await Orders.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found' } });
    }
    
    res.json(order);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /orders
 * Create new order
 */
router.post('/orders', async (req, res, next) => {
  try {
    const { error, value } = orderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }
    
    const userId = req.body.user_id || 'demo_user';
    
    // Check spending cap
    const prefs = await Preferences.findByUser(userId);
    if (prefs && value.total > prefs.max_spend) {
      return res.status(400).json({
        error: {
          message: 'Order exceeds spending limit',
          limit: prefs.max_spend,
          total: value.total,
        },
      });
    }
    
    // Create order
    const order = await Orders.create({
      ...value,
      user_id: userId,
    });
    
    // Auto-approve if conditions met
    if (prefs && prefs.approval_mode === 'auto_all') {
      await Orders.approve(order.id, 'Auto-approved (all orders)');
    } else if (prefs && prefs.approval_mode === 'auto_under_limit' && value.total <= prefs.auto_approve_limit) {
      await Orders.approve(order.id, `Auto-approved (under $${prefs.auto_approve_limit})`);
    }
    
    logger.info(`Order created: ${order.id}`);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /orders/:id/approve
 * Approve pending order
 */
router.put('/orders/:id/approve', validateUUID('id'), async (req, res, next) => {
  try {
    const notes = req.body.notes || null;
    const order = await Orders.approve(req.params.id, notes);
    
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found or already processed' } });
    }
    
    logger.info(`Order approved: ${order.id}`);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /orders/:id/reject
 * Reject pending order
 */
router.put('/orders/:id/reject', validateUUID('id'), async (req, res, next) => {
  try {
    const notes = req.body.notes || null;
    const order = await Orders.reject(req.params.id, notes);
    
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found or already processed' } });
    }
    
    logger.info(`Order rejected: ${order.id}`);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /orders/:id/placed
 * Mark order as placed with vendor
 */
router.put('/orders/:id/placed', validateUUID('id'), async (req, res, next) => {
  try {
    const { vendor_order_id, tracking_number } = req.body;
    
    if (!vendor_order_id) {
      return res.status(400).json({ error: { message: 'vendor_order_id required' } });
    }
    
    const order = await Orders.markPlaced(req.params.id, vendor_order_id, tracking_number);
    
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found or not approved' } });
    }
    
    logger.info(`Order placed: ${order.id}`);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

// ============================================
// DEBUG ENDPOINT (Development only)
// ============================================
/**
 * GET /debug/data
 * Returns all tables for quick inspection during development
 * NOTE: Remove or secure this endpoint in production
 */
if (process.env.NODE_ENV === 'development') {
  router.get('/debug/data', async (req, res, next) => {
    try {
      const userId = req.query.user_id || 'demo_user';
      
      const [inventory, preferences, orders] = await Promise.all([
        Inventory.findByUser(userId),
        Preferences.findByUser(userId),
        Orders.findByUser(userId),
      ]);
      
      res.json({
        user_id: userId,
        timestamp: new Date().toISOString(),
        data: {
          inventory: {
            items: inventory,
            count: inventory.length,
          },
          preferences: preferences || null,
          orders: {
            items: orders,
            count: orders.length,
            by_status: orders.reduce((acc, order) => {
              acc[order.status] = (acc[order.status] || 0) + 1;
              return acc;
            }, {}),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = router;
