/**
 * HTTPS Server Configuration
 * Enables TLS/SSL for data-in-transit encryption
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./app');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;
const ENABLE_HTTPS = process.env.ENABLE_HTTPS === 'true';

/**
 * Start HTTPS server if SSL certificates are configured
 */
function startHttpsServer() {
  try {
    const sslOptions = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH || './ssl/server.key'),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH || './ssl/server.cert'),
    };

    const server = https.createServer(sslOptions, app);

    server.listen(PORT, () => {
      logger.info(`🔒 HTTPS Server running on port ${PORT}`);
      logger.info('✅ TLS/SSL enabled - data-in-transit encrypted');
    });

    return server;
  } catch (error) {
    logger.error('Failed to start HTTPS server:', error.message);
    logger.warn('Falling back to HTTP (INSECURE)');
    return startHttpServer();
  }
}

/**
 * Start HTTP server (development/testing only)
 */
function startHttpServer() {
  const server = http.createServer(app);

  server.listen(PORT, () => {
    logger.warn(`⚠️  HTTP Server running on port ${PORT}`);
    logger.warn('⚠️  WARNING: Data-in-transit is NOT encrypted!');
    logger.warn('⚠️  Enable HTTPS for production deployment');
  });

  return server;
}

// Start appropriate server
const server = ENABLE_HTTPS ? startHttpsServer() : startHttpServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = server;
