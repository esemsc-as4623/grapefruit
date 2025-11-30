/**
 * Item Normalization Utility
 * Handles unit normalization, quantity extraction, and item name cleaning
 */

// Unit mappings for normalization
const UNIT_MAPPINGS = {
  // Volume
  'gal': 'gallon',
  'gl': 'gallon',
  'gallon': 'gallon',
  'gallons': 'gallon',
  'l': 'liter',
  'liter': 'liter',
  'liters': 'liter',
  'ml': 'milliliter',
  'milliliter': 'milliliter',
  'fl oz': 'ounce',
  'floz': 'ounce',
  
  // Weight
  'lb': 'pound',
  'lbs': 'pound',
  'pound': 'pound',
  'pounds': 'pound',
  'oz': 'ounce',
  'ounce': 'ounce',
  'ounces': 'ounce',
  'g': 'gram',
  'gram': 'gram',
  'grams': 'gram',
  'kg': 'kilogram',
  'kilogram': 'kilogram',
  
  // Count
  'ct': 'count',
  'count': 'count',
  'pcs': 'count',
  'piece': 'count',
  'pieces': 'count',
  'ea': 'count',
  'each': 'count',
  
  // Package
  'pkg': 'package',
  'pack': 'package',
  'package': 'package',
  'packages': 'package',
  'box': 'box',
  'boxes': 'box',
  'can': 'can',
  'cans': 'can',
  'jar': 'jar',
  'jars': 'jar',
  'bottle': 'bottle',
  'bottles': 'bottle',
  'bag': 'bag',
  'bags': 'bag',
  'container': 'container',
  'containers': 'container',
};

// Special unit conversions
const UNIT_CONVERSIONS = {
  'dozen': { unit: 'count', multiplier: 12 },
  'doz': { unit: 'count', multiplier: 12 },
};

/**
 * Normalize unit and adjust quantity if needed
 * @param {string} rawUnit - Raw unit string from receipt
 * @param {number} quantity - Original quantity
 * @returns {object} - { unit: string, quantity: number }
 */
function normalizeUnit(rawUnit, quantity) {
  if (!rawUnit) {
    return { unit: 'count', quantity };
  }
  
  // Clean and normalize the unit string
  const cleaned = rawUnit
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, '') // Remove non-letter characters except spaces
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
  
  // Check for special conversions (e.g., dozen → 12 count)
  if (UNIT_CONVERSIONS[cleaned]) {
    const conversion = UNIT_CONVERSIONS[cleaned];
    return {
      unit: conversion.unit,
      quantity: quantity * conversion.multiplier,
    };
  }
  
  // Try standard mapping
  const normalized = UNIT_MAPPINGS[cleaned];
  if (normalized) {
    return { unit: normalized, quantity };
  }
  
  // Try without spaces (fl oz → floz)
  const noSpaces = cleaned.replace(/\s/g, '');
  if (UNIT_MAPPINGS[noSpaces]) {
    return { unit: UNIT_MAPPINGS[noSpaces], quantity };
  }
  
  // Return original if no mapping found
  return { unit: rawUnit.trim(), quantity };
}

/**
 * Extract quantity and unit from text like "2.5 lb" or "(1.82 LB)"
 * @param {string} text - Text containing quantity and unit
 * @returns {object|null} - { quantity: number, unit: string } or null
 */
function extractQuantityAndUnit(text) {
  // Patterns to match quantity + unit
  const patterns = [
    /(\d+\.?\d*)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|gal|gallon|gallons)/i,
    /\((\d+\.?\d*)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|gal|gallon|gallons)\s*@/i,
    /(\d+\.?\d*)\s*(ct|count|pcs|piece|pieces)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const quantity = parseFloat(match[1]);
      const unit = match[2];
      return normalizeUnit(unit, quantity);
    }
  }
  
  return null;
}

/**
 * Clean item name by removing quantity info, prices, and extra metadata
 * @param {string} itemName - Raw item name from receipt
 * @returns {string} - Cleaned item name
 */
function cleanItemName(itemName) {
  let cleaned = itemName.trim();
  
  // Remove patterns like (2.5 lb @ $3.99/lb)
  cleaned = cleaned.replace(/\([^)]*@[^)]*\)/g, '');
  
  // Remove standalone weight/quantity info like "2.5 lb"
  cleaned = cleaned.replace(/\d+\.?\d*\s*(lb|lbs|oz|gal|ct)/gi, '');
  
  // Remove price patterns like $3.99
  cleaned = cleaned.replace(/\$\d+\.?\d*/g, '');
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Capitalize first letter of each word
  cleaned = cleaned.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  
  return cleaned;
}

/**
 * Parse a receipt line into structured item data
 * @param {string} line - Single line from receipt
 * @param {object} context - Optional context (department, vendor, etc.)
 * @returns {object|null} - Parsed item or null if not parseable
 */
function parseReceiptLine(line, context = {}) {
  // Skip empty lines
  if (!line || line.trim().length === 0) {
    return null;
  }
  
  const trimmed = line.trim();
  
  // Skip obvious non-item lines
  const skipPatterns = [
    /^---+$/,
    /^===+$/,
    /^DATE:/i,
    /^TIME:/i,
    /^TOTAL/i,
    /^SUBTOTAL/i,
    /^TAX/i,
    /^PAID/i,
    /^CASHIER/i,
    /^THANK YOU/i,
    /^\$/,
  ];
  
  for (const pattern of skipPatterns) {
    if (pattern.test(trimmed)) {
      return null;
    }
  }
  
  // Try to extract quantity and unit from the line
  const extracted = extractQuantityAndUnit(trimmed);
  
  // Parse basic structure: "ITEM_NAME    QUANTITY    PRICE"
  // or "ITEM_NAME (with details)    PRICE"
  const parts = trimmed.split(/\s{2,}|\t/); // Split on multiple spaces or tabs
  
  if (parts.length === 0) {
    return null;
  }
  
  const itemName = cleanItemName(parts[0]);
  
  // Default values
  let quantity = 1;
  let unit = 'count';
  
  // Use extracted values if found
  if (extracted) {
    quantity = extracted.quantity;
    unit = extracted.unit;
  }
  
  return {
    item_name: itemName,
    quantity,
    unit,
    department: context.department || null,
    vendor: context.vendor || null,
    raw_line: trimmed,
  };
}

/**
 * Normalize a batch of parsed items
 * @param {Array} items - Array of parsed items
 * @returns {Array} - Normalized items
 */
function normalizeItems(items) {
  return items.map(item => {
    const normalized = normalizeUnit(item.unit || 'count', item.quantity || 1);
    
    return {
      ...item,
      item_name: cleanItemName(item.item_name),
      quantity: normalized.quantity,
      unit: normalized.unit,
    };
  });
}

/**
 * Merge duplicate items (same name and unit)
 * @param {Array} items - Array of items
 * @returns {Array} - Merged items with combined quantities
 */
function mergeItems(items) {
  const merged = {};
  
  for (const item of items) {
    const key = `${item.item_name.toLowerCase()}::${item.unit}`;
    
    if (merged[key]) {
      merged[key].quantity += item.quantity;
    } else {
      merged[key] = { ...item };
    }
  }
  
  return Object.values(merged);
}

module.exports = {
  normalizeUnit,
  extractQuantityAndUnit,
  cleanItemName,
  parseReceiptLine,
  normalizeItems,
  mergeItems,
  UNIT_MAPPINGS,
  UNIT_CONVERSIONS,
};
