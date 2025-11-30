/**
 * Category Inference Utility
 * Maps item names to grocery categories using keyword matching
 */

// Category keyword mappings
const CATEGORY_KEYWORDS = {
  dairy: [
    'milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream',
    'cottage cheese', 'cheddar', 'mozzarella', 'parmesan', 'brie',
    'half and half', 'whipped cream', 'ice cream', 'kefir'
  ],
  produce: [
    'banana', 'apple', 'orange', 'tomato', 'lettuce', 'spinach',
    'carrot', 'potato', 'onion', 'garlic', 'broccoli', 'cauliflower',
    'cucumber', 'pepper', 'celery', 'avocado', 'berry', 'berries',
    'strawberry', 'blueberry', 'raspberry', 'grape', 'melon',
    'watermelon', 'cantaloupe', 'peach', 'pear', 'plum', 'kiwi',
    'mango', 'pineapple', 'cilantro', 'basil', 'parsley', 'mint',
    'kale', 'arugula', 'cabbage', 'zucchini', 'squash', 'eggplant'
  ],
  meat: [
    'chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'tuna',
    'steak', 'ground beef', 'sausage', 'bacon', 'ham', 'lamb',
    'shrimp', 'crab', 'lobster', 'tilapia', 'cod', 'thigh', 'breast',
    'drumstick', 'wing', 'ribs', 'roast', 'tenderloin', 'patty'
  ],
  pantry: [
    'pasta', 'rice', 'bread', 'cereal', 'flour', 'sugar', 'salt',
    'pepper', 'oil', 'vinegar', 'sauce', 'soup', 'beans', 'can',
    'canned', 'jar', 'peanut butter', 'jelly', 'jam', 'honey',
    'syrup', 'oats', 'quinoa', 'lentils', 'chickpeas', 'marinara',
    'tomato sauce', 'salsa', 'ketchup', 'mustard', 'mayo', 'mayonnaise',
    'soy sauce', 'hot sauce', 'bbq sauce', 'dressing', 'spice',
    'seasoning', 'extract', 'baking soda', 'baking powder', 'yeast'
  ],
  beverages: [
    'coffee', 'tea', 'juice', 'soda', 'water', 'beer', 'wine',
    'liquor', 'energy drink', 'sports drink', 'lemonade', 'milk',
    'almond milk', 'oat milk', 'soy milk', 'coconut milk'
  ],
  snacks: [
    'chips', 'crackers', 'cookies', 'candy', 'chocolate', 'nuts',
    'pretzels', 'popcorn', 'granola', 'protein bar', 'snack bar',
    'trail mix', 'gummies', 'mints', 'gum'
  ],
  frozen: [
    'frozen', 'ice cream', 'pizza', 'frozen pizza', 'frozen dinner',
    'frozen vegetables', 'frozen fruit', 'popsicle', 'ice', 'waffle',
    'burrito', 'nuggets', 'fries', 'french fries'
  ],
  bakery: [
    'bread', 'bagel', 'muffin', 'croissant', 'donut', 'cake', 'pie',
    'pastry', 'baguette', 'roll', 'bun', 'sourdough', 'rye', 'wheat'
  ],
  household: [
    'paper towel', 'toilet paper', 'tissue', 'napkin', 'detergent',
    'soap', 'shampoo', 'conditioner', 'toothpaste', 'cleaner', 'bleach',
    'sponge', 'trash bag', 'aluminum foil', 'plastic wrap', 'wipes'
  ],
};

// Department name mappings (from receipt departments to our categories)
const DEPARTMENT_MAPPINGS = {
  'dairy': 'dairy',
  'produce': 'produce',
  'meat': 'meat',
  'deli': 'meat',
  'seafood': 'meat',
  'pantry': 'pantry',
  'grocery': 'pantry',
  'beverages': 'beverages',
  'drinks': 'beverages',
  'snacks': 'snacks',
  'frozen': 'frozen',
  'bakery': 'bakery',
  'household': 'household',
  'health & beauty': 'household',
  'pharmacy': 'household',
};

/**
 * Infer category from item name and optional department
 * @param {string} itemName - The name of the item
 * @param {string|null} department - Optional department from receipt
 * @returns {string} - Inferred category
 */
function inferCategory(itemName, department = null) {
  // Normalize inputs
  const normalizedName = itemName.toLowerCase().trim();
  const normalizedDept = department ? department.toLowerCase().trim() : null;
  
  // 1. Try department mapping first (if available)
  if (normalizedDept && DEPARTMENT_MAPPINGS[normalizedDept]) {
    return DEPARTMENT_MAPPINGS[normalizedDept];
  }
  
  // 2. Keyword matching with scoring
  const categoryScores = {};
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    
    for (const keyword of keywords) {
      if (normalizedName.includes(keyword)) {
        // Longer matches get higher scores (more specific)
        score += keyword.length;
      }
    }
    
    if (score > 0) {
      categoryScores[category] = score;
    }
  }
  
  // 3. Return category with highest score
  if (Object.keys(categoryScores).length > 0) {
    return Object.entries(categoryScores).reduce((a, b) => 
      a[1] > b[1] ? a : b
    )[0];
  }
  
  // 4. Default category
  return 'other';
}

/**
 * Filter out non-grocery items
 * @param {string} itemName - The name of the item
 * @returns {boolean} - True if item should be included in inventory
 */
function isGroceryItem(itemName) {
  const normalizedName = itemName.toLowerCase().trim();
  
  // Patterns that indicate non-grocery items
  const nonGroceryPatterns = [
    /^return/i,
    /refund/i,
    /delivery fee/i,
    /service fee/i,
    /tip/i,
    /tax/i,
    /subtotal/i,
    /total/i,
    /bag discount/i,
    /coupon/i,
    /savings/i,
    /paid/i,
    /payment/i,
    /credit/i,
    /debit/i,
  ];
  
  // Check if item matches any non-grocery pattern
  for (const pattern of nonGroceryPatterns) {
    if (pattern.test(normalizedName)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Batch categorize multiple items
 * @param {Array} items - Array of items with name and optional department
 * @returns {Array} - Items with inferred categories
 */
function categorizeItems(items) {
  return items.map(item => ({
    ...item,
    category: inferCategory(item.item_name, item.department),
    isGrocery: isGroceryItem(item.item_name),
  }));
}

module.exports = {
  inferCategory,
  isGroceryItem,
  categorizeItems,
  CATEGORY_KEYWORDS,
  DEPARTMENT_MAPPINGS,
};
