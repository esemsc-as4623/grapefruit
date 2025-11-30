/**
 * LLM Client for ASI Cloud (OpenAI-compatible API)
 * Handles all LLM API calls with proper error handling and retries
 */

const axios = require('axios');
const { LLM_CONFIG } = require('../config/llm');
const logger = require('../utils/logger');

/**
 * Call ASI Cloud API (OpenAI-compatible)
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
  
  try {
    const response = await axios.post(
      `${config.endpoint}/chat/completions`,
      {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature || config.temperature,
        max_tokens: options.maxTokens || config.maxTokens,
        response_format: config.responseFormat,
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
    logger.info('LLM call successful', {
      model: config.model,
      promptLength: prompt.length,
      responseLength: content.length,
    });
    
    return content;
    
  } catch (error) {
    logger.error('LLM API call failed:', {
      error: error.message,
      endpoint: config.endpoint,
      model: config.model,
    });
    throw error;
  }
}

/**
 * Call LLM with JSON parsing
 * Automatically parses JSON response
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @param {object} options - Additional options
 * @returns {Promise<object>} - Parsed JSON response
 */
async function callLLMWithJSON(prompt, systemPrompt, options = {}) {
  const content = await callASICloud(prompt, systemPrompt, options);
  
  // Debug logging
  logger.info('LLM raw response:', { 
    length: content.length, 
    preview: content.substring(0, 200) 
  });
  
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(content);
    return parsed;
  } catch (parseError) {
    logger.error('Failed to parse LLM response as JSON:', {
      content: content.substring(0, 200),
      error: parseError.message,
    });
    
    // Try to extract JSON from response (sometimes LLMs add extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (retryError) {
        logger.error('JSON extraction also failed');
      }
    }
    
    throw new Error('LLM response is not valid JSON');
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
