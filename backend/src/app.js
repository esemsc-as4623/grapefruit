const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes/index');
const simulationRoutes = require('./routes/simulation');
const receiptRoutes = require('./routes/receipts');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// HTTP request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
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

// ============================================
// ERROR HANDLING
// ============================================
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
