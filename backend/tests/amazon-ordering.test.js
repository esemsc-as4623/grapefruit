/**
 * Amazon Auto-Ordering System Tests
 * Tests the complete autonomous ordering workflow:
 * 1. Zero inventory detection
 * 2. Order queue management (to_order table)
 * 3. Amazon catalog matching
 * 4. Order creation with pricing
 * 5. Delivery processing
 * 6. Inventory updates
 * 
 * ⚠️  PREREQUISITES:
 * These tests require the auto-ordering database migration to be run first:
 *   psql -U postgres -d grapefruit < database/migration-auto-ordering.sql
 * 
 * The tests will be automatically skipped if the required tables are not present.
 */

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');

describe('Amazon Auto-Ordering System', () => {
  let testInventoryId;
  let testOrderId;
  let testToOrderId;
  let tablesExist = false;

  beforeAll(async () => {
    // Ensure database connection
    await db.query('SELECT NOW()');
    
    // Check if auto-ordering tables exist
    try {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'amazon_catalog'
        ) as catalog_exists,
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'to_order'
        ) as to_order_exists,
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'background_jobs'
        ) as jobs_exists
      `);
      
      tablesExist = result.rows[0].catalog_exists && 
                    result.rows[0].to_order_exists && 
                    result.rows[0].jobs_exists;
      
      if (!tablesExist) {
        console.log('⚠️  Auto-ordering tables not found. Run migration-auto-ordering.sql to enable these tests.');
      }
    } catch (err) {
      console.log('⚠️  Could not check for auto-ordering tables:', err.message);
      tablesExist = false;
    }
  });

  afterAll(async () => {
    // Clean up test data only if tables exist
    if (tablesExist) {
      if (testInventoryId) {
        await db.query('DELETE FROM inventory WHERE id = $1', [testInventoryId]);
      }
      if (testOrderId) {
        await db.query('DELETE FROM orders WHERE id = $1', [testOrderId]);
      }
      if (testToOrderId) {
        await db.query('DELETE FROM to_order WHERE id = $1', [testToOrderId]);
      }
    }

    // Close database connections
    await db.pool.end();
  });

  // Helper to skip tests if tables don't exist
  const testOrSkip = (name, fn) => {
    return tablesExist ? test(name, fn) : test.skip(name, fn);
  };

  describe('1. Amazon Catalog', () => {
    testOrSkip('Should have Amazon catalog populated', async () => {
      const response = await request(app)
        .get('/auto-order/catalog')
        .expect(200);

      expect(response.body.count).toBeGreaterThan(0);
      expect(response.body.items).toBeInstanceOf(Array);
      expect(response.body.items[0]).toHaveProperty('item_name');
      expect(response.body.items[0]).toHaveProperty('price');
      expect(response.body.items[0]).toHaveProperty('brand');
      expect(response.body.items[0]).toHaveProperty('unit');
    });

    testOrSkip('Should filter catalog by category', async () => {
      const response = await request(app)
        .get('/auto-order/catalog?category=dairy')
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
      response.body.items.forEach(item => {
        expect(item.category).toBe('dairy');
      });
    });

    testOrSkip('Should search catalog by item name', async () => {
      const response = await request(app)
        .get('/auto-order/catalog?search=milk')
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
      response.body.items.forEach(item => {
        expect(item.item_name.toLowerCase()).toContain('milk');
      });
    });

    testOrSkip('Should have pricing for all catalog items', async () => {
      const response = await request(app)
        .get('/auto-order/catalog')
        .expect(200);

      response.body.items.forEach(item => {
        expect(parseFloat(item.price)).toBeGreaterThan(0);
        expect(item.in_stock).toBe(true);
      });
    });
  });

  describe('2. Zero Inventory Detection', () => {
    beforeAll(async () => {
      // Create test inventory item at zero
      const result = await db.query(
        `INSERT INTO inventory (item_name, quantity, unit, category)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Test Milk', 0, 'gallon', 'dairy']
      );
      testInventoryId = result.rows[0].id;
    });

    testOrSkip('Should detect items at zero quantity', async () => {
      const response = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'detect_zero_inventory' })
        .expect(200);

      expect(response.body.result.items_added).toBeGreaterThanOrEqual(1);

      // Verify it was added to to_order table
      const toOrderResult = await db.query(
        'SELECT * FROM to_order WHERE inventory_id = $1',
        [testInventoryId]
      );

      expect(toOrderResult.rows.length).toBe(1);
      testToOrderId = toOrderResult.rows[0].id;
      expect(toOrderResult.rows[0].status).toBe('pending');
      expect(parseFloat(toOrderResult.rows[0].reorder_quantity)).toBeGreaterThan(0);
    });

    testOrSkip('Should not create duplicate to_order entries', async () => {
      // Run detection again
      await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'detect_zero_inventory' })
        .expect(200);

      // Should still only have one entry
      const toOrderResult = await db.query(
        'SELECT * FROM to_order WHERE inventory_id = $1 AND status = $2',
        [testInventoryId, 'pending']
      );

      expect(toOrderResult.rows.length).toBe(1);
    });

    testOrSkip('Should use last purchase quantity for reorder amount', async () => {
      // Create item with last_purchase_quantity
      const result = await db.query(
        `INSERT INTO inventory (item_name, quantity, unit, category, last_purchase_quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['Test Coffee', 0, 'lb', 'beverages', 2.5]
      );

      const itemId = result.rows[0].id;

      // Detect zero inventory
      await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'detect_zero_inventory' })
        .expect(200);

      // Check reorder quantity matches last purchase
      const toOrderResult = await db.query(
        'SELECT * FROM to_order WHERE inventory_id = $1',
        [itemId]
      );

      expect(parseFloat(toOrderResult.rows[0].reorder_quantity)).toBe(2.5);

      // Cleanup
      await db.query('DELETE FROM to_order WHERE inventory_id = $1', [itemId]);
      await db.query('DELETE FROM inventory WHERE id = $1', [itemId]);
    });
  });

  describe('3. Order Processing from to_order Queue', () => {
    testOrSkip('Should match to_order items with Amazon catalog', async () => {
      // Clean up any existing test data first
      await db.query(`DELETE FROM to_order WHERE item_name LIKE 'Test%'`);
      await db.query(`DELETE FROM inventory WHERE item_name LIKE 'Test%'`);

      // Create a to_order entry for an item in the catalog
      const catalogResult = await db.query(
        `SELECT * FROM amazon_catalog WHERE item_name = 'Whole Milk' LIMIT 1`
      );

      expect(catalogResult.rows.length).toBe(1);
      const catalogItem = catalogResult.rows[0];

      // Use unique test item name
      const testItemName = `Test Whole Milk ${Date.now()}`;

      // Create inventory item
      const invResult = await db.query(
        `INSERT INTO inventory (item_name, quantity, unit, category)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [testItemName, 0, 'gallon', 'dairy']
      );

      const inventoryId = invResult.rows[0].id;

      // Create to_order entry (use "Whole Milk" for catalog matching)
      await db.query(
        `INSERT INTO to_order (inventory_id, item_name, unit, category, reorder_quantity, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [inventoryId, 'Whole Milk', 'gallon', 'dairy', 1, 'pending']
      );

      // Process orders
      const response = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_to_order' })
        .expect(200);

      expect(response.body.result.orders_created).toBeGreaterThanOrEqual(1);

      // Verify order was created with catalog pricing
      const orderResult = await db.query(
        `SELECT * FROM orders WHERE vendor = 'amazon'
         ORDER BY created_at DESC LIMIT 1`
      );

      expect(orderResult.rows.length).toBe(1);
      const order = orderResult.rows[0];

      // Verify items match catalog
      const orderItems = order.items;
      expect(orderItems.length).toBeGreaterThanOrEqual(1);

      const milkItem = orderItems.find(item => item.item_name === 'Whole Milk');
      expect(milkItem).toBeDefined();
      expect(parseFloat(milkItem.price)).toBe(parseFloat(catalogItem.price));
      expect(milkItem.brand).toBe(catalogItem.brand);

      // Cleanup
      await db.query('DELETE FROM to_order WHERE inventory_id = $1', [inventoryId]);
      await db.query('DELETE FROM orders WHERE id = $1', [order.id]);
      await db.query('DELETE FROM inventory WHERE id = $1', [inventoryId]);
    });

    testOrSkip('Should calculate correct pricing (subtotal + tax + shipping)', async () => {
      const response = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_to_order' })
        .expect(200);

      if (response.body.result.orders_created > 0) {
        const order = response.body.result.orders[0];

        // Get the actual order from database
        const orderResult = await db.query(
          'SELECT * FROM orders WHERE id = $1',
          [order.order_id]
        );

        const orderData = orderResult.rows[0];
        const subtotal = parseFloat(orderData.subtotal);
        const tax = parseFloat(orderData.tax);
        const shipping = parseFloat(orderData.shipping);
        const total = parseFloat(orderData.total);

        // Tax should be 8% of subtotal
        expect(tax).toBeCloseTo(subtotal * 0.08, 2);

        // Shipping should be $5.99 if subtotal < $35, else $0
        if (subtotal < 35) {
          expect(shipping).toBe(5.99);
        } else {
          expect(shipping).toBe(0);
        }

        // Total should equal subtotal + tax + shipping
        expect(total).toBeCloseTo(subtotal + tax + shipping, 2);
      }
    });

    testOrSkip('Should generate valid tracking numbers', async () => {
      const response = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_to_order' })
        .expect(200);

      if (response.body.result.orders_created > 0) {
        const order = response.body.result.orders[0];

        expect(order.tracking_number).toBeDefined();
        expect(order.tracking_number).toMatch(/^AMZN-[A-Z0-9]{12}$/);
      }
    });

    testOrSkip('Should set delivery date 3-5 days in future', async () => {
      const response = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_to_order' })
        .expect(200);

      if (response.body.result.orders_created > 0) {
        const order = response.body.result.orders[0];

        const deliveryDate = new Date(order.delivery_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((deliveryDate - today) / (1000 * 60 * 60 * 24));

        expect(diffDays).toBeGreaterThanOrEqual(3);
        expect(diffDays).toBeLessThanOrEqual(5);
      }
    });

    testOrSkip('Should auto-approve orders and set status to "placed"', async () => {
      const response = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_to_order' })
        .expect(200);

      if (response.body.result.orders_created > 0) {
        const order = response.body.result.orders[0];

        const orderResult = await db.query(
          'SELECT * FROM orders WHERE id = $1',
          [order.order_id]
        );

        const orderData = orderResult.rows[0];
        expect(orderData.status).toBe('placed');
        expect(orderData.approved_at).not.toBeNull();
        expect(orderData.placed_at).not.toBeNull();
      }
    });

    testOrSkip('Should update to_order status to "ordered"', async () => {
      // Create fresh test data
      const invResult = await db.query(
        `INSERT INTO inventory (item_name, quantity, unit, category)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Test Bananas', 0, 'count', 'produce']
      );

      const inventoryId = invResult.rows[0].id;

      const toOrderResult = await db.query(
        `INSERT INTO to_order (inventory_id, item_name, unit, category, reorder_quantity, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [inventoryId, 'Bananas', 'lb', 'produce', 6, 'pending']
      );

      const toOrderId = toOrderResult.rows[0].id;

      // Process orders
      await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_to_order' })
        .expect(200);

      // Check to_order status
      const updatedToOrder = await db.query(
        'SELECT * FROM to_order WHERE id = $1',
        [toOrderId]
      );

      expect(updatedToOrder.rows[0].status).toBe('ordered');
      expect(updatedToOrder.rows[0].order_id).not.toBeNull();
      expect(updatedToOrder.rows[0].ordered_at).not.toBeNull();

      // Cleanup
      const orderId = updatedToOrder.rows[0].order_id;
      await db.query('DELETE FROM to_order WHERE id = $1', [toOrderId]);
      await db.query('DELETE FROM orders WHERE id = $1', [orderId]);
      await db.query('DELETE FROM inventory WHERE id = $1', [inventoryId]);
    });
  });

  describe('4. Delivery Processing', () => {
    let deliveryTestOrderId;
    let deliveryTestInventoryId;

    beforeAll(async () => {
      // Create test order with delivery date = today
      const invResult = await db.query(
        `INSERT INTO inventory (item_name, quantity, unit, category)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Test Eggs', 0, 'dozen', 'dairy']
      );
      deliveryTestInventoryId = invResult.rows[0].id;

      const orderResult = await db.query(
        `INSERT INTO orders
         (vendor, items, subtotal, tax, shipping, total, status, delivery_date, tracking_number, placed_at, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          'amazon',
          JSON.stringify([{ item_name: 'Test Eggs', quantity: 12, unit: 'dozen', price: 5.99, brand: 'Organic Valley' }]),
          5.99,
          0.48,
          5.99,
          12.46,
          'placed',
          'AMZN-TEST12345678'
        ]
      );
      deliveryTestOrderId = orderResult.rows[0].id;

      // Create to_order entry
      await db.query(
        `INSERT INTO to_order (inventory_id, item_name, unit, category, reorder_quantity, status, order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [deliveryTestInventoryId, 'Test Eggs', 'dozen', 'dairy', 12, 'ordered', deliveryTestOrderId]
      );
    });

    afterAll(async () => {
      if (deliveryTestOrderId) {
        await db.query('DELETE FROM to_order WHERE order_id = $1', [deliveryTestOrderId]);
        await db.query('DELETE FROM orders WHERE id = $1', [deliveryTestOrderId]);
      }
      if (deliveryTestInventoryId) {
        await db.query('DELETE FROM inventory WHERE id = $1', [deliveryTestInventoryId]);
      }
    });

    testOrSkip('Should process deliveries for orders with delivery_date <= today', async () => {
      const response = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_deliveries' })
        .expect(200);

      expect(response.body.result.deliveries_processed).toBeGreaterThanOrEqual(1);
    });

    testOrSkip('Should update inventory quantity when order is delivered', async () => {
      // Reset inventory to known state
      await db.query(
        'UPDATE inventory SET quantity = 0 WHERE id = $1',
        [deliveryTestInventoryId]
      );

      // Get initial quantity
      const beforeResult = await db.query(
        'SELECT quantity FROM inventory WHERE id = $1',
        [deliveryTestInventoryId]
      );
      const beforeQuantity = parseFloat(beforeResult.rows[0].quantity);

      // Reset order to placed status with today's delivery date
      await db.query(
        `UPDATE orders SET status = 'placed', delivery_date = CURRENT_DATE, delivered_at = NULL
         WHERE id = $1`,
        [deliveryTestOrderId]
      );

      // Process delivery
      await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_deliveries' })
        .expect(200);

      // Get updated quantity
      const afterResult = await db.query(
        'SELECT quantity FROM inventory WHERE id = $1',
        [deliveryTestInventoryId]
      );
      const afterQuantity = parseFloat(afterResult.rows[0].quantity);

      // Quantity should have increased by 12 (dozen)
      expect(afterQuantity).toBe(beforeQuantity + 12);
    });

    testOrSkip('Should mark order status as "delivered"', async () => {
      // Process delivery
      await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_deliveries' })
        .expect(200);

      const orderResult = await db.query(
        'SELECT status, delivered_at FROM orders WHERE id = $1',
        [deliveryTestOrderId]
      );

      expect(orderResult.rows[0].status).toBe('delivered');
      expect(orderResult.rows[0].delivered_at).not.toBeNull();
    });

    testOrSkip('Should update to_order status to "delivered"', async () => {
      // Process delivery
      await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_deliveries' })
        .expect(200);

      const toOrderResult = await db.query(
        'SELECT status, delivered_at FROM to_order WHERE order_id = $1',
        [deliveryTestOrderId]
      );

      expect(toOrderResult.rows[0].status).toBe('delivered');
      expect(toOrderResult.rows[0].delivered_at).not.toBeNull();
    });

    testOrSkip('Should update last_purchase_date and last_purchase_quantity', async () => {
      // Process delivery
      await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_deliveries' })
        .expect(200);

      const inventoryResult = await db.query(
        'SELECT last_purchase_date, last_purchase_quantity FROM inventory WHERE id = $1',
        [deliveryTestInventoryId]
      );

      const inv = inventoryResult.rows[0];
      expect(inv.last_purchase_date).not.toBeNull();
      expect(parseFloat(inv.last_purchase_quantity)).toBe(12);
    });
  });

  describe('5. End-to-End Workflow', () => {
    testOrSkip('Complete autonomous workflow: Zero → Order → Delivery → Restock', async () => {
      // Clean up first - delete any existing "Whole Milk" test orders
      await db.query(`DELETE FROM to_order WHERE item_name = 'Whole Milk'`);

      // Find existing Whole Milk item or create it
      let existingItem = await db.query(
        `SELECT id FROM inventory WHERE item_name = 'Whole Milk' AND user_id = 'demo_user'`
      );

      let inventoryId;
      if (existingItem.rows.length > 0) {
        inventoryId = existingItem.rows[0].id;
        // Reset to zero
        await db.query(`UPDATE inventory SET quantity = 0 WHERE id = $1`, [inventoryId]);
      } else {
        // Create it
        const newItem = await db.query(
          `INSERT INTO inventory (item_name, quantity, unit, category, user_id, last_purchase_quantity)
           VALUES ('Whole Milk', 0, 'gallon', 'dairy', 'demo_user', 1)
           RETURNING id`
        );
        inventoryId = newItem.rows[0].id;
      }

      // Step 2: Manually create to_order entry (simulating detection)
      await db.query(
        `INSERT INTO to_order (inventory_id, item_name, unit, category, reorder_quantity, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [inventoryId, 'Whole Milk', 'gallon', 'dairy', 1, 'pending']
      );

      // Verify to_order entry
      let toOrderResult = await db.query(
        'SELECT * FROM to_order WHERE inventory_id = $1',
        [inventoryId]
      );
      expect(toOrderResult.rows.length).toBe(1);
      expect(toOrderResult.rows[0].status).toBe('pending');

      // Step 3: Process order
      const processResponse = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_to_order' })
        .expect(200);

      expect(processResponse.body.result.orders_created).toBeGreaterThanOrEqual(1);

      // Verify order created
      toOrderResult = await db.query(
        'SELECT * FROM to_order WHERE inventory_id = $1',
        [inventoryId]
      );
      const orderId = toOrderResult.rows[0].order_id;
      expect(orderId).not.toBeNull();
      expect(toOrderResult.rows[0].status).toBe('ordered');

      const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      expect(orderResult.rows[0].status).toBe('placed');
      expect(orderResult.rows[0].tracking_number).toMatch(/^AMZN-/);

      // Step 4: Simulate delivery date arriving
      await db.query(
        'UPDATE orders SET delivery_date = CURRENT_DATE WHERE id = $1',
        [orderId]
      );

      // Step 5: Process delivery
      const deliveryResponse = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'process_deliveries' })
        .expect(200);

      expect(deliveryResponse.body.result.deliveries_processed).toBeGreaterThanOrEqual(1);

      // Step 6: Verify final state
      const finalInventory = await db.query(
        'SELECT * FROM inventory WHERE id = $1',
        [inventoryId]
      );
      expect(parseFloat(finalInventory.rows[0].quantity)).toBe(1); // Restocked!

      const finalOrder = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      expect(finalOrder.rows[0].status).toBe('delivered');

      const finalToOrder = await db.query(
        'SELECT * FROM to_order WHERE inventory_id = $1',
        [inventoryId]
      );
      expect(finalToOrder.rows[0].status).toBe('delivered');

      // Cleanup (don't delete inventory - it's the main Whole Milk item)
      await db.query('DELETE FROM to_order WHERE inventory_id = $1', [inventoryId]);
      await db.query('DELETE FROM orders WHERE id = $1', [orderId]);
    });
  });

  describe('6. Background Job Logging', () => {
    testOrSkip('Should log job executions to background_jobs table', async () => {
      await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'detect_zero_inventory' })
        .expect(200);

      const jobsResponse = await request(app)
        .get('/auto-order/jobs?job_name=detect_zero_inventory&limit=1')
        .expect(200);

      expect(jobsResponse.body.jobs.length).toBeGreaterThan(0);
      const job = jobsResponse.body.jobs[0];

      expect(job.job_name).toBe('detect_zero_inventory');
      expect(job.status).toBe('completed');
      expect(job.started_at).not.toBeNull();
      expect(job.completed_at).not.toBeNull();
    });

    testOrSkip('Should log job failures', async () => {
      // Try to run invalid job
      const response = await request(app)
        .post('/auto-order/jobs/run')
        .send({ job_name: 'invalid_job' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('7. API Endpoints', () => {
    testOrSkip('GET /auto-order/status - Should return scheduler status', async () => {
      const response = await request(app)
        .get('/auto-order/status')
        .expect(200);

      expect(response.body.scheduler).toHaveProperty('isRunning');
      expect(response.body.scheduler).toHaveProperty('jobsCount');
    });

    testOrSkip('GET /auto-order/to-order - Should return items in order queue', async () => {
      const response = await request(app)
        .get('/auto-order/to-order')
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    testOrSkip('GET /auto-order/pending - Should return pending orders with catalog info', async () => {
      const response = await request(app)
        .get('/auto-order/pending')
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    testOrSkip('GET /auto-order/deliveries - Should return pending deliveries', async () => {
      const response = await request(app)
        .get('/auto-order/deliveries')
        .expect(200);

      expect(response.body).toHaveProperty('orders');
      expect(Array.isArray(response.body.orders)).toBe(true);
    });

    testOrSkip('GET /auto-order/catalog - Should return Amazon catalog', async () => {
      const response = await request(app)
        .get('/auto-order/catalog')
        .expect(200);

      expect(response.body.count).toBeGreaterThan(0);
      expect(Array.isArray(response.body.items)).toBe(true);
    });
  });
});
