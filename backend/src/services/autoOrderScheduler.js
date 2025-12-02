const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Auto-Order Scheduler Service
 * Runs background jobs to:
 * 1. Detect zero inventory items and add to to_order
 * 2. Process to_order items and create Amazon orders
 * 3. Process delivered orders and update inventory
 */
class AutoOrderScheduler {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Log job execution to database
   */
  async logJobStart(jobName) {
    try {
      const result = await db.query(
        `INSERT INTO background_jobs (job_name, status, started_at)
         VALUES ($1, 'running', CURRENT_TIMESTAMP)
         RETURNING id`,
        [jobName]
      );
      return result.rows[0].id;
    } catch (error) {
      logger.error(`Error logging job start for ${jobName}:`, error);
      return null;
    }
  }

  /**
   * Update job execution log
   */
  async logJobComplete(jobId, status, results = {}) {
    if (!jobId) return;

    try {
      await db.query(
        `UPDATE background_jobs
         SET status = $2,
             completed_at = CURRENT_TIMESTAMP,
             items_processed = $3,
             items_created = $4,
             items_updated = $5,
             metadata = $6,
             error_message = $7
         WHERE id = $1`,
        [
          jobId,
          status,
          results.items_processed || 0,
          results.items_created || 0,
          results.items_updated || 0,
          JSON.stringify(results.metadata || {}),
          results.error_message || null,
        ]
      );
    } catch (error) {
      logger.error(`Error logging job completion for ${jobId}:`, error);
    }
  }

  /**
   * Job 1: Detect zero inventory and add to to_order
   * Runs every 5 minutes
   */
  async detectZeroInventory() {
    const jobName = 'detect_zero_inventory';
    const jobId = await this.logJobStart(jobName);

    try {
      logger.info('Running job: detect_zero_inventory');

      const result = await db.query('SELECT * FROM detect_zero_inventory()');
      const { items_added, items } = result.rows[0];

      // Parse items if it's a string, otherwise use it as-is
      const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

      if (items_added > 0) {
        logger.info(`Added ${items_added} items to to_order table`, {
          items: parsedItems,
        });
      } else {
        logger.debug('No zero inventory items detected');
      }

      await this.logJobComplete(jobId, 'completed', {
        items_created: items_added,
        metadata: { items: parsedItems },
      });

      return { items_added, items: parsedItems };
    } catch (error) {
      logger.error('Error in detect_zero_inventory job:', error);
      await this.logJobComplete(jobId, 'failed', {
        error_message: error.message,
      });
      throw error;
    }
  }

  /**
   * Job 2: Process to_order and create Amazon orders
   * Runs every 10 minutes
   */
  async processToOrder() {
    const jobName = 'process_to_order';
    const jobId = await this.logJobStart(jobName);

    try {
      logger.info('Running job: process_to_order');

      const result = await db.query('SELECT * FROM process_to_order()');
      const { orders_created, order_details } = result.rows[0];

      // Parse order_details if it's a string, otherwise use it as-is
      const parsedOrders = typeof order_details === 'string' ? JSON.parse(order_details) : order_details;

      if (orders_created > 0) {
        logger.info(`Created ${orders_created} Amazon orders`, {
          orders: parsedOrders,
        });
      } else {
        logger.debug('No pending to_order items to process');
      }

      await this.logJobComplete(jobId, 'completed', {
        items_created: orders_created,
        metadata: { orders: parsedOrders },
      });

      return { orders_created, orders: parsedOrders };
    } catch (error) {
      logger.error('Error in process_to_order job:', error);
      await this.logJobComplete(jobId, 'failed', {
        error_message: error.message,
      });
      throw error;
    }
  }

  /**
   * Job 3: Process deliveries and update inventory
   * Runs every 1 hour
   */
  async processDeliveries() {
    const jobName = 'process_deliveries';
    const jobId = await this.logJobStart(jobName);

    try {
      logger.info('Running job: process_deliveries');

      const result = await db.query('SELECT * FROM process_deliveries()');
      const { deliveries_processed, delivery_details } = result.rows[0];

      // Parse delivery_details if it's a string, otherwise use it as-is
      const parsedDeliveries = typeof delivery_details === 'string' ? JSON.parse(delivery_details) : delivery_details;

      if (deliveries_processed > 0) {
        logger.info(`Processed ${deliveries_processed} deliveries`, {
          deliveries: parsedDeliveries,
        });
      } else {
        logger.debug('No deliveries to process');
      }

      await this.logJobComplete(jobId, 'completed', {
        items_updated: deliveries_processed,
        metadata: { deliveries: parsedDeliveries },
      });

      return {
        deliveries_processed,
        deliveries: parsedDeliveries,
      };
    } catch (error) {
      logger.error('Error in process_deliveries job:', error);
      await this.logJobComplete(jobId, 'failed', {
        error_message: error.message,
      });
      throw error;
    }
  }

  /**
   * Job 4: Auto-add low stock items to cart (when auto-order is enabled)
   * Runs every 15 minutes
   */
  async autoAddLowStockToCart() {
    const jobName = 'auto_add_low_stock_to_cart';
    const jobId = await this.logJobStart(jobName);

    try {
      logger.info('Running job: auto_add_low_stock_to_cart');

      // Query to find users with auto-order enabled
      const usersResult = await db.query(
        'SELECT user_id FROM preferences WHERE auto_order_enabled = true'
      );

      const users = usersResult.rows;
      
      if (users.length === 0) {
        logger.debug('No users have auto-order enabled');
        await this.logJobComplete(jobId, 'completed', {
          items_processed: 0,
          metadata: { message: 'No users with auto-order enabled' },
        });
        return { items_added: 0, users_processed: 0 };
      }

      let totalItemsAdded = 0;
      const results = [];

      // Process each user with auto-order enabled
      for (const user of users) {
        const userId = user.user_id;
        
        try {
          // Get low-stock items for this user
          const lowStockResult = await db.query(
            'SELECT * FROM low_inventory WHERE user_id = $1',
            [userId]
          );

          const lowStockItems = lowStockResult.rows;

          if (lowStockItems.length === 0) {
            logger.debug(`No low-stock items for user: ${userId}`);
            continue;
          }

          // Get existing cart items to avoid duplicates
          const cartResult = await db.query(
            'SELECT item_name FROM cart WHERE user_id = $1',
            [userId]
          );
          
          const existingItemNames = new Set(
            cartResult.rows.map(item => item.item_name.toLowerCase())
          );

          let itemsAddedForUser = 0;

          // Add each low-stock item to cart if not already there
          for (const lowItem of lowStockItems) {
            if (existingItemNames.has(lowItem.item_name.toLowerCase())) {
              logger.debug(`Skipping ${lowItem.item_name} - already in cart`);
              continue;
            }

            // Determine reorder quantity
            const reorderQuantity = lowItem.last_purchase_quantity || 1;

            // Get price from catalog (best effort)
            let estimatedPrice = 5.99; // default fallback
            try {
              const priceResult = await db.query(
                `SELECT price FROM amazon_catalog 
                 WHERE LOWER(item_name) = LOWER($1) 
                 ORDER BY price ASC LIMIT 1`,
                [lowItem.item_name]
              );
              
              if (priceResult.rows.length > 0) {
                estimatedPrice = priceResult.rows[0].price;
              }
            } catch (priceError) {
              logger.warn(`Could not fetch price for ${lowItem.item_name}:`, priceError.message);
            }

            // Add to cart
            await db.query(
              `INSERT INTO cart 
               (user_id, item_name, quantity, unit, category, estimated_price, notes, source)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (user_id, item_name) DO NOTHING`,
              [
                userId,
                lowItem.item_name,
                reorderQuantity,
                lowItem.unit,
                lowItem.category,
                estimatedPrice,
                `Auto-added: Low stock (${lowItem.days_until_runout?.toFixed(1) || '?'} days until runout)`,
                'auto_order'
              ]
            );

            itemsAddedForUser++;
            totalItemsAdded++;
          }

          results.push({
            user_id: userId,
            low_stock_items: lowStockItems.length,
            items_added: itemsAddedForUser,
          });

          logger.info(`Auto-added ${itemsAddedForUser} items to cart for user: ${userId}`);

        } catch (userError) {
          logger.error(`Error processing auto-order for user ${userId}:`, userError);
          results.push({
            user_id: userId,
            error: userError.message,
          });
        }
      }

      await this.logJobComplete(jobId, 'completed', {
        items_created: totalItemsAdded,
        items_processed: users.length,
        metadata: { results },
      });

      logger.info(`Auto-add job complete: ${totalItemsAdded} items added for ${users.length} users`);

      return {
        items_added: totalItemsAdded,
        users_processed: users.length,
        results,
      };

    } catch (error) {
      logger.error('Error in auto_add_low_stock_to_cart job:', error);
      await this.logJobComplete(jobId, 'failed', {
        error_message: error.message,
      });
      throw error;
    }
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Auto-order scheduler already running');
      return;
    }

    logger.info('Starting auto-order scheduler...');

    // Job 1: Detect zero inventory every 5 minutes
    this.jobs.push(
      cron.schedule('*/5 * * * *', () => {
        this.detectZeroInventory().catch((err) => {
          logger.error('Scheduled detectZeroInventory failed:', err);
        });
      })
    );

    // Job 2: Process to_order every 10 minutes
    this.jobs.push(
      cron.schedule('*/10 * * * *', () => {
        this.processToOrder().catch((err) => {
          logger.error('Scheduled processToOrder failed:', err);
        });
      })
    );

    // Job 3: Process deliveries every hour
    this.jobs.push(
      cron.schedule('0 * * * *', () => {
        this.processDeliveries().catch((err) => {
          logger.error('Scheduled processDeliveries failed:', err);
        });
      })
    );

    // Job 4: Auto-add low stock items to cart every 15 minutes
    this.jobs.push(
      cron.schedule('*/15 * * * *', () => {
        this.autoAddLowStockToCart().catch((err) => {
          logger.error('Scheduled autoAddLowStockToCart failed:', err);
        });
      })
    );

    // Run all jobs immediately on startup
    logger.info('Running initial auto-order jobs...');
    this.detectZeroInventory().catch((err) =>
      logger.error('Initial detectZeroInventory failed:', err)
    );
    this.processToOrder().catch((err) =>
      logger.error('Initial processToOrder failed:', err)
    );
    this.processDeliveries().catch((err) =>
      logger.error('Initial processDeliveries failed:', err)
    );
    this.autoAddLowStockToCart().catch((err) =>
      logger.error('Initial autoAddLowStockToCart failed:', err)
    );

    this.isRunning = true;
    logger.info('Auto-order scheduler started successfully');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Auto-order scheduler not running');
      return;
    }

    logger.info('Stopping auto-order scheduler...');

    this.jobs.forEach((job) => job.stop());
    this.jobs = [];
    this.isRunning = false;

    logger.info('Auto-order scheduler stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobsCount: this.jobs.length,
    };
  }

  /**
   * Manually trigger a specific job (for testing/debugging)
   */
  async runJob(jobName) {
    switch (jobName) {
      case 'detect_zero_inventory':
        return await this.detectZeroInventory();
      case 'process_to_order':
        return await this.processToOrder();
      case 'process_deliveries':
        return await this.processDeliveries();
      case 'auto_add_low_stock_to_cart':
        return await this.autoAddLowStockToCart();
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }
}

// Export singleton instance
const scheduler = new AutoOrderScheduler();
module.exports = scheduler;
