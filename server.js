require('dotenv').config();
const { validate } = require('./config/env');
const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./config/logger');

try {
  validate();
} catch (err) {
  logger.error('Startup aborted', err.message);
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    logger.banner(PORT);
    logger.success(`Server is live on port ${PORT}`);
    logger.info('Press Ctrl+C to stop\n');
  });

  const shutdown = (signal) => {
    logger.warn(`${signal} received — shutting down gracefully`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
