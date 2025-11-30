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

const router = express.Router();

// In-memory storage for receipts during processing workflow
// In production, this could be Redis or a database table
const receiptStore = new Map();
const receiptTimeouts = new Map(); // Track timeouts for cleanup

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
    
    // Validate userId
    if (!userId) {
      return res.status(400).json({
        error: {
          message: 'userId is required',
          code: 'MISSING_USER_ID',
        },
      });
    }
    
    // Handle file upload
    if (req.file) {
      if (req.file.mimetype === 'text/plain' || req.file.mimetype === 'text/markdown') {
        receiptText = req.file.buffer.toString('utf-8');
      } else {
        // For images/PDFs, we'd run OCR here
        // For now, return error
        return res.status(400).json({
          error: {
            message: 'OCR not yet implemented. Please upload .txt or .md files for now.',
            code: 'OCR_NOT_IMPLEMENTED',
          },
        });
      }
    }
    // Handle JSON text input
    else if (req.body.text) {
      receiptText = req.body.text;
    }
    else {
      return res.status(400).json({
        error: {
          message: 'No receipt provided. Send file or text field.',
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

module.exports = router;
module.exports.cleanup = cleanup;
