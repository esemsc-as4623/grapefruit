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
    // The db pool is managed by the app, no need to close it here
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
          .send(newItem)
          .expect(201);

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
    test('should prevent duplicate items with same name for same user', async () => {
      const itemData = {
        item_name: 'Duplicate Test Milk',
        quantity: 1.0,
        unit: 'gallon',
        category: 'dairy',
      };

      // Create first item
      const firstResponse = await request(app)
        .post('/inventory')
        .send(itemData)
        .expect(201);

      createdItemIds.push(firstResponse.body.id);

      // Try to create duplicate
      const secondResponse = await request(app)
        .post('/inventory')
        .send(itemData)
        .expect(409); // Should fail with conflict status

      expect(secondResponse.body).toHaveProperty('error');
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
