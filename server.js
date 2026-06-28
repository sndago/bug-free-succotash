require('dotenv').config();
const { validate } = require('./config/env');
const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./config/logger');
const Client      = require('./models/Client');
const Transaction = require('./models/Transaction');
const User        = require('./models/User');

try {
  validate();
} catch (err) {
  logger.error('Startup aborted', err.message);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

const runArchiveCleanup = async () => {
  try {
    const cutoff = new Date(Date.now() - SIXTY_DAYS_MS);

    // Find expired clients and cascade-delete their transactions
    const expiredClients = await Client.find({ isDeleted: true, deletedAt: { $lte: cutoff } }).select('_id').lean();
    if (expiredClients.length) {
      const ids = expiredClients.map(c => c._id);
      await Transaction.deleteMany({ client: { $in: ids } });
      await Client.deleteMany({ _id: { $in: ids } });
      logger.info(`Archive cleanup: permanently deleted ${ids.length} client(s) and their transactions`);
    }

    // Delete individually expired transactions
    const txnResult = await Transaction.deleteMany({ isDeleted: true, deletedAt: { $lte: cutoff } });
    if (txnResult.deletedCount) {
      logger.info(`Archive cleanup: permanently deleted ${txnResult.deletedCount} transaction(s)`);
    }

    // Delete expired users
    const userResult = await User.deleteMany({ isDeleted: true, deletedAt: { $lte: cutoff } });
    if (userResult.deletedCount) {
      logger.info(`Archive cleanup: permanently deleted ${userResult.deletedCount} user(s)`);
    }
  } catch (err) {
    logger.error('Archive cleanup failed', err.message);
  }
};

const startServer = async () => {
  await connectDB();

  // Run cleanup once on startup, then every 24 hours
  runArchiveCleanup();
  setInterval(runArchiveCleanup, 24 * 60 * 60 * 1000);

  const server = app.listen(PORT, () => {
    logger.banner(PORT);
    logger.success(`Server is live on port ${PORT}`);
    logger.info('Press Ctrl+C to stop\n');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use`);
    } else {
      logger.error('Server error', err.message);
    }
    process.exit(1);
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

startServer().catch((err) => {
  logger.error('Failed to start server', err.message);
  process.exit(1);
});
