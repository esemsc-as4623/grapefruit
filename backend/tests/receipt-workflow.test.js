/**
 * Receipt Workflow Integration Tests
 * Tests the complete receipt processing pipeline with LLM integration
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const db = require('../src/config/database');
const receiptRoutes = require('../src/routes/receipts');

describe('Receipt Processing Workflow', () => {
  let receiptId;
  const userId = 'test_user_receipt';
  const examplesDir = path.join(__dirname, '../../examples');
  
  // Clean up database connections and receipt timeouts after all tests
  afterAll(async () => {
    // Clear all pending receipt timeouts
    receiptRoutes.cleanup();
    // Close database connection
    await db.end();
  });
  
  // Helper to read receipt file
  const readReceiptFile = (filename) => {
    return fs.readFileSync(path.join(examplesDir, filename), 'utf-8');
  };

  describe('Complete Workflow: generic.txt', () => {
    let receiptText;

    beforeAll(() => {
      receiptText = readReceiptFile('generic.txt');
    });

    test('Step 1: Upload receipt text', async () => {
      const response = await request(app)
        .post('/receipts/upload')
        .send({
          text: receiptText,
          userId: userId,
        })
        .expect(201);

      expect(response.body).toHaveProperty('receiptId');
      expect(response.body).toHaveProperty('status', 'uploaded');
      expect(response.body).toHaveProperty('expiresAt');

      receiptId = response.body.receiptId;
      expect(receiptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    test('Step 2: Parse receipt with LLM', async () => {
      const response = await request(app)
        .post(`/receipts/${receiptId}/parse`)
        .send({
          useLLM: true,
        })
        .expect(200);

      expect(response.body).toHaveProperty('receipt');
      expect(response.body.receipt).toHaveProperty('items');
      expect(response.body.receipt).toHaveProperty('method');
      expect(response.body.receipt).toHaveProperty('stats');

      const { items, method, stats } = response.body.receipt;

      // Verify parsing method
      expect(['llm', 'rules-fallback', 'rules']).toContain(method);

      // Verify items were extracted
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);

      // Verify item structure
      const firstItem = items[0];
      expect(firstItem).toHaveProperty('item_name');
      expect(firstItem).toHaveProperty('quantity');
      expect(firstItem).toHaveProperty('unit');
      expect(firstItem).toHaveProperty('confidence');
      expect(firstItem).toHaveProperty('category');

      // Verify stats
      expect(stats).toHaveProperty('totalParsed');
      expect(stats).toHaveProperty('highConfidence');
      expect(stats).toHaveProperty('avgConfidence');
      expect(stats.totalParsed).toBe(items.length);
      expect(stats.avgConfidence).toBeGreaterThanOrEqual(0);
      expect(stats.avgConfidence).toBeLessThanOrEqual(1);

      // Log results for debugging
      console.log(`\n📊 Parse Results (${method}):`);
      console.log(`   Items: ${items.length}`);
      console.log(`   Avg Confidence: ${stats.avgConfidence.toFixed(2)}`);
      console.log(`   High Confidence: ${stats.highConfidence}`);
      console.log(`   Needs Review: ${stats.needsReview}`);
    }, 30000); // Extended timeout for LLM calls

    test('Step 3: Verify specific items from generic.txt', async () => {
      const response = await request(app)
        .get(`/receipts/${receiptId}`)
        .expect(200);

      const items = response.body.items;
      expect(items).toBeDefined();

      // Check for expected items from generic.txt
      const itemNames = items.map(item => item.item_name.toLowerCase());

      // Should contain key grocery items
      const expectedItems = ['milk', 'eggs', 'banana', 'chicken', 'bread'];
      expectedItems.forEach(expected => {
        const found = itemNames.some(name => name.includes(expected));
        expect(found).toBe(true);
      });

      // Check weight-based items were parsed correctly
      const bananas = items.find(item => 
        item.item_name.toLowerCase().includes('banana')
      );
      if (bananas) {
        expect(bananas.quantity).toBeCloseTo(2.31, 1); // 2.31 LB
        expect(bananas.unit).toMatch(/pound|lb/i);
      }

      const chicken = items.find(item => 
        item.item_name.toLowerCase().includes('chicken')
      );
      if (chicken) {
        expect(chicken.quantity).toBeCloseTo(1.82, 1); // 1.82 LB
        expect(chicken.unit).toMatch(/pound|lb/i);
      }

      // Check gallon conversion (if gallon format was detected)
      const milk = items.find(item => 
        item.item_name.toLowerCase().includes('milk')
      );
      if (milk) {
        // Unit could be "gallon", "gal", or "count" depending on parsing
        expect(milk.unit).toMatch(/gallon|gal|count/i);
      }
    });

    test('Step 4: Match items to inventory', async () => {
      const response = await request(app)
        .post(`/receipts/${receiptId}/match`)
        .send({
          userId: userId,
          threshold: 0.6,
          useLLM: false, // Use fuzzy matching for speed
        })
        .expect(200);

      expect(response.body).toHaveProperty('matches');
      expect(response.body).toHaveProperty('summary');

      const { matches, summary } = response.body;

      // Verify matches array
      expect(Array.isArray(matches)).toBe(true);
      expect(matches.length).toBeGreaterThan(0);

      // Verify match structure
      matches.forEach(match => {
        // Parsed item properties are spread directly into the match object
        expect(match).toHaveProperty('item_name');
        expect(match).toHaveProperty('matchType');
        expect(match).toHaveProperty('confidence');
        expect(['update', 'new', 'ambiguous']).toContain(match.matchType);
      });

      // Verify summary
      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('updates');
      expect(summary).toHaveProperty('newItems');
      expect(summary.total).toBe(matches.length);

      console.log(`\n🔍 Match Results:`);
      console.log(`   Total: ${summary.total}`);
      console.log(`   Updates: ${summary.updates}`);
      console.log(`   New Items: ${summary.newItems}`);
      if (summary.ambiguous) {
        console.log(`   Ambiguous: ${summary.ambiguous}`);
      }
    });

    test('Step 5: Get receipt status', async () => {
      const response = await request(app)
        .get(`/receipts/${receiptId}`)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('receiptId', receiptId);
      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('expiresAt');

      // Status should be parsed or matched
      expect(['uploaded', 'parsed', 'matched', 'applied']).toContain(response.body.status);
    });

    test('Step 6: Apply changes to inventory (dry run)', async () => {
      const response = await request(app)
        .post(`/receipts/${receiptId}/apply`)
        .send({
          userId: userId,
          autoApprove: false,
          dryRun: true, // Don't actually modify inventory in test
        })
        .expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('changes');

      const { summary, changes } = response.body;

      // Verify summary
      expect(summary).toHaveProperty('total');
      expect(summary.total).toBeGreaterThan(0);

      // Verify changes array
      expect(Array.isArray(changes)).toBe(true);
      changes.forEach(change => {
        expect(change).toHaveProperty('action');
        expect(change).toHaveProperty('item');
        expect(['create', 'update']).toContain(change.action);
      });

      console.log(`\n📝 Apply Summary (Dry Run):`);
      console.log(`   Total Changes: ${summary.total}`);
      console.log(`   Created: ${summary.created || 0}`);
      console.log(`   Updated: ${summary.updated || 0}`);
    });
  });

  describe('Error Handling', () => {
    test('Should reject invalid receipt ID format', async () => {
      await request(app)
        .get('/receipts/invalid-uuid')
        .expect(400);
    });

    test('Should reject non-existent receipt ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app)
        .get(`/receipts/${fakeId}`)
        .expect(404);
    });

    test('Should reject empty receipt text', async () => {
      await request(app)
        .post('/receipts/upload')
        .send({
          text: '',
          userId: userId,
        })
        .expect(400);
    });

    test('Should reject upload without userId', async () => {
      await request(app)
        .post('/receipts/upload')
        .send({
          text: 'Some receipt text',
        })
        .expect(400);
    });
  });

  describe('LLM Integration', () => {
    test('Should handle LLM failure gracefully with fallback', async () => {
      const simpleReceipt = 'Milk $3.99\nEggs $2.49\nBread $2.99';

      const uploadResponse = await request(app)
        .post('/receipts/upload')
        .send({
          text: simpleReceipt,
          userId: userId,
        })
        .expect(201);

      const testReceiptId = uploadResponse.body.receiptId;

      const parseResponse = await request(app)
        .post(`/receipts/${testReceiptId}/parse`)
        .send({
          useLLM: true, // Even if LLM fails, should fallback to rules
        })
        .expect(200);

      expect(parseResponse.body.receipt).toHaveProperty('items');
      expect(parseResponse.body.receipt).toHaveProperty('method');
      
      // Should use either llm or rules-fallback
      expect(['llm', 'rules', 'rules-fallback']).toContain(
        parseResponse.body.receipt.method
      );
    }, 30000);

    test('Should parse with rules when useLLM is false', async () => {
      const simpleReceipt = 'Milk $3.99\nEggs $2.49\nBread $2.99';

      const uploadResponse = await request(app)
        .post('/receipts/upload')
        .send({
          text: simpleReceipt,
          userId: userId,
        })
        .expect(201);

      const testReceiptId = uploadResponse.body.receiptId;

      const parseResponse = await request(app)
        .post(`/receipts/${testReceiptId}/parse`)
        .send({
          useLLM: false,
        })
        .expect(200);

      expect(parseResponse.body.receipt.method).toBe('rules');
    });
  });
});
