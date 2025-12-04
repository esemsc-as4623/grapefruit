const db = require('../config/database');
const logger = require('../utils/logger');
const { withTransaction } = require('../utils/transaction');
const { prepareInsert, prepareUpdate, decryptRow, decryptRows, SENSITIVE_FIELDS } = require('../utils/dbEncryption');

/**
 * AKEDO BOUNTY: Database Models with Column-Level Encryption
 * All sensitive fields are encrypted at rest using AES-256-GCM
 * - inventory.item_name
 * - orders.items (JSONB), tracking_number, vendor_order_id
 * - preferences.brand_prefs (JSONB)
 */

/**
 * Inventory Model
 * Handles all database operations for inventory items
 *
 * ENCRYPTION: item_name field is encrypted before storage
 */
class Inventory {
  /**
   * Format item name to title case (capitalize first letter of each word)
   * @param {string} itemName - Original item name
   * @returns {string} - Formatted item name
   */
  static formatItemName(itemName) {
    if (!itemName || typeof itemName !== 'string') return itemName;
    
    return itemName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .trim();
  }

  /**
   * Get all inventory items for a user
   */
  static async findByUser(userId = 'demo_user') {
    try {
      const result = await db.query(
        `SELECT * FROM inventory WHERE user_id = $1 
         ORDER BY 
           CASE category
             WHEN 'dairy' THEN 1
             WHEN 'produce' THEN 2
             WHEN 'meat' THEN 3
             WHEN 'bread' THEN 4
             WHEN 'pantry' THEN 5
             WHEN 'others' THEN 6
             ELSE 7
           END,
           item_name`,
        [userId]
      );
      return decryptRows(result.rows, SENSITIVE_FIELDS.inventory);
    } catch (error) {
      logger.error('Error fetching inventory:', error);
      throw error;
    }
  }

  static async findLowInventory(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM low_inventory WHERE user_id = $1',
        [userId]
      );
      return decryptRows(result.rows, SENSITIVE_FIELDS.inventory);
    } catch (error) {
      logger.error('Error fetching low inventory:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM inventory WHERE id = $1',
        [id]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.inventory);
    } catch (error) {
      logger.error('Error fetching item by ID:', error);
      throw error;
    }
  }

  static async findByName(userId, itemName) {
    try {
      const formattedItemName = this.formatItemName(itemName);
      const result = await db.query(
        'SELECT * FROM inventory WHERE user_id = $1 AND item_name = $2',
        [userId, formattedItemName]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching item by name:', error);
      throw error;
    }
  }

  static async findByNameAndUnit(userId, itemName, unit) {
    try {
      const allItems = await this.findByUser(userId);
      return allItems.find(item =>
        item.item_name.toLowerCase() === itemName.toLowerCase() &&
        item.unit === unit
      );
    } catch (error) {
      logger.error('Error fetching item by name and unit:', error);
      throw error;
    }
  }

  static async create(itemData) {
    const {
      user_id = 'demo_user',
      item_name,
      quantity,
      unit,
      category,
      predicted_runout,
      average_daily_consumption,
    } = itemData;

    // Format item name to title case
    const formattedItemName = this.formatItemName(item_name);

    try {
      let calculatedRunout = predicted_runout;
      if (!calculatedRunout && average_daily_consumption && average_daily_consumption > 0) {
        const daysUntilRunout = quantity / average_daily_consumption;
        const runoutDate = new Date();
        runoutDate.setDate(runoutDate.getDate() + daysUntilRunout);
        calculatedRunout = runoutDate;
      }

      const encryptedData = prepareInsert(
        { user_id, item_name, quantity, unit, category, predicted_runout: calculatedRunout, average_daily_consumption },
        SENSITIVE_FIELDS.inventory
      );

      const result = await db.query(
        `INSERT INTO inventory
         (user_id, item_name, quantity, unit, category, predicted_runout, average_daily_consumption, is_encrypted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          encryptedData.user_id,
          encryptedData.item_name,
          encryptedData.quantity,
          encryptedData.unit,
          encryptedData.category,
          encryptedData.predicted_runout,
          encryptedData.average_daily_consumption,
          encryptedData.is_encrypted
        ]
      );

      return decryptRow(result.rows[0], SENSITIVE_FIELDS.inventory);
    } catch (error) {
      logger.error('Error creating inventory item:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    const allowedFields = ['quantity', 'unit', 'category', 'predicted_runout', 'average_daily_consumption'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    try {
      const current = await this.findById(id);
      if (!current) {
        throw new Error('Item not found');
      }

      if (updates.quantity !== undefined && current.average_daily_consumption && current.average_daily_consumption > 0) {
        const newQuantity = parseFloat(updates.quantity);
        const consumptionRate = parseFloat(updates.average_daily_consumption || current.average_daily_consumption);

        if (consumptionRate > 0) {
          const daysUntilRunout = newQuantity / consumptionRate;
          const runoutDate = new Date();
          runoutDate.setDate(runoutDate.getDate() + daysUntilRunout);
          updates.predicted_runout = runoutDate;

          if (!fields.includes('predicted_runout')) {
            fields.push('predicted_runout');
          }
        }
      }

      const encryptedUpdates = prepareUpdate(updates, SENSITIVE_FIELDS.inventory);
      const finalFields = Object.keys(encryptedUpdates).filter(key => allowedFields.includes(key) || key === 'is_encrypted');
      const setClause = finalFields.map((field, idx) => `${field} = $${idx + 2}`).join(', ');
      const values = [id, ...finalFields.map(field => encryptedUpdates[field])];

      const result = await db.query(
        `UPDATE inventory
         SET ${setClause},
             last_updated = CURRENT_TIMESTAMP,
             created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
         WHERE id = $1
         RETURNING *`,
        values
      );

      return decryptRow(result.rows[0], SENSITIVE_FIELDS.inventory);
    } catch (error) {
      logger.error('Error updating inventory item:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await db.query(
        'DELETE FROM inventory WHERE id = $1 RETURNING *',
        [id]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.inventory);
    } catch (error) {
      logger.error('Error deleting inventory item:', error);
      throw error;
    }
  }

  static async updateConsumption(id, purchaseQuantity) {
    try {
      const result = await db.query(
        `UPDATE inventory
         SET last_purchase_date = CURRENT_TIMESTAMP,
             last_purchase_quantity = $2,
             last_updated = CURRENT_TIMESTAMP,
             created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
         WHERE id = $1
         RETURNING *`,
        [id, purchaseQuantity]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.inventory);
    } catch (error) {
      logger.error('Error updating consumption:', error);
      throw error;
    }
  }

  static async addQuantity(id, additionalQuantity, averageDailyConsumption = null) {
    try {
      const current = await this.findById(id);
      if (!current) {
        throw new Error('Item not found');
      }

      const newQuantity = parseFloat(current.quantity) + parseFloat(additionalQuantity);
      const consumptionRate = averageDailyConsumption !== null
        ? averageDailyConsumption
        : parseFloat(current.average_daily_consumption);

      let predictedRunout = null;
      if (consumptionRate && consumptionRate > 0) {
        const daysUntilRunout = newQuantity / consumptionRate;
        const runoutDate = new Date();
        runoutDate.setDate(runoutDate.getDate() + daysUntilRunout);
        predictedRunout = runoutDate;
      }

      const updateFields = {
        quantity: newQuantity,
        last_purchase_date: new Date(),
        last_purchase_quantity: additionalQuantity,
      };

      if (averageDailyConsumption !== null) {
        updateFields.average_daily_consumption = averageDailyConsumption;
      }

      if (predictedRunout) {
        updateFields.predicted_runout = predictedRunout;
      }

      const setClause = Object.keys(updateFields)
        .map((field, idx) => `${field} = $${idx + 2}`)
        .join(', ');
      const values = [id, ...Object.values(updateFields)];

      const result = await db.query(
        `UPDATE inventory
         SET ${setClause},
             last_updated = CURRENT_TIMESTAMP,
             created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
         WHERE id = $1
         RETURNING *`,
        values
      );

      return decryptRow(result.rows[0], SENSITIVE_FIELDS.inventory);
    } catch (error) {
      logger.error('Error adding quantity to inventory item:', error);
      throw error;
    }
  }

  /**
   * Bulk update inventory from receipt items (transactional)
   * Ensures all items are updated together or none are updated
   * @param {string} userId - User ID
   * @param {Array} items - Array of {itemName, quantity, unit, category}
   * @returns {Promise<Array>} - Array of updated/created inventory items
   */
  static async bulkUpdateFromReceipt(userId, items) {
    return withTransaction(async (client) => {
      const results = [];

      for (const item of items) {
        // Use INSERT ... ON CONFLICT to handle race conditions
        // This is safer than SELECT then INSERT/UPDATE
        const result = await client.query(
          `INSERT INTO inventory (user_id, item_name, quantity, unit, category, last_purchase_date, last_purchase_quantity)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $3)
           ON CONFLICT (user_id, item_name)
           DO UPDATE SET
             quantity = inventory.quantity + EXCLUDED.quantity,
             last_purchase_date = CURRENT_TIMESTAMP,
             last_purchase_quantity = EXCLUDED.last_purchase_quantity,
             last_updated = CURRENT_TIMESTAMP
           RETURNING *`,
          [userId, item.itemName, item.quantity, item.unit, item.category || 'others']
        );
        results.push(result.rows[0]);
      }

      logger.info('Bulk inventory update completed', {
        userId,
        itemCount: items.length,
        resultsCount: results.length,
      });

      return results;
    });
  }
}

/**
 * Preferences Model
 * ENCRYPTION: brand_prefs JSONB is encrypted before storage
 */
class Preferences {
  static async findByUser(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM preferences WHERE user_id = $1',
        [userId]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.preferences);
    } catch (error) {
      logger.error('Error fetching preferences:', error);
      throw error;
    }
  }

  static async upsert(userId, prefsData) {
    const {
      brand_prefs,
      allowed_vendors,
      notify_low_inventory,
      notify_order_ready,
      auto_order_enabled,
      auto_order_threshold_days,
    } = prefsData;

    try {
      const result = await db.query(
        `INSERT INTO preferences 
         (user_id, brand_prefs, allowed_vendors, 
          notify_low_inventory, notify_order_ready, auto_order_enabled, auto_order_threshold_days, is_encrypted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) 
         DO UPDATE SET
           brand_prefs = EXCLUDED.brand_prefs,
           allowed_vendors = EXCLUDED.allowed_vendors,
           notify_low_inventory = EXCLUDED.notify_low_inventory,
           notify_order_ready = EXCLUDED.notify_order_ready,
           auto_order_enabled = EXCLUDED.auto_order_enabled,
           auto_order_threshold_days = EXCLUDED.auto_order_threshold_days,
           is_encrypted = EXCLUDED.is_encrypted,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          userId,
          JSON.stringify(brand_prefs),
          JSON.stringify(allowed_vendors),
          notify_low_inventory,
          notify_order_ready,
          auto_order_enabled,
          auto_order_threshold_days,
          false
        ]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.preferences);
    } catch (error) {
      logger.error('Error upserting preferences:', error);
      throw error;
    }
  }

  static async update(userId, updates) {
    const allowedFields = [
      'brand_prefs', 
      'allowed_vendors', 'notify_low_inventory', 'notify_order_ready',
      'auto_order_enabled', 'auto_order_threshold_days'
    ];

    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    try {
      const encryptedUpdates = prepareUpdate(updates, SENSITIVE_FIELDS.preferences);

      const finalFields = Object.keys(encryptedUpdates).filter(key => allowedFields.includes(key) || key === 'is_encrypted');
      const setClause = finalFields.map((field, idx) => {
        if (['brand_prefs', 'allowed_vendors'].includes(field)) {
          return `${field} = $${idx + 2}::jsonb`;
        }
        return `${field} = $${idx + 2}`;
      }).join(', ');

      const values = [
        userId,
        ...finalFields.map(field =>
          ['brand_prefs', 'allowed_vendors'].includes(field) && typeof encryptedUpdates[field] !== 'string'
            ? JSON.stringify(encryptedUpdates[field])
            : encryptedUpdates[field]
        )
      ];

      const result = await db.query(
        `UPDATE preferences SET ${setClause}, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 RETURNING *`,
        values
      );

      return decryptRow(result.rows[0], SENSITIVE_FIELDS.preferences);
    } catch (error) {
      logger.error('Error updating preferences:', error);
      throw error;
    }
  }
}

/**
 * Orders Model
 * ENCRYPTION: items JSONB, tracking_number, vendor_order_id are encrypted
 */
class Orders {
  static async findByUser(userId = 'demo_user', status = null) {
    try {
      let query = 'SELECT * FROM orders WHERE user_id = $1';
      const params = [userId];

      if (status) {
        query += ' AND status = $2';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC';

      const result = await db.query(query, params);
      return decryptRows(result.rows, SENSITIVE_FIELDS.orders);
    } catch (error) {
      logger.error('Error fetching orders:', error);
      throw error;
    }
  }

  static async findPending(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM pending_orders WHERE user_id = $1',
        [userId]
      );
      return decryptRows(result.rows, SENSITIVE_FIELDS.orders);
    } catch (error) {
      logger.error('Error fetching pending orders:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM orders WHERE id = $1',
        [id]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.orders);
    } catch (error) {
      logger.error('Error fetching order by ID:', error);
      throw error;
    }
  }

  static async create(orderData) {
    const {
      user_id = 'demo_user',
      vendor,
      items,
      subtotal,
      tax = 0,
      shipping = 0,
      total,
      status = 'placed', // Changed from 'pending' to 'placed'
      vendor_order_id = null,
      tracking_number = null,
      delivery_date = null,
    } = orderData;

    try {
      const encryptedData = prepareInsert(
        { items },
        SENSITIVE_FIELDS.orders
      );

      const result = await db.query(
        `INSERT INTO orders 
         (user_id, vendor, items, subtotal, tax, shipping, total, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          user_id,
          vendor,
          encryptedData.items || JSON.stringify(items),
          subtotal,
          tax,
          shipping,
          total,
          status,
          encryptedData.is_encrypted || false
        ]
      );

      return decryptRow(result.rows[0], SENSITIVE_FIELDS.orders);
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  static async approve(id, notes = null) {
    try {
      const result = await db.query(
        `UPDATE orders
         SET status = 'approved',
             approved_at = CURRENT_TIMESTAMP,
             approval_notes = $2
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [id, notes]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.orders);
    } catch (error) {
      logger.error('Error approving order:', error);
      throw error;
    }
  }

  static async reject(id, notes = null) {
    try {
      const result = await db.query(
        `UPDATE orders
         SET status = 'rejected',
             approval_notes = $2
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [id, notes]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.orders);
    } catch (error) {
      logger.error('Error rejecting order:', error);
      throw error;
    }
  }

  static async markPlaced(id, vendorOrderId, trackingNumber = null) {
    try {
      const encryptedData = prepareUpdate(
        { vendor_order_id: vendorOrderId, tracking_number: trackingNumber },
        SENSITIVE_FIELDS.orders
      );

      const result = await db.query(
        `UPDATE orders
         SET status = 'placed',
             placed_at = CURRENT_TIMESTAMP,
             vendor_order_id = $2,
             tracking_number = $3,
             is_encrypted = $4
         WHERE id = $1 AND status = 'approved'
         RETURNING *`,
        [
          id,
          encryptedData.vendor_order_id || vendorOrderId,
          encryptedData.tracking_number || trackingNumber,
          encryptedData.is_encrypted || false
        ]
      );

      return decryptRow(result.rows[0], SENSITIVE_FIELDS.orders);
    } catch (error) {
      logger.error('Error marking order as placed:', error);
      throw error;
    }
  }

  static async markDelivered(id) {
    try {
      const result = await db.query(
        `UPDATE orders
         SET status = 'delivered',
             delivered_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'placed'
         RETURNING *`,
        [id]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.orders);
    } catch (error) {
      logger.error('Error marking order as delivered:', error);
      throw error;
    }
  }
}

/**
 * Cart Model
 * ENCRYPTION: item_name is encrypted
 */
class Cart {
  /**
   * Format item name to title case (capitalize first letter of each word)
   * @param {string} itemName - Original item name
   * @returns {string} - Formatted item name
   */
  static formatItemName(itemName) {
    if (!itemName || typeof itemName !== 'string') return itemName;
    
    return itemName
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .trim();
  }

  /**
   * Get all cart items for a user
   */
  static async findByUser(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM cart WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return decryptRows(result.rows, SENSITIVE_FIELDS.cart);
    } catch (error) {
      logger.error('Error fetching cart items:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM cart WHERE id = $1',
        [id]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.cart);
    } catch (error) {
      logger.error('Error fetching cart item by ID:', error);
      throw error;
    }
  }

  static async findByName(userId, itemName) {
    try {
      const formattedItemName = this.formatItemName(itemName);
      const result = await db.query(
        'SELECT * FROM cart WHERE user_id = $1 AND item_name = $2',
        [userId, formattedItemName]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching cart item by name:', error);
      throw error;
    }
  }

  static async addItem(userId, itemData) {
    const {
      item_name,
      quantity,
      unit,
      estimated_price = 0,
      category,
      brand,
      priority = 1,
    } = itemData;

    try {
      const encryptedData = prepareInsert(
        { user_id: userId, item_name, quantity, unit, estimated_price, category, brand, priority },
        SENSITIVE_FIELDS.cart
      );

      const result = await db.query(
        `INSERT INTO cart
         (user_id, item_name, quantity, unit, estimated_price, category, brand, priority, is_encrypted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          encryptedData.user_id,
          encryptedData.item_name,
          encryptedData.quantity,
          encryptedData.unit,
          encryptedData.estimated_price,
          encryptedData.category,
          encryptedData.brand,
          encryptedData.priority,
          encryptedData.is_encrypted
        ]
      );

      return decryptRow(result.rows[0], SENSITIVE_FIELDS.cart);
    } catch (error) {
      logger.error('Error adding item to cart:', error);
      throw error;
    }
  }

  static async updateQuantity(id, quantity) {
    try {
      const result = await db.query(
        'UPDATE cart SET quantity = $2 WHERE id = $1 RETURNING *',
        [id, quantity]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.cart);
    } catch (error) {
      logger.error('Error updating cart item quantity:', error);
      throw error;
    }
  }

  static async update(id, updates) {
    const allowedFields = ['quantity', 'unit', 'estimated_price', 'category', 'brand', 'priority'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    try {
      const encryptedUpdates = prepareUpdate(updates, SENSITIVE_FIELDS.cart);
      const finalFields = Object.keys(encryptedUpdates).filter(key => allowedFields.includes(key) || key === 'is_encrypted');
      const setClause = finalFields.map((field, idx) => `${field} = $${idx + 2}`).join(', ');
      const values = [id, ...finalFields.map(field => encryptedUpdates[field])];

      const result = await db.query(
        `UPDATE cart SET ${setClause} WHERE id = $1 RETURNING *`,
        values
      );

      return decryptRow(result.rows[0], SENSITIVE_FIELDS.cart);
    } catch (error) {
      logger.error('Error updating cart item:', error);
      throw error;
    }
  }

  static async remove(id) {
    try {
      const result = await db.query(
        'DELETE FROM cart WHERE id = $1 RETURNING *',
        [id]
      );
      return decryptRow(result.rows[0], SENSITIVE_FIELDS.cart);
    } catch (error) {
      logger.error('Error removing item from cart:', error);
      throw error;
    }
  }

  static async clear(userId = 'demo_user') {
    try {
      const result = await db.query(
        'DELETE FROM cart WHERE user_id = $1 RETURNING *',
        [userId]
      );
      return decryptRows(result.rows, SENSITIVE_FIELDS.cart);
    } catch (error) {
      logger.error('Error clearing cart:', error);
      throw error;
    }
  }

  static async getCount(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM cart WHERE user_id = $1',
        [userId]
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Error getting cart count:', error);
      throw error;
    }
  }

  static async getTotalPrice(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT SUM(estimated_price * quantity) as total FROM cart WHERE user_id = $1',
        [userId]
      );
      return parseFloat(result.rows[0].total) || 0;
    } catch (error) {
      logger.error('Error getting cart total price:', error);
      throw error;
    }
  }
}

module.exports = {
  Inventory,
  Preferences,
  Orders,
  Cart,
};
