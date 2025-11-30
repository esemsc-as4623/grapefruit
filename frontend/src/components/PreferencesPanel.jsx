import React, { useState, useEffect } from 'react';
import { preferencesAPI } from '../services/api';
import { Settings, DollarSign, Star, Save, AlertCircle } from 'lucide-react';

const PreferencesPanel = () => {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [maxSpend, setMaxSpend] = useState(250);
  const [approvalMode, setApprovalMode] = useState('manual');
  const [autoApproveLimit, setAutoApproveLimit] = useState(100);
  const [brandPrefs, setBrandPrefs] = useState({});
  const [allowedVendors, setAllowedVendors] = useState(['walmart', 'amazon']);

  // Available categories
  const categories = ['dairy', 'produce', 'meat', 'pantry', 'beverages', 'snacks'];

  // Load preferences
  const loadPreferences = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await preferencesAPI.get();
      setPreferences(data);
      
      // Set form values
      if (data.max_spend !== undefined) setMaxSpend(data.max_spend);
      if (data.approval_mode) setApprovalMode(data.approval_mode);
      if (data.auto_approve_limit !== undefined) setAutoApproveLimit(data.auto_approve_limit);
      if (data.brand_prefs) setBrandPrefs(data.brand_prefs);
      if (data.allowed_vendors) setAllowedVendors(data.allowed_vendors);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load preferences');
      console.error('Error loading preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
  }, []);

  // Save preferences
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      await preferencesAPI.update({
        max_spend: parseFloat(maxSpend),
        approval_mode: approvalMode,
        auto_approve_limit: parseFloat(autoApproveLimit),
        brand_prefs: brandPrefs,
        allowed_vendors: allowedVendors,
      });

      setSuccess(true);
      await loadPreferences();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  // Update brand preference for a category
  const updateBrandPref = (category, prefType, value) => {
    setBrandPrefs((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [prefType]: value.split(',').map((b) => b.trim()).filter(Boolean),
      },
    }));
  };

  // Toggle vendor
  const toggleVendor = (vendor) => {
    setAllowedVendors((prev) =>
      prev.includes(vendor)
        ? prev.filter((v) => v !== vendor)
        : [...prev, vendor]
    );
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
          <h2 className="text-3xl font-bold text-gray-900">Preferences</h2>
          <p className="text-gray-600 mt-1">Manage your shopping preferences and controls</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-grapefruit-500 text-white rounded-lg hover:bg-grapefruit-600 disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Preferences saved successfully!
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Spending Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-grapefruit-500" />
          <h3 className="text-lg font-semibold text-gray-900">Spending Controls</h3>
        </div>

        <div className="space-y-4">
          {/* Maximum Spend */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Monthly Spend
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                value={maxSpend}
                onChange={(e) => setMaxSpend(e.target.value)}
                min="0"
                step="10"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent"
              />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Orders exceeding this limit will require manual approval
            </p>
          </div>

          {/* Approval Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Approval Mode
            </label>
            <select
              value={approvalMode}
              onChange={(e) => setApprovalMode(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent"
            >
              <option value="manual">Manual approval for all orders</option>
              <option value="auto_under_limit">Auto-approve orders under limit</option>
              <option value="auto_all">Auto-approve all orders</option>
            </select>
          </div>

          {/* Auto Approve Limit */}
          {approvalMode === 'auto_under_limit' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Auto-Approve Limit
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  value={autoApproveLimit}
                  onChange={(e) => setAutoApproveLimit(e.target.value)}
                  min="0"
                  step="10"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-grapefruit-500 focus:border-transparent"
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Orders under this amount will be automatically approved
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Vendor Preferences */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-grapefruit-500" />
          <h3 className="text-lg font-semibold text-gray-900">Allowed Vendors</h3>
        </div>

        <div className="space-y-2">
          {['walmart', 'amazon'].map((vendor) => (
            <label key={vendor} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowedVendors.includes(vendor)}
                onChange={() => toggleVendor(vendor)}
                className="w-4 h-4 text-grapefruit-500 border-gray-300 rounded focus:ring-grapefruit-500"
              />
              <span className="text-gray-900 capitalize">{vendor}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Brand Preferences */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-grapefruit-500" />
          <h3 className="text-lg font-semibold text-gray-900">Brand Preferences</h3>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Set your preferred brands for each category. Enter brand names separated by commas.
        </p>

        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category} className="border-b border-gray-200 pb-4 last:border-0">
              <h4 className="text-sm font-semibold text-gray-900 capitalize mb-3">
                {category}
              </h4>
              <div className="space-y-3">
                {/* Preferred */}
                <div>
                  <label className="block text-xs font-medium text-green-700 mb-1">
                    Preferred Brands
                  </label>
                  <input
                    type="text"
                    value={brandPrefs[category]?.preferred?.join(', ') || ''}
                    onChange={(e) => updateBrandPref(category, 'preferred', e.target.value)}
                    placeholder="e.g., Organic Valley, Horizon"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                {/* Acceptable */}
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1">
                    Acceptable Brands
                  </label>
                  <input
                    type="text"
                    value={brandPrefs[category]?.acceptable?.join(', ') || ''}
                    onChange={(e) => updateBrandPref(category, 'acceptable', e.target.value)}
                    placeholder="e.g., Great Value, Kirkland"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Avoid */}
                <div>
                  <label className="block text-xs font-medium text-red-700 mb-1">
                    Avoid Brands
                  </label>
                  <input
                    type="text"
                    value={brandPrefs[category]?.avoid?.join(', ') || ''}
                    onChange={(e) => updateBrandPref(category, 'avoid', e.target.value)}
                    placeholder="e.g., Generic, Store Brand"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button (Bottom) */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-grapefruit-500 text-white rounded-lg hover:bg-grapefruit-600 disabled:opacity-50 flex items-center gap-2 font-medium"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving Changes...' : 'Save All Changes'}
        </button>
      </div>
    </div>
  );
};

export default PreferencesPanel;
