const required = ['MONGO_URI'];

const validate = () => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    // Warn loudly but don't crash — app.js falls back to a random secret
    console.error('[SECURITY WARNING] SESSION_SECRET is not set. Sessions will be invalidated on every restart. Set SESSION_SECRET in your environment immediately.');
  }
};

module.exports = { validate };
