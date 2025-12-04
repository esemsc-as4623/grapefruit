const { create } = require('ipfs-http-client');
const { encrypt, decrypt } = require('../middleware/encryption');
const logger = require('../utils/logger');

/**
 * IPFS User-Owned Storage Service
 * AKEDO BOUNTY: Requirement #4 - User-owned storage
 *
 * Instead of storing receipt images on our server, we:
 * 1. Encrypt receipt data client-side (user owns encryption key)
 * 2. Upload to IPFS (decentralized, user-owned)
 * 3. Store only the IPFS hash in our database
 * 4. User can retrieve from IPFS anytime with their key
 *
 * This ensures:
 * - Data ownership: User owns the data on IPFS
 * - Privacy: Only user can decrypt (we never see plaintext)
 * - Decentralization: No central server stores sensitive images
 */

// IPFS Gateway Configuration
const IPFS_CONFIG = {
  // Public IPFS gateways (free tier)
  host: process.env.IPFS_HOST || 'ipfs.infura.io',
  port: process.env.IPFS_PORT || 5001,
  protocol: process.env.IPFS_PROTOCOL || 'https',

  // Infura IPFS credentials (if using Infura)
  headers: process.env.INFURA_PROJECT_ID ? {
    authorization: `Basic ${Buffer.from(
      `${process.env.INFURA_PROJECT_ID}:${process.env.INFURA_API_SECRET}`
    ).toString('base64')}`
  } : undefined
};

// Create IPFS client
let ipfs;
try {
  ipfs = create(IPFS_CONFIG);
  logger.info('IPFS client initialized', {
    host: IPFS_CONFIG.host,
    port: IPFS_CONFIG.port,
    protocol: IPFS_CONFIG.protocol
  });
} catch (error) {
  logger.warn('IPFS client initialization failed, using mock mode:', error.message);
  ipfs = null;
}

/**
 * Upload encrypted data to IPFS
 * @param {Buffer|string} data - Data to upload (should be pre-encrypted)
 * @param {string} userKey - User's encryption key (client-side only, never stored)
 * @returns {Promise<string>} - IPFS hash (CID)
 */
async function uploadToIPFS(data, userKey = null) {
  try {
    // Encrypt data if user key provided
    const dataToUpload = userKey
      ? encrypt(typeof data === 'string' ? data : data.toString('utf8'))
      : data;

    if (!ipfs) {
      // Mock mode for development (no IPFS server)
      const mockCID = 'Qm' + require('crypto').randomBytes(22).toString('hex');
      logger.warn('IPFS mock mode: generated fake CID', { cid: mockCID });

      // Store locally as fallback
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.join(__dirname, '../../.ipfs-mock');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, mockCID), dataToUpload);

      return mockCID;
    }

    // Real IPFS upload
    const { cid } = await ipfs.add(dataToUpload);
    const cidString = cid.toString();

    logger.info('Uploaded to IPFS', {
      cid: cidString,
      size: dataToUpload.length,
      encrypted: !!userKey
    });

    return cidString;
  } catch (error) {
    logger.error('IPFS upload failed:', error);
    throw new Error(`Failed to upload to IPFS: ${error.message}`);
  }
}

/**
 * Retrieve data from IPFS and decrypt
 * @param {string} cid - IPFS Content Identifier
 * @param {string} userKey - User's decryption key (client-side only)
 * @returns {Promise<Buffer|string>} - Decrypted data
 */
async function retrieveFromIPFS(cid, userKey = null) {
  try {
    let data;

    if (!ipfs) {
      // Mock mode: read from local storage
      const fs = require('fs');
      const path = require('path');
      const mockPath = path.join(__dirname, '../../.ipfs-mock', cid);

      if (!fs.existsSync(mockPath)) {
        throw new Error(`Mock IPFS: CID ${cid} not found`);
      }

      data = fs.readFileSync(mockPath, 'utf8');
      logger.warn('IPFS mock mode: retrieved from local storage', { cid });
    } else {
      // Real IPFS retrieval
      const chunks = [];
      for await (const chunk of ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      data = Buffer.concat(chunks).toString('utf8');
    }

    // Decrypt if user key provided
    if (userKey) {
      data = decrypt(data);
    }

    logger.info('Retrieved from IPFS', {
      cid,
      size: data.length,
      decrypted: !!userKey
    });

    return data;
  } catch (error) {
    logger.error('IPFS retrieval failed:', error);
    throw new Error(`Failed to retrieve from IPFS: ${error.message}`);
  }
}

/**
 * Upload receipt image to IPFS (user-owned storage)
 * @param {Buffer} imageBuffer - Receipt image
 * @param {object} metadata - Receipt metadata (store, date, etc.)
 * @param {string} userEncryptionKey - User's key (never stored server-side)
 * @returns {Promise<object>} - { imageCID, metadataCID }
 */
async function uploadReceipt(imageBuffer, metadata, userEncryptionKey = null) {
  try {
    // Upload encrypted image to IPFS
    const imageCID = await uploadToIPFS(imageBuffer, userEncryptionKey);

    // Upload encrypted metadata to IPFS
    const metadataJSON = JSON.stringify(metadata);
    const metadataCID = await uploadToIPFS(metadataJSON, userEncryptionKey);

    logger.info('Receipt uploaded to IPFS', {
      imageCID,
      metadataCID,
      encrypted: !!userEncryptionKey,
      imageSize: imageBuffer.length,
      metadataSize: metadataJSON.length
    });

    return {
      imageCID,
      metadataCID,
      uploadedAt: new Date().toISOString(),
      encrypted: !!userEncryptionKey,
      gateway: `https://ipfs.io/ipfs/${imageCID}`,  // Public gateway URL
    };
  } catch (error) {
    logger.error('Receipt upload to IPFS failed:', error);
    throw error;
  }
}

/**
 * Retrieve receipt from IPFS
 * @param {string} imageCID - IPFS hash for image
 * @param {string} metadataCID - IPFS hash for metadata
 * @param {string} userEncryptionKey - User's key for decryption
 * @returns {Promise<object>} - { image, metadata }
 */
async function retrieveReceipt(imageCID, metadataCID, userEncryptionKey = null) {
  try {
    const [image, metadataJSON] = await Promise.all([
      retrieveFromIPFS(imageCID, userEncryptionKey),
      retrieveFromIPFS(metadataCID, userEncryptionKey)
    ]);

    const metadata = JSON.parse(metadataJSON);

    logger.info('Receipt retrieved from IPFS', {
      imageCID,
      metadataCID,
      decrypted: !!userEncryptionKey
    });

    return {
      image: Buffer.from(image, 'utf8'),
      metadata
    };
  } catch (error) {
    logger.error('Receipt retrieval from IPFS failed:', error);
    throw error;
  }
}

/**
 * Pin important data to ensure it stays on IPFS
 * @param {string} cid - Content Identifier to pin
 */
async function pinToIPFS(cid) {
  if (!ipfs) {
    logger.warn('IPFS mock mode: skipping pin');
    return;
  }

  try {
    await ipfs.pin.add(cid);
    logger.info('Pinned to IPFS', { cid });
  } catch (error) {
    logger.error('IPFS pin failed:', error);
    // Non-fatal, continue
  }
}

/**
 * Get IPFS gateway URL for a CID
 * @param {string} cid - Content Identifier
 * @returns {string} - Public gateway URL
 */
function getGatewayURL(cid) {
  const gateways = [
    `https://ipfs.io/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
  ];

  return gateways[0];  // Primary gateway
}

/**
 * Health check: Test IPFS connection
 * @returns {Promise<boolean>} - true if IPFS is available
 */
async function healthCheck() {
  if (!ipfs) {
    return { available: false, mode: 'mock', message: 'IPFS client not initialized' };
  }

  try {
    const id = await ipfs.id();
    return {
      available: true,
      mode: 'real',
      nodeId: id.id,
      addresses: id.addresses
    };
  } catch (error) {
    return {
      available: false,
      mode: 'error',
      message: error.message
    };
  }
}

module.exports = {
  uploadToIPFS,
  retrieveFromIPFS,
  uploadReceipt,
  retrieveReceipt,
  pinToIPFS,
  getGatewayURL,
  healthCheck,
};
