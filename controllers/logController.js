const ActivityLog = require('../models/ActivityLog');
const User        = require('../models/User');

const PAGE_SIZE = 50;

const listLogs = async (req, res) => {
  try {
    const { user: userId, action, entity, from, to, page } = req.query;
    const currentPage = Math.max(1, parseInt(page) || 1);
    const filter = {};

    if (userId)  filter.userId = userId;
    if (action)  filter.action = action;
    if (entity)  filter.entity = entity;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }

    const [logs, total, staffUsers] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      ActivityLog.countDocuments(filter),
      User.find({ role: { $in: ['admin', 'teller'] } }).select('name role').sort({ name: 1 }).lean(),
    ]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    res.render('logs', {
      user: req.session.user,
      logs,
      staffUsers,
      filters: { userId: userId || '', action: action || '', entity: entity || '', from: from || '', to: to || '' },
      pagination: { currentPage, totalPages, total, pageSize: PAGE_SIZE },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { listLogs };
