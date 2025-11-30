import React, { useState, useEffect } from 'react';
import { ordersAPI } from '../services/api';
import { ShoppingCart, Check, X, Package, Calendar, Truck } from 'lucide-react';

const CartReview = () => {
  const [orders, setOrders] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // const [selectedOrder, setSelectedOrder] = useState(null); // Currently unused - for future order details modal
  const [actionLoading, setActionLoading] = useState(false);

  // Load all orders
  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const [allOrders, pending] = await Promise.all([
        ordersAPI.getAll(),
        ordersAPI.getPending(),
      ]);
      setOrders(allOrders.orders || []);
      setPendingOrders(pending.orders || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load orders');
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    // Poll for new orders every 30 seconds
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  // Approve order
  const handleApprove = async (orderId, notes = '') => {
    try {
      setActionLoading(true);
      await ordersAPI.approve(orderId, notes);
      await loadOrders();
      setSelectedOrder(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to approve order');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject order
  const handleReject = async (orderId, reason = '') => {
    try {
      setActionLoading(true);
      await ordersAPI.reject(orderId, reason);
      await loadOrders();
      setSelectedOrder(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to reject order');
    } finally {
      setActionLoading(false);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Get status badge color
  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      approved: 'bg-blue-100 text-blue-800 border-blue-300',
      placed: 'bg-green-100 text-green-800 border-green-300',
      rejected: 'bg-red-100 text-red-800 border-red-300',
    };
    return badges[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-grapefruit-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Orders</h2>
          <p className="text-gray-600 mt-1">
            {pendingOrders.length} pending • {orders.length} total orders
          </p>
        </div>
        <button
          onClick={loadOrders}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Pending Orders Alert */}
      {pendingOrders.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <ShoppingCart className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">
                {pendingOrders.length} Order{pendingOrders.length !== 1 ? 's' : ''} Awaiting Approval
              </h3>
              <p className="text-sm text-blue-800 mt-1">
                Review and approve orders to complete your purchase
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Orders List */}
      {orders.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <ShoppingCart className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No orders yet</h3>
          <p className="text-gray-600 mt-1">
            Orders will appear here when inventory runs low
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              {/* Order Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Order #{order.id.slice(0, 8)}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(
                        order.status
                      )}`}
                    >
                      {order.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Truck className="w-4 h-4" />
                      <span className="capitalize">{order.vendor}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(order.total)}
                  </p>
                  <p className="text-sm text-gray-600">{order.items?.length || 0} items</p>
                </div>
              </div>

              {/* Order Items */}
              <div className="border-t border-gray-200 pt-4 mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Items:</h4>
                <div className="space-y-2">
                  {order.items?.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center text-sm bg-gray-50 p-3 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <Package className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900">{item.item_name}</p>
                          <p className="text-gray-600">
                            {item.brand && <span className="text-xs">({item.brand}) </span>}
                            {parseFloat(item.quantity).toFixed(2)} {item.unit}
                          </p>
                        </div>
                      </div>
                      <p className="font-medium text-gray-900">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Total Breakdown */}
              <div className="border-t border-gray-200 pt-4 mb-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="text-gray-900">{formatCurrency(order.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax:</span>
                    <span className="text-gray-900">{formatCurrency(order.tax)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Shipping:</span>
                    <span className="text-gray-900">{formatCurrency(order.shipping)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="font-semibold text-gray-900">Total:</span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons (only for pending orders) */}
              {order.status === 'pending' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApprove(order.id, 'Approved from UI')}
                    disabled={actionLoading}
                    className="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Approve Order
                  </button>
                  <button
                    onClick={() => handleReject(order.id, 'Rejected from UI')}
                    disabled={actionLoading}
                    className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Reject Order
                  </button>
                </div>
              )}

              {/* Approval/Rejection Info */}
              {order.approved_at && (
                <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded">
                  <p>
                    {order.status === 'approved' && '✓ Approved on '}
                    {order.status === 'rejected' && '✗ Rejected on '}
                    {new Date(order.approved_at).toLocaleString()}
                  </p>
                  {order.notes && <p className="mt-1 italic">"{order.notes}"</p>}
                  {order.rejection_reason && (
                    <p className="mt-1 italic">Reason: "{order.rejection_reason}"</p>
                  )}
                </div>
              )}

              {/* Vendor Order Info */}
              {order.vendor_order_id && (
                <div className="mt-4 text-sm text-gray-600 bg-green-50 p-3 rounded border border-green-200">
                  <p className="font-medium text-green-900">Order Placed</p>
                  <p className="mt-1">Vendor Order ID: {order.vendor_order_id}</p>
                  {order.tracking_number && (
                    <p className="mt-1">Tracking: {order.tracking_number}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CartReview;
