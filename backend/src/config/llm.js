/**
 * LLM Configuration and Prompt Management
 * 
 * This module centralizes all LLM-related configuration:
 * - System prompts (loaded from prompts/ directory)
 * - Model selection and parameters
 * - API endpoints and credentials
 * 
 * To change LLM behavior, update this file instead of modifying individual services.
 */

const fs = require('fs');
const path = require('path');

// ============================================
// MODEL CONFIGURATION
// ============================================

/**
 * Primary LLM configuration
 * Change these values to use different models or providers
 */
const LLM_CONFIG = {
  // Model selection for receipt parsing
  receiptParsing: {
    model: process.env.ASI_MODEL || 'asi1-mini',
    provider: 'openai-compatible',   // ASI Cloud uses OpenAI-compatible API
    endpoint: process.env.ASI_BASE_URL || 'https://inference.asicloud.cudos.org/v1',
    apiKey: process.env.ASI_API_KEY,
    
    // Production-optimized parameters
    temperature: 0.1,                // Low temperature for deterministic, structured output
    maxTokens: 1500,                 // Cap response length (typical receipt: 500-1000 tokens)
    topP: 0.95,                      // Probability mass cutoff for focused sampling
    
    // Response format (not all models support this)
    // responseFormat: { type: 'json_object' },
  },
  
  // Model selection for item matching
  itemMatching: {
    model: process.env.ASI_MODEL || 'asi1-mini',
    provider: 'openai-compatible',
    endpoint: process.env.ASI_BASE_URL || 'https://inference.asicloud.cudos.org/v1',
    apiKey: process.env.ASI_API_KEY,
    
    temperature: 0.3,                // Slightly higher for semantic matching flexibility
    maxTokens: 500,                  // Short responses for yes/no matching
    topP: 0.9,
  },
  
  // Fallback configuration
  fallback: {
    enabled: true,                   // Always fall back to rule-based if LLM fails
    logErrors: true,                 // Log LLM failures for debugging
  },
  
  // Performance optimization
  caching: {
    enabled: true,                   // Cache identical prompts (future enhancement)
    ttl: 3600,                       // Cache TTL in seconds (1 hour)
  },
  
  // Batch processing (future enhancement)
  batch: {
    enabled: false,                  // Batch multiple items in one call
    maxBatchSize: 10,                // Max items per batch
  },
  
  // Monitoring and debugging
  monitoring: {
    logRawResponses: process.env.LLM_DEBUG === 'true',  // Set LLM_DEBUG=true to see full responses
    logTokenUsage: true,             // Track token consumption
    logLatency: true,                // Track API call timing
  },
};

// ============================================
// ALTERNATIVE MODEL CONFIGURATIONS
// ============================================

/**
 * Uncomment and modify LLM_CONFIG above to use these alternatives:
 * 
 * // Phi-3 Mini (better accuracy, slower)
 * receiptParsing: {
 *   model: 'phi3:mini',
 *   provider: 'ollama',
 *   temperature: 0.1,
 *   maxTokens: 2048,
 * }
 * 
 * // Gemma 2 (good balance)
 * receiptParsing: {
 *   model: 'gemma2:2b',
 *   provider: 'ollama',
 *   temperature: 0.1,
 *   maxTokens: 2048,
 * }
 * 
 * // Qwen2.5 (multilingual support)
 * receiptParsing: {
 *   model: 'qwen2.5:1.5b',
 *   provider: 'ollama',
 *   temperature: 0.1,
 *   maxTokens: 2048,
 * }
 * 
 * // OpenAI GPT-4 (cloud, requires API key)
 * receiptParsing: {
 *   model: 'gpt-4-turbo',
 *   provider: 'openai',
 *   endpoint: 'https://api.openai.com/v1/chat/completions',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   temperature: 0.1,
 *   maxTokens: 2048,
 * }
 */

// ============================================
// SYSTEM PROMPTS
// ============================================

/**
 * Load system prompts from text files
 * This allows easy editing without touching code
 */
const PROMPTS_DIR = path.join(__dirname, '../../prompts');  // Go up two levels: config → src → backend

let SYSTEM_PROMPTS = {};

/**
 * Load all system prompts from prompts/ directory
 */
function loadPrompts() {
  try {
    // Receipt parsing prompt
    const receiptParsingPath = path.join(PROMPTS_DIR, 'receipt_parsing.txt');
    if (fs.existsSync(receiptParsingPath)) {
      const content = fs.readFileSync(receiptParsingPath, 'utf-8');
      // Extract prompt after the marker line
      const marker = '# SYSTEM PROMPT BELOW (copy everything after this line)';
      const parts = content.split(marker);
      SYSTEM_PROMPTS.receiptParsing = parts[1] ? parts[1].trim() : content;
    }
    
    // Item matching prompt
    const itemMatchingPath = path.join(PROMPTS_DIR, 'item_matching.txt');
    if (fs.existsSync(itemMatchingPath)) {
      const content = fs.readFileSync(itemMatchingPath, 'utf-8');
      const marker = '# SYSTEM PROMPT BELOW (copy everything after this line)';
      const parts = content.split(marker);
      SYSTEM_PROMPTS.itemMatching = parts[1] ? parts[1].trim() : content;
    }
    
    console.log('✓ Loaded system prompts:', Object.keys(SYSTEM_PROMPTS));
  } catch (error) {
    console.error('Error loading prompts:', error);
    // Use inline fallbacks if file loading fails
    SYSTEM_PROMPTS.receiptParsing = getDefaultReceiptParsingPrompt();
    SYSTEM_PROMPTS.itemMatching = getDefaultItemMatchingPrompt();
  }
}

/**
 * Default fallback prompts (in case files aren't available)
 */
function getDefaultReceiptParsingPrompt() {
  return `You are a specialized receipt parser for grocery shopping. Extract grocery items from receipt text and return them as a JSON array. For each item include: item_name, quantity, unit, department, confidence (0-1), and raw_line. Skip non-grocery items like fees, taxes, and totals. Normalize units (gal→gallon, lb→pound, etc.). Return only valid JSON.`;
}

function getDefaultItemMatchingPrompt() {
  return `You are an expert at matching grocery items. Given a parsed item and inventory items, find the best match. Consider semantic similarity and unit compatibility. Return JSON with: match_found, inventory_id, confidence, reason, suggested_action, and alternative_matches. Confidence >0.9 for exact matches, 0.6-0.9 for probable matches, <0.6 for no match.`;
}

// Load prompts on module initialization
loadPrompts();

// ============================================
// PROMPT GETTERS
// ============================================

/**
 * Get receipt parsing system prompt
 * @returns {string} System prompt for receipt parsing
 */
function getReceiptParsingPrompt() {
  return SYSTEM_PROMPTS.receiptParsing || getDefaultReceiptParsingPrompt();
}

/**
 * Get item matching system prompt
 * @returns {string} System prompt for item matching
 */
function getItemMatchingPrompt() {
  return SYSTEM_PROMPTS.itemMatching || getDefaultItemMatchingPrompt();
}

/**
 * Reload prompts from disk (useful for hot-reloading during development)
 */
function reloadPrompts() {
  loadPrompts();
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  LLM_CONFIG,
  getReceiptParsingPrompt,
  getItemMatchingPrompt,
  reloadPrompts,
  SYSTEM_PROMPTS, // For debugging/testing
};
