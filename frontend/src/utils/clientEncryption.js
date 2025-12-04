/**
 * Client-Side Encryption Utilities
 * AKEDO BOUNTY: On-device processing + User-owned encryption
 *
 * Features:
 * - Encrypt data BEFORE sending to server
 * - User owns encryption keys (stored in localStorage/wallet)
 * - Zero-knowledge architecture (server never sees plaintext)
 * - Uses Web Crypto API (native browser encryption)
 */

/**
 * Generate a new encryption key for the user
 * @returns {Promise<string>} - Base64-encoded encryption key
 */
export async function generateUserKey() {
  const key = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256  // AES-256
    },
    true,  // extractable
    ['encrypt', 'decrypt']
  );

  // Export key as JWK for storage
  const exported = await window.crypto.subtle.exportKey('jwk', key);
  return btoa(JSON.stringify(exported));
}

/**
 * Import user's encryption key from storage
 * @param {string} keyB64 - Base64-encoded key
 * @returns {Promise<CryptoKey>} - Web Crypto API key object
 */
async function importUserKey(keyB64) {
  const keyData = JSON.parse(atob(keyB64));

  return await window.crypto.subtle.importKey(
    'jwk',
    keyData,
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data client-side before sending to server
 * @param {string|object} data - Data to encrypt
 * @param {string} userKeyB64 - User's encryption key (from localStorage)
 * @returns {Promise<string>} - Base64-encoded encrypted data (IV:AuthTag:Ciphertext)
 */
export async function encryptClientSide(data, userKeyB64) {
  const key = await importUserKey(userKeyB64);

  // Convert data to bytes
  const dataString = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const dataBytes = new TextEncoder().encode(dataString);

  // Generate random IV (Initialization Vector)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));  // 96-bit IV for GCM

  // Encrypt
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128  // 128-bit authentication tag
    },
    key,
    dataBytes
  );

  // Format: IV:Ciphertext+AuthTag (auth tag is appended by GCM)
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');

  return btoa(`${ivHex}:${encryptedHex}`);
}

/**
 * Decrypt data received from server
 * @param {string} encryptedB64 - Base64-encoded encrypted data
 * @param {string} userKeyB64 - User's encryption key
 * @returns {Promise<any>} - Decrypted data (parsed as JSON if applicable)
 */
export async function decryptClientSide(encryptedB64, userKeyB64) {
  const key = await importUserKey(userKeyB64);

  // Decode from base64
  const encryptedData = atob(encryptedB64);
  const [ivHex, ciphertextHex] = encryptedData.split(':');

  // Convert hex to bytes
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const ciphertext = new Uint8Array(ciphertextHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  // Decrypt
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128
    },
    key,
    ciphertext
  );

  // Convert bytes to string
  const decryptedString = new TextDecoder().decode(decrypted);

  // Try to parse as JSON
  try {
    return JSON.parse(decryptedString);
  } catch {
    return decryptedString;
  }
}

/**
 * Get or create user's encryption key
 * AKEDO: User-owned storage - key stored in browser, never on server
 * @returns {Promise<string>} - User's encryption key (Base64)
 */
export async function getUserEncryptionKey() {
  const STORAGE_KEY = 'grapefruit_user_encryption_key';

  // Check localStorage
  let key = localStorage.getItem(STORAGE_KEY);

  if (!key) {
    // Generate new key for first-time user
    key = await generateUserKey();
    localStorage.setItem(STORAGE_KEY, key);

    console.warn('🔐 Generated new encryption key (stored locally)');
    console.warn('⚠️  IMPORTANT: Backup this key! If lost, your encrypted data cannot be recovered.');
    console.warn('📋 Key:', key.substring(0, 20) + '...');
  }

  return key;
}

/**
 * Export user's encryption key for backup
 * @returns {string} - Base64-encoded key
 */
export function exportUserKey() {
  const STORAGE_KEY = 'grapefruit_user_encryption_key';
  const key = localStorage.getItem(STORAGE_KEY);

  if (!key) {
    throw new Error('No encryption key found. Please generate one first.');
  }

  return key;
}

/**
 * Import user's encryption key from backup
 * @param {string} keyB64 - Base64-encoded key
 */
export function importUserKeyFromBackup(keyB64) {
  const STORAGE_KEY = 'grapefruit_user_encryption_key';

  try {
    // Validate key format
    JSON.parse(atob(keyB64));

    // Store key
    localStorage.setItem(STORAGE_KEY, keyB64);

    console.log('✅ Encryption key imported successfully');
  } catch (error) {
    throw new Error('Invalid encryption key format');
  }
}

/**
 * Clear user's encryption key (logout/reset)
 */
export function clearUserKey() {
  const STORAGE_KEY = 'grapefruit_user_encryption_key';
  localStorage.removeItem(STORAGE_KEY);
  console.warn('🗑️  Encryption key cleared');
}

/**
 * Encrypt receipt data before upload
 * AKEDO: On-device processing - encryption happens in browser
 * @param {File} imageFile - Receipt image file
 * @param {object} metadata - Receipt metadata
 * @returns {Promise<object>} - { encryptedImage, encryptedMetadata, userKey }
 */
export async function encryptReceiptForUpload(imageFile, metadata) {
  const userKey = await getUserEncryptionKey();

  // Read image as base64
  const imageDataURL = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(imageFile);
  });

  // Encrypt both image and metadata client-side
  const [encryptedImage, encryptedMetadata] = await Promise.all([
    encryptClientSide(imageDataURL, userKey),
    encryptClientSide(metadata, userKey)
  ]);

  console.log('🔒 Receipt encrypted client-side (server will never see plaintext)');

  return {
    encryptedImage,
    encryptedMetadata,
    userKey  // Only used for IPFS upload, never sent to server
  };
}

/**
 * Decrypt receipt data after retrieval
 * @param {string} encryptedImage - Encrypted image data
 * @param {string} encryptedMetadata - Encrypted metadata
 * @returns {Promise<object>} - { image, metadata }
 */
export async function decryptReceiptAfterDownload(encryptedImage, encryptedMetadata) {
  const userKey = await getUserEncryptionKey();

  const [image, metadata] = await Promise.all([
    decryptClientSide(encryptedImage, userKey),
    decryptClientSide(encryptedMetadata, userKey)
  ]);

  console.log('🔓 Receipt decrypted client-side');

  return { image, metadata };
}

/**
 * Hash sensitive data for privacy-preserving logs
 * @param {string} data - Data to hash
 * @returns {Promise<string>} - Hash (first 8 chars)
 */
export async function hashForLogging(data) {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(String(data));

  const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex.substring(0, 8);
}

// Export all encryption utilities
export default {
  generateUserKey,
  encryptClientSide,
  decryptClientSide,
  getUserEncryptionKey,
  exportUserKey,
  importUserKeyFromBackup,
  clearUserKey,
  encryptReceiptForUpload,
  decryptReceiptAfterDownload,
  hashForLogging
};
