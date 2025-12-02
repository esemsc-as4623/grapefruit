import React, { useState, useEffect } from 'react';
import { cartAPI, ordersAPI } from '../services/api';
import { ShoppingCart, Check, X, Package, Trash2, Plus, Minus, DollarSign, Send, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const CartReview = () => {
  const [cartItems, setCartItems] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [cartTotals, setCartTotals] = useState(null); // Now stores full totals object from backend
  const [cartCount, setCartCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expandedOrder, setExpandedOrder] = useState(null);

  // Load cart items
  const loadCart = async () => {
    try {
      setError(null);
      const data = await cartAPI.getAll();
      setCartItems(data.items || []);
      setCartCount(data.count || 0);
      // Backend now returns full totals object with subtotal, tax, shipping, total
      setCartTotals({
        subtotal: data.subtotal || 0,
        tax: data.tax || 0,
        shipping: data.shipping || 0,
        total: data.total || 0,
        freeShipping: data.freeShipping || false,
        shippingThreshold: data.shippingThreshold || 35.00,
      });
      setLastUpdated(data.lastUpdated);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load cart');
      console.error('Error loading cart:', err);
    }
  };

  // Load pending orders
  const loadPendingOrders = async () => {
    try {
      const data = await ordersAPI.getPending();
      setPendingOrders(data.orders || []);
    } catch (err) {
      console.error('Error loading pending orders:', err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadCart(), loadPendingOrders()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // Poll for cart updates every 30 seconds
    const interval = setInterval(() => {
      loadCart();
      loadPendingOrders();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Update item quantity
  const handleUpdateQuantity = async (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      // Remove item if quantity is 0 or less
      await handleRemoveItem(itemId);
      return;
    }

    try {
      await cartAPI.update(itemId, { quantity: newQuantity });
      await loadCart();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update quantity');
    }
  };

  // Remove item from cart
  const handleRemoveItem = async (itemId) => {
    try {
      await cartAPI.removeItem(itemId);
      await loadCart();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to remove item');
    }
  };

  // Clear entire cart
  const handleClearCart = async () => {
    if (!window.confirm('Are you sure you want to clear your entire cart?')) {
      return;
    }

    try {
      await cartAPI.clearCart();
      await loadCart();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to clear cart');
    }
  };

  // Convert cart to order
  const handleCreateOrder = async () => {
    if (cartItems.length === 0) {
      setError('Cart is empty');
      return;
    }

    if (!cartTotals) {
      setError('Cart totals not calculated');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Prepare order data using enriched cart items with real Amazon prices
      const orderItems = cartItems.map(item => ({
        item_name: item.item_name,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
        price: parseFloat(item.price || item.estimated_price || 5.99), // Use real catalog price
        brand: item.brand || 'Generic', // Use catalog brand
      }));

      // Use backend-calculated totals (already includes real Amazon prices)
      const { subtotal, tax, shipping, total } = cartTotals;

      // Create order
      await ordersAPI.create({
        vendor: 'amazon', // Now using Amazon catalog prices
        items: orderItems,
        subtotal,
        tax,
        shipping,
        total,
      });

      // Clear cart after successful order
      await cartAPI.clearCart();
      await loadCart();
      await loadPendingOrders();

      setSuccessMessage('Order created successfully! It is now pending approval.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick add item handler
  const handleQuickAddItem = async (e) => {
    e.preventDefault();
    
    if (!newItemName.trim()) return;
    
    try {
      setAddingItem(true);
      setError(null);
      
      // Split by comma to handle multiple items
      const itemNames = newItemName.split(',').map(name => name.trim()).filter(name => name);
      
      // Add each item separately
      for (const itemName of itemNames) {
        await cartAPI.addItem({
          item_name: itemName,
          use_llm_pricing: true, // Let AI suggest everything
          source: 'manual',
        });
      }
      
      setNewItemName('');
      await loadCart();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add item');
    } finally {
      setAddingItem(false);
    }
  };

  // Approve order
  const handleApproveOrder = async (orderId) => {
    try {
      await ordersAPI.approve(orderId);
      await loadPendingOrders();
      setSuccessMessage('Order approved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to approve order');
    }
  };

  // Reject order
  const handleRejectOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to reject this order?')) return;
    try {
      await ordersAPI.reject(orderId);
      await loadPendingOrders();
      setSuccessMessage('Order rejected.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to reject order');
    }
  };

  // Get step size based on unit
  const getStepSize = (unit) => {
    const wholeNumberUnits = ['count', 'can'];
    const quarterUnits = ['package', 'box', 'bottle'];
    const halfUnits = ['gallon', 'liter', 'quart'];
    const fineUnits = ['ounce', 'pound', 'lb', 'oz'];

    if (wholeNumberUnits.includes(unit?.toLowerCase())) return 1;
    if (quarterUnits.includes(unit?.toLowerCase())) return 0.25;
    if (halfUnits.includes(unit?.toLowerCase())) return 0.5;
    if (fineUnits.includes(unit?.toLowerCase())) return 0.1;
    return 0.5; // default
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-grapefruit-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Orders & Cart</h2>
          <p className="text-gray-600 mt-1">
            {cartCount} item{cartCount !== 1 ? 's' : ''} in cart
            {cartTotals && cartTotals.total > 0 && ` • Est. ${formatCurrency(cartTotals.total)}`}
            {lastUpdated && (
              <span className="text-xs text-gray-500 ml-2">
                • Prices updated {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { loadCart(); loadPendingOrders(); }}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Refresh
          </button>
          {cartItems.length > 0 && (
            <button
              onClick={handleClearCart}
              className="px-4 py-2 bg-red-100 text-red-700 border border-red-300 rounded-lg hover:bg-red-200"
            >
              Clear Cart
            </button>
          )}
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Quick Add Item Form - Always visible */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <form onSubmit={handleQuickAddItem} className="flex gap-3">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="e.g., Milk, Bananas, Chicken Breast"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-grapefruit-500"
            disabled={addingItem}
          />
          <button
            type="submit"
            disabled={addingItem || !newItemName.trim()}
            className="px-6 py-2 bg-grapefruit-500 text-white rounded-lg hover:bg-grapefruit-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {addingItem ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Adding...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                Add to Cart
              </>
            )}
          </button>
        </form>
      </div>
      {/* Pending Orders Section */}
      {pendingOrders.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Pending Orders ({pendingOrders.length})
          </h3>
          <div className="space-y-4">
            {pendingOrders.map((order) => (
              <div key={order.id} className="bg-white border border-orange-200 rounded-lg overflow-hidden shadow-sm">
                <div className="p-4 bg-orange-50 flex justify-between items-center cursor-pointer"
                     onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                  <div className="flex items-center gap-4">
                    <div className="bg-orange-100 p-2 rounded-full">
                      <Package className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">
                        Order #{order.id.slice(0, 8)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {new Date(order.created_at).toLocaleDateString()} • {order.items.length} items • {formatCurrency(order.total)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium uppercase tracking-wide">
                      Needs Approval
                    </span>
                    {expandedOrder === order.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                </div>
                
                {/* Expanded Details */}
                {expandedOrder === order.id && (
                  <div className="p-4 border-t border-orange-100">
                    <div className="space-y-2 mb-4">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-600">{item.quantity}x {item.item_name}</span>
                          <span className="text-gray-900">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      ))}
                      <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between font-medium">
                        <span>Total</span>
                        <span>{formatCurrency(order.total)}</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRejectOrder(order.id); }}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleApproveOrder(order.id); }}
                        className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Approve Order
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 my-6"></div>

      <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
        <ShoppingCart className="w-5 h-5 text-gray-700" />
        Current Cart
      </h3>

      {/* Empty Cart State */}
      {cartItems.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <ShoppingCart className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Your cart is empty</h3>
          <p className="text-gray-600 mt-1">
            Add items using the form above to get started
          </p>
        </div>
      ) : (
        <>
          {/* Cart Items List */}
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
            {cartItems.map((item) => {
              const stepSize = getStepSize(item.unit);
              // Use enriched price from backend (includes catalog lookup)
              const itemPrice = parseFloat(item.price || item.estimated_price || 5.99);
              const itemTotal = itemPrice * parseFloat(item.quantity);

              return (
                <div
                  key={item.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Item Icon and Info */}
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{item.item_name}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                          <span className="capitalize">{item.category || 'Other'}</span>
                          {item.brand && item.brand !== 'Generic' && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              {item.brand}
                            </span>
                          )}
                          {item.priceChanged && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded flex items-center gap-1">
                              ℹ️ Price updated: {formatCurrency(item.cachedPrice)} → {formatCurrency(item.price)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleUpdateQuantity(item.id, parseFloat(item.quantity) - stepSize)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                        title="Decrease quantity"
                      >
                        <Minus className="w-4 h-4 text-gray-600" />
                      </button>
                      <div className="text-center min-w-[80px]">
                        <div className="text-lg font-bold text-gray-900">
                          {parseFloat(item.quantity).toFixed(stepSize >= 1 ? 0 : 2)}
                        </div>
                        <div className="text-xs text-gray-600">{item.unit}</div>
                      </div>
                      <button
                        onClick={() => handleUpdateQuantity(item.id, parseFloat(item.quantity) + stepSize)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                        title="Increase quantity"
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>

                    {/* Price */}
                    <div className="text-right min-w-[100px]">
                      <div className="text-lg font-bold text-gray-900">
                        {formatCurrency(itemTotal)}
                      </div>
                      <div className="text-xs text-gray-600">
                        {formatCurrency(itemPrice)}/{item.unit}
                      </div>
                    </div>

                    {/* Remove Button */}
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-2 hover:bg-red-50 rounded transition-colors"
                      title="Remove from cart"
                    >
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cart Summary and Checkout */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>

            {/* Use backend-calculated totals (with real Amazon prices) */}
            {cartTotals && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal ({cartCount} items):</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(cartTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Estimated Tax (8%):</span>
                  <span className="text-gray-900 font-medium">{formatCurrency(cartTotals.tax)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Shipping:</span>
                  <span className="text-gray-900 font-medium">
                    {cartTotals.freeShipping ? 'FREE' : formatCurrency(cartTotals.shipping)}
                  </span>
                </div>
                {!cartTotals.freeShipping && cartTotals.shippingThreshold && (
                  <p className="text-xs text-blue-600">
                    Add {formatCurrency(cartTotals.shippingThreshold - cartTotals.subtotal)} more for free shipping!
                  </p>
                )}
                <div className="border-t pt-3 flex justify-between">
                  <span className="text-lg font-bold text-gray-900">Estimated Total:</span>
                  <span className="text-2xl font-bold text-grapefruit-600">
                    {formatCurrency(cartTotals.total)}
                  </span>
                </div>

                {/* Create Order Button */}
                <button
                  onClick={handleCreateOrder}
                  disabled={submitting}
                  className="w-full mt-4 px-6 py-3 bg-grapefruit-500 text-white rounded-lg hover:bg-grapefruit-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-semibold"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Creating Order...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Create Order
                    </>
                  )}
                </button>

                <p className="text-xs text-gray-500 text-center mt-2">
                  Order will be sent for approval before purchase
                </p>
              </div>
            )}
          </div>

          {/* Help Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">How it works:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Add items using the form above (separate multiple items with commas)</li>
                  <li>AI suggests realistic quantities and prices from Walmart/Amazon</li>
                  <li>Adjust quantities using the + and - buttons</li>
                  <li>Click "Create Order" to submit for approval</li>
                  <li>After approval, your order will be placed automatically</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CartReview;
