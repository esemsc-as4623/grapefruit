import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import InventoryDashboard from './components/InventoryDashboard';
import CartReview from './components/CartReview';
import PreferencesPanel from './components/PreferencesPanel';
import ManualEntry from './components/ManualEntry';
import ReceiptUploadPrivacy from './components/ReceiptUploadPrivacy';
import ReceiptReview from './components/ReceiptReview';
import { Package, ShoppingCart, Settings, Plus } from 'lucide-react';

// Navigation component
const Navigation = () => {
  const location = useLocation();

  const navItems = [
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
              <img src="/grapefruit.png" alt="Grapefruit" className="h-8 w-8" />
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

// Add Item Page (combines ManualEntry with ReceiptUpload)
const AddItemPage = () => {
  const [receiptData, setReceiptData] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const navigate = useNavigate();

  const handleReceiptParsed = (data) => {
    setReceiptData(data);
    setShowReview(true);
  };

  const handleApplied = (result) => {
    // Navigate to inventory with days sort instead of showing alert
    navigate('/inventory', { state: { sortBy: 'days' } });
  };

  const handleCancel = () => {
    setShowReview(false);
    setReceiptData(null);
  };

  const handleItemAdded = () => {
    // Future: Could refresh a list of recently added items
    console.log('Item added successfully');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Add Items</h2>
        <p className="text-gray-600 mt-1">Add items to your inventory manually or via receipt</p>
      </div>

      {showReview && receiptData ? (
        // Show receipt review when items are parsed
        <ReceiptReview 
          receiptData={receiptData}
          onApplied={handleApplied}
          onCancel={handleCancel}
        />
      ) : (
        // Show upload options - Receipt upload first, manual entry second
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ReceiptUploadPrivacy onReceiptParsed={handleReceiptParsed} />
          <ManualEntry onItemAdded={handleItemAdded} />
        </div>
      )}
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
            <Route path="/" element={<InventoryDashboard />} />
            <Route path="/inventory" element={<InventoryDashboard />} />
            <Route path="/orders" element={<CartReview />} />
            <Route path="/add" element={<AddItemPage />} />
            <Route path="/preferences" element={<PreferencesPanel />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <p className="text-center text-sm text-gray-500 flex items-center justify-center gap-2">
              <img src="/grapefruit.png" alt="Grapefruit" className="h-4 w-4" />
              Grapefruit - AI Shopping Assistant | Built for Akedo Bounty
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
