const express = require('express');
const Joi = require('joi');
const { Inventory, Orders, Preferences } = require('../models/db');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================
const simulateDaySchema = Joi.object({
  user_id: Joi.string().max(255).optional(),
});

const simulateConsumptionSchema = Joi.object({
  user_id: Joi.string().max(255).optional(),
  days: Joi.number().min(0).max(365).optional().default(1),
});

// ============================================
// SIMULATION ROUTES
// ============================================

/**
 * POST /day
 * Simulate a day passing - trigger forecasting and order generation
 * This replaces the background scheduler for demo purposes
 */
router.post('/day', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = simulateDaySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }
    
    const userId = value.user_id || 'demo_user';
    
    logger.info('Starting day simulation...');
    
    // Step 0: Recalculate predicted_runout for all items based on current consumption
    const allItems = await Inventory.findByUser(userId);
    for (const item of allItems) {
      if (item.average_daily_consumption > 0 && item.quantity > 0) {
        const daysRemaining = item.quantity / item.average_daily_consumption;
        const newRunout = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
        await Inventory.update(item.id, {
          predicted_runout: newRunout,
        });
      } else if (item.quantity === 0) {
        // Item is out of stock - set to null to avoid false low inventory triggers
        await Inventory.update(item.id, {
          predicted_runout: null,
        });
      }
    }
    
    // Step 1: Get low inventory items (after recalculation)
    const lowItems = await Inventory.findLowInventory(userId);
    
    if (lowItems.length === 0) {
      return res.json({
        message: 'No items running low',
        low_items: [],
        order_created: false,
      });
    }
    
    // Step 2: Get user preferences
    const prefs = await Preferences.findByUser(userId);
    const allowedVendors = prefs?.allowed_vendors || ['walmart', 'amazon'];
    const brandPrefs = prefs?.brand_prefs || {};
    
    // Step 3: Generate order items with category-based brand selection
    const orderItems = lowItems.map(item => {
      // Use category-based brand matching (not item_name)
      // "Whole Milk" -> category "dairy" -> brandPrefs["dairy"]
      const category = (item.category || 'other').toLowerCase();
      const categoryBrands = brandPrefs[category] || {};
      const preferredBrand = categoryBrands.preferred?.[0] || 'Generic';
      
      // Calculate quantity needed accounting for current stock
      const daysToRestock = 7; // Standard restock period
      const targetQuantity = item.average_daily_consumption * daysToRestock;
      const quantityNeeded = parseFloat(Math.max(0, targetQuantity - item.quantity).toFixed(2));
      
      // Round up for countable items (count, roll, loaf), keep decimals for weight/volume
      const finalQuantity = ['count', 'roll', 'loaf'].includes(item.unit) 
        ? Math.ceil(quantityNeeded) 
        : quantityNeeded;
      
      // Mock pricing (would come from vendor APIs in production)
      const mockPrices = {
        'gallon': 4.99,
        'lb': 5.99,
        'count': 0.50,
        'loaf': 3.99,
        'bottle': 6.99,
        'quart': 4.49,
        'roll': 1.99,
      };
      
      const unitPrice = mockPrices[item.unit] || 5.00;
      
      return {
        item_name: item.item_name,
        quantity: finalQuantity,
        unit: item.unit,
        price: unitPrice,
        brand: preferredBrand,
      };
    });
    
    // Step 4: Calculate totals
    const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.08; // 8% tax
    const shipping = subtotal >= 35 ? 0 : 5.99; // Free shipping over $35
    const total = subtotal + tax + shipping;
    
    // Step 5: Select vendor (prefer first in allowed list)
    const vendor = allowedVendors[0] || 'walmart';
    
    // Step 6: Check spending cap
    if (prefs && total > prefs.max_spend) {
      // Defer some items if over budget
      logger.info(`Order total $${total.toFixed(2)} exceeds limit $${prefs.max_spend}`);
      
      return res.json({
        message: 'Order exceeds spending limit - manual review required',
        low_items: lowItems,
        proposed_order: {
          items: orderItems,
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          shipping: shipping.toFixed(2),
          total: total.toFixed(2),
          vendor,
        },
        order_created: false,
        reason: 'exceeds_spending_limit',
      });
    }
    
    // Step 7: Create order
    const order = await Orders.create({
      user_id: userId,
      vendor,
      items: orderItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      shipping: parseFloat(shipping.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      status: 'pending',
    });
    
    logger.info(`Day simulation complete - Order ${order.id} created`);
    
    res.json({
      message: 'Day simulation complete',
      low_items: lowItems,
      order_created: true,
      order,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /consumption
 * Simulate consumption of inventory items
 * Useful for testing forecasting without waiting
 */
router.post('/consumption', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = simulateConsumptionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }
    
    const userId = value.user_id || 'demo_user';
    const days = value.days || 1;
    
    logger.info(`Simulating ${days} days of consumption...`);
    
    const items = await Inventory.findByUser(userId);
    const updatedItems = [];
    
    for (const item of items) {
      if (item.average_daily_consumption) {
        const consumption = item.average_daily_consumption * days;
        const newQuantity = Math.max(0, item.quantity - consumption);
        
        // Update predicted runout based on new quantity
        let newRunout = null;
        if (item.average_daily_consumption > 0 && newQuantity > 0) {
          const daysRemaining = newQuantity / item.average_daily_consumption;
          newRunout = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
        }
        
        const updated = await Inventory.update(item.id, {
          quantity: parseFloat(newQuantity.toFixed(2)),
          predicted_runout: newRunout,
        });
        
        updatedItems.push(updated);
      }
    }
    
    logger.info(`Consumption simulation complete - ${updatedItems.length} items updated`);
    
    res.json({
      message: `Simulated ${days} days of consumption`,
      items_updated: updatedItems.length,
      items: updatedItems,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
