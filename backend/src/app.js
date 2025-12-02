const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes/index');
const simulationRoutes = require('./routes/simulation');
const receiptRoutes = require('./routes/receipts');
const autoOrderRoutes = require('./routes/autoOrder');
const auditLogsRoutes = require('./routes/auditLogs');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter, strictLimiter } = require('./middleware/rateLimiter');
const { combinedLogger, slowRequestLogger } = require('./middleware/requestLogger');
const logger = require('./utils/logger');
const { getMigrationStatus } = require('./migrations');
const { pool } = require('./config/database');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request/Response logging middleware
if (process.env.NODE_ENV === 'production') {
  // In production, use combined logger for comprehensive logging
  app.use(combinedLogger);
} else {
  // In development, use morgan for simpler logs
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }));
}

// Slow request detection
app.use(slowRequestLogger(2000)); // Warn about requests taking > 2 seconds

// Rate limiting (apply to all routes, but skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  app.use(apiLimiter);
}

// ============================================
// ROUTES
// ============================================

// Health check endpoint with migration status
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    const dbResponseTime = Date.now() - dbStart;

    // Get migration status
    const migrations = await getMigrationStatus();

    // Determine overall health status
    const isHealthy = 
      dbResponseTime < 1000 && 
      migrations.status !== 'error' && 
      migrations.status !== 'pending';

    res.status(isHealthy ? 200 : 503).json({ 
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'grapefruit-backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      
      // Database health
      database: {
        connected: true,
        responseTime: `${dbResponseTime}ms`,
        status: dbResponseTime < 100 ? 'excellent' : dbResponseTime < 500 ? 'good' : 'slow',
      },
      
      // Migration status
      migrations,
      
      // LLM configuration
      llm: {
        configured: !!process.env.ASI_API_KEY,
        model: process.env.ASI_MODEL || 'asi1-mini',
        cacheEnabled: process.env.LLM_CACHE_ENABLED === 'true',
      },
      
      // System info
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      },
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'grapefruit-backend',
      error: error.message,
      database: {
        connected: false,
        error: error.message,
      },
    });
  }
});

// API routes
app.use('/', routes);
app.use('/simulate', simulationRoutes);
// Stricter rate limit for LLM endpoints (skip in test mode)
if (process.env.NODE_ENV !== 'test') {
  app.use('/receipts', strictLimiter, receiptRoutes);
} else {
  app.use('/receipts', receiptRoutes);
}
app.use('/', autoOrderRoutes);
app.use('/', auditLogsRoutes); // Audit logs API

// ============================================
// ERROR HANDLING
// ============================================
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
