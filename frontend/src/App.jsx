import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import InventoryDashboard from './components/InventoryDashboard';
import CartReview from './components/CartReview';
import PreferencesPanel from './components/PreferencesPanel';
import ManualEntry from './components/ManualEntry';
import { Package, ShoppingCart, Settings, Plus, Home as HomeIcon } from 'lucide-react';

// Navigation component
const Navigation = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: HomeIcon, label: 'Dashboard' },
    { path: '/inventory', icon: Package, label: 'Inventory' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/add', icon: Plus, label: 'Add Item' },
    { path: '/preferences', icon: Settings, label: 'Preferences' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <span className="text-2xl">🍊</span>
              <span className="ml-2 text-xl font-bold text-grapefruit-600">Grapefruit</span>
            </div>

            {/* Navigation Links */}
            <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`inline-flex items-center px-3 py-2 border-b-2 text-sm font-medium ${
                      isActive
                        ? 'border-grapefruit-500 text-grapefruit-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="sm:hidden border-t border-gray-200">
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center px-3 py-2 text-xs ${
                  isActive ? 'text-grapefruit-600' : 'text-gray-500'
                }`}
              >
                <Icon className="w-5 h-5 mb-1" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

// Home/Landing component
const HomePage = () => {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-grapefruit-500 to-grapefruit-600 rounded-lg p-8 text-white">
        <h1 className="text-4xl font-bold mb-4">Welcome to Grapefruit 🍊</h1>
        <p className="text-xl mb-6 opacity-90">
          Your AI-powered shopping assistant for smart grocery management
        </p>
        <div className="flex gap-4">
          <Link
            to="/inventory"
            className="bg-white text-grapefruit-600 px-6 py-3 rounded-lg font-medium hover:bg-gray-100"
          >
            View Inventory
          </Link>
          <Link
            to="/add"
            className="bg-grapefruit-700 text-white px-6 py-3 rounded-lg font-medium hover:bg-grapefruit-800"
          >
            Add Items
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <Package className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Smart Inventory</h3>
          <p className="text-sm text-gray-600">
            Track your groceries with AI-powered predictions
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <ShoppingCart className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Auto-Ordering</h3>
          <p className="text-sm text-gray-600">
            Never run out with automatic order generation
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <Settings className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Full Control</h3>
          <p className="text-sm text-gray-600">
            Set spending limits and brand preferences
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
            <Plus className="w-6 h-6 text-orange-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Easy Input</h3>
          <p className="text-sm text-gray-600">
            Add items manually or upload receipts
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Start</h2>
        <ol className="space-y-3 text-gray-600">
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-grapefruit-100 text-grapefruit-600 rounded-full flex items-center justify-center text-sm font-medium">
              1
            </span>
            <span>Add items to your inventory manually or by uploading a receipt</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-grapefruit-100 text-grapefruit-600 rounded-full flex items-center justify-center text-sm font-medium">
              2
            </span>
            <span>Set your spending limits and brand preferences</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-grapefruit-100 text-grapefruit-600 rounded-full flex items-center justify-center text-sm font-medium">
              3
            </span>
            <span>Simulate daily consumption to trigger automatic order generation</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-grapefruit-100 text-grapefruit-600 rounded-full flex items-center justify-center text-sm font-medium">
              4
            </span>
            <span>Review and approve orders before they're placed</span>
          </li>
        </ol>
      </div>
    </div>
  );
};

// Add Item Page (combines ManualEntry with future ReceiptUpload)
const AddItemPage = () => {
  const handleItemAdded = () => {
    // Future: Could refresh a list of recently added items
    console.log('Item added successfully');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Add Items</h2>
        <p className="text-gray-600 mt-1">Add items to your inventory</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ManualEntry onItemAdded={handleItemAdded} />
        
        {/* Placeholder for future ReceiptUpload component */}
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Receipt Upload</h3>
          <p className="text-sm text-gray-500">
            OCR receipt scanning coming soon!
          </p>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/inventory" element={<InventoryDashboard />} />
            <Route path="/orders" element={<CartReview />} />
            <Route path="/add" element={<AddItemPage />} />
            <Route path="/preferences" element={<PreferencesPanel />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <p className="text-center text-sm text-gray-500">
              🍊 Grapefruit - AI Shopping Assistant | Built for Akedo Bounty
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
