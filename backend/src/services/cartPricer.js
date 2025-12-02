/**
 * Cart Pricer Service
 * Uses LLM to suggest reasonable quantities and prices for grocery items
 */

const { callASICloud } = require('./llmClient');
const { LLM_CONFIG, getCartPricingPrompt } = require('../config/llm');
const logger = require('../utils/logger');

/**
 * Suggest quantity and price for a cart item using LLM
 * @param {string} itemName - Name of the grocery item
 * @param {string} category - Optional category hint
 * @returns {Promise<Object>} Suggested quantity, price, and metadata
 */
async function suggestPriceAndQuantity(itemName, category = null) {
  try {
    logger.info(`Suggesting price and quantity for: ${itemName}`);
    
    // Build the user prompt
    let userPrompt = `Item: ${itemName}`;
    if (category) {
      userPrompt += `\nCategory: ${category}`;
    }
    
    // Get system prompt
    const systemPrompt = getCartPricingPrompt();
    
    // Call LLM
    const response = await callASICloud(
      userPrompt,
      systemPrompt,
      {
        config: LLM_CONFIG.cartPricing,
        model: LLM_CONFIG.cartPricing.model,
        temperature: LLM_CONFIG.cartPricing.temperature,
        maxTokens: LLM_CONFIG.cartPricing.maxTokens,
      }
    );
    
    // Parse JSON response
    const parsed = parseCartPricingResponse(response);
    
    if (!parsed) {
      logger.warn(`Failed to parse LLM response for ${itemName}, using fallback`);
      return getFallbackPricing(itemName, category);
    }
    
    logger.info(`LLM pricing suggestion for ${itemName}:`, {
      quantity: parsed.suggested_quantity,
      unit: parsed.unit,
      price: parsed.estimated_price_per_unit,
      total: parsed.total_price,
      confidence: parsed.confidence,
    });
    
    return {
      suggested_quantity: parsed.suggested_quantity,
      unit: parsed.unit,
      estimated_price_per_unit: parsed.estimated_price_per_unit,
      total_price: parsed.total_price,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      source: 'llm',
    };
    
  } catch (error) {
    logger.error('Error in LLM cart pricing:', error);
    // Fallback to rule-based pricing
    return getFallbackPricing(itemName, category);
  }
}

/**
 * Parse LLM response for cart pricing
 * @param {string} response - Raw LLM response
 * @returns {Object|null} Parsed pricing data or null if invalid
 */
function parseCartPricingResponse(response) {
  try {
    // Clean response - remove markdown code blocks if present
    let cleaned = response.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```\n?/g, '');
    }
    
    const parsed = JSON.parse(cleaned);
    
    // Validate required fields
    if (
      typeof parsed.suggested_quantity !== 'number' ||
      typeof parsed.unit !== 'string' ||
      typeof parsed.estimated_price_per_unit !== 'number' ||
      typeof parsed.total_price !== 'number' ||
      typeof parsed.confidence !== 'number'
    ) {
      logger.warn('Invalid LLM pricing response structure:', parsed);
      return null;
    }
    
    // Validate ranges
    if (
      parsed.suggested_quantity <= 0 ||
      parsed.estimated_price_per_unit < 0 ||
      parsed.total_price < 0 ||
      parsed.confidence < 0 ||
      parsed.confidence > 1
    ) {
      logger.warn('Invalid LLM pricing values:', parsed);
      return null;
    }
    
    return parsed;
    
  } catch (error) {
    logger.warn('Failed to parse LLM pricing response:', error.message);
    return null;
  }
}

/**
 * Fallback rule-based pricing when LLM fails
 * @param {string} itemName - Name of the grocery item
 * @param {string} category - Optional category
 * @returns {Object} Fallback pricing data
 */
function getFallbackPricing(itemName, category = null) {
  logger.info(`Using fallback pricing for: ${itemName}`);
  
  const normalizedName = itemName.toLowerCase();
  const cat = category?.toLowerCase();
  
  // Rule-based pricing by category and common items
  let quantity = 1;
  let unit = 'count';
  let pricePerUnit = 5.99; // Default price
  
  // Dairy products
  if (cat === 'dairy' || normalizedName.includes('milk')) {
    if (normalizedName.includes('milk')) {
      quantity = 1;
      unit = 'gallon';
      pricePerUnit = 4.29;
    } else if (normalizedName.includes('yogurt')) {
      quantity = 32;
      unit = 'ounce';
      pricePerUnit = 0.19;
    } else if (normalizedName.includes('cheese')) {
      quantity = 8;
      unit = 'ounce';
      pricePerUnit = 0.50;
    } else if (normalizedName.includes('butter')) {
      quantity = 1;
      unit = 'pound';
      pricePerUnit = 4.99;
    }
  }
  
  // Produce
  else if (cat === 'produce') {
    if (normalizedName.includes('banana')) {
      quantity = 3;
      unit = 'pound';
      pricePerUnit = 0.59;
    } else if (normalizedName.includes('apple') || normalizedName.includes('orange')) {
      quantity = 3;
      unit = 'pound';
      pricePerUnit = 1.99;
    } else if (normalizedName.includes('lettuce') || normalizedName.includes('salad')) {
      quantity = 1;
      unit = 'head';
      pricePerUnit = 2.49;
    } else if (normalizedName.includes('tomato')) {
      quantity = 2;
      unit = 'pound';
      pricePerUnit = 2.99;
    } else if (normalizedName.includes('potato')) {
      quantity = 5;
      unit = 'pound';
      pricePerUnit = 0.79;
    } else {
      // Generic produce
      quantity = 1;
      unit = 'pound';
      pricePerUnit = 2.99;
    }
  }
  
  // Meat
  else if (cat === 'meat') {
    if (normalizedName.includes('chicken')) {
      quantity = 2;
      unit = 'pound';
      pricePerUnit = 4.99;
    } else if (normalizedName.includes('beef') || normalizedName.includes('steak')) {
      quantity = 1.5;
      unit = 'pound';
      pricePerUnit = 7.99;
    } else if (normalizedName.includes('pork')) {
      quantity = 2;
      unit = 'pound';
      pricePerUnit = 4.49;
    } else if (normalizedName.includes('ground')) {
      quantity = 1;
      unit = 'pound';
      pricePerUnit = 5.99;
    } else {
      quantity = 1;
      unit = 'pound';
      pricePerUnit = 6.99;
    }
  }
  
  // Eggs
  else if (normalizedName.includes('egg')) {
    quantity = 12;
    unit = 'count';
    pricePerUnit = 0.29; // Per egg
  }
  
  // Bread
  else if (cat === 'bread' || normalizedName.includes('bread')) {
    quantity = 1;
    unit = 'loaf';
    pricePerUnit = 2.99;
  }
  
  // Pantry staples
  else if (cat === 'pantry') {
    if (normalizedName.includes('pasta') || normalizedName.includes('spaghetti')) {
      quantity = 1;
      unit = 'pound';
      pricePerUnit = 1.99;
    } else if (normalizedName.includes('rice')) {
      quantity = 2;
      unit = 'pound';
      pricePerUnit = 1.49;
    } else if (normalizedName.includes('beans') || normalizedName.includes('can')) {
      quantity = 1;
      unit = 'can';
      pricePerUnit = 1.29;
    } else if (normalizedName.includes('cereal')) {
      quantity = 1;
      unit = 'box';
      pricePerUnit = 4.49;
    } else {
      quantity = 1;
      unit = 'package';
      pricePerUnit = 3.99;
    }
  }
  
  // Calculate total
  const totalPrice = quantity * pricePerUnit;
  
  return {
    suggested_quantity: quantity,
    unit: unit,
    estimated_price_per_unit: pricePerUnit,
    total_price: parseFloat(totalPrice.toFixed(2)),
    confidence: 0.6, // Lower confidence for fallback
    reasoning: 'Rule-based fallback pricing (LLM unavailable)',
    source: 'fallback',
  };
}

module.exports = {
  suggestPriceAndQuantity,
  getFallbackPricing,
  parseCartPricingResponse,
};
