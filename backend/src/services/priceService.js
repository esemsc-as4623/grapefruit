/**
 * Price Service
 *
 * PURPOSE: Single source of truth for grocery item pricing
 * 
 * RESPONSIBILITY SEPARATION:
 * - priceService.js (THIS FILE): Fetches authoritative prices from amazon_catalog
 * - cartPricer.js: Suggests quantities and units using LLM intelligence
 * 
 * WHY THIS APPROACH?
 * - Database prices are accurate and consistent (no LLM hallucination)
 * - Real-time price updates without re-training models
 * - Cost-effective (no API calls for price lookups)
 * - Deterministic (same item → same price)
 * 
 * DATA SOURCE: amazon_catalog table (mock Amazon API)
 * - 50+ common grocery items with real-world pricing
 * - Exact match → Fuzzy match → Default fallback chain
 * - Supports batch operations for efficiency
 *
 * USAGE:
 *   const priceData = await priceService.getPriceForItem('Whole Milk');
 *   // { price: 4.99, brand: 'Organic Valley', source: 'amazon_catalog', confidence: 1.0 }
 */

const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Calculate string similarity using Levenshtein distance
 * Used for fuzzy matching inventory names to catalog items
 *
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1, higher is better)
 */
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  // Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - (distance / maxLength);
}

/**
 * Find best matching item from catalog using fuzzy matching
 *
 * @param {string} itemName - Item name from user's inventory
 * @param {Array} catalogItems - Array of catalog items
 * @returns {Object|null} - Best match with confidence score
 */
function findBestMatch(itemName, catalogItems) {
  if (!catalogItems || catalogItems.length === 0) return null;

  let bestMatch = null;
  let highestScore = 0;

  for (const catalogItem of catalogItems) {
    const score = calculateSimilarity(itemName, catalogItem.item_name);

    if (score > highestScore) {
      highestScore = score;
      bestMatch = {
        ...catalogItem,
        confidence: score
      };
    }
  }

  return bestMatch;
}

/**
 * Get price for a single item
 *
 * FALLBACK CHAIN (in priority order):
 * 1. Exact match in amazon_catalog (best) - confidence: 1.0
 *    Example: "Whole Milk" → matches "Whole Milk" in catalog
 * 
 * 2. Fuzzy match in amazon_catalog - confidence: 0.7-0.99
 *    Example: "milk whole" → matches "Whole Milk" (85% similarity)
 *    Uses Levenshtein distance algorithm
 * 
 * 3. Default price $5.99 (last resort) - confidence: 0.0
 *    Used when item not found in catalog
 *
 * @param {string} itemName - Item name to look up
 * @returns {Promise<Object>} - { price, brand, unit, source, confidence }
 */
async function getPriceForItem(itemName) {
  try {
    // Step 1: Try exact match
    const exactMatch = await db.query(
      `SELECT item_name, price, brand, unit, category
       FROM amazon_catalog
       WHERE LOWER(item_name) = LOWER($1)
       AND in_stock = true
       LIMIT 1`,
      [itemName.trim()]
    );

    if (exactMatch.rows.length > 0) {
      const item = exactMatch.rows[0];
      logger.info('Price lookup - exact match', {
        itemName,
        price: item.price,
        brand: item.brand
      });

      return {
        price: parseFloat(item.price),
        brand: item.brand,
        unit: item.unit,
        category: item.category,
        catalogName: item.item_name,
        source: 'amazon_catalog',
        matchType: 'exact',
        confidence: 1.0
      };
    }

    // Step 2: Try fuzzy match
    const allCatalogItems = await db.query(
      'SELECT item_name, price, brand, unit, category FROM amazon_catalog WHERE in_stock = true'
    );

    const bestMatch = findBestMatch(itemName, allCatalogItems.rows);

    if (bestMatch && bestMatch.confidence >= 0.7) {
      logger.info('Price lookup - fuzzy match', {
        itemName,
        matched: bestMatch.item_name,
        price: bestMatch.price,
        confidence: bestMatch.confidence.toFixed(2)
      });

      return {
        price: parseFloat(bestMatch.price),
        brand: bestMatch.brand,
        unit: bestMatch.unit,
        category: bestMatch.category,
        catalogName: bestMatch.item_name,
        source: 'amazon_catalog',
        matchType: 'fuzzy',
        confidence: bestMatch.confidence
      };
    }

    // Step 3: No match - use default
    logger.warn('Price lookup - no match, using default', { itemName });

    return {
      price: 5.99,
      brand: 'Generic',
      unit: 'each',
      category: 'uncategorized',
      catalogName: itemName,
      source: 'default',
      matchType: 'none',
      confidence: 0.0
    };

  } catch (error) {
    logger.error('Error in getPriceForItem', { itemName, error: error.message });

    // Graceful fallback on error
    return {
      price: 5.99,
      brand: 'Generic',
      unit: 'each',
      category: 'uncategorized',
      catalogName: itemName,
      source: 'error_fallback',
      matchType: 'error',
      confidence: 0.0,
      error: error.message
    };
  }
}

/**
 * Get prices for multiple items in batch
 * More efficient than calling getPriceForItem() in a loop
 *
 * @param {Array<string>} itemNames - Array of item names
 * @returns {Promise<Map<string, Object>>} - Map of itemName → priceData
 */
async function getPricesForItems(itemNames) {
  const priceMap = new Map();

  try {
    // Try exact matches first (single query)
    const exactMatches = await db.query(
      `SELECT item_name, price, brand, unit, category
       FROM amazon_catalog
       WHERE LOWER(item_name) = ANY($1::text[])
       AND in_stock = true`,
      [itemNames.map(name => name.toLowerCase())]
    );

    // Build map of exact matches
    const exactMatchMap = new Map();
    exactMatches.rows.forEach(item => {
      exactMatchMap.set(item.item_name.toLowerCase(), {
        price: parseFloat(item.price),
        brand: item.brand,
        unit: item.unit,
        category: item.category,
        catalogName: item.item_name,
        source: 'amazon_catalog',
        matchType: 'exact',
        confidence: 1.0
      });
    });

    // Get all catalog items for fuzzy matching
    const allCatalogItems = await db.query(
      'SELECT item_name, price, brand, unit, category FROM amazon_catalog WHERE in_stock = true'
    );

    // Process each item
    for (const itemName of itemNames) {
      const exactMatch = exactMatchMap.get(itemName.toLowerCase());

      if (exactMatch) {
        priceMap.set(itemName, exactMatch);
      } else {
        // Try fuzzy match
        const bestMatch = findBestMatch(itemName, allCatalogItems.rows);

        if (bestMatch && bestMatch.confidence >= 0.7) {
          priceMap.set(itemName, {
            price: parseFloat(bestMatch.price),
            brand: bestMatch.brand,
            unit: bestMatch.unit,
            category: bestMatch.category,
            catalogName: bestMatch.item_name,
            source: 'amazon_catalog',
            matchType: 'fuzzy',
            confidence: bestMatch.confidence
          });
        } else {
          // Default fallback
          priceMap.set(itemName, {
            price: 5.99,
            brand: 'Generic',
            unit: 'each',
            category: 'uncategorized',
            catalogName: itemName,
            source: 'default',
            matchType: 'none',
            confidence: 0.0
          });
        }
      }
    }

    logger.info('Batch price lookup completed', {
      itemCount: itemNames.length,
      exactMatches: exactMatches.rows.length
    });

  } catch (error) {
    logger.error('Error in getPricesForItems', { error: error.message });

    // On error, return default prices for all items
    itemNames.forEach(itemName => {
      priceMap.set(itemName, {
        price: 5.99,
        brand: 'Generic',
        unit: 'each',
        category: 'uncategorized',
        catalogName: itemName,
        source: 'error_fallback',
        matchType: 'error',
        confidence: 0.0
      });
    });
  }

  return priceMap;
}

/**
 * Enrich cart items with current prices from catalog
 * Compares cached cart.estimated_price with fresh catalog price
 *
 * @param {Array<Object>} cartItems - Cart items from database
 * @returns {Promise<Array<Object>>} - Cart items enriched with price data
 */
async function enrichCartWithPrices(cartItems) {
  if (!cartItems || cartItems.length === 0) return [];

  try {
    const itemNames = cartItems.map(item => item.item_name);
    const priceMap = await getPricesForItems(itemNames);

    const enrichedItems = cartItems.map(cartItem => {
      const priceData = priceMap.get(cartItem.item_name);
      const cachedPrice = cartItem.estimated_price ? parseFloat(cartItem.estimated_price) : null;
      const freshPrice = priceData.price;

      // Detect price changes
      const priceChanged = cachedPrice && Math.abs(cachedPrice - freshPrice) > 0.01;

      return {
        ...cartItem,
        price: freshPrice,
        brand: priceData.brand,
        unit: priceData.unit,
        category: priceData.category,
        priceSource: priceData.source,
        matchType: priceData.matchType,
        confidence: priceData.confidence,
        catalogName: priceData.catalogName,
        // Price change detection
        cachedPrice,
        priceChanged,
        priceChange: priceChanged ? freshPrice - cachedPrice : 0,
        // Subtotal for this item
        itemSubtotal: freshPrice * cartItem.quantity
      };
    });

    logger.info('Cart enriched with prices', {
      itemCount: cartItems.length,
      priceChanges: enrichedItems.filter(i => i.priceChanged).length
    });

    return enrichedItems;

  } catch (error) {
    logger.error('Error enriching cart with prices', { error: error.message });

    // On error, return items with cached prices or defaults
    return cartItems.map(item => ({
      ...item,
      price: item.estimated_price || 5.99,
      priceSource: 'cached_or_default',
      error: error.message
    }));
  }
}

/**
 * Calculate cart totals with current prices
 *
 * @param {Array<Object>} enrichedCartItems - Cart items with price data
 * @returns {Object} - { subtotal, tax, shipping, total, freeShipping }
 */
function calculateCartTotals(enrichedCartItems) {
  const subtotal = enrichedCartItems.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);

  const taxRate = 0.08; // 8% tax
  const tax = subtotal * taxRate;

  const freeShippingThreshold = 35.00;
  const shippingCost = 5.99;
  const freeShipping = subtotal >= freeShippingThreshold;
  const shipping = freeShipping ? 0 : shippingCost;

  const total = subtotal + tax + shipping;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    taxRate,
    shipping: parseFloat(shipping.toFixed(2)),
    shippingThreshold: freeShippingThreshold,
    freeShipping,
    total: parseFloat(total.toFixed(2)),
    itemCount: enrichedCartItems.length,
    totalQuantity: enrichedCartItems.reduce((sum, item) => sum + item.quantity, 0)
  };
}

module.exports = {
  getPriceForItem,
  getPricesForItems,
  enrichCartWithPrices,
  calculateCartTotals,
  // Exported for testing
  calculateSimilarity,
  findBestMatch
};
