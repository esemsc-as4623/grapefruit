import React, { useState, useEffect } from 'react';
import { inventoryAPI, simulationAPI } from '../services/api';
import { Package, AlertTriangle, TrendingDown, Calendar, RefreshCw } from 'lucide-react';

const InventoryDashboard = () => {
  const [inventory, setInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Load inventory data
  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryAPI.getAll();
      setInventory(data.items || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load inventory');
      console.error('Error loading inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load low stock items
  const loadLowStock = async () => {
    try {
      const data = await inventoryAPI.getLowStock();
      setLowStock(data.items || []);
    } catch (err) {
      console.error('Error loading low stock:', err);
    }
  };

  // Simulate a day
  const handleSimulateDay = async () => {
    try {
      setSimulating(true);
      await simulationAPI.simulateDay();
      // Reload data after simulation
      await loadInventory();
      await loadLowStock();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  useEffect(() => {
    loadInventory();
    loadLowStock();
  }, []);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Out of stock';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${diffDays} days`;
  };

  // Get status color based on predicted runout
  const getStatusColor = (item) => {
    if (item.quantity === 0 || item.quantity === '0' || item.quantity === '0.00') {
      return 'bg-red-100 border-red-300 text-red-800';
    }
    if (!item.predicted_runout) return 'bg-green-100 border-green-300 text-green-800';
    
    const date = new Date(item.predicted_runout);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) return 'bg-red-100 border-red-300 text-red-800';
    if (diffDays <= 3) return 'bg-yellow-100 border-yellow-300 text-yellow-800';
    return 'bg-green-100 border-green-300 text-green-800';
  };

  // Category icon and color
  const getCategoryInfo = (category) => {
    const categories = {
      dairy: { icon: '🥛', color: 'bg-blue-50' },
      produce: { icon: '🥬', color: 'bg-green-50' },
      meat: { icon: '🥩', color: 'bg-red-50' },
      pantry: { icon: '🥫', color: 'bg-yellow-50' },
      beverages: { icon: '🥤', color: 'bg-purple-50' },
      snacks: { icon: '🍿', color: 'bg-orange-50' },
    };
    return categories[category?.toLowerCase()] || { icon: '📦', color: 'bg-gray-50' };
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
          <h2 className="text-3xl font-bold text-gray-900">Inventory Dashboard</h2>
          <p className="text-gray-600 mt-1">
            {inventory.length} items • {lowStock.length} running low
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadInventory}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleSimulateDay}
            disabled={simulating}
            className="px-4 py-2 bg-grapefruit-500 text-white rounded-lg hover:bg-grapefruit-600 disabled:opacity-50 flex items-center gap-2"
          >
            <TrendingDown className="w-4 h-4" />
            {simulating ? 'Simulating...' : 'Simulate Day'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Low Stock Alert</h3>
              <p className="text-sm text-yellow-800 mt-1">
                {lowStock.length} item{lowStock.length !== 1 ? 's' : ''} running low (less than 3 days)
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {lowStock.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-yellow-100 text-yellow-800"
                  >
                    {item.item_name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Grid */}
      {inventory.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No inventory items</h3>
          <p className="text-gray-600 mt-1">Add items manually or upload a receipt to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inventory.map((item) => {
            const categoryInfo = getCategoryInfo(item.category);
            const statusColor = getStatusColor(item);
            
            return (
              <div
                key={item.id}
                className={`${categoryInfo.color} border-2 ${statusColor.split(' ')[1]} rounded-lg p-4 hover:shadow-md transition-shadow`}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{categoryInfo.icon}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{item.item_name}</h3>
                      <p className="text-sm text-gray-600 capitalize">{item.category || 'Other'}</p>
                    </div>
                  </div>
                </div>

                {/* Quantity */}
                <div className="mb-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {parseFloat(item.quantity).toFixed(2)}
                    </span>
                    <span className="text-sm text-gray-600">{item.unit}</span>
                  </div>
                  {item.average_daily_consumption > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Consumes ~{parseFloat(item.average_daily_consumption).toFixed(2)} {item.unit}/day
                    </p>
                  )}
                </div>

                {/* Predicted Runout */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${statusColor}`}>
                  <Calendar className="w-4 h-4" />
                  <div className="flex-1">
                    <p className="text-xs font-medium">Runs out in:</p>
                    <p className="text-sm font-semibold">
                      {formatDate(item.predicted_runout)}
                    </p>
                  </div>
                </div>

                {/* Last Updated */}
                <p className="text-xs text-gray-500 mt-3 text-right">
                  Updated {new Date(item.last_updated).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InventoryDashboard;
