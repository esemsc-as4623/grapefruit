/**
 * Inventory Matcher Service
 * Handles fuzzy matching of parsed items to existing inventory
 * Determines whether to update existing items or create new ones
 */

const { Inventory } = require('../models/db');
const { getItemMatchingPrompt, LLM_CONFIG } = require('../config/llm');
const { callLLMWithJSON } = require('./llmClient');
const logger = require('../utils/logger');

/**
 * LLM-based item matching
 * 
 * CONFIGURATION:
 * - System prompt: backend/prompts/item_matching.txt
 * - Model settings: backend/src/config/llm.js (LLM_CONFIG.itemMatching)
 * - To change model: Edit LLM_CONFIG.itemMatching.model
 * - To tune prompt: Edit backend/prompts/item_matching.txt
 * 
 * CURRENT MODEL: Configured in config/llm.js
 * PROVIDER: Configured in config/llm.js
 */

/**
 * Get system prompt for item matching
 * This now loads from backend/prompts/item_matching.txt
 * @deprecated Use getItemMatchingPrompt() from config/llm.js instead
 */
const ITEM_MATCHING_SYSTEM_PROMPT = getItemMatchingPrompt();

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1)
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Similarity score (0 = completely different, 1 = identical)
 */
function stringSimilarity(a, b) {
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();
  
  if (aNorm === bNorm) return 1.0;
  
  const distance = levenshteinDistance(aNorm, bNorm);
  const maxLength = Math.max(aNorm.length, bNorm.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Check if two units are compatible
 * @param {string} unit1 - First unit
 * @param {string} unit2 - Second unit
 * @returns {boolean} - True if units are compatible
 */
function unitsAreCompatible(unit1, unit2) {
  const u1 = unit1.toLowerCase();
  const u2 = unit2.toLowerCase();
  
  // Exact match
  if (u1 === u2) return true;
  
  // Volume units
  const volumeUnits = ['gallon', 'liter', 'milliliter', 'ounce'];
  if (volumeUnits.includes(u1) && volumeUnits.includes(u2)) return true;
  
  // Weight units
  const weightUnits = ['pound', 'ounce', 'gram', 'kilogram'];
  if (weightUnits.includes(u1) && weightUnits.includes(u2)) return true;
  
  // Count units
  const countUnits = ['count', 'piece', 'each'];
  if (countUnits.includes(u1) && countUnits.includes(u2)) return true;
  
  return false;
}

/**
 * Calculate match score between parsed item and inventory item
 * @param {object} parsedItem - Item from receipt
 * @param {object} inventoryItem - Existing inventory item
 * @returns {number} - Match score (0-1)
 */
function calculateMatchScore(parsedItem, inventoryItem) {
  let score = 0;
  
  // Name similarity (weighted 50%)
  const nameSimilarity = stringSimilarity(
    parsedItem.item_name,
    inventoryItem.item_name
  );
  score += nameSimilarity * 0.5;
  
  // Unit compatibility (weighted 30%)
  if (unitsAreCompatible(parsedItem.unit, inventoryItem.unit)) {
    score += 0.3;
  }
  
  // Category match (weighted 20%)
  if (parsedItem.category && inventoryItem.category) {
    if (parsedItem.category === inventoryItem.category) {
      score += 0.2;
    } else if (
      // Allow some category flexibility (dairy/beverages for milk)
      (parsedItem.category === 'dairy' && inventoryItem.category === 'beverages') ||
      (parsedItem.category === 'beverages' && inventoryItem.category === 'dairy')
    ) {
      score += 0.1;
    }
  }
  
  return score;
}

/**
 * Find best match for a parsed item in existing inventory
 * @param {object} parsedItem - Item from receipt
 * @param {Array} inventoryItems - All inventory items for user
 * @param {number} threshold - Minimum score to consider a match (default 0.6)
 * @returns {object|null} - Best match or null
 */
function findBestMatch(parsedItem, inventoryItems, threshold = 0.6) {
  let bestMatch = null;
  let bestScore = 0;
  const alternatives = [];
  
  for (const inventoryItem of inventoryItems) {
    const score = calculateMatchScore(parsedItem, inventoryItem);
    
    if (score > bestScore) {
      // Save previous best as alternative
      if (bestMatch && bestScore > threshold) {
        alternatives.push({ ...bestMatch, score: bestScore });
      }
      
      bestMatch = inventoryItem;
      bestScore = score;
    } else if (score > threshold) {
      // Save as alternative match
      alternatives.push({ ...inventoryItem, score });
    }
  }
  
  // Only return match if above threshold
  if (bestScore < threshold) {
    return null;
  }
  
  return {
    item: bestMatch,
    score: bestScore,
    alternatives: alternatives.sort((a, b) => b.score - a.score).slice(0, 3),
  };
}

/**
 * Match parsed items against existing inventory using LLM (ASI Cloud)
 * Falls back to fuzzy matching if LLM fails
 * 
 * CONFIGURATION: See backend/src/config/llm.js for model selection
 * PROMPT: See backend/prompts/item_matching.txt for system prompt
 * 
 * @param {object} parsedItem - Item from receipt
 * @param {Array} inventoryItems - Existing inventory
 * @returns {Promise<object>} - Match result
 */
async function matchWithLLM(parsedItem, inventoryItems) {
  const systemPrompt = getItemMatchingPrompt();
  const config = LLM_CONFIG.itemMatching;
  
  try {
    // Limit inventory items to same category for better performance
    const relevantItems = inventoryItems.filter(item => 
      item.category === parsedItem.category
    ).slice(0, 10); // Max 10 candidates
    
    const userPrompt = `
Parsed item from receipt:
${JSON.stringify(parsedItem, null, 2)}

Existing inventory items in database:
${relevantItems.map((item, idx) => `${idx + 1}. ${JSON.stringify({
  id: item.id,
  name: item.name,
  unit: item.unit,
  category: item.category,
  quantity: item.quantity
}, null, 2)}`).join('\n')}

Find the best match or indicate no match found.
`;
    
    logger.info('Calling LLM for item matching');
    
    const response = await callLLMWithJSON(
      userPrompt,
      systemPrompt,
      { 
        config,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      }
    );
    
    logger.info('LLM matching successful', { matched: !!response.matchedItem });
    
    return response;
    
  } catch (error) {
    logger.error('LLM matching failed, returning null:', error.message);
    return null;
  }
}

/**
 * Match multiple parsed items against inventory
 * @param {Array} parsedItems - Items from receipt
 * @param {string} userId - User ID to fetch inventory for
 * @param {object} options - Matching options
 * @returns {Promise<object>} - Matching results
 */
async function matchItems(parsedItems, userId = 'demo_user', options = {}) {
  try {
    const {
      useLLM = false,
      threshold = 0.6,
      autoApproveThreshold = 0.9,
    } = options;
    
    logger.info(`Matching ${parsedItems.length} items for user ${userId}`);
    
    // Fetch existing inventory
    const inventoryItems = await Inventory.findByUser(userId);
    logger.info(`Found ${inventoryItems.length} existing inventory items`);
    
    const results = {
      toUpdate: [],      // High confidence matches to update
      toCreate: [],      // New items to create
      needsReview: [],   // Uncertain matches requiring user input
    };
    
    for (const parsedItem of parsedItems) {
      // Try LLM matching first (if enabled)
      let match = null;
      if (useLLM && inventoryItems.length > 0) {
        match = await matchWithLLM(parsedItem, inventoryItems);
      }
      
      // Fallback to rule-based matching
      if (!match && inventoryItems.length > 0) {
        match = findBestMatch(parsedItem, inventoryItems, threshold);
      }
      
      if (!match) {
        // No match found - create new item
        results.toCreate.push({
          ...parsedItem,
          action: 'create',
          confidence: 1.0,
        });
      } else if (match.score >= autoApproveThreshold) {
        // High confidence match - auto-update
        results.toUpdate.push({
          ...parsedItem,
          action: 'update',
          inventoryItem: match.item,
          matchScore: match.score,
          newQuantity: parseFloat(match.item.quantity) + parseFloat(parsedItem.quantity),
        });
      } else {
        // Medium confidence - needs review
        results.needsReview.push({
          ...parsedItem,
          action: 'review',
          inventoryItem: match.item,
          matchScore: match.score,
          alternatives: match.alternatives,
          suggestedQuantity: match.item.quantity + parsedItem.quantity,
        });
      }
    }
    
    const summary = {
      total: parsedItems.length,
      toUpdate: results.toUpdate.length,
      toCreate: results.toCreate.length,
      needsReview: results.needsReview.length,
    };
    
    logger.info('Matching completed', summary);
    
    return {
      ...results,
      summary,
    };
    
  } catch (error) {
    logger.error('Error matching items:', error);
    throw error;
  }
}

/**
 * Apply matched items to inventory
 * @param {object} matchResults - Results from matchItems()
 * @param {string} userId - User ID
 * @returns {Promise<object>} - Applied changes summary
 */
async function applyToInventory(matchResults, userId = 'demo_user') {
  try {
    const consumptionLearner = require('./consumptionLearner');
    
    const results = {
      updated: [],
      created: [],
      errors: [],
    };
    
    // Update existing items
    for (const item of matchResults.toUpdate) {
      try {
        const inventoryItem = item.inventoryItem;
        
        // Record the purchase event (negative consumption = purchase)
        await consumptionLearner.recordConsumptionEvent({
          userId,
          itemName: inventoryItem.item_name,
          quantityBefore: inventoryItem.quantity,
          quantityAfter: item.newQuantity,
          eventType: 'purchase',
          source: 'receipt_scan',
          unit: inventoryItem.unit,
          category: inventoryItem.category,
          itemCreatedAt: inventoryItem.created_at,
        });
        
        const updated = await Inventory.update(inventoryItem.id, {
          quantity: item.newQuantity,
          last_purchase_date: new Date(),
          last_purchase_quantity: item.quantity,
        });
        
        // Learn and update consumption rate for this item
        const learningResult = await consumptionLearner.learnConsumptionRate(
          userId,
          inventoryItem.item_name,
          {
            category: inventoryItem.category,
            unit: inventoryItem.unit,
            daysInInventory: (Date.now() - new Date(inventoryItem.created_at).getTime()) / (1000 * 60 * 60 * 24),
          }
        );
        
        // Update consumption rate if we got a good estimate
        if (learningResult.rate && learningResult.confidence !== 'very_low') {
          await Inventory.update(inventoryItem.id, {
            average_daily_consumption: learningResult.rate,
          });
        }
        
        results.updated.push(updated);
      } catch (error) {
        logger.error(`Error updating item ${item.inventoryItem.id}:`, error);
        results.errors.push({
          item,
          error: error.message,
        });
      }
    }
    
    // Create new items
    for (const item of matchResults.toCreate) {
      try {
        const created = await Inventory.create({
          user_id: userId,
          item_name: item.item_name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          average_daily_consumption: 0, // Will be calculated over time
          last_purchase_date: new Date(),
          last_purchase_quantity: item.quantity,
        });
        results.created.push(created);
      } catch (error) {
        logger.error(`Error creating item ${item.item_name}:`, error);
        results.errors.push({
          item,
          error: error.message,
        });
      }
    }
    
    logger.info('Applied to inventory', {
      updated: results.updated.length,
      created: results.created.length,
      errors: results.errors.length,
    });
    
    return results;
    
  } catch (error) {
    logger.error('Error applying to inventory:', error);
    throw error;
  }
}

module.exports = {
  matchItems,
  applyToInventory,
  findBestMatch,
  calculateMatchScore,
  stringSimilarity,
  unitsAreCompatible,
  ITEM_MATCHING_SYSTEM_PROMPT,
};
