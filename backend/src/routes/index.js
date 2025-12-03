const express = require('express');
const Joi = require('joi');
const { Inventory, Preferences, Orders, Cart } = require('../models/db');
const logger = require('../utils/logger');
const consumptionLearner = require('../services/consumptionLearner');
const { suggestPriceAndQuantity } = require('../services/cartPricer');
const priceService = require('../services/priceService');
const { logAudit } = require('../services/auditLogger');

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
  user_id: Joi.string().optional(), // Allow user_id to be passed, defaults to 'demo_user' if not provided
  item_name: Joi.string().required().max(255),
  quantity: Joi.number().min(0).required(),
  unit: Joi.string().required().max(50),
  category: Joi.string().max(100),
  predicted_runout: Joi.date().optional(),
  average_daily_consumption: Joi.number().min(0).optional(),
});

const preferencesSchema = Joi.object({
  brand_prefs: Joi.object().optional(),
  allowed_vendors: Joi.array().items(Joi.string()).optional(),
  notify_low_inventory: Joi.boolean().optional(),
  notify_order_ready: Joi.boolean().optional(),
  auto_order_enabled: Joi.boolean().optional(),
  auto_order_threshold_days: Joi.number().integer().min(0).max(30).optional(),
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

const cartItemSchema = Joi.object({
  item_name: Joi.string().required().max(255),
  quantity: Joi.number().min(0.01).optional(), // Made optional - LLM can suggest
  unit: Joi.string().max(50).optional(),        // Made optional - LLM can suggest
  category: Joi.string().max(100).optional(),
  estimated_price: Joi.number().min(0).optional(),
  notes: Joi.string().max(500).optional(),
  source: Joi.string().valid('manual', 'trash', 'deplete', 'cart_icon').optional(),
  use_llm_pricing: Joi.boolean().optional().default(true), // Enable LLM pricing by default
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
 * Add new inventory item or add quantity to existing item
 */
router.post('/inventory', async (req, res, next) => {
  try {
    const { error, value } = inventorySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }
    
    const userId = req.body.user_id || 'demo_user';
    
    // Check if item already exists
    const existingItem = await Inventory.findByName(userId, value.item_name);
    
    if (existingItem) {
      // Add to existing quantity
      const updatedItem = await Inventory.addQuantity(
        existingItem.id,
        value.quantity,
        value.average_daily_consumption || null
      );
      
      logger.info(`Inventory item updated (quantity added): ${updatedItem.id}`);
      return res.status(200).json({
        ...updatedItem,
        message: 'Quantity added to existing item',
        added_quantity: value.quantity,
      });
    }
    
    // Create new item
    const item = await Inventory.create({
      ...value,
      user_id: userId,
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
            // Add quantity to existing item (instead of replacing)
            const updated = await Inventory.addQuantity(
              existing.id,
              value.quantity,
              value.average_daily_consumption || null
            );
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
    // Get current item state before update
    const currentItem = await Inventory.findById(req.params.id);
    if (!currentItem) {
      return res.status(404).json({ error: { message: 'Item not found' } });
    }
    
    const item = await Inventory.update(req.params.id, req.body);
    
    // Record consumption event if quantity changed (and quantity decreased)
    if (req.body.quantity !== undefined && req.body.quantity !== currentItem.quantity) {
      const quantityChanged = currentItem.quantity - req.body.quantity;
      
      // Record the event (both increases and decreases)
      await consumptionLearner.recordConsumptionEvent({
        userId: currentItem.user_id,
        itemName: currentItem.item_name,
        quantityBefore: currentItem.quantity,
        quantityAfter: req.body.quantity,
        eventType: quantityChanged > 0 ? 'manual_depletion' : 'manual_update',
        source: 'user',
        unit: currentItem.unit,
        category: currentItem.category,
        itemCreatedAt: currentItem.created_at,
      });
      
      // Only learn from depletions (quantity decreased), not restocks
      if (quantityChanged > 0) {
        // Manual depletions happen instantly - no time passage
        // Only learn from historical patterns, not from real-world clock time
        const learningResult = await consumptionLearner.learnConsumptionRate(
          currentItem.user_id,
          currentItem.item_name,
          {
            category: currentItem.category,
            unit: currentItem.unit,
            daysInInventory: null, // No time passage for manual actions
          }
        );
        
        // Update the item with learned consumption rate if we got a good estimate
        if (learningResult.rate && learningResult.confidence !== 'very_low') {
          await Inventory.update(req.params.id, {
            average_daily_consumption: learningResult.rate,
          });
          
          logger.info(
            `Learned from manual depletion: ${currentItem.item_name}, rate: ${learningResult.rate.toFixed(3)}, confidence: ${learningResult.confidence}`
          );
        }
      }
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
    // Get item before deleting to record consumption
    const currentItem = await Inventory.findById(req.params.id);
    if (!currentItem) {
      return res.status(404).json({ error: { message: 'Item not found' } });
    }
    
    // Record deletion as consumption event (if there was remaining quantity)
    if (currentItem.quantity > 0) {
      await consumptionLearner.recordConsumptionEvent({
        userId: currentItem.user_id,
        itemName: currentItem.item_name,
        quantityBefore: currentItem.quantity,
        quantityAfter: 0,
        eventType: 'deletion',
        source: 'user',
        unit: currentItem.unit,
        category: currentItem.category,
        itemCreatedAt: currentItem.created_at,
      });
      
      // Manual deletions happen instantly - no time passage
      // Only learn from historical patterns, not from real-world clock time
      const learningResult = await consumptionLearner.learnConsumptionRate(
        currentItem.user_id,
        currentItem.item_name,
        {
          category: currentItem.category,
          unit: currentItem.unit,
          daysInInventory: null, // No time passage for manual actions
        }
      );
      
      logger.info(
        `Learned from deletion: ${currentItem.item_name}, rate: ${learningResult.rate?.toFixed(3)}, confidence: ${learningResult.confidence}`
      );
    }
    
    const item = await Inventory.delete(req.params.id);
    
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
 * Create new order preserving exact cart prices and totals
 */
router.post('/orders', async (req, res, next) => {
  try {
    const { error, value } = orderSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }

    const userId = req.body.user_id || 'demo_user';

    // Preserve cart items exactly as they were displayed to the user
    // Do NOT override prices - use the prices that were shown in cart
    const enrichedItems = value.items.map((item) => {
      // Just ensure we have all required fields, but keep the displayed prices
      return {
        item_name: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price, // Keep the exact price that was displayed in cart
        brand: item.brand || 'Generic',
      };
    });

    // Use the totals as calculated by frontend (based on displayed cart prices)
    // This ensures the Track Orders section shows the exact same totals the user saw
    const subtotal = value.subtotal;
    const tax = value.tax || 0;
    const shipping = value.shipping || 0;
    const total = value.total;

    // Generate tracking information for immediate placement
    const trackingNumber = 'AMZN-' + Math.random().toString(36).substr(2, 12).toUpperCase();
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3 + Math.floor(Math.random() * 3)); // 3-5 days

    // Create order with 'placed' status (skip approval)
    const order = await Orders.create({
      ...value,
      user_id: userId,
      items: enrichedItems,
      subtotal,
      tax,
      shipping,
      total,
      status: 'placed', // Immediately place the order
      vendor_order_id: trackingNumber,
      tracking_number: trackingNumber,
      delivery_date: deliveryDate.toISOString().split('T')[0], // YYYY-MM-DD format
    });

    logger.info(`Order placed immediately with tracking ${trackingNumber}: ${order.id} - $${total.toFixed(2)}`);
    res.status(201).json({
      ...order,
      message: 'Order placed successfully and is now in transit!',
    });
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
      return res.status(404).json({ error: { message: 'Order not found' } });
    }
    
    logger.info(`Order placed: ${order.id}`);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /orders/:id/delivered
 * Mark order as delivered and add items to inventory with exact name matching
 */
router.put('/orders/:id/delivered', validateUUID('id'), async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const userId = req.body.user_id || 'demo_user';
    
    // Get the order first to access its items
    const order = await Orders.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: { message: 'Order not found' } });
    }
    
    if (order.status === 'delivered') {
      return res.status(400).json({ error: { message: 'Order already marked as delivered' } });
    }
    
    // Mark order as delivered
    const updatedOrder = await Orders.markDelivered(orderId);
    
    if (!updatedOrder) {
      return res.status(400).json({ error: { message: 'Failed to mark order as delivered. Order must be in placed status.' } });
    }
    
    // Parse order items and use inventory matcher for intelligent matching
    const rawItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    
    logger.info('Debug - Raw order.items:', rawItems);
    logger.info('Debug - Items is array?', Array.isArray(rawItems));
    logger.info('Debug - typeof rawItems:', typeof rawItems);
    logger.info('Debug - rawItems !== null:', rawItems !== null);
    
    // Handle both array and object formats (PostgreSQL JSON can sometimes store arrays as objects)
    let items;
    if (Array.isArray(rawItems)) {
      items = rawItems;
      logger.info('Debug - Using rawItems as array');
    } else if (typeof rawItems === 'object' && rawItems !== null) {
      // Convert object with numeric keys to array
      items = Object.values(rawItems);
      logger.info('Debug - Converted object to array, length:', items.length);
      logger.info('Debug - After conversion, items:', items);
      logger.info('Debug - First item after conversion:', items[0]);
    } else {
      logger.error('Debug - rawItems format not recognized:', {type: typeof rawItems, isNull: rawItems === null, value: rawItems});
      return res.status(400).json({ 
        error: { message: 'Order items are invalid or missing' } 
      });
    }
    
    logger.info('Debug - Final items array:', items);
    
    // Check for any undefined or null items before processing
    if (!items || items.length === 0) {
      return res.status(400).json({ 
        error: { message: 'Order items are empty or missing' } 
      });
    }
    
    // Filter out any invalid items
    const validItems = items.filter((item, index) => {
      if (!item) {
        logger.warn(`Debug - Found null/undefined item at index ${index}`);
        return false;
      }
      if (!item.item_name || item.quantity === undefined || item.quantity === null) {
        logger.warn(`Debug - Found invalid item at index ${index}:`, item);
        return false;
      }
      return true;
    });
    
    if (validItems.length === 0) {
      return res.status(400).json({ 
        error: { message: 'No valid items found in order' } 
      });
    }
    
    // Transform order items to format expected by inventory matcher
    const parsedItems = validItems.map(item => ({
      item_name: item.item_name,
      quantity: parseFloat(item.quantity),
      unit: item.unit,
      category: item.category || 'others',
      price: parseFloat(item.price || 0),
      brand: item.brand || null,
    }));
    
    logger.info(`Processing ${parsedItems.length} delivered items for order ${orderId}`);
    
    // Add items to inventory with exact name matching
    const results = {
      updated: [],
      created: [],
      errors: [],
    };
    
    // Process each item: check if exists, update quantity or create new
    for (const item of parsedItems) {
      try {
        // Check if item with exact same name already exists for this user
        const existingItem = await Inventory.findByName(order.user_id, item.item_name);
        
        if (existingItem) {
          // Item exists - add to existing quantity
          const newQuantity = parseFloat(existingItem.quantity) + item.quantity;
          const updated = await Inventory.update(existingItem.id, {
            quantity: newQuantity,
            last_purchase_date: new Date(),
            last_purchase_quantity: item.quantity,
          });
          results.updated.push(updated);
          logger.info(`Updated ${item.item_name}: ${existingItem.quantity} + ${item.quantity} = ${newQuantity} ${item.unit}`);
        } else {
          // Item doesn't exist - create new entry
          const created = await Inventory.create({
            user_id: order.user_id,
            item_name: item.item_name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            average_daily_consumption: 0, // Will be calculated over time
            last_purchase_date: new Date(),
            last_purchase_quantity: item.quantity,
          });
          results.created.push(created);
          logger.info(`Created ${item.item_name} (${item.quantity} ${item.unit}) in inventory`);
        }
      } catch (error) {
        logger.error(`Error processing inventory item ${item.item_name}:`, error);
        results.errors.push({
          item_name: item.item_name,
          error: error.message,
        });
      }
    }
    
    // Combine results for response
    const summary = {
      totalItems: parsedItems.length,
      updated: results.updated.length,
      created: results.created.length,
      errors: results.errors.length,
    };
    
    logger.info(`Order delivered: ${updatedOrder.id}`, summary);
    
    res.json({
      success: true,
      order: updatedOrder,
      inventoryUpdates: {
        updated: results.updated,
        created: results.created,
        errors: results.errors,
      },
      summary,
      message: `Order marked as delivered. ${summary.updated} items updated, ${summary.created} items created in inventory.`,
    });
    
  } catch (error) {
    logger.error('Error marking order as delivered:', error);
    next(error);
  }
});

// ============================================
// CART ROUTES
// ============================================

/**
 * GET /cart
 * Get all cart items for user
 * Now enriched with real-time prices from amazon_catalog
 */
router.get('/cart', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';
    const items = await Cart.findByUser(userId);

    // Enrich cart items with current prices from catalog
    const enrichedItems = await priceService.enrichCartWithPrices(items);

    // Calculate totals with real prices
    const totals = priceService.calculateCartTotals(enrichedItems);

    res.json({
      items: enrichedItems,
      count: enrichedItems.length,
      ...totals,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /cart/:id
 * Get single cart item
 */
router.get('/cart/:id', validateUUID('id'), async (req, res, next) => {
  try {
    const item = await Cart.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: { message: 'Cart item not found' } });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /cart
 * Add item to cart with intelligent pricing
 * 
 * ARCHITECTURE:
 * 1. LLM (cartPricer) suggests: quantity, unit, category, and price estimate
 * 2. Catalog (priceService) provides: authoritative price (if available)
 * 3. Use catalog price for good matches (confidence >= 0.7)
 * 4. Use LLM price for items not in catalog (confidence < 0.7)
 * 
 * This ensures accurate pricing for known items, while using AI estimates for new/specialty items.
 */
router.post('/cart', async (req, res, next) => {
  try {
    const { error, value } = cartItemSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }

    const userId = req.body.user_id || 'demo_user';
    const useLLMPricing = value.use_llm_pricing !== false; // Default to true
    
    let itemData = { ...value, user_id: userId };
    let llmSuggestion = null;
    
    // STEP 1: Get LLM suggestions for quantity, unit, category, and price
    // Call LLM if enabled and ANY field is missing
    const needsLLM = useLLMPricing && (!value.quantity || !value.unit || !value.category);
    
    if (needsLLM) {
      try {
        logger.info(`[LLM] Getting suggestion for: ${value.item_name}`, {
          missingFields: {
            quantity: !value.quantity,
            unit: !value.unit,
            category: !value.category
          }
        });
        
        llmSuggestion = await suggestPriceAndQuantity(value.item_name, value.category);
        
        // Log raw LLM response for debugging
        logger.info(`[LLM] Raw suggestion received:`, {
          suggested_quantity: llmSuggestion.suggested_quantity,
          unit: llmSuggestion.unit,
          category: llmSuggestion.category,
          estimated_price_per_unit: llmSuggestion.estimated_price_per_unit,
          confidence: llmSuggestion.confidence,
        });
        
        // Use LLM suggestions for missing fields
        if (!value.quantity) {
          itemData.quantity = llmSuggestion.suggested_quantity;
          logger.info(`[LLM] Setting quantity: ${itemData.quantity}`);
        }
        if (!value.unit) {
          itemData.unit = llmSuggestion.unit;
          logger.info(`[LLM] Setting unit: ${itemData.unit}`);
        }
        if (!value.category && llmSuggestion.category) {
          itemData.category = llmSuggestion.category;
          logger.info(`[LLM] Setting category: ${itemData.category}`);
        }
        
        logger.info(`[LLM] Final itemData after applying suggestions:`, {
          quantity: itemData.quantity,
          unit: itemData.unit,
          category: itemData.category,
        });
      } catch (llmError) {
        // If LLM fails, require user to provide values
        logger.error(`[LLM] Failed for ${value.item_name}:`, llmError);
        
        if (!value.quantity || !value.unit) {
          return res.status(400).json({ 
            error: { 
              message: 'Quantity and unit are required when LLM pricing is unavailable',
              llm_error: llmError.message 
            } 
          });
        }
      }
    } else {
      logger.info(`[LLM] Skipping LLM call for ${value.item_name}`, {
        useLLMPricing,
        hasQuantity: !!value.quantity,
        hasUnit: !!value.unit,
        hasCategory: !!value.category
      });
    }
    
    // STEP 2: Fetch price from amazon_catalog
    const priceData = await priceService.getPriceForItem(value.item_name);
    
    logger.info(`[Catalog] Lookup for ${value.item_name}:`, {
      price: priceData.price,
      brand: priceData.brand,
      source: priceData.source,
      matchType: priceData.matchType,
      confidence: priceData.confidence,
    });

    // STEP 3: Decide which price to use based on catalog confidence
    // Confidence >= 0.7: Good catalog match, use catalog price
    // Confidence < 0.7: Poor/no match, use LLM estimate if available
    let finalPrice = priceData.price;
    let finalBrand = priceData.brand;
    let priceSource = priceData.source;
    
    if (priceData.confidence < 0.7 && llmSuggestion && llmSuggestion.estimated_price_per_unit) {
      finalPrice = llmSuggestion.estimated_price_per_unit;
      finalBrand = 'AI Estimated';
      priceSource = 'llm_estimate';
      
      logger.info(`[Pricing] Using LLM estimate for ${value.item_name}:`, {
        catalogConfidence: priceData.confidence,
        catalogPrice: priceData.price,
        llmPrice: finalPrice,
        reason: 'No close catalog match found'
      });
    } else {
      logger.info(`[Pricing] Using catalog price for ${value.item_name}:`, {
        catalogConfidence: priceData.confidence,
        catalogPrice: finalPrice,
        llmPrice: llmSuggestion?.estimated_price_per_unit || 'N/A',
        reason: priceData.confidence >= 0.7 ? 'Good catalog match' : 'No LLM estimate available'
      });
    }

    // STEP 4: Create cart item with final price
    const startTime = Date.now();
    const item = await Cart.addItem({
      ...itemData,
      estimated_price: finalPrice,
    });

    // STEP 5: Enrich response with price metadata
    const enrichedItem = {
      ...item,
      price: finalPrice,
      brand: finalBrand,
      catalog_name: priceData.catalogName,
      priceSource: priceSource,
      matchType: priceData.matchType,
      confidence: priceData.confidence,
    };

    logger.info(`[Cart] Item added: ${item.id} - ${item.item_name} (${itemData.quantity} ${itemData.unit} @ $${finalPrice})`);
    
    // Log audit event
    await logAudit({
      userId,
      action: 'cart_add_item',
      resourceType: 'cart',
      resourceId: item.id,
      status: 'success',
      metadata: {
        itemName: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        price: finalPrice,
        priceSource,
      },
      request: req,
      executionTimeMs: Date.now() - startTime,
    });
    
    res.status(201).json(enrichedItem);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /cart/:id
 * Update cart item
 */
router.put('/cart/:id', validateUUID('id'), async (req, res, next) => {
  try {
    const item = await Cart.update(req.params.id, req.body);
    
    if (!item) {
      return res.status(404).json({ error: { message: 'Cart item not found' } });
    }
    
    logger.info(`Cart item updated: ${item.id}`);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /cart/:id
 * Remove item from cart
 */
router.delete('/cart/:id', validateUUID('id'), async (req, res, next) => {
  try {
    const item = await Cart.removeItem(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: { message: 'Cart item not found' } });
    }
    
    logger.info(`Cart item removed: ${item.id}`);
    res.json({ message: 'Item removed from cart', item });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /cart
 * Clear all cart items for user
 */
router.delete('/cart', async (req, res, next) => {
  try {
    const userId = req.query.user_id || 'demo_user';
    const items = await Cart.clearCart(userId);
    
    logger.info(`Cart cleared for user: ${userId}`);
    res.json({ message: 'Cart cleared', count: items.length });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /cart/auto-add-low-stock
 * Automatically add all low-stock items to cart (when auto-order is enabled)
 * This checks user preferences and only adds items if auto_order_enabled is true
 */
router.post('/cart/auto-add-low-stock', async (req, res, next) => {
  try {
    const userId = req.query.user_id || req.body.user_id || 'demo_user';
    
    // Check if auto-order is enabled for this user
    const preferences = await Preferences.findByUser(userId);
    
    if (!preferences || !preferences.auto_order_enabled) {
      return res.status(400).json({ 
        error: { 
          message: 'Auto-order is not enabled for this user. Please enable it in preferences first.',
          auto_order_enabled: preferences?.auto_order_enabled || false
        } 
      });
    }

    // Get all low-stock items
    const lowStockItems = await Inventory.findLowInventory(userId);
    
    if (lowStockItems.length === 0) {
      return res.json({
        message: 'No low-stock items found',
        itemsAdded: 0,
        items: [],
      });
    }

    // Get current cart items to avoid duplicates
    const existingCartItems = await Cart.findByUser(userId);
    const existingItemNames = new Set(existingCartItems.map(item => item.item_name.toLowerCase()));

    const addedItems = [];
    const skippedItems = [];
    let errors = [];

    // Add each low-stock item to cart if not already there
    for (const lowItem of lowStockItems) {
      // Skip if already in cart
      if (existingItemNames.has(lowItem.item_name.toLowerCase())) {
        logger.info(`[Auto-Order] Skipping ${lowItem.item_name} - already in cart`);
        skippedItems.push({
          item_name: lowItem.item_name,
          reason: 'already_in_cart'
        });
        continue;
      }

      try {
        // Determine reorder quantity (use last purchase quantity or default to 1)
        const reorderQuantity = lowItem.last_purchase_quantity || 1;
        
        // Get price from catalog
        const priceData = await priceService.getPriceForItem(lowItem.item_name);
        
        // Add to cart
        const cartItem = await Cart.addItem({
          user_id: userId,
          item_name: lowItem.item_name,
          quantity: reorderQuantity,
          unit: lowItem.unit,
          category: lowItem.category,
          estimated_price: priceData.price,
          notes: `Auto-added: Low stock (${lowItem.days_until_runout?.toFixed(1)} days until runout)`,
          source: 'auto_order',
        });

        logger.info(`[Auto-Order] Added ${lowItem.item_name} to cart (${reorderQuantity} ${lowItem.unit})`);
        
        addedItems.push({
          id: cartItem.id,
          item_name: cartItem.item_name,
          quantity: cartItem.quantity,
          unit: cartItem.unit,
          estimated_price: cartItem.estimated_price,
          days_until_runout: lowItem.days_until_runout,
        });
      } catch (error) {
        logger.error(`[Auto-Order] Failed to add ${lowItem.item_name} to cart:`, error);
        errors.push({
          item_name: lowItem.item_name,
          error: error.message,
        });
      }
    }

    res.json({
      message: `Auto-order complete: ${addedItems.length} items added to cart`,
      itemsAdded: addedItems.length,
      itemsSkipped: skippedItems.length,
      totalLowStock: lowStockItems.length,
      items: addedItems,
      skipped: skippedItems,
      errors: errors.length > 0 ? errors : undefined,
    });
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
