const crypto = require('crypto');
const { encrypt, decrypt, hash, generateSecurePaymentHeader, verifyPaymentHeader } = require('../middleware/encryption');
const logger = require('../utils/logger');

/**
 * x402 Protocol Integration
 * AKEDO BOUNTY: Requirement #4 - x402 protocol support
 *
 * The x402 protocol enables:
 * - Account-free API access (no signup required)
 * - Autonomous AI agent payments (agents can pay for resources)
 * - Privacy-preserving transactions (no personal info required)
 * - Crypto-based micropayments
 *
 * Based on: https://www.x402.org
 * Reference: AKEDO integration with x402
 */

/**
 * x402 Payment Header Structure
 * As per x402 specification
 */
class X402Header {
  constructor(options = {}) {
    this.version = '1.0';
    this.amount = options.amount || 0;
    this.currency = options.currency || 'USD';
    this.timestamp = options.timestamp || Date.now();
    this.nonce = options.nonce || crypto.randomBytes(16).toString('hex');
    this.payee = options.payee; // Vendor address (Amazon, etc.)
    this.payer = options.payer; // User/AI agent address
    this.metadata = options.metadata || {};
  }

  /**
   * Serialize header for transmission
   * @returns {string} - Base64-encoded encrypted header
   */
  serialize() {
    const headerData = {
      version: this.version,
      amount: this.amount,
      currency: this.currency,
      timestamp: this.timestamp,
      nonce: this.nonce,
      payee: this.payee,
      payer: this.payer,
      metadata: this.metadata,
      checksum: hash(JSON.stringify({
        amount: this.amount,
        currency: this.currency,
        timestamp: this.timestamp,
        nonce: this.nonce
      }))
    };

    return encrypt(JSON.stringify(headerData));
  }

  /**
   * Deserialize header from transmission
   * @param {string} serialized - Base64-encoded encrypted header
   * @returns {X402Header} - Parsed header object
   */
  static deserialize(serialized) {
    const decrypted = decrypt(serialized);
    const headerData = JSON.parse(decrypted);

    // Verify checksum
    const expectedChecksum = hash(JSON.stringify({
      amount: headerData.amount,
      currency: headerData.currency,
      timestamp: headerData.timestamp,
      nonce: headerData.nonce
    }));

    if (headerData.checksum !== expectedChecksum) {
      throw new Error('x402 header checksum mismatch - possible tampering');
    }

    // Verify timestamp (prevent replay attacks - 5 minute window)
    const age = Date.now() - headerData.timestamp;
    if (age > 5 * 60 * 1000) {
      throw new Error('x402 header expired (>5 minutes old)');
    }

    return new X402Header(headerData);
  }
}

/**
 * Autonomous AI Agent - Makes purchasing decisions without human intervention
 * AKEDO: Autonomous agent capability
 */
class AutonomousShoppingAgent {
  constructor(userId, userLimits = {}) {
    this.userId = userId;
    this.limits = {
      maxPerTransaction: userLimits.maxPerTransaction || 50.00,
      dailyLimit: userLimits.dailyLimit || 200.00,
      requiresApprovalAbove: userLimits.requiresApprovalAbove || 25.00,
      autoApproveCategories: userLimits.autoApproveCategories || ['groceries', 'essentials']
    };

    this.dailySpent = 0; // Track spending (in production, fetch from database)
  }

  /**
   * Evaluate if item should be auto-ordered
   * AI Agent Decision Logic
   * @param {object} item - Inventory item to evaluate
   * @returns {object} - { shouldOrder, reason, confidence }
   */
  async evaluateAutoOrder(item) {
    const decision = {
      shouldOrder: false,
      reason: '',
      confidence: 0,
      requiresApproval: false
    };

    // Rule 1: Check quantity threshold
    if (item.quantity <= 0) {
      decision.shouldOrder = true;
      decision.reason = 'Item depleted (quantity = 0)';
      decision.confidence = 1.0;
    } else if (item.quantity <= (item.reorder_point || 2)) {
      decision.shouldOrder = true;
      decision.reason = `Low stock (${item.quantity} ${item.unit} remaining)`;
      decision.confidence = 0.9;
    }

    // Rule 2: Check predicted runout date
    if (item.predicted_runout) {
      const daysUntilRunout = Math.ceil(
        (new Date(item.predicted_runout) - new Date()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilRunout <= 3) {
        decision.shouldOrder = true;
        decision.reason = `Predicted to run out in ${daysUntilRunout} days`;
        decision.confidence = 0.85;
      }
    }

    // Rule 3: Check spending limits
    if (decision.shouldOrder) {
      const estimatedCost = item.estimated_price || 5.00;

      // Check per-transaction limit
      if (estimatedCost > this.limits.maxPerTransaction) {
        decision.shouldOrder = false;
        decision.reason = `Exceeds per-transaction limit ($${estimatedCost} > $${this.limits.maxPerTransaction})`;
        decision.confidence = 0;
      }

      // Check daily limit
      if (this.dailySpent + estimatedCost > this.limits.dailyLimit) {
        decision.shouldOrder = false;
        decision.reason = `Exceeds daily spending limit`;
        decision.confidence = 0;
      }

      // Check if requires approval
      if (estimatedCost > this.limits.requiresApprovalAbove) {
        decision.requiresApproval = true;
        decision.reason += ' (requires user approval)';
      }

      // Auto-approve for whitelisted categories
      if (this.limits.autoApproveCategories.includes(item.category)) {
        decision.requiresApproval = false;
      }
    }

    logger.info('AI agent decision', {
      item: `[REDACTED:${hash(item.item_name).substring(0, 8)}]`,
      decision: decision.shouldOrder,
      reason: decision.reason,
      confidence: decision.confidence,
      requiresApproval: decision.requiresApproval
    });

    return decision;
  }

  /**
   * Execute autonomous order via x402 protocol
   * @param {object} orderData - Order details
   * @returns {Promise<object>} - { success, transactionId, x402Header }
   */
  async executeAutonomousOrder(orderData) {
    const { items, vendor, total } = orderData;

    // Create x402 payment header
    const x402 = new X402Header({
      amount: total,
      currency: 'USD',
      payee: vendor.walletAddress || 'amazon-payment-gateway',
      payer: this.userId,
      metadata: {
        items: items.map(i => ({
          name: hash(i.item_name).substring(0, 8),  // Privacy-preserving
          quantity: i.quantity,
          unit: i.unit
        })),
        autonomous: true,
        agentVersion: '1.0.0'
      }
    });

    const paymentHeader = x402.serialize();

    logger.info('Autonomous order via x402 protocol', {
      vendor: vendor.name,
      total: total,
      itemCount: items.length,
      headerSize: paymentHeader.length
    });

    try {
      // In production, this would call the vendor's x402 payment endpoint
      // For now, we simulate successful payment
      const transactionId = 'x402-' + crypto.randomBytes(16).toString('hex');

      // Update daily spending
      this.dailySpent += total;

      return {
        success: true,
        transactionId,
        x402Header: paymentHeader,
        timestamp: new Date().toISOString(),
        message: 'Order placed autonomously via x402 protocol'
      };
    } catch (error) {
      logger.error('Autonomous order failed:', error);
      throw new Error(`x402 payment failed: ${error.message}`);
    }
  }
}

/**
 * x402 Payment Gateway - Handles crypto payments for resources
 */
class X402PaymentGateway {
  /**
   * Process payment via x402 protocol
   * @param {string} x402HeaderEncrypted - Encrypted payment header
   * @param {object} resourceData - Resource being paid for
   * @returns {Promise<object>} - Payment result
   */
  static async processPayment(x402HeaderEncrypted, resourceData) {
    try {
      // Deserialize and validate header
      const header = X402Header.deserialize(x402HeaderEncrypted);

      logger.info('Processing x402 payment', {
        amount: header.amount,
        currency: header.currency,
        payee: header.payee,
        payer: `[HASHED:${hash(header.payer).substring(0, 8)}]`
      });

      // Validate payment amount
      const expectedAmount = resourceData.price || 0;
      if (header.amount < expectedAmount) {
        throw new Error(`Insufficient payment: sent ${header.amount}, expected ${expectedAmount}`);
      }

      // Simulate blockchain transaction (in production, would interact with wallet)
      const blockchainTxId = 'blockchain-' + crypto.randomBytes(32).toString('hex');

      logger.info('x402 payment successful', {
        transactionId: blockchainTxId,
        amount: header.amount,
        resource: resourceData.type
      });

      return {
        success: true,
        transactionId: blockchainTxId,
        amount: header.amount,
        currency: header.currency,
        timestamp: new Date().toISOString(),
        confirmations: 1  // Simulate instant confirmation
      };
    } catch (error) {
      logger.error('x402 payment processing failed:', error);
      throw error;
    }
  }

  /**
   * Create x402 payment request for a resource
   * @param {object} resource - Resource details (IPFS upload, API call, etc.)
   * @returns {object} - { paymentRequired, x402Header }
   */
  static createPaymentRequest(resource) {
    const header = new X402Header({
      amount: resource.price || 0.01,  // Micropayment (e.g., $0.01 for IPFS upload)
      currency: 'USD',
      payee: process.env.PAYMENT_ADDRESS || 'grapefruit-treasury',
      metadata: {
        resourceType: resource.type,
        resourceId: resource.id,
        description: resource.description
      }
    });

    return {
      paymentRequired: true,
      amount: header.amount,
      currency: header.currency,
      x402Header: header.serialize(),
      message: `Payment of ${header.amount} ${header.currency} required for ${resource.type}`
    };
  }
}

/**
 * Account-Free API Access
 * Users can access API without signup by paying with crypto
 */
class AccountFreeAPIAccess {
  /**
   * Verify x402 payment for API access
   * @param {string} x402HeaderEncrypted - Payment header
   * @param {string} endpoint - API endpoint being accessed
   * @returns {Promise<boolean>} - Access granted
   */
  static async verifyAccess(x402HeaderEncrypted, endpoint) {
    try {
      const header = X402Header.deserialize(x402HeaderEncrypted);

      // Check if payment is sufficient for endpoint
      const endpointPricing = {
        '/receipts/parse': 0.05,  // $0.05 per receipt parse
        '/inventory': 0.01,        // $0.01 per inventory query
        '/orders/create': 0.10,    // $0.10 per order placement
      };

      const requiredAmount = endpointPricing[endpoint] || 0.01;

      if (header.amount < requiredAmount) {
        throw new Error(`Insufficient payment for ${endpoint}: ${header.amount} < ${requiredAmount}`);
      }

      logger.info('Account-free API access granted', {
        endpoint,
        amountPaid: header.amount,
        payer: `[HASHED:${hash(header.payer).substring(0, 8)}]`
      });

      return true;
    } catch (error) {
      logger.error('Account-free access denied:', error);
      return false;
    }
  }
}

module.exports = {
  X402Header,
  AutonomousShoppingAgent,
  X402PaymentGateway,
  AccountFreeAPIAccess
};
