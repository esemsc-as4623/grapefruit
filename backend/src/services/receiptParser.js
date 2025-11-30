/**
 * Receipt Parser Service
 * Orchestrates parsing of receipt text into structured items using LLM
 */

const { parseReceiptLine, normalizeItems, mergeItems } = require('../utils/itemNormalizer');
const { categorizeItems, isGroceryItem } = require('../utils/categoryInference');
const { getReceiptParsingPrompt, LLM_CONFIG } = require('../config/llm');
const { callLLMWithJSON } = require('./llmClient');
const logger = require('../utils/logger');

/**
 * LLM-based receipt parsing
 * 
 * CONFIGURATION:
 * - System prompt: backend/prompts/receipt_parsing.txt
 * - Model settings: backend/src/config/llm.js (LLM_CONFIG.receiptParsing)
 * - To change model: Edit LLM_CONFIG.receiptParsing.model
 * - To tune prompt: Edit backend/prompts/receipt_parsing.txt
 * 
 * CURRENT MODEL: ${() => LLM_CONFIG.receiptParsing.model}
 * PROVIDER: ${() => LLM_CONFIG.receiptParsing.provider}
 */

/**
 * Get system prompt for receipt parsing
 * This now loads from backend/prompts/receipt_parsing.txt
 * @deprecated Use getReceiptParsingPrompt() from config/llm.js instead
 */
const RECEIPT_PARSING_SYSTEM_PROMPT = getReceiptParsingPrompt();

/**
 * Parse receipt text using LLM (ASI Cloud)
 * Throws error if LLM fails (caller handles fallback)
 * 
 * BEST PRACTICES APPLIED:
 * - Simple, clear prompts (see prompts/receipt_parsing.txt)
 * - Limited max_tokens to avoid runaway generations
 * - Retry logic with exponential backoff (in llmClient.js)
 * - Token usage and latency tracking
 * - System/user message separation for clarity
 * 
 * DEBUGGING:
 * - Set LLM_DEBUG=true in .env to see full LLM responses
 * - Check logs/combined.log for raw responses and metrics
 * - Monitor token usage in log output
 * 
 * @param {string} receiptText - Raw receipt text
 * @returns {Promise<Array>} - Array of parsed items
 */
async function parseWithLLM(receiptText) {
  const systemPrompt = getReceiptParsingPrompt();
  const config = LLM_CONFIG.receiptParsing;
  
  // Limit input length to avoid excessive token usage
  const maxInputLength = 10000; // ~2500 tokens
  const truncatedText = receiptText.length > maxInputLength 
    ? receiptText.substring(0, maxInputLength) + '\n[...truncated]'
    : receiptText;
  
  if (receiptText.length > maxInputLength) {
    logger.warn('Receipt text truncated for LLM processing', {
      original: receiptText.length,
      truncated: truncatedText.length,
    });
  }
  
  logger.info('Calling LLM for receipt parsing', {
    model: config.model,
    textLength: truncatedText.length,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });
  
  // Construct user prompt with context
  const userPrompt = `Parse this grocery receipt and extract ONLY actual food/grocery items.
Return JSON with an "items" array. Do not include store info, totals, or fees.

Receipt text:
${truncatedText}`;
  
  const response = await callLLMWithJSON(
    userPrompt,
    systemPrompt,
    { 
      config,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
    }
  );
  
  logger.info('LLM parsing successful', { 
    itemCount: response.items?.length,
    avgConfidence: response.items?.reduce((sum, item) => sum + (item.confidence || 0), 0) / (response.items?.length || 1),
  });
  
  // Validate response structure
  if (!response.items || !Array.isArray(response.items)) {
    throw new Error('Invalid LLM response format: missing items array');
  }
  
  return response.items;
}


/**
 * Rule-based parsing fallback (when LLM is not available)
 * @param {string} receiptText - Raw receipt text
 * @returns {Array} - Array of parsed items
 */
function parseWithRules(receiptText) {
  const lines = receiptText.split('\n');
  const items = [];
  let currentDepartment = null;
  
  for (const line of lines) {
    // Check for department headers
    const deptMatch = line.match(/^DEPT(?:ARTMENT)?:\s*(.+)$/i) || 
                      line.match(/^FROM\s+(.+):$/i);
    if (deptMatch) {
      currentDepartment = deptMatch[1].trim();
      continue;
    }
    
    // Try to parse as item line
    const parsed = parseReceiptLine(line, { department: currentDepartment });
    if (parsed && parsed.item_name && parsed.item_name.length > 2) {
      // Add confidence score based on line quality
      const confidence = calculateConfidence(line, parsed);
      items.push({
        ...parsed,
        confidence,
      });
    }
  }
  
  return items;
}

/**
 * Calculate confidence score for parsed item
 * @param {string} rawLine - Original receipt line
 * @param {object} parsedItem - Parsed item data
 * @returns {number} - Confidence score (0.0 to 1.0)
 */
function calculateConfidence(rawLine, parsedItem) {
  let score = 0.5; // Base score
  
  // Increase confidence if line contains price
  if (/\$\d+\.?\d*/.test(rawLine)) {
    score += 0.2;
  }
  
  // Increase if quantity/unit detected
  if (parsedItem.quantity > 0 && parsedItem.unit) {
    score += 0.15;
  }
  
  // Decrease if item name is very short (likely parsing error)
  if (parsedItem.item_name.length < 3) {
    score -= 0.3;
  }
  
  // Decrease if contains garbled characters (█, �, etc.)
  if (/[█�]/.test(rawLine)) {
    score -= 0.4;
  }
  
  // Increase if item name looks like real words
  const wordCount = parsedItem.item_name.split(/\s+/).length;
  if (wordCount >= 2 && wordCount <= 5) {
    score += 0.15;
  }
  
  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, score));
}

/**
 * Main parsing function - orchestrates the full pipeline
 * @param {string} receiptText - Raw receipt text
 * @param {object} options - Parsing options
 * @returns {Promise<object>} - Parsed result with items and metadata
 */
async function parseReceipt(receiptText, options = {}) {
  try {
    const {
      useLLM = true,
      minConfidence = 0.5,
      filterNonGrocery = true,
      mergeQuantities = true,
    } = options;
    
    logger.info('Starting receipt parsing', { textLength: receiptText.length });
    
    // Step 1: Parse with LLM or rules (with fallback)
    let items;
    let method;
    
    if (useLLM) {
      try {
        items = await parseWithLLM(receiptText);
        method = 'llm';
      } catch (error) {
        logger.error('LLM parsing failed, falling back to rules:', error.message);
        items = parseWithRules(receiptText);
        method = 'rules-fallback';
      }
    } else {
      items = parseWithRules(receiptText);
      method = 'rules';
    }
    
    logger.info(`Parsed ${items.length} raw items using ${method}`);
    
    // Step 2: Normalize items (clean names, standardize units)
    items = normalizeItems(items);
    
    // Step 3: Categorize items
    items = categorizeItems(items);
    
    // Step 4: Filter by confidence
    const lowConfidenceItems = items.filter(item => item.confidence < minConfidence);
    items = items.filter(item => item.confidence >= minConfidence);
    
    // Step 5: Filter non-grocery items (optional)
    if (filterNonGrocery) {
      items = items.filter(item => item.isGrocery !== false);
    }
    
    // Step 6: Merge duplicate items (optional)
    if (mergeQuantities) {
      items = mergeItems(items);
    }
    
    // Calculate statistics
    const stats = {
      totalParsed: items.length + lowConfidenceItems.length,
      highConfidence: items.length,
      needsReview: lowConfidenceItems.length,
      avgConfidence: items.length > 0
        ? items.reduce((sum, item) => sum + (item.confidence || 0), 0) / items.length
        : 0,
      categories: [...new Set(items.map(item => item.category))],
    };
    
    logger.info('Receipt parsing completed', stats);
    
    return {
      items,
      needsReview: lowConfidenceItems,
      stats,
      method,  // 'llm' or 'rules'
      success: true,
    };
    
  } catch (error) {
    logger.error('Error parsing receipt:', error);
    throw error;
  }
}

/**
 * Extract vendor information from receipt text
 * @param {string} receiptText - Raw receipt text
 * @returns {object} - Vendor info (name, date, order_id, etc.)
 */
function extractMetadata(receiptText) {
  const metadata = {
    vendor: null,
    date: null,
    order_id: null,
    total: null,
  };
  
  const lines = receiptText.split('\n').slice(0, 20); // Check first 20 lines
  
  // Common vendor patterns
  const vendorPatterns = [
    /amazon\s+fresh/i,
    /walmart/i,
    /target/i,
    /costco/i,
    /trader\s+joe'?s/i,
    /whole\s+foods/i,
    /kroger/i,
    /safeway/i,
  ];
  
  for (const line of lines) {
    // Vendor detection
    if (!metadata.vendor) {
      for (const pattern of vendorPatterns) {
        if (pattern.test(line)) {
          metadata.vendor = line.trim();
          break;
        }
      }
    }
    
    // Date extraction
    if (!metadata.date) {
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (dateMatch) {
        metadata.date = dateMatch[1];
      }
    }
    
    // Order ID
    if (!metadata.order_id) {
      const orderMatch = line.match(/order\s*#?:?\s*([A-Z0-9-]+)/i);
      if (orderMatch) {
        metadata.order_id = orderMatch[1];
      }
    }
  }
  
  // Total extraction (usually near bottom)
  const totalMatch = receiptText.match(/TOTAL\s+\$?(\d+\.?\d*)/i);
  if (totalMatch) {
    metadata.total = parseFloat(totalMatch[1]);
  }
  
  return metadata;
}

module.exports = {
  parseReceipt,
  extractMetadata,
  parseWithLLM,
  parseWithRules,
  calculateConfidence,
  RECEIPT_PARSING_SYSTEM_PROMPT,
};
