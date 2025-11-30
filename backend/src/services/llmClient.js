/**
 * LLM Client for ASI Cloud (OpenAI-compatible API)
 * Handles all LLM API calls with proper error handling and retries
 */

const axios = require('axios');
const { LLM_CONFIG } = require('../config/llm');
const logger = require('../utils/logger');

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second
const RETRY_BACKOFF = 2; // Exponential backoff multiplier

/**
 * Sleep helper for retries
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Call ASI Cloud API (OpenAI-compatible) with retry logic
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
  
  const startTime = Date.now();
  let lastError = null;
  
  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        `${config.endpoint}/chat/completions`,
        {
          model: options.model || config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: options.temperature ?? config.temperature,
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
      const latency = Date.now() - startTime;
      const tokensUsed = response.data.usage?.total_tokens || 'unknown';
      
      // Log successful call with metrics
      logger.info('LLM call successful', {
        model: config.model,
        attempt,
        latency: `${latency}ms`,
        tokensUsed,
        promptLength: prompt.length,
        responseLength: content.length,
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
        model: config.model,
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
    model: config.model,
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
