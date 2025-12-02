const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');

/**
 * Test Suite: Inventory Item Addition
 * 
 * Tests the ability to manually add items to inventory with proper attribute handling,
 * including predicted runout calculation when daily consumption rate is provided.
 */

describe('Inventory Item Addition', () => {
  // Store created item IDs for cleanup
  const createdItemIds = [];

  // Ensure consumption_history table exists
  beforeAll(async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS consumption_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id VARCHAR(255) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        quantity_before DECIMAL(10, 2) NOT NULL,
        quantity_after DECIMAL(10, 2) NOT NULL,
        quantity_consumed DECIMAL(10, 2) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        days_elapsed DECIMAL(10, 4),
        days_in_inventory DECIMAL(10, 4),
        event_type VARCHAR(50) NOT NULL,
        source VARCHAR(50),
        unit VARCHAR(50),
        category VARCHAR(100)
      );
      
      CREATE INDEX IF NOT EXISTS idx_consumption_user_item ON consumption_history(user_id, item_name);
      CREATE INDEX IF NOT EXISTS idx_consumption_timestamp ON consumption_history(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_consumption_user_timestamp ON consumption_history(user_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_consumption_event_type ON consumption_history(event_type);
    `);
  });

  // Helper function to clean up created items
  const cleanupItems = async () => {
    for (const id of createdItemIds) {
      try {
        await request(app).delete(`/inventory/${id}`);
      } catch (err) {
        // Ignore errors if item already deleted
      }
    }
    createdItemIds.length = 0; // Clear array
  };

  // Clean up after each test
  afterEach(async () => {
    await cleanupItems();
  });

  // Close database connection after all tests
  afterAll(async () => {
    await db.pool.end();
  });

  // ============================================
  // BASIC ITEM CREATION TESTS
  // ============================================

  describe('POST /inventory - Basic Creation', () => {
    test('should successfully add a basic inventory item with required fields only', async () => {
      const newItem = {
        item_name: `Organic Almond Milk ${Date.now()}`,
        quantity: 1.0,
        unit: 'gallon',
        category: 'dairy',
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.item_name).toBe(newItem.item_name);
      expect(parseFloat(response.body.quantity)).toBe(newItem.quantity);
      expect(response.body.unit).toBe(newItem.unit);
      expect(response.body.category).toBe(newItem.category);
      expect(response.body.user_id).toBe('demo_user');

      // Store for cleanup
      createdItemIds.push(response.body.id);
    });

    test('should add item with all optional fields', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
      
      const newItem = {
        item_name: 'Greek Yogurt',
        quantity: 4,
        unit: 'count',
        category: 'dairy',
        average_daily_consumption: 0.8,
        predicted_runout: futureDate.toISOString(),
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.item_name).toBe(newItem.item_name);
      expect(parseFloat(response.body.quantity)).toBe(newItem.quantity);
      expect(parseFloat(response.body.average_daily_consumption)).toBe(newItem.average_daily_consumption);
      expect(response.body.predicted_runout).toBeTruthy();

      createdItemIds.push(response.body.id);
    });

    test('should reject item with missing required fields', async () => {
      const incompleteItem = {
        item_name: 'Incomplete Item',
        // Missing quantity and unit
      };

      const response = await request(app)
        .post('/inventory')
        .send(incompleteItem)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toMatch(/required/i);
    });

    test('should reject item with negative quantity', async () => {
      const invalidItem = {
        item_name: 'Invalid Quantity Item',
        quantity: -5,
        unit: 'count',
        category: 'produce',
      };

      const response = await request(app)
        .post('/inventory')
        .send(invalidItem)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject item with invalid data types', async () => {
      const invalidItem = {
        item_name: 'Invalid Type Item',
        quantity: 'not a number',
        unit: 'count',
        category: 'produce',
      };

      const response = await request(app)
        .post('/inventory')
        .send(invalidItem)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ============================================
  // PREDICTED RUNOUT CALCULATION TESTS
  // ============================================

  describe('Predicted Runout Date Calculation', () => {
    test('should calculate predicted runout when daily consumption is provided', async () => {
      const newItem = {
        item_name: 'Fresh Orange Juice',
        quantity: 0.5, // Half gallon
        unit: 'gallon',
        category: 'beverages',
        average_daily_consumption: 0.25, // Quarter gallon per day
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(response.body).toHaveProperty('predicted_runout');
      
      // If predicted_runout is calculated, it should be approximately 2 days from now
      // (0.5 / 0.25 = 2 days)
      if (response.body.predicted_runout) {
        const runoutDate = new Date(response.body.predicted_runout);
        const expectedRunout = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        
        // Allow 1 hour tolerance for calculation differences
        const timeDiff = Math.abs(runoutDate - expectedRunout);
        expect(timeDiff).toBeLessThan(60 * 60 * 1000);
      }

      createdItemIds.push(response.body.id);
    });

    test('should handle items with manual predicted runout override', async () => {
      const manualRunoutDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      
      const newItem = {
        item_name: 'Whole Wheat Flour',
        quantity: 5.0,
        unit: 'lb',
        category: 'pantry',
        average_daily_consumption: 0.5,
        predicted_runout: manualRunoutDate.toISOString(),
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(response.body).toHaveProperty('predicted_runout');
      
      // Should use the manually provided runout date
      const returnedRunout = new Date(response.body.predicted_runout);
      expect(Math.abs(returnedRunout - manualRunoutDate)).toBeLessThan(1000); // Within 1 second

      createdItemIds.push(response.body.id);
    });

    test('should handle items with zero consumption rate (non-perishable)', async () => {
      const newItem = {
        item_name: 'Canned Beans',
        quantity: 12,
        unit: 'count',
        category: 'pantry',
        average_daily_consumption: 0.0,
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(parseFloat(response.body.average_daily_consumption)).toBe(0.0);
      
      // Items with zero consumption shouldn't have a runout date or it should be far in future
      // This depends on your business logic

      createdItemIds.push(response.body.id);
    });

    test('should handle high consumption rate items', async () => {
      const newItem = {
        item_name: 'Fresh Strawberries',
        quantity: 16,
        unit: 'oz',
        category: 'produce',
        average_daily_consumption: 8, // High consumption
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      // Should run out in 2 days (16 / 8 = 2)
      if (response.body.predicted_runout) {
        const runoutDate = new Date(response.body.predicted_runout);
        const expectedRunout = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        
        const timeDiff = Math.abs(runoutDate - expectedRunout);
        expect(timeDiff).toBeLessThan(60 * 60 * 1000); // Within 1 hour
      }

      createdItemIds.push(response.body.id);
    });
  });

  // ============================================
  // ATTRIBUTE PERSISTENCE TESTS
  // ============================================

  describe('Attribute Persistence', () => {
    test('should persist all provided attributes correctly', async () => {
      const newItem = {
        item_name: 'Organic Honey',
        quantity: 32,
        unit: 'oz',
        category: 'pantry',
        average_daily_consumption: 1.5,
      };

      // Create item
      const createResponse = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      const itemId = createResponse.body.id;
      createdItemIds.push(itemId);

      // Retrieve item
      const getResponse = await request(app)
        .get(`/inventory/${itemId}`)
        .expect(200);

      // Verify all attributes match
      expect(getResponse.body.item_name).toBe(newItem.item_name);
      expect(parseFloat(getResponse.body.quantity)).toBeCloseTo(newItem.quantity, 2);
      expect(getResponse.body.unit).toBe(newItem.unit);
      expect(getResponse.body.category).toBe(newItem.category);
      expect(parseFloat(getResponse.body.average_daily_consumption)).toBeCloseTo(newItem.average_daily_consumption, 4);
    });

    test('should set created_at and last_updated timestamps', async () => {
      const newItem = {
        item_name: 'Timestamp Test Item',
        quantity: 1,
        unit: 'count',
        category: 'test',
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('last_updated');

      const createdAt = new Date(response.body.created_at);
      const lastUpdated = new Date(response.body.last_updated);

      // Timestamps should be recent (within last minute)
      const now = Date.now();
      expect(now - createdAt.getTime()).toBeLessThan(60 * 1000);
      expect(now - lastUpdated.getTime()).toBeLessThan(60 * 1000);

      createdItemIds.push(response.body.id);
    });

    test('should generate valid UUID for item ID', async () => {
      const newItem = {
        item_name: 'UUID Test Item',
        quantity: 1,
        unit: 'count',
        category: 'test',
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(response.body.id).toMatch(uuidRegex);

      createdItemIds.push(response.body.id);
    });
  });

  // ============================================
  // CATEGORY-SPECIFIC TESTS
  // ============================================

  describe('Category-Specific Item Addition', () => {
    const categories = [
      { category: 'dairy', item: 'Butter', unit: 'lb', quantity: 1.0 },
      { category: 'produce', item: 'Fresh Spinach', unit: 'oz', quantity: 10 },
      { category: 'pantry', item: 'Rice', unit: 'lb', quantity: 5.0 },
      { category: 'beverages', item: 'Sparkling Water', unit: 'count', quantity: 12 },
      { category: 'frozen', item: 'Frozen Broccoli', unit: 'lb', quantity: 2.0 },
      { category: 'household', item: 'Laundry Detergent', unit: 'bottle', quantity: 1 },
    ];

    categories.forEach(({ category, item, unit, quantity }) => {
      test(`should add ${category} item correctly`, async () => {
        const newItem = {
          item_name: item,
          quantity,
          unit,
          category,
          average_daily_consumption: 0.1,
        };

        const response = await request(app)
          .post('/inventory')
          .send(newItem);

        // Could be 201 (created) or 200 (updated existing)
        expect([200, 201]).toContain(response.status);
        expect(response.body.category).toBe(category);
        expect(response.body.item_name).toBe(item);

        createdItemIds.push(response.body.id);
      });
    });
  });

  // ============================================
  // UNIT TYPE TESTS
  // ============================================

  describe('Different Unit Types', () => {
    const units = [
      { unit: 'gallon', quantity: 2.0 },
      { unit: 'quart', quantity: 4.0 },
      { unit: 'lb', quantity: 5.5 },
      { unit: 'oz', quantity: 16 },
      { unit: 'count', quantity: 24 },
      { unit: 'bottle', quantity: 3 },
      { unit: 'can', quantity: 6 },
      { unit: 'loaf', quantity: 2 },
    ];

    units.forEach(({ unit, quantity }) => {
      test(`should handle ${unit} unit correctly`, async () => {
        const newItem = {
          item_name: `Test Item ${unit}`,
          quantity,
          unit,
          category: 'test',
        };

        const response = await request(app)
          .post('/inventory')
          .send(newItem)
          .expect(201);

        expect(response.body.unit).toBe(unit);
        expect(parseFloat(response.body.quantity)).toBeCloseTo(quantity, 2);

        createdItemIds.push(response.body.id);
      });
    });
  });

  // ============================================
  // DUPLICATE PREVENTION TESTS
  // ============================================

  describe('Duplicate Item Handling', () => {
    test('should add quantity to existing item instead of creating duplicate', async () => {
      const itemData = {
        item_name: `Auto-Update Bananas ${Date.now()}`,
        quantity: 2,
        unit: 'count',
        category: 'produce',
        average_daily_consumption: 1.0,
      };

      // Create first item
      const firstResponse = await request(app)
        .post('/inventory')
        .send(itemData)
        .expect(201);

      const itemId = firstResponse.body.id;
      createdItemIds.push(itemId);

      expect(parseFloat(firstResponse.body.quantity)).toBe(2);

      // Add more of the same item
      const addMoreData = {
        item_name: itemData.item_name,
        quantity: 6, // Adding 6 more
        unit: 'count',
        category: 'produce',
        average_daily_consumption: 1.0,
      };

      const secondResponse = await request(app)
        .post('/inventory')
        .send(addMoreData)
        .expect(200); // Should return 200 for update

      // Should be the same item ID
      expect(secondResponse.body.id).toBe(itemId);
      
      // Quantity should be 2 + 6 = 8
      expect(parseFloat(secondResponse.body.quantity)).toBe(8);
      
      // Should include message about addition
      expect(secondResponse.body.message).toMatch(/added to existing/i);
      expect(parseFloat(secondResponse.body.added_quantity)).toBe(6);

      // Verify by retrieving the item
      const getResponse = await request(app)
        .get(`/inventory/${itemId}`)
        .expect(200);

      expect(parseFloat(getResponse.body.quantity)).toBe(8);
    });

    test('should recalculate predicted runout when adding to existing item', async () => {
      const itemData = {
        item_name: `Runout Calc Milk ${Date.now()}`,
        quantity: 1.0, // 1 gallon
        unit: 'gallon',
        category: 'dairy',
        average_daily_consumption: 0.5, // 0.5 gallon/day = 2 days
      };

      // Create first item
      const firstResponse = await request(app)
        .post('/inventory')
        .send(itemData)
        .expect(201);

      createdItemIds.push(firstResponse.body.id);

      const firstRunout = new Date(firstResponse.body.predicted_runout);

      // Add more milk
      const addMoreData = {
        ...itemData,
        quantity: 2.0, // Adding 2 more gallons (total becomes 3)
      };

      const secondResponse = await request(app)
        .post('/inventory')
        .send(addMoreData)
        .expect(200);

      expect(parseFloat(secondResponse.body.quantity)).toBe(3.0);

      // New runout should be ~6 days from now (3 gallons / 0.5 per day)
      const newRunout = new Date(secondResponse.body.predicted_runout);
      const expectedRunout = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

      // New runout should be later than first runout
      expect(newRunout.getTime()).toBeGreaterThan(firstRunout.getTime());
      
      // Should be approximately 6 days from now
      const timeDiff = Math.abs(newRunout - expectedRunout);
      expect(timeDiff).toBeLessThan(60 * 60 * 1000); // Within 1 hour
    });

    test('should update consumption rate if provided when adding to existing item', async () => {
      const itemData = {
        item_name: `Rate Update Coffee ${Date.now()}`,
        quantity: 0.5,
        unit: 'lb',
        category: 'beverages',
        average_daily_consumption: 0.1, // Initial rate
      };

      // Create first item
      const firstResponse = await request(app)
        .post('/inventory')
        .send(itemData)
        .expect(201);

      createdItemIds.push(firstResponse.body.id);

      expect(parseFloat(firstResponse.body.average_daily_consumption)).toBe(0.1);

      // Add more with updated consumption rate
      const addMoreData = {
        item_name: itemData.item_name,
        quantity: 0.5,
        unit: 'lb',
        category: 'beverages',
        average_daily_consumption: 0.2, // Updated rate
      };

      const secondResponse = await request(app)
        .post('/inventory')
        .send(addMoreData)
        .expect(200);

      expect(parseFloat(secondResponse.body.quantity)).toBe(1.0);
      expect(parseFloat(secondResponse.body.average_daily_consumption)).toBe(0.2);

      // Runout should be calculated with new rate: 1.0 / 0.2 = 5 days
      const runoutDate = new Date(secondResponse.body.predicted_runout);
      const expectedRunout = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      
      const timeDiff = Math.abs(runoutDate - expectedRunout);
      expect(timeDiff).toBeLessThan(60 * 60 * 1000);
    });

    test('should handle adding to item without initial consumption rate', async () => {
      const itemData = {
        item_name: `No Rate Item ${Date.now()}`,
        quantity: 5,
        unit: 'count',
        category: 'pantry',
        // No average_daily_consumption initially
      };

      // Create first item
      const firstResponse = await request(app)
        .post('/inventory')
        .send(itemData)
        .expect(201);

      createdItemIds.push(firstResponse.body.id);

      // Add more with consumption rate now
      const addMoreData = {
        item_name: itemData.item_name,
        quantity: 3,
        unit: 'count',
        category: 'pantry',
        average_daily_consumption: 2.0,
      };

      const secondResponse = await request(app)
        .post('/inventory')
        .send(addMoreData)
        .expect(200);

      expect(parseFloat(secondResponse.body.quantity)).toBe(8);
      expect(parseFloat(secondResponse.body.average_daily_consumption)).toBe(2.0);

      // Should now have a predicted runout: 8 / 2 = 4 days
      expect(secondResponse.body.predicted_runout).toBeTruthy();
    });

    test('should update last_purchase_date when adding to existing item', async () => {
      const itemData = {
        item_name: `Purchase Date Test ${Date.now()}`,
        quantity: 2,
        unit: 'lb',
        category: 'produce',
      };

      // Create first item
      const firstResponse = await request(app)
        .post('/inventory')
        .send(itemData)
        .expect(201);

      createdItemIds.push(firstResponse.body.id);

      const firstPurchaseDate = new Date(firstResponse.body.last_purchase_date || firstResponse.body.created_at);

      // Wait a moment to ensure timestamps are different
      await new Promise(resolve => setTimeout(resolve, 100));

      // Add more
      const addMoreData = {
        item_name: itemData.item_name,
        quantity: 1,
        unit: 'lb',
        category: 'produce',
      };

      const secondResponse = await request(app)
        .post('/inventory')
        .send(addMoreData)
        .expect(200);

      const secondPurchaseDate = new Date(secondResponse.body.last_purchase_date);

      // Last purchase date should be updated
      expect(secondPurchaseDate.getTime()).toBeGreaterThanOrEqual(firstPurchaseDate.getTime());
    });

    test('should track last_purchase_quantity when adding to existing item', async () => {
      const itemData = {
        item_name: `Purchase Qty Test ${Date.now()}`,
        quantity: 10,
        unit: 'oz',
        category: 'pantry',
      };

      // Create first item
      const firstResponse = await request(app)
        .post('/inventory')
        .send(itemData)
        .expect(201);

      createdItemIds.push(firstResponse.body.id);

      // Add more
      const addMoreData = {
        item_name: itemData.item_name,
        quantity: 5, // Adding 5 oz
        unit: 'oz',
        category: 'pantry',
      };

      const secondResponse = await request(app)
        .post('/inventory')
        .send(addMoreData)
        .expect(200);

      expect(parseFloat(secondResponse.body.quantity)).toBe(15);
      expect(parseFloat(secondResponse.body.last_purchase_quantity)).toBe(5);
    });

    test('should handle multiple sequential additions to same item', async () => {
      const itemName = `Multi Add Item ${Date.now()}`;
      
      // First addition
      const first = await request(app)
        .post('/inventory')
        .send({
          item_name: itemName,
          quantity: 2,
          unit: 'count',
          category: 'produce',
          average_daily_consumption: 1.0,
        })
        .expect(201);

      createdItemIds.push(first.body.id);
      expect(parseFloat(first.body.quantity)).toBe(2);

      // Second addition
      const second = await request(app)
        .post('/inventory')
        .send({
          item_name: itemName,
          quantity: 3,
          unit: 'count',
          category: 'produce',
        })
        .expect(200);

      expect(parseFloat(second.body.quantity)).toBe(5);

      // Third addition
      const third = await request(app)
        .post('/inventory')
        .send({
          item_name: itemName,
          quantity: 1,
          unit: 'count',
          category: 'produce',
        })
        .expect(200);

      expect(parseFloat(third.body.quantity)).toBe(6);

      // All should have the same ID
      expect(second.body.id).toBe(first.body.id);
      expect(third.body.id).toBe(first.body.id);
    });
  });

  // ============================================
  // RETRIEVAL AFTER CREATION TESTS
  // ============================================

  describe('Item Retrieval After Creation', () => {
    test('should retrieve newly added item in inventory list', async () => {
      const newItem = {
        item_name: `Retrieval Test ${Date.now()}`,
        quantity: 3.0,
        unit: 'lb',
        category: 'produce',
      };

      const createResponse = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      createdItemIds.push(createResponse.body.id);

      // Get all inventory
      const listResponse = await request(app)
        .get('/inventory')
        .expect(200);

      // Find our item in the list
      const foundItem = listResponse.body.items.find(
        item => item.id === createResponse.body.id
      );

      expect(foundItem).toBeTruthy();
      expect(foundItem.item_name).toBe(newItem.item_name);
    });

    test('should retrieve item by ID immediately after creation', async () => {
      const newItem = {
        item_name: 'ID Retrieval Test',
        quantity: 2.5,
        unit: 'gallon',
        category: 'beverages',
      };

      const createResponse = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      const itemId = createResponse.body.id;
      createdItemIds.push(itemId);

      // Retrieve by ID
      const getResponse = await request(app)
        .get(`/inventory/${itemId}`)
        .expect(200);

      expect(getResponse.body.id).toBe(itemId);
      expect(getResponse.body.item_name).toBe(newItem.item_name);
    });
  });

  // ============================================
  // LOW INVENTORY FLAG TESTS
  // ============================================

  describe('Low Inventory Detection', () => {
    test('should appear in low inventory list when runout is < 3 days', async () => {
      const soonToRunOut = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now

      const newItem = {
        item_name: `Low Stock ${Date.now()}`,
        quantity: 0.5,
        unit: 'gallon',
        category: 'dairy',
        predicted_runout: soonToRunOut.toISOString(),
        average_daily_consumption: 0.25,
      };

      const createResponse = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      createdItemIds.push(createResponse.body.id);

      // Check low inventory endpoint
      const lowResponse = await request(app)
        .get('/inventory/low')
        .expect(200);

      // Should find our item in the low inventory list
      const foundItem = lowResponse.body.items.find(
        item => item.id === createResponse.body.id
      );

      expect(foundItem).toBeTruthy();
    });

    test('should NOT appear in low inventory when runout is > 3 days', async () => {
      const farFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now

      const newItem = {
        item_name: `High Stock ${Date.now()}`,
        quantity: 5.0,
        unit: 'lb',
        category: 'pantry',
        predicted_runout: farFuture.toISOString(),
        average_daily_consumption: 0.5,
      };

      const createResponse = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      createdItemIds.push(createResponse.body.id);

      // Check low inventory endpoint
      const lowResponse = await request(app)
        .get('/inventory/low')
        .expect(200);

      // Should NOT find our item in the low inventory list
      const foundItem = lowResponse.body.items.find(
        item => item.id === createResponse.body.id
      );

      expect(foundItem).toBeFalsy();
    });
  });

  // ============================================
  // DECIMAL PRECISION TESTS
  // ============================================

  describe('Decimal Precision Handling', () => {
    test('should handle decimal quantities with precision', async () => {
      const newItem = {
        item_name: 'Precision Test',
        quantity: 1.234,
        unit: 'lb',
        category: 'produce',
        average_daily_consumption: 0.0567,
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(parseFloat(response.body.quantity)).toBeCloseTo(1.234, 2);
      expect(parseFloat(response.body.average_daily_consumption)).toBeCloseTo(0.0567, 4);

      createdItemIds.push(response.body.id);
    });

    test('should handle very small consumption rates', async () => {
      const newItem = {
        item_name: 'Slow Consumption Test',
        quantity: 10.0,
        unit: 'oz',
        category: 'pantry',
        average_daily_consumption: 0.001, // Very slow
      };

      const response = await request(app)
        .post('/inventory')
        .send(newItem)
        .expect(201);

      expect(parseFloat(response.body.average_daily_consumption)).toBeCloseTo(0.001, 4);

      createdItemIds.push(response.body.id);
    });
  });
});
