/**
 * Cart Pricer Service
 * 
 * PURPOSE: Uses LLM to suggest reasonable QUANTITIES and UNITS for grocery items
 * 
 * RESPONSIBILITY SEPARATION:
 * - cartPricer.js (THIS FILE): Suggests quantity, unit, category using AI intelligence
 * - priceService.js: Fetches authoritative prices from amazon_catalog database
 * 
 * WHY BOTH?
 * - LLM provides context-aware suggestions ("buy 1 gallon of milk for a household")
 * - Catalog provides accurate, real-time pricing (no hallucination)
 * - Cost-effective: LLM only for intelligence, not price lookups
 * 
 * WORKFLOW:
 * 1. cartPricer suggests: quantity=1, unit="gallon", category="DAIRY"
 * 2. priceService fetches: price=$4.29 from amazon_catalog
 * 3. Backend combines both for final cart item
 */

const { callASICloud } = require('./llmClient');
const { LLM_CONFIG, getCartPricingPrompt } = require('../config/llm');
const logger = require('../utils/logger');

/**
 * Suggest quantity, unit, and category for a cart item using LLM
 * 
 * NOTE: Price is estimated by LLM but should be OVERRIDDEN by priceService
 * in the backend route handler. The LLM price is only for fallback/testing.
 * 
 * @param {string} itemName - Name of the grocery item
 * @param {string} category - Optional category hint
 * @returns {Promise<Object>} Suggested quantity, unit, category, and estimated price
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
    
    logger.info(`LLM suggestion for ${itemName}:`, {
      quantity: parsed.suggested_quantity,
      unit: parsed.unit,
      category: parsed.category,
      confidence: parsed.confidence,
      note: 'Price will be fetched from catalog, not used from LLM'
    });
    
    return {
      // PRIMARY OUTPUTS (what we actually use from LLM)
      suggested_quantity: parsed.suggested_quantity,
      unit: parsed.unit,
      category: parsed.category || category, // Use LLM category or fallback to provided
      
      // METADATA (for logging/debugging)
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      source: 'llm',
      
      // DEPRECATED (use priceService instead)
      // These are kept for backward compatibility but should be overridden
      estimated_price_per_unit: parsed.estimated_price_per_unit,
      total_price: parsed.total_price,
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
    
    // Validate required fields (including category)
    if (
      typeof parsed.suggested_quantity !== 'number' ||
      typeof parsed.unit !== 'string' ||
      typeof parsed.category !== 'string' ||
      typeof parsed.estimated_price_per_unit !== 'number' ||
      typeof parsed.total_price !== 'number' ||
      typeof parsed.confidence !== 'number'
    ) {
      logger.warn('Invalid LLM pricing response structure:', parsed);
      return null;
    }
    
    // Validate category is uppercase
    if (parsed.category !== parsed.category.toUpperCase()) {
      logger.warn('Category not uppercase, normalizing:', parsed.category);
      parsed.category = parsed.category.toUpperCase();
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
  let cat = category?.toUpperCase() || null;
  
  // Rule-based pricing by category and common items
  let quantity = 1;
  let unit = 'count';
  let pricePerUnit = 3.99; // Default price (changed from $5.99 for diversity)
  
  // Dairy products
  if (cat === 'DAIRY' || normalizedName.includes('milk') || normalizedName.includes('cheese') || 
      normalizedName.includes('yogurt') || normalizedName.includes('butter') || normalizedName.includes('cream')) {
    cat = 'DAIRY';
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
    } else if (normalizedName.includes('cream')) {
      quantity = 1;
      unit = 'pint';
      pricePerUnit = 3.29;
    }
  }
  
  // Produce
  else if (cat === 'PRODUCE' || normalizedName.includes('banana') || normalizedName.includes('apple') ||
           normalizedName.includes('lettuce') || normalizedName.includes('tomato') || normalizedName.includes('potato')) {
    cat = 'PRODUCE';
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
      pricePerUnit = 2.49;
    }
  }
  
  // Meat
  else if (cat === 'MEAT' || normalizedName.includes('chicken') || normalizedName.includes('beef') ||
           normalizedName.includes('pork') || normalizedName.includes('lamb') || normalizedName.includes('turkey')) {
    cat = 'MEAT';
    if (normalizedName.includes('chicken breast')) {
      quantity = 2;
      unit = 'pound';
      pricePerUnit = 4.99;
    } else if (normalizedName.includes('chicken thigh')) {
      quantity = 2;
      unit = 'pound';
      pricePerUnit = 3.49;
    } else if (normalizedName.includes('chicken')) {
      quantity = 2;
      unit = 'pound';
      pricePerUnit = 4.29;
    } else if (normalizedName.includes('lamb')) {
      quantity = 2;
      unit = 'pound';
      pricePerUnit = 8.99;
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
      pricePerUnit = 5.49;
    } else {
      quantity = 1;
      unit = 'pound';
      pricePerUnit = 6.49;
    }
  }
  
  // Eggs
  else if (normalizedName.includes('egg')) {
    cat = 'DAIRY';
    quantity = 12;
    unit = 'count';
    pricePerUnit = 0.29; // Per egg
  }
  
  // Bakery
  else if (cat === 'BAKERY' || normalizedName.includes('bread') || normalizedName.includes('bagel') ||
           normalizedName.includes('baguette') || normalizedName.includes('croissant')) {
    cat = 'BAKERY';
    if (normalizedName.includes('bread')) {
      quantity = 1;
      unit = 'loaf';
      pricePerUnit = 2.99;
    } else if (normalizedName.includes('bagel')) {
      quantity = 6;
      unit = 'count';
      pricePerUnit = 0.50;
    } else if (normalizedName.includes('baguette')) {
      quantity = 1;
      unit = 'each';
      pricePerUnit = 3.49;
    } else if (normalizedName.includes('croissant')) {
      quantity = 4;
      unit = 'count';
      pricePerUnit = 0.99;
    }
  }
  
  // Pantry staples
  else if (cat === 'PANTRY' || normalizedName.includes('pasta') || normalizedName.includes('rice') ||
           normalizedName.includes('beans') || normalizedName.includes('cereal')) {
    cat = 'PANTRY';
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
      pricePerUnit = 3.49;
    }
  }
  
  // Default to OTHERS if no category matched
  if (!cat) {
    cat = 'OTHERS';
  }
  
  // Calculate total
  const totalPrice = quantity * pricePerUnit;
  
  return {
    suggested_quantity: quantity,
    unit: unit,
    estimated_price_per_unit: pricePerUnit,
    total_price: parseFloat(totalPrice.toFixed(2)),
    category: cat,
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
