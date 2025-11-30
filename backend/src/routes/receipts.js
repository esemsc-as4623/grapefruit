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
    const userId = req.body.user_id || req.query.user_id || 'demo_user';
    
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
    setTimeout(() => {
      receiptStore.delete(receiptId);
      logger.info(`Receipt ${receiptId} expired and removed from memory`);
    }, 60 * 60 * 1000);
    
    logger.info(`Receipt uploaded: ${receiptId}`, {
      userId,
      textLength: receiptText.length,
      vendor: metadata.vendor,
    });
    
    res.json({
      receipt_id: receiptId,
      raw_text: receiptText,
      metadata,
      status: 'uploaded',
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
router.post('/:id/parse', async (req, res, next) => {
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
      receipt_id: id,
      items: parseResult.items,
      needs_review: parseResult.needsReview,
      stats: parseResult.stats,
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
router.post('/:id/match', async (req, res, next) => {
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
      receipt_id: id,
      to_update: matchResults.toUpdate,
      to_create: matchResults.toCreate,
      needs_review: matchResults.needsReview,
      summary: matchResults.summary,
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
router.post('/:id/apply', async (req, res, next) => {
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
      receipt_id: id,
      updated_count: applyResults.updated.length,
      created_count: applyResults.created.length,
      error_count: applyResults.errors.length,
      updated_items: applyResults.updated,
      created_items: applyResults.created,
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
router.get('/:id', (req, res) => {
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
  
  // Return receipt without raw_text to reduce response size
  const { raw_text, ...receiptData } = receipt;
  
  res.json({
    ...receiptData,
    raw_text_length: raw_text.length,
  });
});

/**
 * DELETE /receipts/:id
 * Delete receipt from memory
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existed = receiptStore.has(id);
  
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

module.exports = router;
