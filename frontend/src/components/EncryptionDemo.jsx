import React, { useState } from 'react';
import { Lock, Unlock, Key, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { encryptText, decryptText, generateDemoPassword, isWebCryptoSupported } from '../utils/clientEncryption';

/**
 * Client-Side Encryption Demo Component
 * Demonstrates browser-based encryption using Web Crypto API
 * 
 * NOTE: This is for DEMONSTRATION purposes only.
 * Not integrated into main app flow.
 */
const EncryptionDemo = () => {
  const [plaintext, setPlaintext] = useState('');
  const [password, setPassword] = useState('');
  const [encryptedText, setEncryptedText] = useState('');
  const [decryptedText, setDecryptedText] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleEncrypt = async () => {
    if (!plaintext.trim()) {
      setError('Please enter some text to encrypt');
      return;
    }

    if (!password) {
      setError('Please enter a password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const encrypted = await encryptText(plaintext, password);
      setEncryptedText(encrypted);
      setDecryptedText('');
      console.log('🔒 Encrypted successfully:', encrypted.substring(0, 50) + '...');
    } catch (err) {
      setError('Encryption failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDecrypt = async () => {
    if (!encryptedText) {
      setError('No encrypted text to decrypt');
      return;
    }

    if (!password) {
      setError('Please enter the password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const decrypted = await decryptText(encryptedText, password);
      setDecryptedText(decrypted);
      console.log('🔓 Decrypted successfully');
    } catch (err) {
      setError('Decryption failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePassword = () => {
    const newPassword = generateDemoPassword();
    setPassword(newPassword);
    console.log('🔑 Generated password:', newPassword);
  };

  const handleClear = () => {
    setPlaintext('');
    setEncryptedText('');
    setDecryptedText('');
    setError(null);
  };

  if (!isWebCryptoSupported()) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle size={20} />
          <p className="font-medium">Web Crypto API not supported</p>
        </div>
        <p className="text-sm text-red-600 mt-2">
          Your browser doesn't support the Web Crypto API. Please use a modern browser.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="text-blue-600" size={24} />
        <h3 className="text-xl font-bold text-gray-800">Client-Side Encryption Demo</h3>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-blue-800">
          <strong>Demo Feature:</strong> This demonstrates browser-based encryption using the Web Crypto API.
          Data is encrypted in your browser before being stored/transmitted.
        </p>
      </div>

      {/* Password Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Encryption Password
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <button
            onClick={handleGeneratePassword}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-2"
          >
            <Key size={16} />
            Generate
          </button>
        </div>
      </div>

      {/* Plaintext Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Plaintext
        </label>
        <textarea
          value={plaintext}
          onChange={(e) => setPlaintext(e.target.value)}
          placeholder="Enter text to encrypt..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
        />
      </div>

      {/* Encrypt Button */}
      <button
        onClick={handleEncrypt}
        disabled={loading || !plaintext.trim() || !password}
        className="w-full mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Lock size={16} />
        {loading ? 'Encrypting...' : 'Encrypt'}
      </button>

      {/* Encrypted Output */}
      {encryptedText && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Encrypted Text (Base64)
          </label>
          <div className="relative">
            <textarea
              value={encryptedText}
              readOnly
              rows={4}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-xs"
            />
            <div className="absolute top-2 right-2">
              <CheckCircle className="text-green-600" size={20} />
            </div>
          </div>
        </div>
      )}

      {/* Decrypt Button */}
      {encryptedText && (
        <button
          onClick={handleDecrypt}
          disabled={loading || !password}
          className="w-full mb-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Unlock size={16} />
          {loading ? 'Decrypting...' : 'Decrypt'}
        </button>
      )}

      {/* Decrypted Output */}
      {decryptedText && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Decrypted Text
          </label>
          <div className="relative">
            <textarea
              value={decryptedText}
              readOnly
              rows={4}
              className="w-full px-3 py-2 bg-green-50 border border-green-300 rounded-lg font-mono text-sm"
            />
            <div className="absolute top-2 right-2">
              <CheckCircle className="text-green-600" size={20} />
            </div>
          </div>
          {decryptedText === plaintext && (
            <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
              <CheckCircle size={16} />
              Decryption successful - matches original text
            </p>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={16} />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Clear Button */}
      {(plaintext || encryptedText || decryptedText) && (
        <button
          onClick={handleClear}
          className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Clear All
        </button>
      )}

      {/* Technical Details */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Technical Details</h4>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Algorithm: AES-256-GCM (AEAD cipher)</li>
          <li>• Key Derivation: PBKDF2 with 100,000 iterations</li>
          <li>• Initialization Vector: 96-bit random (generated per encryption)</li>
          <li>• Authentication Tag: 128-bit (included in ciphertext)</li>
          <li>• Encoding: Base64 for display</li>
          <li>• API: Web Crypto API (crypto.subtle)</li>
        </ul>
      </div>
    </div>
  );
};

export default EncryptionDemo;
