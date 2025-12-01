import React, { useState, useEffect } from 'react';
import { cartAPI, ordersAPI } from '../services/api';
import { ShoppingCart, Check, X, Package, Trash2, Plus, Minus, DollarSign, Send } from 'lucide-react';

const CartReview = () => {
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cartTotal, setCartTotal] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Load cart items
  const loadCart = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await cartAPI.getAll();
      setCartItems(data.items || []);
      setCartCount(data.count || 0);
      setCartTotal(data.total || 0);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load cart');
      console.error('Error loading cart:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCart();
    // Poll for cart updates every 30 seconds
    const interval = setInterval(loadCart, 30000);
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

    try {
      setSubmitting(true);
      setError(null);

      // Prepare order data
      const orderItems = cartItems.map(item => ({
        item_name: item.item_name,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
        price: parseFloat(item.estimated_price || 5.99), // Default price if not set
        brand: 'Generic', // Could be enhanced with brand selection
      }));

      const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax = subtotal * 0.08; // 8% tax
      const shipping = subtotal > 35 ? 0 : 5.99; // Free shipping over $35
      const total = subtotal + tax + shipping;

      // Create order
      await ordersAPI.create({
        vendor: 'walmart', // Default vendor, could be selectable
        items: orderItems,
        subtotal,
        tax,
        shipping,
        total,
      });

      // Clear cart after successful order
      await cartAPI.clearCart();
      await loadCart();

      alert('Order created successfully! Check the Orders tab to approve.');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
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

  // Category icon
  const getCategoryIcon = (category) => {
    const icons = {
      dairy: '🥛',
      produce: '🥬',
      meat: '🥩',
      pantry: '🥫',
      beverages: '🥤',
      snacks: '🍿',
    };
    return icons[category?.toLowerCase()] || '📦';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-grapefruit-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Shopping Cart</h2>
          <p className="text-gray-600 mt-1">
            {cartCount} item{cartCount !== 1 ? 's' : ''} in cart
            {cartTotal > 0 && ` • Est. ${formatCurrency(cartTotal)}`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadCart}
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

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Empty Cart State */}
      {cartItems.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <ShoppingCart className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Your cart is empty</h3>
          <p className="text-gray-600 mt-1">
            Add items from your inventory or manually to get started
          </p>
        </div>
      ) : (
        <>
          {/* Cart Items List */}
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
            {cartItems.map((item) => {
              const stepSize = getStepSize(item.unit);
              const itemPrice = parseFloat(item.estimated_price || 5.99);
              const itemTotal = itemPrice * parseFloat(item.quantity);

              return (
                <div
                  key={item.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Item Icon and Info */}
                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-3xl">{getCategoryIcon(item.category)}</span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{item.item_name}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                          <span className="capitalize">{item.category || 'Other'}</span>
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
            
            {/* Calculate totals */}
            {(() => {
              const subtotal = cartItems.reduce((sum, item) => {
                const price = parseFloat(item.estimated_price || 5.99);
                const qty = parseFloat(item.quantity);
                return sum + (price * qty);
              }, 0);
              const tax = subtotal * 0.08;
              const shipping = subtotal > 35 ? 0 : 5.99;
              const total = subtotal + tax + shipping;

              return (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal ({cartCount} items):</span>
                    <span className="text-gray-900 font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Estimated Tax (8%):</span>
                    <span className="text-gray-900 font-medium">{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shipping:</span>
                    <span className="text-gray-900 font-medium">
                      {shipping === 0 ? 'FREE' : formatCurrency(shipping)}
                    </span>
                  </div>
                  {subtotal < 35 && (
                    <p className="text-xs text-blue-600">
                      Add {formatCurrency(35 - subtotal)} more for free shipping!
                    </p>
                  )}
                  <div className="border-t pt-3 flex justify-between">
                    <span className="text-lg font-bold text-gray-900">Estimated Total:</span>
                    <span className="text-2xl font-bold text-grapefruit-600">
                      {formatCurrency(total)}
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
              );
            })()}
          </div>

          {/* Help Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">How it works:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Adjust quantities using the + and - buttons</li>
                  <li>Estimated prices are used for calculation (${(5.99).toFixed(2)} default)</li>
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
