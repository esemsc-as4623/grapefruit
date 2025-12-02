import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { inventoryAPI, simulationAPI, cartAPI } from '../services/api';
import { Package, AlertTriangle, TrendingDown, Calendar, RefreshCw, Trash2, ShoppingCart, Sliders } from 'lucide-react';

const InventoryDashboard = () => {
  const location = useLocation();
  const [inventory, setInventory] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [simulating, setSimulating] = useState(false);
  // Get sort preference from localStorage or use default
  const [sortBy, setSortBy] = useState(() => {
    const saved = localStorage.getItem('inventorySortBy');
    return saved || location.state?.sortBy || 'days';
  });
  const [hoveredItem, setHoveredItem] = useState(null);
  const [depletingItem, setDepletingItem] = useState(null); // Track which item is in deplete mode
  const [depleteValue, setDepleteValue] = useState(0); // Current slider value
  const [confirmingDelete, setConfirmingDelete] = useState(null); // Track item awaiting delete confirmation

  // Save sort preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('inventorySortBy', sortBy);
  }, [sortBy]);

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

  // Delete item from inventory
  const handleDeleteItem = async (itemId, itemName) => {
    // Show confirmation prompt
    setConfirmingDelete({ id: itemId, name: itemName });
  };

  // Confirm deletion without adding to order
  const handleConfirmDelete = async (itemId) => {
    try {
      await inventoryAPI.delete(itemId);
      
      // Reload inventory after deletion
      await loadInventory();
      await loadLowStock();
      
      // Clear confirmation state
      setConfirmingDelete(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to delete item');
      console.error('Error deleting item:', err);
    }
  };

  // Delete item and add to order
  const handleDeleteAndAddToOrder = async (itemId, itemName) => {
    try {
      // Get the item details - either from confirmingDelete.item or from inventory
      let item = confirmingDelete?.item;
      if (!item) {
        item = inventory.find(i => i.id === itemId);
      }
      if (!item) {
        throw new Error('Item not found');
      }

      // Determine source based on confirmingDelete
      const source = confirmingDelete?.source || 'trash';

      // Add to cart - let LLM suggest quantity, unit, and price
      await cartAPI.addItem({
        item_name: item.item_name,
        category: item.category,
        source: source,
        use_llm_pricing: true, // Enable LLM pricing
      });
      
      await inventoryAPI.delete(itemId);
      
      // Reload inventory after deletion
      await loadInventory();
      await loadLowStock();
      
      // Clear confirmation state
      setConfirmingDelete(null);
      
      // Show success message
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to delete item');
      console.error('Error deleting item:', err);
    }
  };

  // Add item to cart without deleting
  const handleAddToCart = async (item) => {
    try {
      await cartAPI.addItem({
        item_name: item.item_name,
        category: item.category,
        source: 'cart_icon',
        use_llm_pricing: true, // Let LLM suggest quantity, unit, and price
      });
      
      // Show success feedback (you could add a toast notification here)
      console.log(`Added ${item.item_name} to cart with LLM-suggested pricing`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add item to cart');
      console.error('Error adding to cart:', err);
    }
  };

  // Cancel deletion
  const handleCancelDelete = () => {
    setConfirmingDelete(null);
  };

  // Get step size based on unit
  const getStepSize = (unit) => {
    const wholeNumberUnits = ['count', 'can'];
    const quarterUnits = ['package', 'box', 'bottle'];
    const halfUnits = ['gallon', 'liter', 'quart'];
    const fineUnits = ['ounce', 'pound', 'lb', 'oz'];

    if (wholeNumberUnits.includes(unit.toLowerCase())) return 1;
    if (quarterUnits.includes(unit.toLowerCase())) return 0.25;
    if (halfUnits.includes(unit.toLowerCase())) return 0.5;
    if (fineUnits.includes(unit.toLowerCase())) return 0.1;
    return 0.5; // default
  };

  // Start depletion mode
  const handleStartDeplete = (item) => {
    setDepletingItem(item.id);
    setDepleteValue(parseFloat(item.quantity));
  };

  // Cancel depletion
  const handleCancelDeplete = () => {
    setDepletingItem(null);
    setDepleteValue(0);
  };

  // Apply depletion
  const handleApplyDeplete = async (itemId, newQuantity, itemName) => {
    try {
      // If quantity is 0, show confirmation to add to order
      if (newQuantity === 0) {
        // Get the item details
        const item = inventory.find(i => i.id === itemId);
        
        setConfirmingDelete({ id: itemId, name: itemName, item, source: 'deplete' });
        // Exit depletion mode
        setDepletingItem(null);
        setDepleteValue(0);
      } else {
        await inventoryAPI.update(itemId, { quantity: newQuantity });
        
        // Reload inventory after update
        await loadInventory();
        await loadLowStock();
        
        // Exit depletion mode
        setDepletingItem(null);
        setDepleteValue(0);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update item');
      console.error('Error updating item:', err);
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
    if (!item.predicted_runout) return 'border-gray-300';
    
    const date = new Date(item.predicted_runout);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 1) return 'bg-red-100 border-red-300 text-red-800';
    if (diffDays <= 3) return 'bg-yellow-100 border-yellow-300 text-yellow-800';
    return 'border-gray-300';
  };

  // Category icon and color
  const getCategoryInfo = (category) => {
    const categories = {
      dairy: { icon: '🥛', color: 'bg-blue-50' },
      produce: { icon: '🥬', color: 'bg-green-50' },
      meat: { icon: '🥩', color: 'bg-red-50' },
      pantry: { icon: '🥫', color: 'bg-yellow-50' },
      bread: { icon: '🍞', color: 'bg-amber-50' },
      others: { icon: '📦', color: 'bg-gray-50' },
    };
    return categories[category?.toLowerCase()] || { icon: '📦', color: 'bg-gray-50' };
  };

  // Calculate days until runout
  const getDaysUntilRunout = (item) => {
    if (!item.predicted_runout) return NaN;
    const date = new Date(item.predicted_runout);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Sort inventory
  const getSortedInventory = () => {
    const sorted = [...inventory];
    
    if (sortBy === 'category') {
      // Define category order: Dairy, Produce, Meat, Pantry, Bread, Other
      const categoryOrder = {
        'dairy': 1,
        'produce': 2,
        'meat': 3,
        'pantry': 4,
        'bread': 5,
        'other': 6
      };
      
      sorted.sort((a, b) => {
        const catA = (a.category || 'other').toLowerCase();
        const catB = (b.category || 'other').toLowerCase();
        const orderA = categoryOrder[catA] || 6; // Default to 'other' if category not found
        const orderB = categoryOrder[catB] || 6;
        return orderA - orderB;
      });
    } else if (sortBy === 'days') {
      sorted.sort((a, b) => {
        const daysA = getDaysUntilRunout(a);
        const daysB = getDaysUntilRunout(b);
        
        // NaN values go to the bottom
        if (isNaN(daysA) && isNaN(daysB)) return 0;
        if (isNaN(daysA)) return 1;
        if (isNaN(daysB)) return -1;
        
        return daysA - daysB;
      });
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => {
        const dateA = new Date(a.last_updated);
        const dateB = new Date(b.last_updated);
        return dateA - dateB; // Oldest first
      });
    }
    
    return sorted;
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

      {/* Sort Controls */}
      {inventory.length > 0 && (
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3">
          <span className="text-sm font-medium text-gray-700">Sort by:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('days')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'days'
                  ? 'bg-grapefruit-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Days Until Runout
            </button>
            <button
              onClick={() => setSortBy('oldest')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'oldest'
                  ? 'bg-grapefruit-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Oldest First
            </button>
            <button
              onClick={() => setSortBy('category')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortBy === 'category'
                  ? 'bg-grapefruit-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Category
            </button>
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
          {getSortedInventory().map((item) => {
            const categoryInfo = getCategoryInfo(item.category);
            const statusColor = getStatusColor(item);
            const daysUntilRunout = getDaysUntilRunout(item);
            const hasConsumption = !isNaN(daysUntilRunout);
            const isDepletingThisItem = depletingItem === item.id;
            const isConfirmingThisItem = confirmingDelete?.id === item.id;
            const stepSize = getStepSize(item.unit);
            
            // Check if item was added in the last 24 hours
            const createdDate = new Date(item.created_at);
            const now = new Date();
            const hoursSinceCreation = (now - createdDate) / (1000 * 60 * 60);
            const isNewlyAdded = hoursSinceCreation <= 24;
            
            // Calculate days since item was added
            const daysSinceCreation = (now - createdDate) / (1000 * 60 * 60 * 24);
            const hasEnoughHistory = daysSinceCreation >= 2;
            
            // Determine background color
            const backgroundColor = isNewlyAdded ? 'bg-green-50' : 'bg-white';
            
            // Only show "runs out in" if days until runout is 3 or less
            const showRunsOutIn = hasConsumption && daysUntilRunout >= 0 && daysUntilRunout <= 3;
            
            return (
              <div
                key={item.id}
                className={`relative ${backgroundColor} border-2 ${statusColor.split(' ')[1]} rounded-lg p-4 hover:shadow-md transition-all group`}
                onMouseEnter={() => !isDepletingThisItem && !isConfirmingThisItem && setHoveredItem(item.id)}
                onMouseLeave={() => !isDepletingThisItem && !isConfirmingThisItem && setHoveredItem(null)}
              >
                {isConfirmingThisItem ? (
                  // Confirmation Mode - Add to Order Prompt
                  <div className="space-y-4">
                    <div className="text-center">
                      <span className="text-3xl mb-2 block">{categoryInfo.icon}</span>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Add {item.item_name} to order?
                      </h3>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleDeleteAndAddToOrder(item.id, item.item_name)}
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                      >
                        Yes, Add to Order
                      </button>
                      <button
                        onClick={() => handleConfirmDelete(item.id)}
                        className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                      >
                        No, Just Remove
                      </button>
                      <button
                        onClick={handleCancelDelete}
                        className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : isDepletingThisItem ? (
                  // Depletion Mode - Slider Interface
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{categoryInfo.icon}</span>
                        <div>
                          <h3 className="font-semibold text-gray-900">{item.item_name}</h3>
                          <p className="text-sm text-gray-600 capitalize">{item.category || 'Other'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-orange-600">
                            {depleteValue.toFixed(stepSize >= 1 ? 0 : 2)}
                          </span>
                          <span className="text-sm text-gray-600">{item.unit}</span>
                        </div>
                      </div>
                    </div>

                    {/* Slider */}
                    <div className="space-y-2">
                      <input
                        type="range"
                        min="0"
                        max={parseFloat(item.quantity)}
                        step={stepSize}
                        value={depleteValue}
                        onChange={(e) => setDepleteValue(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                      />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>0</span>
                        <span>{parseFloat(item.quantity).toFixed(stepSize >= 1 ? 0 : 2)} {item.unit}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApplyDeplete(item.id, depleteValue, item.item_name)}
                        className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
                      >
                        Apply
                      </button>
                      <button
                        onClick={handleCancelDeplete}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Normal Mode - Regular Card
                  <>
                    {/* Action Icons - appear on hover */}
                    {hoveredItem === item.id && (
                      <div className="absolute top-2 right-2 flex gap-2 bg-white rounded-lg shadow-lg p-2 border border-gray-200">
                        <button
                          onClick={() => handleStartDeplete(item)}
                          className="p-2 hover:bg-orange-50 rounded transition-colors"
                          title="Deplete item"
                        >
                          <Sliders className="w-4 h-4 text-orange-600 rotate-90" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id, item.item_name)}
                          className="p-2 hover:bg-red-50 rounded transition-colors"
                          title="Remove from inventory"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                        <button
                          onClick={() => handleAddToCart(item)}
                          className="p-2 hover:bg-blue-50 rounded transition-colors"
                          title="Add to cart"
                        >
                          <ShoppingCart className="w-4 h-4 text-blue-600" />
                        </button>
                      </div>
                    )}

                {/* Header with quantity on the right */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{categoryInfo.icon}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{item.item_name}</h3>
                      <p className="text-sm text-gray-600 capitalize">{item.category || 'Other'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold text-gray-900">
                        {parseFloat(item.quantity).toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-600">{item.unit}</span>
                    </div>
                  </div>
                </div>

                {/* Consumption rate */}
                {hasEnoughHistory && item.average_daily_consumption > 0 && (
                  <p className="text-xs text-gray-500 mb-2">
                    Consumes ~{parseFloat(item.average_daily_consumption).toFixed(2)} {item.unit}/day
                  </p>
                )}

                {/* Predicted Runout - only show if there's a consumption rate and runs out in 3 days or fewer */}
                {showRunsOutIn && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${statusColor} mb-2`}>
                    <Calendar className="w-4 h-4" />
                    <div className="flex-1">
                      <p className="text-xs font-medium">Runs out in:</p>
                      <p className="text-sm font-semibold">
                        {formatDate(item.predicted_runout)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Last Updated */}
                <p className="text-xs text-gray-500 text-right">
                  Updated {new Date(item.last_updated).toLocaleDateString()}
                </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InventoryDashboard;
