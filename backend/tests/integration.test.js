const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');

// Test helpers
let testItemId;
let testOrderId;

describe('Grapefruit Backend Integration Tests', () => {
  
  // Setup and teardown
  beforeAll(async () => {
    // Ensure database connection
    await db.query('SELECT NOW()');
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
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ============================================
  // INVENTORY TESTS
  // ============================================
  describe('Inventory Endpoints', () => {
    test('GET /inventory should return user inventory', async () => {
      const response = await request(app).get('/inventory');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body).toHaveProperty('count');
    });

    test('GET /inventory/low should return items running low', async () => {
      const response = await request(app).get('/inventory/low');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    test('POST /inventory should add new item', async () => {
      const newItem = {
        item_name: 'Test Milk',
        quantity: 2.5,
        unit: 'gallon',
        category: 'dairy',
        average_daily_consumption: 0.3,
      };
      
      const response = await request(app).post('/inventory').send(newItem);
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.item_name).toBe('Test Milk');
      
      // Save for later tests
      testItemId = response.body.id;
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
      const response = await request(app).get(`/inventory/${testItemId}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testItemId);
      expect(response.body.item_name).toBe('Test Milk');
    });

    test('PUT /inventory/:id should update item quantity', async () => {
      const response = await request(app)
        .put(`/inventory/${testItemId}`)
        .send({ quantity: 1.5 });
      
      expect(response.status).toBe(200);
      expect(parseFloat(response.body.quantity)).toBe(1.5);
    });

    test('DELETE /inventory/:id should remove item', async () => {
      const response = await request(app).delete(`/inventory/${testItemId}`);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      
      // Verify deletion
      const getResponse = await request(app).get(`/inventory/${testItemId}`);
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
      expect(response.body).toHaveProperty('max_spend');
      expect(response.body).toHaveProperty('approval_mode');
      expect(response.body).toHaveProperty('brand_prefs');
    });

    test('PUT /preferences should update max_spend', async () => {
      const response = await request(app)
        .put('/preferences')
        .send({ max_spend: 300.00 });
      
      expect(response.status).toBe(200);
      expect(parseFloat(response.body.max_spend)).toBe(300.00);
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

    test('POST /orders should reject order exceeding spending cap', async () => {
      // First set a low spending cap
      await request(app).put('/preferences').send({ max_spend: 10.00 });
      
      const order = {
        vendor: 'walmart',
        items: [
          { item_name: 'Expensive Item', quantity: 1, unit: 'count', price: 100.00 },
        ],
        subtotal: 100.00,
        tax: 8.00,
        shipping: 0.00,
        total: 108.00,
      };
      
      const response = await request(app).post('/orders').send(order);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('exceeds spending limit');
      
      // Reset spending cap
      await request(app).put('/preferences').send({ max_spend: 250.00 });
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
    test('POST /simulate/day should trigger forecasting and order generation', async () => {
      const response = await request(app).post('/simulate/day');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('low_items');
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
    test('End-to-end: Add item -> Simulate consumption -> Generate order -> Approve', async () => {
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
      
      // Step 3: Trigger day simulation to generate order
      const simResponse = await request(app).post('/simulate/day');
      expect(simResponse.status).toBe(200);
      
      // Step 4: Check if order was created
      if (simResponse.body.order_created) {
        const orderId = simResponse.body.order.id;
        
        // Step 5: Approve order
        const approveResponse = await request(app)
          .put(`/orders/${orderId}/approve`)
          .send({ notes: 'Workflow test approval' });
        expect(approveResponse.status).toBe(200);
      }
      
      // Cleanup
      await request(app).delete(`/inventory/${itemId}`);
    });
  });
});
