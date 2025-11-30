const express = require('express');
const { Inventory, Orders, Preferences } = require('../models/db');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /day
 * Simulate a day passing - trigger forecasting and order generation
 * This replaces the background scheduler for demo purposes
 */
router.post('/day', async (req, res, next) => {
  try {
    const userId = req.body.user_id || 'demo_user';
    
    logger.info('Starting day simulation...');
    
    // Step 1: Get low inventory items
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
    
    // Step 3: Generate order items with brand selection
    const orderItems = lowItems.map(item => {
      // Simple brand selection logic
      const itemBrands = brandPrefs[item.item_name.toLowerCase()] || {};
      const preferredBrand = itemBrands.preferred?.[0] || 'Generic';
      
      // Estimate quantity needed (rounded up)
      const daysToRestock = 7; // Standard restock period
      const quantityNeeded = Math.ceil(item.average_daily_consumption * daysToRestock);
      
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
        quantity: quantityNeeded,
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
    const userId = req.body.user_id || 'demo_user';
    const days = req.body.days || 1;
    
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
