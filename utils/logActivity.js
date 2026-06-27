const ActivityLog = require('../models/ActivityLog');

/**
 * Log a user action. Never throws — logging failures are silent.
 * @param {object} req        - Express request (for session user + IP)
 * @param {string} action     - Action code, e.g. 'TXN_APPROVE'
 * @param {string} entity     - Entity type: 'auth' | 'client' | 'transaction' | 'user'
 * @param {string} description - Human-readable description
 * @param {object} [meta]     - Optional extra context (amounts, names, etc.)
 * @param {*}      [entityId] - Optional MongoDB ObjectId of affected entity
 */
const logActivity = async (req, action, entity, description, meta = {}, entityId = null) => {
  try {
    const sessionUser = req.session?.user;
    await ActivityLog.create({
      userId:      sessionUser?.id   || null,
      userName:    sessionUser?.name || 'System',
      userRole:    sessionUser?.role || null,
      action,
      entity,
      entityId:    entityId || null,
      description,
      meta,
      ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '—',
    });
  } catch { /* never block the request on a log failure */ }
};

module.exports = logActivity;
