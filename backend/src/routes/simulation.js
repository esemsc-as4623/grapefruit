const express = require('express');
const Joi = require('joi');
const { Inventory, Orders, Preferences, Cart } = require('../models/db');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get step size based on unit type
 * Different units should deplete/increment in different amounts
 * @param {string} unit - The unit of measurement
 * @returns {number} - The step size for this unit
 */
function getStepSize(unit) {
  if (!unit) return 0.5;
  
  const unitLower = unit.toLowerCase();
  const wholeNumberUnits = ['count', 'can', 'piece', 'each'];
  const quarterUnits = ['package', 'box', 'bottle', 'jar', 'bag', 'container'];
  const halfUnits = ['gallon', 'liter', 'quart'];
  const fineUnits = ['ounce', 'pound', 'lb', 'oz', 'gram', 'kg', 'kilogram'];

  if (wholeNumberUnits.includes(unitLower)) return 1;
  if (quarterUnits.includes(unitLower)) return 0.25;
  if (halfUnits.includes(unitLower)) return 0.5;
  if (fineUnits.includes(unitLower)) return 0.1;
  return 0.5; // default
}

/**
 * Round quantity to nearest step size
 * @param {number} quantity - The quantity to round
 * @param {number} stepSize - The step size to round to
 * @returns {number} - The rounded quantity
 */
function roundToStep(quantity, stepSize) {
  return Math.round(quantity / stepSize) * stepSize;
}

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
    
    logger.info('Starting day simulation with consistent consumption...');
    
    // Get all inventory items
    const items = await Inventory.findByUser(userId);
    const updatedItems = [];
    const deletedItems = [];
    const cartAddedItems = [];
    
    if (items.length === 0) {
      logger.info('No items in inventory to simulate');
      return res.json({
        message: 'No items in inventory',
        items_updated: 0,
        items_deleted: 0,
        items_added_to_cart: 0,
        deleted_items: [],
        cart_items: [],
        low_items_count: 0,
        items: [],
      });
    }
    
    // Separate items into two groups: those with consumption rates and those without
    const itemsWithConsumption = items.filter(item => item.average_daily_consumption);
    const itemsWithoutConsumption = items.filter(item => !item.average_daily_consumption);
    
    // ALWAYS deplete items with known consumption rates
    for (const item of itemsWithConsumption) {
      const stepSize = getStepSize(item.unit);
      const consumption = item.average_daily_consumption * 1; // 1 day
      
      // Round consumption to match step size
      const roundedConsumption = roundToStep(consumption, stepSize);
      const newQuantity = roundToStep(item.quantity - roundedConsumption, stepSize);
      
      // If quantity reaches 0 or goes below 0, delete and optionally add to cart
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
        logger.info(`Depleted ${item.item_name} by ${roundedConsumption.toFixed(2)} to ${newQuantity.toFixed(2)} ${item.unit}`);
      }
    }
    
    // For items WITHOUT consumption rates, apply consistent consumption pattern
    if (itemsWithoutConsumption.length > 0) {
      // Calculate consistent consumption target: 5-8 items per day (or 30-50% of these items if smaller)
      const minConsumption = Math.min(5, Math.ceil(itemsWithoutConsumption.length * 0.3));
      const maxConsumption = Math.min(8, Math.ceil(itemsWithoutConsumption.length * 0.5));
      const targetConsumption = Math.floor(Math.random() * (maxConsumption - minConsumption + 1)) + minConsumption;
      
      // Shuffle items to randomize which ones are consumed
      const shuffledItems = [...itemsWithoutConsumption].sort(() => Math.random() - 0.5);
      
      // Process items for consumption (deplete or delete)
      for (let i = 0; i < Math.min(targetConsumption, shuffledItems.length); i++) {
        const item = shuffledItems[i];
        
        // 80% chance of depletion, 20% chance of deletion (disposal)
        const shouldDelete = Math.random() < 0.2;
        
        if (shouldDelete) {
          // Delete item (user disposed of it)
          await Inventory.delete(item.id);
          deletedItems.push(item.item_name);
          logger.info(`Randomly deleted ${item.item_name}`);
        } else {
          // No consumption rate - reduce by step-based amount
          const stepSize = getStepSize(item.unit);
          
          // Deplete by 1-3 steps (depending on step size)
          const stepsToDeplete = Math.floor(Math.random() * 3) + 1;
          const depletionAmount = stepsToDeplete * stepSize;
          const newQuantity = roundToStep(item.quantity - depletionAmount, stepSize);
          
          if (newQuantity <= 0) {
            // Very low quantity - delete and add to cart
            await Cart.addItem({
              user_id: userId,
              item_name: item.item_name,
              quantity: 1,
              unit: item.unit,
              category: item.category,
              source: 'simulation',
            });
            cartAddedItems.push(item.item_name);
            await Inventory.delete(item.id);
            deletedItems.push(item.item_name);
            logger.info(`Deleted ${item.item_name} (depleted to 0 or below), added to cart`);
          } else {
            const updated = await Inventory.update(item.id, {
              quantity: parseFloat(newQuantity.toFixed(2)),
            });
            updatedItems.push(updated);
            logger.info(`Depleted ${item.item_name} by ${depletionAmount.toFixed(2)} to ${newQuantity.toFixed(2)} ${item.unit}`);
          }
        }
      }
    }
    
    // Smart shopping list additions based on depletion levels
    // Check remaining items (not consumed today) for potential cart additions
    const remainingItems = await Inventory.findByUser(userId);
    
    for (const item of remainingItems) {
      // Calculate depletion percentage
      let depletionScore = 0;
      
      if (item.predicted_runout) {
        const daysUntilRunout = (new Date(item.predicted_runout) - new Date()) / (1000 * 60 * 60 * 24);
        
        if (daysUntilRunout <= 0) {
          depletionScore = 1.0; // Already out or about to run out
        } else if (daysUntilRunout <= 3) {
          depletionScore = 0.8; // 80% chance if running out in 3 days
        } else if (daysUntilRunout <= 7) {
          depletionScore = 0.5; // 50% chance if running out in a week
        } else if (daysUntilRunout <= 14) {
          depletionScore = 0.2; // 20% chance if running out in 2 weeks
        } else {
          depletionScore = 0.05; // 5% chance otherwise
        }
      } else {
        // No predicted runout - use quantity-based heuristic
        if (item.quantity < 1) {
          depletionScore = 0.6;
        } else if (item.quantity < 3) {
          depletionScore = 0.3;
        } else {
          depletionScore = 0.1;
        }
      }
      
      // Add random element to prevent deterministic behavior
      if (Math.random() < depletionScore) {
        // Check if item is already in cart to avoid duplicates
        const existingCartItems = await Cart.findByUser(userId);
        const alreadyInCart = existingCartItems.some(cartItem => 
          cartItem.item_name.toLowerCase() === item.item_name.toLowerCase()
        );
        
        if (!alreadyInCart && !cartAddedItems.includes(item.item_name)) {
          await Cart.addItem({
            user_id: userId,
            item_name: item.item_name,
            quantity: 1,
            unit: item.unit,
            category: item.category,
            source: 'simulation',
          });
          cartAddedItems.push(item.item_name);
          logger.info(`Added ${item.item_name} to cart (depletion score: ${depletionScore.toFixed(2)})`);
        }
      }
    }
    
    // Get low inventory items (for informational purposes)
    const lowItems = await Inventory.findLowInventory(userId);
    
    logger.info(`Day simulation complete - ${updatedItems.length} items updated, ${deletedItems.length} items deleted, ${cartAddedItems.length} items added to cart, ${lowItems.length} items running low`);
    
    res.json({
      message: 'Day simulation complete with consistent consumption',
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
