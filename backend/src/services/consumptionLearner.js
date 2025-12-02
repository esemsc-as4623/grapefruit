/**
 * Consumption Learner Service
 * Learns and predicts item consumption rates using ML techniques
 * 
 * Learning Sources:
 * - Simulation events: Daily consumption simulation
 * - Manual depletions: User reduces quantity via PUT /inventory/:id
 * - Manual deletions: User deletes item with remaining quantity
 * - Time-based tracking: Records time elapsed between events
 * 
 * Algorithm Selection:
 * - < 2 days of data: Use category estimate (insufficient data)
 * - 2 days to 1 week: Simple Moving Average
 * - 1 week to 2 weeks: Exponential Weighted Moving Average (EWMA)
 * - >= 2 weeks: Linear Regression with temporal features
 * 
 * @module services/consumptionLearner
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Record a consumption event for ML learning
 * @param {Object} params - Event parameters
 * @param {string} params.userId - User ID
 * @param {string} params.itemName - Item name
 * @param {number} params.quantityBefore - Quantity before change
 * @param {number} params.quantityAfter - Quantity after change
 * @param {string} params.eventType - Type of event (simulation, manual_update, deletion, purchase, receipt_scan)
 * @param {string} params.source - Source of event (user, simulation, api)
 * @param {string} params.unit - Item unit
 * @param {string} params.category - Item category
 * @param {Date} params.itemCreatedAt - When item was first added to inventory
 * @returns {Promise<Object>} - The created consumption event
 */
async function recordConsumptionEvent({
  userId,
  itemName,
  quantityBefore,
  quantityAfter,
  eventType,
  source,
  unit,
  category,
  itemCreatedAt,
}) {
  try {
    const quantityConsumed = quantityBefore - quantityAfter;
    
    // Skip if no actual consumption occurred (unchanged quantity)
    if (quantityConsumed === 0) {
      return null;
    }

    // Get last event for this item to calculate days elapsed
    const lastEventResult = await db.query(
      `SELECT timestamp FROM consumption_history 
       WHERE user_id = $1 AND item_name = $2 
       ORDER BY timestamp DESC LIMIT 1`,
      [userId, itemName]
    );

    let daysElapsed;
    
    // For manual actions (source='user'), use minimal time since they happen instantly
    if (source === 'user') {
      daysElapsed = 0.01; // Minimal value to indicate instant action
    } else if (lastEventResult.rows.length > 0) {
      // For simulation events, calculate actual time difference
      const lastTimestamp = new Date(lastEventResult.rows[0].timestamp);
      daysElapsed = (Date.now() - lastTimestamp.getTime()) / (1000 * 60 * 60 * 24);
    } else {
      // First event - use days since item was created
      const createdAt = itemCreatedAt ? new Date(itemCreatedAt) : new Date();
      daysElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      daysElapsed = Math.max(0.1, daysElapsed); // Minimum 0.1 days to avoid division by zero
    }

    // Calculate days in inventory (total lifespan)
    // For manual actions, use 0 to indicate no time passage
    const createdAt = itemCreatedAt ? new Date(itemCreatedAt) : new Date();
    const daysInInventory = source === 'user' 
      ? 0 
      : (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    const result = await db.query(
      `INSERT INTO consumption_history 
       (user_id, item_name, quantity_before, quantity_after, quantity_consumed, 
        days_elapsed, days_in_inventory, event_type, source, unit, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        itemName,
        quantityBefore,
        quantityAfter,
        quantityConsumed,
        daysElapsed,
        daysInInventory,
        eventType,
        source,
        unit,
        category,
      ]
    );

    logger.info(
      `Recorded consumption event: ${itemName} consumed ${quantityConsumed.toFixed(2)} over ${daysElapsed.toFixed(2)} days (source: ${source})`
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error recording consumption event:', error);
    throw error;
  }
}

/**
 * Get consumption history for an item
 * @param {string} userId - User ID
 * @param {string} itemName - Item name
 * @param {number} daysBack - Number of days to look back (default: 90)
 * @returns {Promise<Array>} - Array of consumption events
 */
async function getConsumptionHistory(userId, itemName, daysBack = 90) {
  try {
    const result = await db.query(
      `SELECT * FROM consumption_history
       WHERE user_id = $1 AND item_name = $2 
         AND quantity_consumed > 0
         AND timestamp > NOW() - INTERVAL '${daysBack} days'
       ORDER BY timestamp ASC`,
      [userId, itemName]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error fetching consumption history:', error);
    return [];
  }
}

/**
 * Calculate Simple Moving Average consumption rate
 * Used when we have 2 days to 1 week of data
 * @param {Array} events - Array of consumption events
 * @returns {number|null} - Average daily consumption rate
 */
function calculateSimpleMovingAverage(events) {
  if (events.length === 0) {
    return null;
  }

  const totalConsumed = events.reduce(
    (sum, event) => sum + parseFloat(event.quantity_consumed),
    0
  );
  const totalDays = events.reduce(
    (sum, event) => sum + parseFloat(event.days_elapsed),
    0
  );

  if (totalDays === 0) {
    return null;
  }

  return totalConsumed / totalDays;
}

/**
 * Calculate Exponential Weighted Moving Average consumption rate
 * Used when we have 1 week to 2 weeks of data
 * Gives more weight to recent observations
 * @param {Array} events - Array of consumption events (sorted chronologically)
 * @param {number} alpha - Smoothing factor (0-1), higher = more weight to recent (default: 0.3)
 * @returns {number|null} - EWMA daily consumption rate
 */
function calculateEWMA(events, alpha = 0.3) {
  if (events.length === 0) {
    return null;
  }

  // Start with first observation
  let ewma =
    parseFloat(events[0].quantity_consumed) / parseFloat(events[0].days_elapsed);

  // Apply EWMA formula to subsequent observations
  for (let i = 1; i < events.length; i++) {
    const dailyRate =
      parseFloat(events[i].quantity_consumed) / parseFloat(events[i].days_elapsed);
    ewma = alpha * dailyRate + (1 - alpha) * ewma;
  }

  return ewma;
}

/**
 * Calculate consumption rate using Linear Regression with temporal features
 * Used when we have >= 2 weeks of data
 * @param {Array} events - Array of consumption events
 * @param {Object} itemContext - Current item context (category, unit, etc.)
 * @returns {number|null} - Predicted daily consumption rate
 */
function calculateLinearRegression(events, itemContext = {}) {
  if (events.length < 7) {
    // Need at least a week of data for meaningful regression
    return null;
  }

  // Prepare features and targets
  const features = [];
  const targets = [];

  events.forEach((event) => {
    const timestamp = new Date(event.timestamp);
    const dayOfWeek = timestamp.getDay(); // 0-6
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
    const monthOfYear = timestamp.getMonth(); // 0-11
    const daysInInventory = parseFloat(event.days_in_inventory);

    // Simple feature encoding
    features.push([
      dayOfWeek / 6, // Normalized day of week
      isWeekend,
      monthOfYear / 11, // Normalized month
      daysInInventory / 30, // Normalized days in inventory (assume 30 day max for normalization)
      1, // Bias term
    ]);

    const dailyRate =
      parseFloat(event.quantity_consumed) / parseFloat(event.days_elapsed);
    targets.push(dailyRate);
  });

  // Simple linear regression using least squares
  // y = wx + b, solve for w using normal equation: w = (X^T X)^-1 X^T y
  const X = features;
  const y = targets;
  const n = X.length;
  const m = X[0].length;

  // Calculate X^T X
  const XtX = Array(m)
    .fill(0)
    .map(() => Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < n; k++) {
        XtX[i][j] += X[k][i] * X[k][j];
      }
    }
  }

  // Calculate X^T y
  const Xty = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < n; k++) {
      Xty[i] += X[k][i] * y[k];
    }
  }

  // Solve for weights using Gaussian elimination (simplified)
  // For production, use a proper linear algebra library
  const weights = gaussianElimination(XtX, Xty);

  if (!weights) {
    // Fallback to EWMA if matrix is singular
    return calculateEWMA(events);
  }

  // Calculate current prediction
  const now = new Date();
  const currentFeatures = [
    now.getDay() / 6,
    (now.getDay() === 0 || now.getDay() === 6 ? 1 : 0),
    now.getMonth() / 11,
    parseFloat(itemContext.daysInInventory || 1) / 30,
    1,
  ];

  let prediction = 0;
  for (let i = 0; i < weights.length; i++) {
    prediction += weights[i] * currentFeatures[i];
  }

  // Ensure non-negative prediction
  return Math.max(0, prediction);
}

/**
 * Gaussian elimination for solving linear systems
 * Simplified implementation for small matrices
 * @param {Array<Array<number>>} A - Coefficient matrix
 * @param {Array<number>} b - Right-hand side vector
 * @returns {Array<number>|null} - Solution vector or null if singular
 */
function gaussianElimination(A, b) {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);

  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    // Check for singular matrix
    if (Math.abs(augmented[i][i]) < 1e-10) {
      return null;
    }

    // Eliminate column
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j < n + 1; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  // Back substitution
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }

  return x;
}

/**
 * Learn and update consumption rate for an item
 * Automatically selects best algorithm based on data availability
 * @param {string} userId - User ID
 * @param {string} itemName - Item name
 * @param {Object} itemContext - Current item context (category, unit, daysInInventory, etc.)
 * @returns {Promise<Object>} - Learning result with rate and algorithm used
 */
async function learnConsumptionRate(userId, itemName, itemContext = {}) {
  try {
    // Get consumption history
    const events = await getConsumptionHistory(userId, itemName);

    if (events.length === 0) {
      logger.info(`No consumption history for ${itemName}, using category estimate`);
      return {
        rate: await estimateFromCategory(userId, itemContext.category),
        algorithm: 'category_estimate',
        confidence: 'low',
        dataPoints: 0,
      };
    }

    // Calculate total days of data (only days when item was in inventory)
    const firstEvent = new Date(events[0].timestamp);
    const lastEvent = new Date(events[events.length - 1].timestamp);
    const totalDataDays = (lastEvent - firstEvent) / (1000 * 60 * 60 * 24);

    let rate;
    let algorithm;
    let confidence;

    // Algorithm selection based on data availability
    if (totalDataDays < 2) {
      // < 2 days: Not enough data, use category estimate
      rate = await estimateFromCategory(userId, itemContext.category);
      algorithm = 'insufficient_data_category_fallback';
      confidence = 'very_low';
    } else if (totalDataDays < 7) {
      // 2 days to 1 week: Simple Moving Average
      rate = calculateSimpleMovingAverage(events);
      algorithm = 'simple_moving_average';
      confidence = 'low';
    } else if (totalDataDays < 14) {
      // 1 week to 2 weeks: EWMA
      rate = calculateEWMA(events, 0.3);
      algorithm = 'ewma';
      confidence = 'medium';
    } else {
      // >= 2 weeks: Linear Regression
      rate = calculateLinearRegression(events, itemContext);
      algorithm = 'linear_regression';
      confidence = 'high';
    }

    if (rate === null || rate <= 0) {
      // Fallback to category estimate
      rate = await estimateFromCategory(userId, itemContext.category);
      algorithm = `${algorithm}_fallback_category`;
      confidence = 'low';
    }

    logger.info(
      `Learned consumption rate for ${itemName}: ${rate.toFixed(4)} using ${algorithm} (${events.length} data points over ${totalDataDays.toFixed(1)} days)`
    );

    return {
      rate,
      algorithm,
      confidence,
      dataPoints: events.length,
      dataDays: totalDataDays,
    };
  } catch (error) {
    logger.error(`Error learning consumption rate for ${itemName}:`, error);
    return {
      rate: await estimateFromCategory(userId, itemContext.category),
      algorithm: 'error_fallback',
      confidence: 'very_low',
      dataPoints: 0,
    };
  }
}

/**
 * Estimate consumption rate from category averages
 * Used as fallback when no item-specific data is available
 * @param {string} userId - User ID
 * @param {string} category - Item category
 * @returns {Promise<number>} - Estimated daily consumption rate
 */
async function estimateFromCategory(userId, category) {
  try {
    // Get average consumption rate for this category from user's history
    const result = await db.query(
      `SELECT AVG(i.average_daily_consumption) as avg_consumption
       FROM inventory i
       WHERE i.user_id = $1 AND i.category = $2 
         AND i.average_daily_consumption IS NOT NULL
         AND i.average_daily_consumption > 0`,
      [userId, category]
    );

    if (result.rows[0]?.avg_consumption) {
      return parseFloat(result.rows[0].avg_consumption);
    }

    // Fallback: global category defaults
    const categoryDefaults = {
      dairy: 0.5,
      produce: 0.3,
      pantry: 0.1,
      frozen: 0.2,
      beverages: 0.4,
      meat: 0.3,
      snacks: 0.2,
      bakery: 0.25,
      condiments: 0.05,
      household: 0.1,
    };

    const categoryLower = (category || '').toLowerCase();
    return categoryDefaults[categoryLower] || 0.25; // Default fallback
  } catch (error) {
    logger.error('Error estimating from category:', error);
    return 0.25; // Safe default
  }
}

/**
 * Update consumption rates for all items belonging to a user
 * Should be called periodically (e.g., daily)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Update statistics
 */
async function updateAllConsumptionRates(userId) {
  try {
    // Get all inventory items
    const result = await db.query(
      `SELECT id, item_name, quantity, unit, category, average_daily_consumption, 
              created_at, 
              EXTRACT(DAY FROM (NOW() - created_at)) as days_in_inventory
       FROM inventory
       WHERE user_id = $1`,
      [userId]
    );

    const items = result.rows;
    const stats = {
      total: items.length,
      updated: 0,
      failed: 0,
      algorithms: {},
    };

    for (const item of items) {
      try {
        const itemContext = {
          category: item.category,
          unit: item.unit,
          daysInInventory: parseFloat(item.days_in_inventory) || 1,
        };

        const learningResult = await learnConsumptionRate(
          userId,
          item.item_name,
          itemContext
        );

        // Only update if the learned rate is different from current
        const currentRate = parseFloat(item.average_daily_consumption) || 0;
        const newRate = learningResult.rate;

        if (Math.abs(newRate - currentRate) > 0.001) {
          // Update consumption rate
          await db.query(
            `UPDATE inventory 
             SET average_daily_consumption = $1,
                 last_updated = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [newRate, item.id]
          );

          // Recalculate predicted runout
          if (newRate > 0 && item.quantity > 0) {
            const daysRemaining = item.quantity / newRate;
            const runoutDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
            await db.query(
              `UPDATE inventory 
               SET predicted_runout = $1
               WHERE id = $2`,
              [runoutDate, item.id]
            );
          }

          stats.updated++;
          stats.algorithms[learningResult.algorithm] =
            (stats.algorithms[learningResult.algorithm] || 0) + 1;
        }
      } catch (error) {
        logger.error(`Error updating consumption rate for ${item.item_name}:`, error);
        stats.failed++;
      }
    }

    logger.info(
      `Updated consumption rates for ${userId}: ${stats.updated}/${stats.total} items updated`
    );

    return stats;
  } catch (error) {
    logger.error('Error updating all consumption rates:', error);
    throw error;
  }
}

module.exports = {
  recordConsumptionEvent,
  getConsumptionHistory,
  learnConsumptionRate,
  estimateFromCategory,
  updateAllConsumptionRates,
  // Export individual algorithms for testing
  calculateSimpleMovingAverage,
  calculateEWMA,
  calculateLinearRegression,
};
