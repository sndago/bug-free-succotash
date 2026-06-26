const logger = require('../config/logger');

const notFound = (req, res, next) => {
  const err = new Error(`Not found — ${req.originalUrl}`);
  err.status = 404;
  next(err);
};

const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) logger.error(`${req.method} ${req.originalUrl}`, err.message);

  res.status(status).json({
    error: {
      message: err.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
};

module.exports = { notFound, errorHandler };
