require('dotenv').config();
const fs = require('fs');
const http = require('http');
const https = require('https');
const app = require('./app');
const logger = require('./utils/logger');
const { pool } = require('./config/database');
const autoOrderScheduler = require('./services/autoOrderScheduler');
const { runMigrations } = require('./migrations');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || './ssl/server.key';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || './ssl/server.cert';

/**
 * Initialize application with proper startup sequence
 * 1. Test database connection
 * 2. Run migrations
 * 3. Start auto-order scheduler
 * 4. Start HTTP server
 */
async function startServer() {
  try {
    // Step 1: Test database connection with retries
    logger.info('Checking database connection...');
    const maxRetries = 10;
    let connected = false;
    
    for (let i = 1; i <= maxRetries; i++) {
      try {
        await pool.query('SELECT NOW()');
        logger.info('Database connection verified');
        connected = true;
        break;
      } catch (err) {
        logger.warn(`Database connection attempt ${i}/${maxRetries} failed`, {
          error: err.message,
        });
        
        if (i === maxRetries) {
          throw new Error('Failed to connect to database after maximum retries');
        }
        
        // Exponential backoff: 2s, 4s, 8s, etc.
        const delay = Math.min(2000 * Math.pow(2, i - 1), 30000);
        logger.info(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!connected) {
      throw new Error('Database connection could not be established');
    }

    // Step 2: Run application-level migrations
    logger.info('Running database migrations...');
    await runMigrations();
    logger.info('Database migrations completed successfully');

    // Step 3: Start auto-order scheduler
    logger.info('Starting auto-order scheduler...');
    autoOrderScheduler.start();

    // Step 4: Start HTTP or HTTPS server
    let server;
    
    if (ENABLE_HTTPS) {
      // Load SSL/TLS certificates for HTTPS
      try {
        const privateKey = fs.readFileSync(SSL_KEY_PATH, 'utf8');
        const certificate = fs.readFileSync(SSL_CERT_PATH, 'utf8');
        const credentials = { key: privateKey, cert: certificate };
        
        server = https.createServer(credentials, app);
        logger.info('HTTPS/TLS enabled with certificates');
      } catch (err) {
        logger.error('Failed to load SSL certificates:', err);
        throw new Error(`SSL certificate loading failed: ${err.message}`);
      }
    } else {
      server = http.createServer(app);
      logger.info('Running in HTTP mode (SSL/TLS disabled)');
    }
    
    server.listen(PORT, HOST, () => {
      logger.info(`Grapefruit backend listening on ${ENABLE_HTTPS ? 'https' : 'http'}://${HOST}:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('Application startup complete');
    });
    
    // Graceful shutdown handler
    const shutdown = async (signal) => {
      logger.info(`${signal} signal received: initiating graceful shutdown`);
      
      // Stop accepting new requests
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
      // Stop scheduled tasks
      autoOrderScheduler.stop();
      logger.info('Auto-order scheduler stopped');
      
      // Close database connections
      try {
        await pool.end();
        logger.info('Database pool closed');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown:', err);
        process.exit(1);
      }
    };
    
    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Start the server
startServer();
