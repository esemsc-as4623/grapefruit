const express = require('express');
const Joi = require('joi');
const { Inventory, Orders, Preferences, Cart } = require('../models/db');
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
 * Simulate a day passing - randomly deplete, add to cart, or delete items
 * Simulates realistic user behavior with consumption forecasting
 */
router.post('/day', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = simulateDaySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: { message: error.details[0].message } });
    }
    
    const userId = value.user_id || 'demo_user';
    
    logger.info('Starting day simulation with random actions...');
    
    // Get all inventory items
    const items = await Inventory.findByUser(userId);
    const updatedItems = [];
    const deletedItems = [];
    const cartAddedItems = [];
    
    for (const item of items) {
      // Random chance of action: 70% deplete, 20% add to cart, 10% delete
      const randomAction = Math.random();
      
      if (randomAction < 0.7) {
        // 70% chance: Normal consumption depletion
        if (item.average_daily_consumption) {
          const consumption = item.average_daily_consumption * 1; // 1 day
          const newQuantity = item.quantity - consumption;
          
          // If quantity reaches 0 or goes below 0, randomly decide to add to cart or delete
          if (newQuantity <= 0) {
            if (Math.random() < 0.7) {
              // 70% chance: Add to cart before deleting
              await Cart.addItem({
                user_id: userId,
                item_name: item.item_name,
                quantity: 1,
                unit: item.unit,
                category: item.category,
                source: 'simulation',
              });
              cartAddedItems.push(item.item_name);
              logger.info(`Added ${item.item_name} to cart (depleted to 0)`);
            }
            
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
            logger.info(`Depleted ${item.item_name} to ${newQuantity.toFixed(2)} ${item.unit}`);
          }
        } else {
          // No consumption rate - randomly reduce by a small amount (0-20%)
          const randomReduction = Math.random() * 0.2;
          const newQuantity = item.quantity * (1 - randomReduction);
          
          if (newQuantity < 0.5) {
            // Low quantity - add to cart
            await Cart.addItem({
              user_id: userId,
              item_name: item.item_name,
              quantity: 1,
              unit: item.unit,
              category: item.category,
              source: 'simulation',
            });
            cartAddedItems.push(item.item_name);
            logger.info(`Added ${item.item_name} to cart (low quantity)`);
          }
          
          const updated = await Inventory.update(item.id, {
            quantity: parseFloat(newQuantity.toFixed(2)),
          });
          updatedItems.push(updated);
        }
      } else if (randomAction < 0.9) {
        // 20% chance: Add to cart (user wants to restock)
        await Cart.addItem({
          user_id: userId,
          item_name: item.item_name,
          quantity: 1,
          unit: item.unit,
          category: item.category,
          source: 'simulation',
        });
        cartAddedItems.push(item.item_name);
        logger.info(`Randomly added ${item.item_name} to cart`);
      } else {
        // 10% chance: Delete item (user disposed of it)
        await Inventory.delete(item.id);
        deletedItems.push(item.item_name);
        logger.info(`Randomly deleted ${item.item_name}`);
      }
    }
    
    // Get low inventory items (for informational purposes)
    const lowItems = await Inventory.findLowInventory(userId);
    
    logger.info(`Day simulation complete - ${updatedItems.length} items updated, ${deletedItems.length} items deleted, ${cartAddedItems.length} items added to cart, ${lowItems.length} items running low`);
    
    res.json({
      message: 'Day simulation complete with random actions',
      items_updated: updatedItems.length,
      items_deleted: deletedItems.length,
      items_added_to_cart: cartAddedItems.length,
      deleted_items: deletedItems,
      cart_items: cartAddedItems,
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
