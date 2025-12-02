const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Inventory Model
 * Handles all database operations for inventory items
 */
class Inventory {
  /**
   * Get all inventory items for a user
   */
  static async findByUser(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM inventory WHERE user_id = $1 ORDER BY category, item_name',
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching inventory:', error);
      throw error;
    }
  }

  /**
   * Get items running low (using view)
   */
  static async findLowInventory(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM low_inventory WHERE user_id = $1',
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching low inventory:', error);
      throw error;
    }
  }

  /**
   * Get single item by ID
   */
  static async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM inventory WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching item by ID:', error);
      throw error;
    }
  }

  /**
   * Find item by name and user
   */
  static async findByName(userId, itemName) {
    try {
      const result = await db.query(
        'SELECT * FROM inventory WHERE user_id = $1 AND item_name = $2',
        [userId, itemName]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching item by name:', error);
      throw error;
    }
  }

  /**
   * Find item by name and unit for a user
   * Used for matching receipt items to existing inventory
   */
  static async findByNameAndUnit(userId, itemName, unit) {
    try {
      const result = await db.query(
        'SELECT * FROM inventory WHERE user_id = $1 AND LOWER(item_name) = LOWER($2) AND unit = $3',
        [userId, itemName, unit]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching item by name and unit:', error);
      throw error;
    }
  }

  /**
   * Create new inventory item
   */
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

    try {
      // Calculate predicted_runout if consumption rate is provided
      let calculatedRunout = predicted_runout;
      if (!calculatedRunout && average_daily_consumption && average_daily_consumption > 0) {
        const daysUntilRunout = quantity / average_daily_consumption;
        const runoutDate = new Date();
        runoutDate.setDate(runoutDate.getDate() + daysUntilRunout);
        calculatedRunout = runoutDate;
      }

      const result = await db.query(
        `INSERT INTO inventory 
         (user_id, item_name, quantity, unit, category, predicted_runout, average_daily_consumption)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [user_id, item_name, quantity, unit, category, calculatedRunout, average_daily_consumption]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating inventory item:', error);
      throw error;
    }
  }

  /**
   * Update inventory item
   */
  static async update(id, updates) {
    const allowedFields = ['quantity', 'unit', 'category', 'predicted_runout', 'average_daily_consumption'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    try {
      // Get current item to check for consumption rate
      const current = await this.findById(id);
      if (!current) {
        throw new Error('Item not found');
      }

      // If quantity is being updated and we have a consumption rate, recalculate predicted_runout
      if (updates.quantity !== undefined && current.average_daily_consumption && current.average_daily_consumption > 0) {
        const newQuantity = parseFloat(updates.quantity);
        const consumptionRate = parseFloat(updates.average_daily_consumption || current.average_daily_consumption);
        
        if (consumptionRate > 0) {
          const daysUntilRunout = newQuantity / consumptionRate;
          const runoutDate = new Date();
          runoutDate.setDate(runoutDate.getDate() + daysUntilRunout);
          updates.predicted_runout = runoutDate;
          
          // Add predicted_runout to fields if not already there
          if (!fields.includes('predicted_runout')) {
            fields.push('predicted_runout');
          }
        }
      }

      const setClause = fields.map((field, idx) => `${field} = $${idx + 2}`).join(', ');
      const values = [id, ...fields.map(field => updates[field])];

      const result = await db.query(
        `UPDATE inventory 
         SET ${setClause}, 
             last_updated = CURRENT_TIMESTAMP,
             created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
         WHERE id = $1 
         RETURNING *`,
        values
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating inventory item:', error);
      throw error;
    }
  }

  /**
   * Delete inventory item
   */
  static async delete(id) {
    try {
      const result = await db.query(
        'DELETE FROM inventory WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting inventory item:', error);
      throw error;
    }
  }

  /**
   * Update consumption tracking (called after purchase)
   */
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
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating consumption:', error);
      throw error;
    }
  }

  /**
   * Add quantity to existing item and recalculate runout date
   */
  static async addQuantity(id, additionalQuantity, averageDailyConsumption = null) {
    try {
      // Get current item to access current quantity and consumption rate
      const current = await this.findById(id);
      if (!current) {
        throw new Error('Item not found');
      }

      const newQuantity = parseFloat(current.quantity) + parseFloat(additionalQuantity);
      const consumptionRate = averageDailyConsumption !== null 
        ? averageDailyConsumption 
        : parseFloat(current.average_daily_consumption);

      // Calculate new predicted runout if we have a consumption rate
      let predictedRunout = null;
      if (consumptionRate && consumptionRate > 0) {
        const daysUntilRunout = newQuantity / consumptionRate;
        const runoutDate = new Date();
        runoutDate.setDate(runoutDate.getDate() + daysUntilRunout);
        predictedRunout = runoutDate;
      }

      // Update the item
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

      return result.rows[0];
    } catch (error) {
      logger.error('Error adding quantity to inventory item:', error);
      throw error;
    }
  }
}

/**
 * Preferences Model
 * Handles user preferences for spending, brands, and vendors
 */
class Preferences {
  /**
   * Get user preferences
   */
  static async findByUser(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM preferences WHERE user_id = $1',
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching preferences:', error);
      throw error;
    }
  }

  /**
   * Create or update preferences (upsert)
   */
  static async upsert(userId, prefsData) {
    const {
      max_spend,
      approval_mode,
      auto_approve_limit,
      brand_prefs,
      allowed_vendors,
      notify_low_inventory,
      notify_order_ready,
    } = prefsData;

    try {
      const result = await db.query(
        `INSERT INTO preferences 
         (user_id, max_spend, approval_mode, auto_approve_limit, brand_prefs, allowed_vendors, 
          notify_low_inventory, notify_order_ready)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) 
         DO UPDATE SET
           max_spend = EXCLUDED.max_spend,
           approval_mode = EXCLUDED.approval_mode,
           auto_approve_limit = EXCLUDED.auto_approve_limit,
           brand_prefs = EXCLUDED.brand_prefs,
           allowed_vendors = EXCLUDED.allowed_vendors,
           notify_low_inventory = EXCLUDED.notify_low_inventory,
           notify_order_ready = EXCLUDED.notify_order_ready,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [userId, max_spend, approval_mode, auto_approve_limit, 
         JSON.stringify(brand_prefs), JSON.stringify(allowed_vendors),
         notify_low_inventory, notify_order_ready]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error upserting preferences:', error);
      throw error;
    }
  }

  /**
   * Update specific preference fields
   */
  static async update(userId, updates) {
    const allowedFields = [
      'max_spend', 'approval_mode', 'auto_approve_limit', 'brand_prefs', 
      'allowed_vendors', 'notify_low_inventory', 'notify_order_ready'
    ];
    
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field, idx) => {
      // JSON fields need special handling
      if (['brand_prefs', 'allowed_vendors'].includes(field)) {
        return `${field} = $${idx + 2}::jsonb`;
      }
      return `${field} = $${idx + 2}`;
    }).join(', ');

    const values = [
      userId, 
      ...fields.map(field => 
        ['brand_prefs', 'allowed_vendors'].includes(field) 
          ? JSON.stringify(updates[field]) 
          : updates[field]
      )
    ];

    try {
      const result = await db.query(
        `UPDATE preferences SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $1 RETURNING *`,
        values
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating preferences:', error);
      throw error;
    }
  }
}

/**
 * Orders Model
 * Handles order creation and approval workflow
 */
class Orders {
  /**
   * Get all orders for a user
   */
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
      return result.rows;
    } catch (error) {
      logger.error('Error fetching orders:', error);
      throw error;
    }
  }

  /**
   * Get pending orders (using view)
   */
  static async findPending(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM pending_orders WHERE user_id = $1',
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching pending orders:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  static async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM orders WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching order by ID:', error);
      throw error;
    }
  }

  /**
   * Create new order
   */
  static async create(orderData) {
    const {
      user_id = 'demo_user',
      vendor,
      items,
      subtotal,
      tax = 0,
      shipping = 0,
      total,
      status = 'pending',
    } = orderData;

    try {
      const result = await db.query(
        `INSERT INTO orders 
         (user_id, vendor, items, subtotal, tax, shipping, total, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [user_id, vendor, JSON.stringify(items), subtotal, tax, shipping, total, status]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  /**
   * Approve order
   */
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
      return result.rows[0];
    } catch (error) {
      logger.error('Error approving order:', error);
      throw error;
    }
  }

  /**
   * Reject order
   */
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
      return result.rows[0];
    } catch (error) {
      logger.error('Error rejecting order:', error);
      throw error;
    }
  }

  /**
   * Mark order as placed with vendor
   */
  static async markPlaced(id, vendorOrderId, trackingNumber = null) {
    try {
      const result = await db.query(
        `UPDATE orders 
         SET status = 'placed',
             placed_at = CURRENT_TIMESTAMP,
             vendor_order_id = $2,
             tracking_number = $3
         WHERE id = $1 AND status = 'approved'
         RETURNING *`,
        [id, vendorOrderId, trackingNumber]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error marking order as placed:', error);
      throw error;
    }
  }

  /**
   * Mark order as delivered
   */
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
      return result.rows[0];
    } catch (error) {
      logger.error('Error marking order as delivered:', error);
      throw error;
    }
  }
}

/**
 * Cart Model
 * Handles shopping cart/list operations before items become orders
 */
class Cart {
  /**
   * Get all cart items for a user
   */
  static async findByUser(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT * FROM cart WHERE user_id = $1 ORDER BY added_at DESC',
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching cart items:', error);
      throw error;
    }
  }

  /**
   * Get single cart item by ID
   */
  static async findById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM cart WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching cart item by ID:', error);
      throw error;
    }
  }

  /**
   * Find cart item by name and user
   */
  static async findByName(userId, itemName) {
    try {
      const result = await db.query(
        'SELECT * FROM cart WHERE user_id = $1 AND item_name = $2',
        [userId, itemName]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching cart item by name:', error);
      throw error;
    }
  }

  /**
   * Add item to cart (or update quantity if exists)
   */
  static async addItem(itemData) {
    const {
      user_id = 'demo_user',
      item_name,
      quantity,
      unit,
      category,
      estimated_price,
      notes,
      source = 'manual',
    } = itemData;

    try {
      // Check if item already exists in cart
      const existing = await this.findByName(user_id, item_name);
      
      if (existing) {
        // Update quantity
        const newQuantity = parseFloat(existing.quantity) + parseFloat(quantity);
        const result = await db.query(
          `UPDATE cart 
           SET quantity = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [newQuantity, existing.id]
        );
        return result.rows[0];
      } else {
        // Insert new item
        const result = await db.query(
          `INSERT INTO cart 
           (user_id, item_name, quantity, unit, category, estimated_price, notes, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [user_id, item_name, quantity, unit, category, estimated_price, notes, source]
        );
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Error adding item to cart:', error);
      throw error;
    }
  }

  /**
   * Update cart item quantity
   */
  static async updateQuantity(id, quantity) {
    try {
      const result = await db.query(
        `UPDATE cart 
         SET quantity = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, quantity]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating cart item quantity:', error);
      throw error;
    }
  }

  /**
   * Update cart item
   */
  static async update(id, updates) {
    const allowedFields = ['quantity', 'unit', 'category', 'estimated_price', 'notes'];
    const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
    
    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((field, idx) => `${field} = $${idx + 2}`).join(', ');
    const values = [id, ...fields.map(field => updates[field])];

    try {
      const result = await db.query(
        `UPDATE cart 
         SET ${setClause}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 
         RETURNING *`,
        values
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating cart item:', error);
      throw error;
    }
  }

  /**
   * Remove item from cart
   */
  static async removeItem(id) {
    try {
      const result = await db.query(
        'DELETE FROM cart WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error removing item from cart:', error);
      throw error;
    }
  }

  /**
   * Clear all cart items for a user
   */
  static async clearCart(userId = 'demo_user') {
    try {
      const result = await db.query(
        'DELETE FROM cart WHERE user_id = $1 RETURNING *',
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error clearing cart:', error);
      throw error;
    }
  }

  /**
   * Get cart total count
   */
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

  /**
   * Get cart total estimated price
   */
  static async getTotalPrice(userId = 'demo_user') {
    try {
      const result = await db.query(
        'SELECT SUM(estimated_price * quantity) as total FROM cart WHERE user_id = $1',
        [userId]
      );
      return parseFloat(result.rows[0].total || 0);
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
