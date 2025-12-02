import React, { useState } from 'react';
import { inventoryAPI } from '../services/api';
import { Plus, AlertCircle, Check } from 'lucide-react';

const ManualEntry = ({ onItemAdded }) => {
  const [formData, setFormData] = useState({
    item_name: '',
    quantity: '',
    unit: 'gallon',
    category: 'dairy',
    average_daily_consumption: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Available options
  const units = ['gallon', 'liter', 'ounce', 'pound', 'count', 'package', 'box', 'can', 'bottle'];
  const categories = ['dairy', 'produce', 'meat', 'pantry', 'bread', 'other'];

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      // Validate
      if (!formData.item_name.trim()) {
        setError('Item name is required');
        return;
      }
      if (!formData.quantity || parseFloat(formData.quantity) < 0) {
        setError('Quantity must be a positive number');
        return;
      }

      // Prepare data
      const itemData = {
        item_name: formData.item_name.trim(),
        quantity: parseFloat(formData.quantity),
        unit: formData.unit,
        category: formData.category,
        average_daily_consumption: formData.average_daily_consumption
          ? parseFloat(formData.average_daily_consumption)
          : 0,
      };

      // Create item
      await inventoryAPI.create(itemData);

      // Show success
      setSuccess(true);

      // Reset form
      setFormData({
        item_name: '',
        quantity: '',
        unit: 'gallon',
        category: 'dairy',
        average_daily_consumption: '',
      });

      // Notify parent component
      if (onItemAdded) {
        onItemAdded();
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to add item');
      console.error('Error adding item:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-6">
        <Plus className="w-5 h-5 text-grapefruit-500" />
        <h3 className="text-lg font-semibold text-gray-900">Add Item Manually</h3>
      </div>

      {/* Success Message */}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          Item added successfully!
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Item Name */}
        <div>
          <label htmlFor="item_name" className="block text-sm font-medium text-gray-700 mb-2">
            Item Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="item_name"
            name="item_name"
            value={formData.item_name}
            onChange={handleChange}
            placeholder="e.g., Whole Milk"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent"
          />
        </div>

        {/* Quantity and Unit */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-2">
              Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="quantity"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              placeholder="e.g., 2.5"
              step="0.01"
              min="0"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-2">
              Unit
            </label>
            <select
              id="unit"
              name="unit"
              value={formData.unit}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent"
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
            Category
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Average Daily Consumption */}
        <div>
          <label
            htmlFor="average_daily_consumption"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Average Daily Consumption (Optional)
          </label>
          <input
            type="number"
            id="average_daily_consumption"
            name="average_daily_consumption"
            value={formData.average_daily_consumption}
            onChange={handleChange}
            placeholder="e.g., 0.25"
            step="0.01"
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent"
          />
          <p className="text-sm text-gray-500 mt-1">
            How much of this item you use per day (for forecasting)
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-grapefruit-500 text-white px-6 py-3 rounded-lg hover:bg-grapefruit-600 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
        >
          <Plus className="w-5 h-5" />
          {loading ? 'Adding Item...' : 'Add Item to Inventory'}
        </button>
      </form>
    </div>
  );
};

export default ManualEntry;
