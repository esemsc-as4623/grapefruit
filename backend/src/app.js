const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes/index');
const simulationRoutes = require('./routes/simulation');
const receiptRoutes = require('./routes/receipts');
const autoOrderRoutes = require('./routes/autoOrder');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { privacyPreservingLogger } = require('./middleware/encryption');
const logger = require('./utils/logger');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// AKEDO-inspired: Privacy-preserving request logging
app.use(privacyPreservingLogger());

// HTTP request logging (with IP redaction via custom stream)
app.use(morgan(':method :url :status :response-time ms', {
  stream: {
    write: (message) => {
      // Redact IPs from morgan logs
      const redacted = message.replace(/(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}/g, '$1.xxx.xxx');
      logger.info(redacted.trim());
    },
  },
}));

// ============================================
// ROUTES
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'grapefruit-backend',
    llm: {
      configured: !!process.env.ASI_API_KEY,
      model: process.env.ASI_MODEL || 'asi1-mini'
    }
  });
});

// API routes
app.use('/', routes);
app.use('/simulate', simulationRoutes);
app.use('/receipts', receiptRoutes);
app.use('/', autoOrderRoutes);

// ============================================
// ERROR HANDLING
// ============================================
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
