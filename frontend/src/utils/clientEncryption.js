/**
 * Client-Side Encryption Demo
 * Uses browser's native Web Crypto API
 * 
 * NOTE: This is a DEMONSTRATION feature only.
 * Not integrated into main receipt flow (server needs plaintext for LLM parsing).
 */

/**
 * Generate encryption key from password
 * @param {string} password - User password
 * @returns {Promise<CryptoKey>} - Encryption key
 */
async function deriveKeyFromPassword(password) {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  // Import password as key material
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordData,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  // Derive AES key from password
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('grapefruit-salt'), // In production, use random salt per user
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return key;
}

/**
 * Encrypt text using password
 * @param {string} text - Plaintext to encrypt
 * @param {string} password - Encryption password
 * @returns {Promise<string>} - Base64-encoded encrypted data (IV:Ciphertext)
 */
export async function encryptText(text, password) {
  try {
    const key = await deriveKeyFromPassword(password);
    
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Generate random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      key,
      data
    );
    
    // Combine IV and ciphertext
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Convert to base64
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt text');
  }
}

/**
 * Decrypt text using password
 * @param {string} encryptedB64 - Base64-encoded encrypted data
 * @param {string} password - Decryption password
 * @returns {Promise<string>} - Decrypted plaintext
 */
export async function decryptText(encryptedB64, password) {
  try {
    const key = await deriveKeyFromPassword(password);
    
    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
    
    // Extract IV and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    // Decrypt
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      key,
      ciphertext
    );
    
    // Convert bytes to string
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt text - incorrect password?');
  }
}

/**
 * Generate a random password for demo purposes
 * @returns {string} - Random password
 */
export function generateDemoPassword() {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if Web Crypto API is available
 * @returns {boolean} - True if available
 */
export function isWebCryptoSupported() {
  return !!(window.crypto && window.crypto.subtle);
}

export default {
  encryptText,
  decryptText,
  generateDemoPassword,
  isWebCryptoSupported,
};
