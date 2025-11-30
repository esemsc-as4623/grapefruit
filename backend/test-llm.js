/**
 * Quick test script to verify ASI Cloud LLM connection
 * Run with: node test-llm.js
 */

require('dotenv').config({ path: '../.env' });  // Load from root directory
const { testConnection } = require('./src/services/llmClient');
const { parseReceipt } = require('./src/services/receiptParser');
const logger = require('./src/utils/logger');

async function main() {
  console.log('\n=== Testing ASI Cloud LLM Connection ===\n');
  
  // Test 1: Basic connection test
  console.log('Test 1: Testing basic LLM connection...');
  const connected = await testConnection();
  
  if (!connected) {
    console.error('❌ LLM connection failed');
    console.error('Check your ASI_API_KEY in .env file');
    process.exit(1);
  }
  
  console.log('✅ LLM connection successful!\n');
  
  // Test 2: Parse a simple receipt
  console.log('Test 2: Parsing a simple receipt...');
  const testReceipt = `
GROCERY STORE
Date: 2024-01-15

Organic Bananas    $3.99
Whole Milk 1gal    $4.29
Chicken Breast 2lb $8.50
Bread              $2.99

TOTAL: $19.77
`;
  
  try {
    const result = await parseReceipt(testReceipt);
    console.log('✅ Receipt parsed successfully!');
    console.log('Parsed items:', JSON.stringify(result.items, null, 2));
    console.log('\nMethod used:', result.method);
    console.log('Total items:', result.items.length);
  } catch (error) {
    console.error('❌ Receipt parsing failed:', error.message);
  }
  
  console.log('\n=== Test Complete ===\n');
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
