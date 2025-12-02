/**
 * LLM Client for ASI Cloud (OpenAI-compatible API)
 * Handles all LLM API calls with proper error handling, retries, and caching
 */

const axios = require('axios');
const crypto = require('crypto');
const { LLM_CONFIG } = require('../config/llm');
const logger = require('../utils/logger');
const db = require('../config/database');

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second
const RETRY_BACKOFF = 2; // Exponential backoff multiplier

// Cache configuration
const CACHE_TTL_DAYS = 30; // Cache responses for 30 days
const ENABLE_CACHE = process.env.LLM_CACHE_ENABLED !== 'false'; // Enabled by default

/**
 * Sleep helper for retries
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate cache key from prompt and configuration
 */
function generateCacheKey(systemPrompt, userPrompt, model, temperature) {
  const hash = crypto.createHash('sha256');
  hash.update(`${systemPrompt}||${userPrompt}||${model}||${temperature || 0}`);
  return hash.digest('hex');
}

/**
 * Generate hash for a single prompt
 */
function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(prompt).digest('hex');
}

/**
 * Check cache for existing LLM response
 */
async function getCachedResponse(cacheKey) {
  if (!ENABLE_CACHE) {
    return null;
  }

  try {
    const query = `
      SELECT response, tokens_used, hit_count 
      FROM llm_cache 
      WHERE cache_key = $1 
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `;
    
    const result = await db.query(query, [cacheKey]);
    
    if (result.rows.length > 0) {
      // Update hit count and last used timestamp
      await db.query(
        `UPDATE llm_cache 
         SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP 
         WHERE cache_key = $1`,
        [cacheKey]
      );
      
      logger.info('LLM cache hit', {
        cacheKey: cacheKey.substring(0, 16) + '...',
        hitCount: result.rows[0].hit_count + 1,
      });
      
      return result.rows[0].response;
    }
    
    return null;
  } catch (error) {
    logger.warn('Cache lookup failed, proceeding without cache', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Store LLM response in cache
 */
async function cacheResponse(cacheKey, systemPrompt, userPrompt, model, temperature, response, tokensUsed, responseTimeMs) {
  if (!ENABLE_CACHE) {
    return;
  }

  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);
    
    const query = `
      INSERT INTO llm_cache (
        cache_key, model, temperature,
        system_prompt_hash, user_prompt_hash,
        system_prompt, user_prompt,
        response, tokens_used, response_time_ms, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (cache_key) DO UPDATE SET
        hit_count = llm_cache.hit_count + 1,
        last_used_at = CURRENT_TIMESTAMP
    `;
    
    await db.query(query, [
      cacheKey,
      model,
      temperature || 0,
      hashPrompt(systemPrompt),
      hashPrompt(userPrompt),
      systemPrompt,
      userPrompt,
      response,
      tokensUsed,
      responseTimeMs,
      expiresAt,
    ]);
    
    logger.info('LLM response cached', {
      cacheKey: cacheKey.substring(0, 16) + '...',
      ttlDays: CACHE_TTL_DAYS,
    });
  } catch (error) {
    logger.warn('Failed to cache LLM response', {
      error: error.message,
    });
    // Don't fail the request if caching fails
  }
}

/**
 * Call ASI Cloud API (OpenAI-compatible) with retry logic and caching
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @param {object} options - Additional options (model, temperature, etc.)
 * @returns {Promise<string>} - LLM response
 */
async function callASICloud(prompt, systemPrompt, options = {}) {
  const config = options.config || LLM_CONFIG.receiptParsing;
  
  if (!config.apiKey) {
    throw new Error('ASI_API_KEY not configured. Set it in .env file.');
  }
  
  const model = options.model || config.model;
  const temperature = options.temperature ?? config.temperature;
  
  // Check cache first
  const cacheKey = generateCacheKey(systemPrompt, prompt, model, temperature);
  const cachedResponse = await getCachedResponse(cacheKey);
  
  if (cachedResponse) {
    logger.info('Returning cached LLM response');
    return cachedResponse;
  }
  
  const startTime = Date.now();
  let lastError = null;
  
  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        `${config.endpoint}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature,
          max_tokens: options.maxTokens || config.maxTokens,
          top_p: options.topP,
          stream: false, // Streaming not needed for receipt parsing
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          timeout: 30000, // 30 second timeout
        }
      );
      
      const content = response.data.choices[0].message.content;
      const responseTimeMs = Date.now() - startTime;
      const tokensUsed = response.data.usage?.total_tokens || 0;
      
      // Log successful call with metrics
      logger.info('LLM call successful', {
        model,
        attempt,
        latency: `${responseTimeMs}ms`,
        tokensUsed,
        promptLength: prompt.length,
        responseLength: content.length,
        cached: false,
      });
      
      // Cache the response asynchronously
      setImmediate(() => {
        cacheResponse(cacheKey, systemPrompt, prompt, model, temperature, content, tokensUsed, responseTimeMs);
      });
      
      // Debug: Log raw response for troubleshooting
      if (process.env.LLM_DEBUG === 'true') {
        logger.debug('LLM raw response:', {
          fullResponse: content,
          usage: response.data.usage,
        });
      }
      
      return content;
      
    } catch (error) {
      lastError = error;
      const isRetriable = error.code === 'ECONNABORTED' 
        || error.code === 'ETIMEDOUT'
        || (error.response?.status >= 500 && error.response?.status < 600)
        || error.response?.status === 429; // Rate limit
      
      logger.warn(`LLM API call failed (attempt ${attempt}/${MAX_RETRIES})`, {
        error: error.message,
        status: error.response?.status,
        retriable: isRetriable,
        endpoint: config.endpoint,
        model,
      });
      
      // Don't retry on client errors (400-499 except 429)
      if (!isRetriable || attempt === MAX_RETRIES) {
        break;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF, attempt - 1);
      logger.info(`Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  // All retries failed
  logger.error('LLM API call failed after all retries:', {
    error: lastError.message,
    endpoint: config.endpoint,
    model,
    attempts: MAX_RETRIES,
  });
  throw lastError;
}

/**
 * Call LLM with JSON parsing
 * Automatically parses JSON response with fallback extraction
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @param {object} options - Additional options
 * @returns {Promise<object>} - Parsed JSON response
 */
async function callLLMWithJSON(prompt, systemPrompt, options = {}) {
  const content = await callASICloud(prompt, systemPrompt, options);
  
  // Always log raw response for debugging (first 500 chars)
  logger.info('LLM raw response preview:', { 
    length: content.length, 
    preview: content.substring(0, 500).replace(/\n/g, ' '),
  });
  
  try {
    // Try to parse as JSON directly
    const parsed = JSON.parse(content);
    logger.info('JSON parsed successfully', {
      itemCount: parsed.items?.length || 0,
    });
    return parsed;
  } catch (parseError) {
    logger.warn('Initial JSON parse failed, attempting extraction:', {
      parseError: parseError.message,
      contentPreview: content.substring(0, 200),
    });
    
    // Try to extract JSON from markdown code blocks or extra text
    // Common patterns: ```json\n{...}\n``` or plain {...}
    const jsonPatterns = [
      /```json\s*([\s\S]*?)\s*```/,  // Markdown JSON block
      /```\s*([\s\S]*?)\s*```/,       // Generic markdown block
      /\{[\s\S]*\}/,                   // Any JSON object
      /\[[\s\S]*\]/,                   // Any JSON array
    ];
    
    for (const pattern of jsonPatterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          const extracted = match[1] || match[0];
          const parsed = JSON.parse(extracted);
          logger.info('JSON extracted and parsed successfully', {
            pattern: pattern.source,
            itemCount: parsed.items?.length || 0,
          });
          return parsed;
        } catch (retryError) {
          // Continue to next pattern
          continue;
        }
      }
    }
    
    // All extraction attempts failed
    logger.error('All JSON parsing attempts failed', {
      rawResponse: content,
    });
    throw new Error('LLM response is not valid JSON. Check logs for raw response.');
  }
}

/**
 * Test LLM connection
 * @returns {Promise<boolean>} - True if connection successful
 */
async function testConnection() {
  try {
    const response = await callASICloud(
      'Reply with just the word "OK"',
      'You are a helpful assistant.',
      { config: LLM_CONFIG.receiptParsing }
    );
    
    logger.info('LLM connection test successful:', response);
    return true;
  } catch (error) {
    logger.error('LLM connection test failed:', error.message);
    return false;
  }
}

module.exports = {
  callASICloud,
  callLLMWithJSON,
  testConnection,
};
