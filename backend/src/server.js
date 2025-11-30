require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');
const { pool } = require('./config/database');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Test database connection before starting server
pool.query('SELECT NOW()')
  .then(() => {
    logger.info('Database connection verified');
    
    // Start server
    const server = app.listen(PORT, HOST, () => {
      logger.info(`Grapefruit backend listening on ${HOST}:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        logger.info('HTTP server closed');
        pool.end(() => {
          logger.info('Database pool closed');
          process.exit(0);
        });
      });
    });
  })
  .catch((err) => {
    logger.error('Unable to connect to database:', err);
    process.exit(1);
  });
