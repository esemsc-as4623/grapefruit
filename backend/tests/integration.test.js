const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');

// Test helpers and factory functions
let testItemId;
let testOrderId;

// ============================================
// TEST DATA FACTORIES
// ============================================
/**
 * Factory function to create a test inventory item
 * Avoids relying on seed data which may change
 */
const createTestItem = async (overrides = {}) => {
  const defaultItem = {
    item_name: `Test Item ${Date.now()}`,
    quantity: 2.5,
    unit: 'gallon',
    category: 'dairy',
    average_daily_consumption: 0.3,
    // Don't include user_id - it's added by the API automatically
  };
  
  const response = await request(app)
    .post('/inventory')
    .send({ ...defaultItem, ...overrides });
  
  // Ensure the creation was successful
  if (response.status !== 201) {
    throw new Error(`Failed to create test item: ${response.status} - ${JSON.stringify(response.body)}`);
  }
  
  return response.body;
};

/**
 * Factory function to create a low-stock test item
 */
const createLowStockItem = async (overrides = {}) => {
  return createTestItem({
    quantity: 0.5,
    average_daily_consumption: 0.25,
    predicted_runout: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
    ...overrides,
  });
};

/**
 * Factory function to create a test order
 */
const createTestOrder = async (overrides = {}) => {
  const defaultOrder = {
    vendor: 'walmart',
    items: [
      {
        item_name: 'Test Milk',
        quantity: 2,
        unit: 'gallon',
        price: 4.99,
        brand: 'Great Value',
      },
    ],
    subtotal: 9.98,
    tax: 0.80,
    shipping: 0.00,
    total: 10.78,
    // Don't include user_id - it's added by the API automatically
  };
  
  const response = await request(app)
    .post('/orders')
    .send({ ...defaultOrder, ...overrides });
  
  return response.body;
};

/**
 * Clean up test data
 */
const cleanupTestData = async (itemIds = [], orderIds = []) => {
  for (const id of itemIds) {
    try {
      await request(app).delete(`/inventory/${id}`);
    } catch (err) {
      // Ignore errors if item already deleted
    }
  }
  
  for (const id of orderIds) {
    try {
      await db.query('DELETE FROM orders WHERE id = $1', [id]);
    } catch (err) {
      // Ignore errors
    }
  }
};

describe('Grapefruit Backend Integration Tests', () => {
  
  // Setup and teardown
  beforeAll(async () => {
    // Ensure database connection
    await db.query('SELECT NOW()');
    
    // Create consumption_history table if it doesn't exist
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
    
    // Create cart table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS cart (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id VARCHAR(255) NOT NULL DEFAULT 'demo_user',
        item_name VARCHAR(255) NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
        unit VARCHAR(50) NOT NULL,
        category VARCHAR(100),
        estimated_price DECIMAL(10, 2),
        notes TEXT,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(50) DEFAULT 'manual',
        CONSTRAINT unique_user_cart_item UNIQUE(user_id, item_name)
      );
      
      CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);
      CREATE INDEX IF NOT EXISTS idx_cart_added_at ON cart(added_at);
    `);
    
    // Create trigger function for cart timestamp updates if it doesn't exist
    await db.query(`
      CREATE OR REPLACE FUNCTION update_cart_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Create trigger for cart table if it doesn't exist
    await db.query(`
      DROP TRIGGER IF EXISTS cart_updated_at ON cart;
      CREATE TRIGGER cart_updated_at
        BEFORE UPDATE ON cart
        FOR EACH ROW
        EXECUTE FUNCTION update_cart_timestamp();
    `);
  });

  afterAll(async () => {
    // Close database pool
    await db.pool.end();
  });

  // ============================================
  // HEALTH CHECK TESTS
  // ============================================
  describe('Health Check', () => {
    test('GET /health should return 200 OK', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(['healthy', 'degraded']).toContain(response.body.status);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('migrations');
    });
  });

  // ============================================
  // INVENTORY TESTS
  // ============================================
  describe('Inventory Endpoints', () => {
    const createdItemIds = [];
    
    afterEach(async () => {
      // Clean up created test items
      await cleanupTestData(createdItemIds);
      createdItemIds.length = 0;
    });
    
    test('GET /inventory should return user inventory', async () => {
      const response = await request(app).get('/inventory');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body).toHaveProperty('count');
    });

    test('GET /inventory/low should return items running low', async () => {
      // Create a low-stock item for this test with proper predicted_runout
      const lowItem = await createTestItem({
        item_name: `Low Stock Test ${Date.now()}`,
        quantity: 0.5,
        unit: 'gallon',
        category: 'dairy',
        average_daily_consumption: 0.25,
      });
      createdItemIds.push(lowItem.id);
      
      // Manually set predicted_runout via update since create doesn't set it
      await request(app)
        .put(`/inventory/${lowItem.id}`)
        .send({ 
          predicted_runout: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
      
      const response = await request(app).get('/inventory/low');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      
      // Should include our low-stock item
      const foundItem = response.body.items.find(item => item.id === lowItem.id);
      expect(foundItem).toBeDefined();
    });

    test('POST /inventory should add new item', async () => {
      const newItem = {
        item_name: `Test Milk ${Date.now()}`,
        quantity: 2.5,
        unit: 'gallon',
        category: 'dairy',
        average_daily_consumption: 0.3,
      };
      
      const response = await request(app).post('/inventory').send(newItem);
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.item_name).toBe(newItem.item_name);
      
      // Save for cleanup
      testItemId = response.body.id;
      createdItemIds.push(testItemId);
    });

    test('POST /inventory should fail with invalid data', async () => {
      const invalidItem = {
        item_name: 'Test Item',
        // Missing required fields
      };
      
      const response = await request(app).post('/inventory').send(invalidItem);
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('GET /inventory/:id should return specific item', async () => {
      // Create a test item specifically for this test
      const testItem = await createTestItem();
      createdItemIds.push(testItem.id);
      
      const response = await request(app).get(`/inventory/${testItem.id}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testItem.id);
      expect(response.body.item_name).toBe(testItem.item_name);
    });

    test('PUT /inventory/:id should update item quantity', async () => {
      // Create a test item specifically for this test
      const testItem = await createTestItem();
      createdItemIds.push(testItem.id);
      
      const response = await request(app)
        .put(`/inventory/${testItem.id}`)
        .send({ quantity: 1.5 });
      
      expect(response.status).toBe(200);
      expect(parseFloat(response.body.quantity)).toBe(1.5);
    });

    test('DELETE /inventory/:id should remove item', async () => {
      // Create a test item specifically for this test
      const testItem = await createTestItem();
      
      // Ensure item was created successfully
      expect(testItem).toHaveProperty('id');
      expect(testItem.id).toBeTruthy();
      
      createdItemIds.push(testItem.id);
      
      const response = await request(app).delete(`/inventory/${testItem.id}`);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      
      // Verify deletion
      const getResponse = await request(app).get(`/inventory/${testItem.id}`);
      expect(getResponse.status).toBe(404);
    });
  });

  // ============================================
  // PREFERENCES TESTS
  // ============================================
  describe('Preferences Endpoints', () => {
    test('GET /preferences should return user preferences', async () => {
      const response = await request(app).get('/preferences');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('brand_prefs');
      expect(response.body).toHaveProperty('allowed_vendors');
    });

    test('PUT /preferences should update brand preferences', async () => {
      const brandPrefs = {
        milk: {
          preferred: ['Organic Valley', 'Horizon'],
          acceptable: ['Great Value'],
          avoid: [],
        },
      };
      
      const response = await request(app)
        .put('/preferences')
        .send({ brand_prefs: brandPrefs });
      
      expect(response.status).toBe(200);
      expect(response.body.brand_prefs).toHaveProperty('milk');
    });

    test('PUT /preferences should update allowed vendors', async () => {
      const response = await request(app)
        .put('/preferences')
        .send({ allowed_vendors: ['walmart'] });
      
      expect(response.status).toBe(200);
      expect(response.body.allowed_vendors).toContain('walmart');
    });
  });

  // ============================================
  // ORDERS TESTS
  // ============================================
  describe('Orders Endpoints', () => {
    test('GET /orders should return order history', async () => {
      const response = await request(app).get('/orders');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('orders');
      expect(Array.isArray(response.body.orders)).toBe(true);
    });

    test('GET /orders/pending should return pending orders', async () => {
      const response = await request(app).get('/orders/pending');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('orders');
    });

    test('POST /orders should create new order', async () => {
      // First set manual approval mode to prevent auto-approval
      await request(app).put('/preferences').send({ approval_mode: 'manual' });
      
      const order = {
        vendor: 'walmart',
        items: [
          { item_name: 'Milk', quantity: 1, unit: 'gallon', price: 4.99, brand: 'Great Value' },
          { item_name: 'Eggs', quantity: 12, unit: 'count', price: 5.99, brand: 'Organic' },
        ],
        subtotal: 10.98,
        tax: 0.88,
        shipping: 0.00,
        total: 11.86,
      };
      
      const response = await request(app).post('/orders').send(order);
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.vendor).toBe('walmart');
      expect(response.body.status).toBe('pending');
      
      testOrderId = response.body.id;
    });

    test('PUT /orders/:id/approve should approve pending order', async () => {
      const response = await request(app)
        .put(`/orders/${testOrderId}/approve`)
        .send({ notes: 'Test approval' });
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('approved');
      expect(response.body).toHaveProperty('approved_at');
    });

    test('PUT /orders/:id/placed should mark order as placed', async () => {
      const response = await request(app)
        .put(`/orders/${testOrderId}/placed`)
        .send({ 
          vendor_order_id: 'TEST-ORDER-123',
          tracking_number: 'TRACK-456',
        });
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('placed');
      expect(response.body.vendor_order_id).toBe('TEST-ORDER-123');
    });

    test('GET /orders/:id should return specific order', async () => {
      const response = await request(app).get(`/orders/${testOrderId}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testOrderId);
    });
  });

  // ============================================
  // SIMULATION TESTS
  // ============================================
  describe('Simulation Endpoints', () => {
    test('POST /simulate/day should update consumption without creating orders', async () => {
      const response = await request(app).post('/simulate/day');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('items_updated');
      expect(response.body).toHaveProperty('low_items_count');
      expect(response.body).not.toHaveProperty('order_created');
    });

    test('POST /simulate/consumption should reduce inventory quantities', async () => {
      const response = await request(app)
        .post('/simulate/consumption')
        .send({ days: 1 });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items_updated');
      expect(response.body).toHaveProperty('items');
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================
  describe('Error Handling', () => {
    test('Should return 404 for non-existent route', async () => {
      const response = await request(app).get('/nonexistent');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    test('Should return 404 for non-existent item', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app).get(`/inventory/${fakeId}`);
      expect(response.status).toBe(404);
    });

    test('Should return 400 for invalid UUID', async () => {
      const response = await request(app).get('/inventory/invalid-id');
      expect(response.status).toBe(400);
    });
  });

  // ============================================
  // WORKFLOW TESTS
  // ============================================
  describe('Complete Workflow', () => {
    test('End-to-end: Add item -> Simulate consumption -> Check low stock', async () => {
      // Step 1: Add inventory item (with unique name to avoid conflicts)
      const timestamp = Date.now();
      const newItem = {
        item_name: `Workflow Test Milk ${timestamp}`,
        quantity: 1.0,
        unit: 'gallon',
        category: 'dairy',
        average_daily_consumption: 0.5,
      };
      
      const addResponse = await request(app).post('/inventory').send(newItem);
      expect(addResponse.status).toBe(201);
      const itemId = addResponse.body.id;
      
      // Step 2: Simulate consumption to make it run low
      const consumeResponse = await request(app)
        .post('/simulate/consumption')
        .send({ days: 1 });
      expect(consumeResponse.status).toBe(200);
      
      // Step 3: Trigger day simulation (updates consumption, does not create orders)
      const simResponse = await request(app).post('/simulate/day');
      expect(simResponse.status).toBe(200);
      expect(simResponse.body).toHaveProperty('items_updated');
      
      // Step 4: Check low inventory items
      const lowStockResponse = await request(app).get('/inventory/low');
      expect(lowStockResponse.status).toBe(200);
      
      // Cleanup
      await request(app).delete(`/inventory/${itemId}`);
    });
  });
});
