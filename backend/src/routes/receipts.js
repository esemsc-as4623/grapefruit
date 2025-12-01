/**
 * Receipt Routes
 * Handles receipt upload, parsing, and application to inventory
 */

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { parseReceipt, extractMetadata } = require('../services/receiptParser');
const { matchItems, applyToInventory } = require('../services/inventoryMatcher');
const logger = require('../utils/logger');

// AKEDO BOUNTY: Privacy & Storage integrations
const { uploadReceipt, retrieveReceipt, healthCheck: ipfsHealthCheck } = require('../services/ipfsStorage');
const { decrypt } = require('../middleware/encryption');
const { X402Header, AccountFreeAPIAccess } = require('../services/x402Protocol');

const router = express.Router();

// AKEDO BOUNTY: Hybrid storage strategy
// - If user provides encryption key → IPFS (user-owned, encrypted)
// - Otherwise → In-memory (traditional flow, for backward compatibility)
const receiptStore = new Map();
const receiptTimeouts = new Map(); // Track timeouts for cleanup
const ipfsReceiptStore = new Map(); // Maps receiptId → { imageCID, metadataCID }

// ============================================
// MIDDLEWARE
// ============================================
/**
 * Validate UUID format in route parameters
 */
const validateUUID = (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return next();
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ 
      error: { 
        message: 'Invalid UUID format for receipt ID',
        code: 'INVALID_UUID'
      } 
    });
  }
  
  next();
};

// Configure multer for file uploads (accepting text files for now)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept text files and images (for future OCR)
    const allowedMimes = [
      'text/plain',
      'text/markdown',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only text, markdown, images, and PDFs allowed.'));
    }
  },
});

/**
 * POST /receipts/upload
 * Upload receipt text or file
 * 
 * Accepts:
 * - multipart/form-data with 'receipt' file
 * - application/json with { text: "receipt content" }
 * 
 * Response: { receipt_id, raw_text, metadata }
 */
router.post('/upload', upload.single('receipt'), async (req, res, next) => {
  try {
    let receiptText = '';
    const userId = req.body.userId || req.body.user_id || req.query.user_id;

    // AKEDO BOUNTY: x402 protocol support (account-free API access)
    const x402Header = req.headers['x-x402-payment'] || req.body.x402Header;
    let accountFreeMode = false;

    if (x402Header && !userId) {
      // Verify x402 payment for account-free access
      try {
        accountFreeMode = await AccountFreeAPIAccess.verifyAccess(x402Header, '/receipts/upload');
        logger.info('Account-free access granted via x402 protocol');
      } catch (error) {
        return res.status(402).json({
          error: {
            message: 'Payment required for account-free access',
            code: 'X402_PAYMENT_REQUIRED',
            requiredAmount: 0.05,
            currency: 'USD'
          }
        });
      }
    }

    // Validate userId (unless account-free mode)
    if (!userId && !accountFreeMode) {
      return res.status(400).json({
        error: {
          message: 'userId is required (or use x402 payment for account-free access)',
          code: 'MISSING_USER_ID',
        },
      });
    }

    // AKEDO BOUNTY: Client-side encryption support
    const clientEncrypted = req.body.encrypted === true || req.body.encrypted === 'true';
    const userEncryptionKey = req.body.userKey; // Only used for IPFS, never stored

    // AKEDO BOUNTY: IPFS user-owned storage mode
    const useIPFS = req.body.useIPFS === true || req.body.useIPFS === 'true';

    // Handle file upload
    if (req.file) {
      if (req.file.mimetype === 'text/plain' || req.file.mimetype === 'text/markdown') {
        receiptText = req.file.buffer.toString('utf-8');

        // AKEDO BOUNTY: If client sent encrypted text, decrypt it
        if (clientEncrypted && userEncryptionKey) {
          try {
            receiptText = decrypt(receiptText);
            logger.info('Client-side encrypted receipt decrypted successfully');
          } catch (error) {
            return res.status(400).json({
              error: {
                message: 'Failed to decrypt client-encrypted receipt',
                code: 'DECRYPTION_FAILED',
              },
            });
          }
        }
      } else {
        // AKEDO BOUNTY: Image/PDF support with IPFS storage
        const imageBuffer = req.file.buffer;

        // Upload to IPFS (user-owned storage)
        if (useIPFS) {
          try {
            const receiptId = uuidv4();
            const metadata = {
              userId: userId || 'anonymous',
              filename: req.file.originalname,
              mimetype: req.file.mimetype,
              uploadedAt: new Date().toISOString(),
            };

            const ipfsResult = await uploadReceipt(imageBuffer, metadata, userEncryptionKey);

            // Store IPFS CIDs (not the actual image)
            ipfsReceiptStore.set(receiptId, {
              imageCID: ipfsResult.imageCID,
              metadataCID: ipfsResult.metadataCID,
              encrypted: ipfsResult.encrypted,
              gateway: ipfsResult.gateway,
            });

            logger.info('Receipt uploaded to IPFS (user-owned storage)', {
              receiptId,
              imageCID: ipfsResult.imageCID,
              encrypted: ipfsResult.encrypted,
            });

            return res.status(201).json({
              receiptId,
              status: 'uploaded_to_ipfs',
              storage: 'user-owned',
              ipfs: {
                imageCID: ipfsResult.imageCID,
                metadataCID: ipfsResult.metadataCID,
                gateway: ipfsResult.gateway,
                encrypted: ipfsResult.encrypted,
              },
              message: 'Receipt uploaded to IPFS. Image stored in decentralized network, not on our server.',
              nextStep: 'Use client-side OCR or send CID to /receipts/ipfs/:cid/parse'
            });
          } catch (error) {
            logger.error('IPFS upload failed:', error);
            return res.status(500).json({
              error: {
                message: 'Failed to upload to IPFS: ' + error.message,
                code: 'IPFS_UPLOAD_FAILED',
              },
            });
          }
        }

        // Fallback: OCR not implemented for server-side processing
        return res.status(400).json({
          error: {
            message: 'Server-side OCR not implemented. Use client-side OCR (edgeAI.js) or upload to IPFS with useIPFS=true.',
            code: 'OCR_NOT_IMPLEMENTED',
            suggestion: 'Use frontend Edge AI for privacy-preserving on-device OCR',
          },
        });
      }
    }
    // Handle JSON text input
    else if (req.body.text) {
      receiptText = req.body.text;

      // AKEDO BOUNTY: Decrypt if client-encrypted
      if (clientEncrypted && userEncryptionKey) {
        try {
          receiptText = decrypt(receiptText);
          logger.info('Client-encrypted text decrypted');
        } catch (error) {
          return res.status(400).json({
            error: {
              message: 'Failed to decrypt text',
              code: 'DECRYPTION_FAILED',
            },
          });
        }
      }
    }
    else {
      return res.status(400).json({
        error: {
          message: 'No receipt provided. Send file or text field (or use IPFS with useIPFS=true).',
          code: 'MISSING_RECEIPT',
        },
      });
    }
    
    // Validate receipt text
    if (!receiptText || receiptText.trim().length === 0) {
      return res.status(400).json({
        error: {
          message: 'Receipt text is empty.',
          code: 'EMPTY_RECEIPT',
        },
      });
    }
    
    // Generate receipt ID
    const receiptId = uuidv4();
    
    // Extract metadata
    const metadata = extractMetadata(receiptText);
    
    // Store receipt in memory
    receiptStore.set(receiptId, {
      id: receiptId,
      user_id: userId,
      raw_text: receiptText,
      metadata,
      parsed_items: null,
      match_results: null,
      created_at: new Date().toISOString(),
      status: 'uploaded',
    });
    
    // Auto-expire after 1 hour
    const timeoutId = setTimeout(() => {
      receiptStore.delete(receiptId);
      receiptTimeouts.delete(receiptId);
      logger.info(`Receipt ${receiptId} expired and removed from memory`);
    }, 60 * 60 * 1000);
    
    // Store timeout ID for cleanup
    receiptTimeouts.set(receiptId, timeoutId);
    
    logger.info(`Receipt uploaded: ${receiptId}`, {
      userId,
      textLength: receiptText.length,
      vendor: metadata.vendor,
    });
    
    res.status(201).json({
      receiptId: receiptId,
      status: 'uploaded',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      metadata,
      message: 'Receipt uploaded successfully. Use /receipts/:id/parse to parse items.',
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /receipts/:id/parse
 * Parse receipt into structured items
 * 
 * Body: {
 *   use_llm: boolean (default: false),
 *   min_confidence: number (default: 0.5),
 *   filter_non_grocery: boolean (default: true)
 * }
 * 
 * Response: { items, needs_review, stats }
 */
router.post('/:id/parse', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const receipt = receiptStore.get(id);
    
    if (!receipt) {
      return res.status(404).json({
        error: {
          message: 'Receipt not found. It may have expired (1 hour limit).',
          code: 'RECEIPT_NOT_FOUND',
        },
      });
    }
    
    const options = {
      useLLM: req.body.use_llm || false,
      minConfidence: req.body.min_confidence || 0.5,
      filterNonGrocery: req.body.filter_non_grocery !== false,
      mergeQuantities: req.body.merge_quantities !== false,
    };
    
    logger.info(`Parsing receipt ${id}`, options);
    
    // Parse the receipt
    const parseResult = await parseReceipt(receipt.raw_text, options);
    
    // Store parsed items
    receipt.parsed_items = parseResult.items;
    receipt.needs_review = parseResult.needsReview;
    receipt.parse_stats = parseResult.stats;
    receipt.status = 'parsed';
    receiptStore.set(id, receipt);
    
    res.json({
      receipt: {
        items: parseResult.items,
        method: parseResult.method,
        stats: parseResult.stats,
        needsReview: parseResult.needsReview,
      },
      receiptId: id,
      status: 'parsed',
      message: 'Receipt parsed successfully. Review items and use /receipts/:id/apply to add to inventory.',
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /receipts/:id/match
 * Match parsed items against existing inventory
 * 
 * Body: {
 *   use_llm: boolean (default: false),
 *   threshold: number (default: 0.6),
 *   auto_approve_threshold: number (default: 0.9)
 * }
 * 
 * Response: { to_update, to_create, needs_review, summary }
 */
router.post('/:id/match', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const receipt = receiptStore.get(id);
    
    if (!receipt) {
      return res.status(404).json({
        error: {
          message: 'Receipt not found.',
          code: 'RECEIPT_NOT_FOUND',
        },
      });
    }
    
    if (!receipt.parsed_items) {
      return res.status(400).json({
        error: {
          message: 'Receipt not yet parsed. Use /receipts/:id/parse first.',
          code: 'NOT_PARSED',
        },
      });
    }
    
    const options = {
      useLLM: req.body.use_llm || false,
      threshold: req.body.threshold || 0.6,
      autoApproveThreshold: req.body.auto_approve_threshold || 0.9,
    };
    
    logger.info(`Matching items for receipt ${id}`, options);
    
    // Match items against inventory
    const matchResults = await matchItems(
      receipt.parsed_items,
      receipt.user_id,
      options
    );
    
    // Store match results
    receipt.match_results = matchResults;
    receipt.status = 'matched';
    receiptStore.set(id, receipt);
    
    res.json({
      receiptId: id,
      matches: [
        ...matchResults.toUpdate.map(item => ({ ...item, matchType: 'update' })),
        ...matchResults.toCreate.map(item => ({ ...item, matchType: 'new' })),
        ...matchResults.needsReview.map(item => ({ ...item, matchType: 'ambiguous' })),
      ],
      summary: {
        total: matchResults.summary.total,
        updates: matchResults.summary.toUpdate,
        newItems: matchResults.summary.toCreate,
        ambiguous: matchResults.summary.needsReview,
      },
      status: 'matched',
      message: 'Items matched. Review suggestions and use /receipts/:id/apply to update inventory.',
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /receipts/:id/apply
 * Apply parsed items to inventory
 * 
 * Body: {
 *   items: Array (optional - override parsed items),
 *   adjustments: Object (optional - manual adjustments)
 *   auto_match: boolean (default: true)
 * }
 * 
 * Response: { updated_count, created_count, errors }
 */
router.post('/:id/apply', validateUUID, async (req, res, next) => {
  try {
    const { id } = req.params;
    const receipt = receiptStore.get(id);
    
    if (!receipt) {
      return res.status(404).json({
        error: {
          message: 'Receipt not found.',
          code: 'RECEIPT_NOT_FOUND',
        },
      });
    }
    
    const autoMatch = req.body.auto_match !== false;
    let matchResults = receipt.match_results;
    
    // If auto_match is enabled and we haven't matched yet, do it now
    if (autoMatch && !matchResults) {
      if (!receipt.parsed_items) {
        return res.status(400).json({
          error: {
            message: 'Receipt not yet parsed. Use /receipts/:id/parse first.',
            code: 'NOT_PARSED',
          },
        });
      }
      
      logger.info(`Auto-matching items for receipt ${id}`);
      matchResults = await matchItems(receipt.parsed_items, receipt.user_id);
      receipt.match_results = matchResults;
    }
    
    // Allow manual item overrides from request body
    if (req.body.items && Array.isArray(req.body.items)) {
      logger.info(`Using manual item overrides (${req.body.items.length} items)`);
      matchResults = {
        toUpdate: req.body.items.filter(item => item.action === 'update'),
        toCreate: req.body.items.filter(item => item.action === 'create'),
        needsReview: [],
        summary: {
          total: req.body.items.length,
          toUpdate: req.body.items.filter(item => item.action === 'update').length,
          toCreate: req.body.items.filter(item => item.action === 'create').length,
          needsReview: 0,
        },
      };
    }
    
    if (!matchResults) {
      return res.status(400).json({
        error: {
          message: 'No match results available. Use /receipts/:id/match or provide items in body.',
          code: 'NO_MATCH_RESULTS',
        },
      });
    }
    
    logger.info(`Applying receipt ${id} to inventory`);
    
    // Apply to inventory
    const applyResults = await applyToInventory(matchResults, receipt.user_id);
    
    // Update receipt status
    receipt.status = 'applied';
    receipt.applied_at = new Date().toISOString();
    receipt.apply_results = applyResults;
    receiptStore.set(id, receipt);
    
    res.json({
      receiptId: id,
      summary: {
        total: applyResults.updated.length + applyResults.created.length,
        updated: applyResults.updated.length,
        created: applyResults.created.length,
        errors: applyResults.errors.length,
      },
      changes: [
        ...applyResults.updated.map(item => ({ action: 'update', item })),
        ...applyResults.created.map(item => ({ action: 'create', item })),
      ],
      errors: applyResults.errors,
      status: 'applied',
      message: `Successfully updated ${applyResults.updated.length} items and created ${applyResults.created.length} items.`,
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /receipts/:id
 * Get receipt status and data
 */
router.get('/:id', validateUUID, (req, res) => {
  const { id } = req.params;
  const receipt = receiptStore.get(id);
  
  if (!receipt) {
    return res.status(404).json({
      error: {
        message: 'Receipt not found.',
        code: 'RECEIPT_NOT_FOUND',
      },
    });
  }
  
  // Return receipt with consistent field names
  res.json({
    receiptId: receipt.id,
    status: receipt.status,
    items: receipt.parsed_items,
    createdAt: receipt.created_at,
    expiresAt: new Date(new Date(receipt.created_at).getTime() + 60 * 60 * 1000).toISOString(),
    metadata: receipt.metadata,
    stats: receipt.parse_stats,
    matches: receipt.match_results,
  });
});

/**
 * DELETE /receipts/:id
 * Delete receipt from memory
 */
router.delete('/:id', validateUUID, (req, res) => {
  const { id } = req.params;
  const existed = receiptStore.has(id);
  
  // Clear timeout if it exists
  if (receiptTimeouts.has(id)) {
    clearTimeout(receiptTimeouts.get(id));
    receiptTimeouts.delete(id);
  }
  
  receiptStore.delete(id);
  
  if (existed) {
    logger.info(`Receipt ${id} deleted`);
    res.json({
      message: 'Receipt deleted successfully.',
      receipt_id: id,
    });
  } else {
    res.status(404).json({
      error: {
        message: 'Receipt not found.',
        code: 'RECEIPT_NOT_FOUND',
      },
    });
  }
});

/**
 * POST /receipts/ipfs/:cid/parse
 * AKEDO BOUNTY: Parse receipt from IPFS by CID
 *
 * This endpoint allows users to parse receipts stored on IPFS
 * without re-uploading the image. Users provide the IPFS CID
 * and optionally their encryption key if the data is encrypted.
 */
router.post('/ipfs/:cid/parse', async (req, res) => {
  try {
    const { cid } = req.params;
    const {
      userKey,
      metadataCID,
      userId = 'demo_user',
      use_llm = true,
      min_confidence = 0.5
    } = req.body;

    logger.info('Parsing receipt from IPFS CID', {
      imageCID: cid,
      metadataCID,
      encrypted: !!userKey,
      userId
    });

    // Step 1: Retrieve receipt from IPFS
    let receiptData;
    try {
      receiptData = await retrieveReceipt(cid, metadataCID, userKey);
    } catch (error) {
      logger.error('Failed to retrieve receipt from IPFS:', error);
      return res.status(404).json({
        error: {
          message: `Failed to retrieve receipt from IPFS: ${error.message}`,
          code: 'IPFS_RETRIEVAL_FAILED',
          cid,
        },
      });
    }

    // Step 2: Check if this is an image or text
    const isImage = receiptData.metadata.mimetype?.startsWith('image/');

    let receiptText;

    if (isImage) {
      // For images, we would need to perform OCR
      // This could be done server-side or the client can send pre-extracted text
      return res.status(400).json({
        error: {
          message: 'Image OCR from IPFS not yet implemented. Please use on-device OCR and send extracted text.',
          code: 'OCR_NOT_IMPLEMENTED',
          suggestion: 'Use Edge AI (Tesseract.js) in browser to extract text, then upload text with useIPFS=false',
        },
      });
    } else {
      // Text receipt
      receiptText = receiptData.image.toString('utf-8');
    }

    // Step 3: Create a temporary receipt ID for this IPFS-sourced receipt
    const receiptId = uuidv4();

    receiptStore.set(receiptId, {
      text: receiptText,
      userId,
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
      source: 'ipfs',
      ipfsCID: cid,
      metadata: receiptData.metadata,
    });

    // Step 4: Parse the receipt using LLM
    logger.info('Parsing receipt text from IPFS', { receiptId, textLength: receiptText.length });

    let parsedItems = [];

    if (use_llm) {
      try {
        parsedItems = await parseReceiptWithLLM(receiptText);
      } catch (error) {
        logger.error('LLM parsing failed, using fallback:', error);
        parsedItems = parseReceiptFallback(receiptText);
      }
    } else {
      parsedItems = parseReceiptFallback(receiptText);
    }

    // Update receipt store
    receiptStore.set(receiptId, {
      ...receiptStore.get(receiptId),
      parsedItems,
      status: 'parsed',
    });

    logger.info('Receipt from IPFS parsed successfully', {
      receiptId,
      itemCount: parsedItems.length,
    });

    res.json({
      receiptId,
      items: parsedItems,
      source: 'ipfs',
      ipfs: {
        imageCID: cid,
        metadataCID,
        gateway: `https://ipfs.io/ipfs/${cid}`,
      },
      metadata: {
        itemCount: parsedItems.length,
        averageConfidence: parsedItems.reduce((sum, item) => sum + (item.confidence || 0), 0) / parsedItems.length,
      },
      message: 'Receipt parsed from IPFS successfully',
    });
  } catch (error) {
    logger.error('Error parsing receipt from IPFS:', error);
    res.status(500).json({
      error: {
        message: 'Failed to parse receipt from IPFS',
        code: 'IPFS_PARSE_FAILED',
        details: error.message,
      },
    });
  }
});

/**
 * Cleanup function to clear all pending timeouts
 * Used primarily for testing to ensure Jest can exit cleanly
 */
const cleanup = () => {
  // Clear all pending timeouts
  for (const timeoutId of receiptTimeouts.values()) {
    clearTimeout(timeoutId);
  }
  receiptTimeouts.clear();
  receiptStore.clear();
};

/**
 * GET /receipts/ipfs/health
 * AKEDO BOUNTY: Check IPFS storage health
 */
router.get('/ipfs/health', async (req, res) => {
  try {
    const health = await ipfsHealthCheck();

    res.json({
      ipfs: health,
      message: health.available
        ? 'IPFS storage is available'
        : 'IPFS storage unavailable (using mock mode)',
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: 'Failed to check IPFS health',
        code: 'IPFS_HEALTH_CHECK_FAILED',
      },
    });
  }
});

module.exports = router;
module.exports.cleanup = cleanup;
