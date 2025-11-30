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
 * Simulate a day passing - update consumption and recalculate predictions
 * Does NOT auto-create orders - users must manually create orders from the Orders page
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
    
    // Simulate consumption for one day
    const items = await Inventory.findByUser(userId);
    const updatedItems = [];
    const deletedItems = [];
    
    for (const item of items) {
      if (item.average_daily_consumption) {
        const consumption = item.average_daily_consumption * 1; // 1 day
        const newQuantity = item.quantity - consumption;
        
        // If quantity reaches 0 or goes below 0, delete the item from inventory
        if (newQuantity <= 0) {
          await Inventory.delete(item.id);
          deletedItems.push(item.item_name);
          logger.info(`Deleted item ${item.item_name} - quantity reached ${newQuantity.toFixed(2)}`);
        } else {
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
    }
    
    // Get low inventory items (for informational purposes)
    const lowItems = await Inventory.findLowInventory(userId);
    
    logger.info(`Day simulation complete - ${updatedItems.length} items updated, ${deletedItems.length} items deleted, ${lowItems.length} items running low`);
    
    res.json({
      message: 'Day simulation complete - consumption updated',
      items_updated: updatedItems.length,
      items_deleted: deletedItems.length,
      deleted_items: deletedItems,
      low_items_count: lowItems.length,
      items: updatedItems,
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
    const deletedItems = [];
    
    for (const item of items) {
      if (item.average_daily_consumption) {
        const consumption = item.average_daily_consumption * days;
        const newQuantity = item.quantity - consumption;
        
        // If quantity reaches 0 or goes below 0, delete the item from inventory
        if (newQuantity <= 0) {
          await Inventory.delete(item.id);
          deletedItems.push(item.item_name);
          logger.info(`Deleted item ${item.item_name} - quantity reached ${newQuantity.toFixed(2)}`);
        } else {
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
    }
    
    logger.info(`Consumption simulation complete - ${updatedItems.length} items updated, ${deletedItems.length} items deleted`);
    
    res.json({
      message: `Simulated ${days} days of consumption`,
      items_updated: updatedItems.length,
      items_deleted: deletedItems.length,
      deleted_items: deletedItems,
      items: updatedItems,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
