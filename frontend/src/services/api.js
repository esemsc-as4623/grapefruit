import axios from 'axios';

// Base API URL - use environment variable or default to localhost
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 90000, // 90 seconds (OCR can take 20-30 seconds)
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// ============================================
// INVENTORY ENDPOINTS
// ============================================

export const inventoryAPI = {
  // Get all inventory items
  getAll: async () => {
    const response = await api.get('/inventory');
    return response.data;
  },

  // Get low inventory items (< 3 days)
  getLowStock: async () => {
    const response = await api.get('/inventory/low');
    return response.data;
  },

  // Get single inventory item
  getById: async (id) => {
    const response = await api.get(`/inventory/${id}`);
    return response.data;
  },

  // Add new inventory item
  create: async (itemData) => {
    const response = await api.post('/inventory', itemData);
    return response.data;
  },

  // Update inventory item
  update: async (id, updates) => {
    const response = await api.put(`/inventory/${id}`, updates);
    return response.data;
  },

  // Delete inventory item
  delete: async (id) => {
    const response = await api.delete(`/inventory/${id}`);
    return response.data;
  },
};

// ============================================
// PREFERENCES ENDPOINTS
// ============================================

export const preferencesAPI = {
  // Get user preferences
  get: async () => {
    const response = await api.get('/preferences');
    return response.data;
  },

  // Update preferences
  update: async (updates) => {
    const response = await api.put('/preferences', updates);
    return response.data;
  },
};

// ============================================
// ORDERS ENDPOINTS
// ============================================

export const ordersAPI = {
  // Get all orders
  getAll: async () => {
    const response = await api.get('/orders');
    return response.data;
  },

  // Get orders in transit (placed status)
  getInTransit: async () => {
    const response = await api.get('/orders?status=placed');
    return response.data;
  },

  // Get single order
  getById: async (id) => {
    const response = await api.get(`/orders/${id}`);
    return response.data;
  },

  // Create new order
  create: async (orderData) => {
    const response = await api.post('/orders', orderData);
    return response.data;
  },

  // Mark order as placed
  markPlaced: async (id, vendorOrderId, trackingNumber = '') => {
    const response = await api.put(`/orders/${id}/placed`, {
      vendor_order_id: vendorOrderId,
      tracking_number: trackingNumber,
    });
    return response.data;
  },

  // Mark order as delivered
  markDelivered: async (id) => {
    const response = await api.put(`/orders/${id}/delivered`);
    return response.data;
  },
};

// ============================================
// CART ENDPOINTS
// ============================================

export const cartAPI = {
  // Get all cart items
  getAll: async () => {
    const response = await api.get('/cart');
    return response.data;
  },

  // Get single cart item
  getById: async (id) => {
    const response = await api.get(`/cart/${id}`);
    return response.data;
  },

  // Add item to cart
  addItem: async (itemData) => {
    const response = await api.post('/cart', itemData);
    return response.data;
  },

  // Update cart item
  update: async (id, updates) => {
    const response = await api.put(`/cart/${id}`, updates);
    return response.data;
  },

  // Remove item from cart
  removeItem: async (id) => {
    const response = await api.delete(`/cart/${id}`);
    return response.data;
  },

  // Clear entire cart
  clearCart: async () => {
    const response = await api.delete('/cart');
    return response.data;
  },
};

// ============================================
// AUTO-ORDER ENDPOINTS
// ============================================

export const autoOrderAPI = {
  // Get items in to_order queue
  getToOrder: async (status = null) => {
    const params = status ? `?status=${status}` : '';
    const response = await api.get(`/auto-order/to-order${params}`);
    return response.data;
  },
};

// ============================================
// SIMULATION ENDPOINTS
// ============================================

export const simulationAPI = {
  // Simulate a day passing (trigger forecasting + order generation)
  simulateDay: async () => {
    const response = await api.post('/simulate/day');
    return response.data;
  },

  // Simulate consumption over multiple days
  simulateConsumption: async (days = 1) => {
    const response = await api.post('/simulate/consumption', { days });
    return response.data;
  },
};

// ============================================
// HEALTH CHECK
// ============================================

export const healthAPI = {
  check: async () => {
    const response = await api.get('/health');
    return response.data;
  },
};

export default api;
