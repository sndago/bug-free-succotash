const logger = require('../config/logger');

const isProd = process.env.NODE_ENV === 'production';

const notFound = (req, res, next) => {
  const err = new Error(`Not found — ${req.originalUrl}`);
  err.status = 404;
  next(err);
};

const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) logger.error(`${req.method} ${req.originalUrl}`, err.message);

  // Don't leak internal error details in production
  const message = isProd && status >= 500
    ? 'An unexpected error occurred. Please try again.'
    : err.message;

  // Render a simple HTML error page for browser requests
  if (req.accepts('html') && !req.path.startsWith('/api')) {
    return res.status(status).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CONE — ${status}</title>
  <style>
    body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}
    .box{text-align:center;max-width:420px;padding:2rem}
    h1{font-size:3rem;font-weight:800;color:#6366f1;margin:0 0 .5rem}
    p{color:#64748b;margin:.5rem 0 1.5rem}
    a{display:inline-block;padding:.5rem 1.25rem;background:#6366f1;color:#fff;border-radius:.5rem;text-decoration:none;font-weight:600}
  </style>
</head>
<body>
  <div class="box">
    <h1>${status}</h1>
    <p>${message}</p>
    <a href="/dashboard">Go to dashboard</a>
  </div>
</body>
</html>`);
  }

  res.status(status).json({
    error: {
      message,
      ...(!isProd && { stack: err.stack }),
    },
  });
};

module.exports = { notFound, errorHandler };
