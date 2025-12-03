import React, { useState, useEffect } from 'react';
import { CheckCircle, Edit2, Plus, Trash2, AlertTriangle, Loader } from 'lucide-react';
import api from '../services/api';

const ReceiptReview = ({ receiptData, onApplied, onCancel }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showRawText, setShowRawText] = useState(false);

  // Available unit options (same as ManualEntry)
  const units = ['gallon', 'liter', 'ounce', 'pound', 'count', 'package', 'box', 'can', 'bottle'];

  useEffect(() => {
    if (receiptData && receiptData.items) {
      setItems(receiptData.items.map((item, index) => ({
        ...item,
        id: `item-${index}`,
        action: 'create', // Default action
        editable: true,
      })));
    }
  }, [receiptData]);

  // Handle item edit
  const handleEdit = (id, field, value) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // Toggle edit mode
  const toggleEdit = (id) => {
    setEditingId(editingId === id ? null : id);
  };

  // Remove item from list
  const handleRemove = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  // Apply items to inventory
  const handleApply = async () => {
    try {
      setLoading(true);
      setError(null);

      // Prepare items for submission
      const itemsToSubmit = items.map(item => ({
        item_name: item.item_name,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
        category: item.category,
        action: item.action,
        id: item.inventoryItem?.id, // Include ID for updates
      }));

      const response = await api.post(`/receipts/${receiptData.receiptId}/apply`, {
        items: itemsToSubmit,
      });

      const data = response.data;

      // Notify parent component
      if (onApplied) {
        onApplied(data);
      }

    } catch (err) {
      setError(err.message);
      console.error('Error applying items:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!receiptData || !items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500">
        No items to review. Upload a receipt first.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Review Parsed Items</h3>
      </div>

      {/* Raw Receipt Text Toggle */}
      {receiptData.rawText && (
        <div className="mb-4">
          <button
            onClick={() => setShowRawText(!showRawText)}
            className="text-sm text-grapefruit-600 hover:text-grapefruit-700 font-medium flex items-center gap-1"
          >
            {showRawText ? '▼' : '▶'} {showRawText ? 'Hide' : 'Show'} Original Receipt Text
          </button>
          {showRawText && (
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap">
                {receiptData.rawText}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats */}
      {receiptData.stats && (
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-sm text-blue-600 font-medium">Total Items</p>
            <p className="text-2xl font-bold text-blue-900">{items.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-sm text-green-600 font-medium">Avg Confidence</p>
            <p className="text-2xl font-bold text-green-900">
              {(receiptData.stats.avgConfidence * 100).toFixed(0)}%
            </p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-sm text-purple-600 font-medium">Categories</p>
            <p className="text-2xl font-bold text-purple-900">
              {receiptData.stats.categories?.length || 0}
            </p>
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 font-medium text-gray-700">Item</th>
              <th className="text-left py-3 px-2 font-medium text-gray-700">Qty</th>
              <th className="text-left py-3 px-2 font-medium text-gray-700">Unit</th>
              <th className="text-left py-3 px-2 font-medium text-gray-700">Category</th>
              <th className="text-left py-3 px-2 font-medium text-gray-700">Confidence</th>
              <th className="text-right py-3 px-2 font-medium text-gray-700">Edit</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-2">
                  {editingId === item.id ? (
                    <input
                      type="text"
                      value={item.item_name}
                      onChange={(e) => handleEdit(item.id, 'item_name', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  ) : (
                    <span className="font-medium text-gray-900">{item.item_name}</span>
                  )}
                </td>
                <td className="py-3 px-2">
                  {editingId === item.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => handleEdit(item.id, 'quantity', e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  ) : (
                    <span>{item.quantity}</span>
                  )}
                </td>
                <td className="py-3 px-2">
                  {editingId === item.id ? (
                    <select
                      value={item.unit}
                      onChange={(e) => handleEdit(item.id, 'unit', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      {units.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  ) : (
                    <span>{item.unit}</span>
                  )}
                </td>
                <td className="py-3 px-2">
                  {editingId === item.id ? (
                    <select
                      value={item.category}
                      onChange={(e) => handleEdit(item.id, 'category', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="dairy">Dairy</option>
                      <option value="produce">Produce</option>
                      <option value="meat">Meat</option>
                      <option value="bread">Bread</option>
                      <option value="pantry">Pantry</option>
                      <option value="other">Other</option>
                    </select>
                  ) : (
                    <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                      {item.category}
                    </span>
                  )}
                </td>
                <td className="py-3 px-2">
                  <span className={`text-xs font-medium ${
                    item.confidence >= 0.8 ? 'text-green-600' :
                    item.confidence >= 0.6 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {(item.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="py-3 px-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleEdit(item.id)}
                      className="p-1 text-gray-500 hover:text-grapefruit-600 transition-colors"
                      title={editingId === item.id ? 'Save' : 'Edit'}
                    >
                      {editingId === item.id ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Edit2 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleApply}
          disabled={loading || items.length === 0}
          className="flex-1 py-3 px-4 bg-grapefruit-500 text-white rounded-lg font-medium hover:bg-grapefruit-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader className="w-5 h-5 animate-spin" />
              Applying...
            </span>
          ) : (
            `Apply ${items.length} Items to Inventory`
          )}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default ReceiptReview;
