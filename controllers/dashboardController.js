const Client      = require('../models/Client');
const User        = require('../models/User');
const Transaction = require('../models/Transaction');

const VALID_PERIODS = ['day', 'week', 'month', 'year'];

const periodSince = (period) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week')  d.setDate(d.getDate() - d.getDay());
  if (period === 'month') d.setDate(1);
  if (period === 'year')  d.setMonth(0, 1);
  return d;
};

const dashboard = async (req, res) => {
  const { role, id } = req.session.user;
  try {
    let clients;
    let recentTxns = [];
    const stats = {};

    if (role === 'teller') {
      const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : 'day';
      const since  = periodSince(period);

      clients = await Client.find({ assignedTeller: id }).lean();
      const clientIds = clients.map(c => c._id);

      const [txnSummary, pendingCount, recent] = await Promise.all([
        clientIds.length
          ? Transaction.aggregate([
              { $match: { client: { $in: clientIds }, date: { $gte: since }, status: 'completed', isDeleted: { $ne: true } } },
              { $group: {
                _id:     null,
                credits: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
                debits:  { $sum: { $cond: [{ $eq: ['$type', 'debit']  }, '$amount', 0] } },
                count:   { $sum: 1 },
              }},
            ])
          : Promise.resolve([]),
        Transaction.countDocuments({ $or: [
          { requestedBy: id, requiresApproval: true, approvalStatus: 'pending' },
          { 'pendingEdit.requestedBy': id, 'pendingEdit.editStatus': 'pending' },
        ]}),
        clientIds.length
          ? Transaction.find({ client: { $in: clientIds } })
              .populate('client', 'name accountNumber')
              .sort({ date: -1 })
              .limit(10)
              .lean()
          : Promise.resolve([]),
      ]);

      stats.totalClients    = clients.length;
      stats.totalBalance    = clients.reduce((sum, c) => sum + (c.balance || 0), 0);
      stats.periodCredits   = txnSummary[0]?.credits || 0;
      stats.periodDebits    = txnSummary[0]?.debits  || 0;
      stats.periodCount     = txnSummary[0]?.count   || 0;
      stats.pendingRequests = pendingCount;
      stats.period          = period;
      recentTxns = recent;

    } else {
      const [allClients, totalClients, activeClients, balanceResult,
             pendingTxns, pendingEdits, pendingClients, accountTypeCounts] = await Promise.all([
        Client.find().populate('assignedTeller', 'name').lean(),
        Client.countDocuments(),
        Client.countDocuments({ status: 'active' }),
        Client.aggregate([{ $match: { isDeleted: { $ne: true } } }, { $group: { _id: null, total: { $sum: '$balance' } } }]),
        Transaction.countDocuments({ requiresApproval: true, approvalStatus: 'pending' }),
        Transaction.countDocuments({ 'pendingEdit.editStatus': 'pending' }),
        Client.countDocuments({ approvalStatus: 'pending' }),
        Client.aggregate([
          { $match: { isDeleted: { $ne: true } } },
          { $group: { _id: '$accountType', count: { $sum: 1 } } },
        ]),
      ]);
      clients = allClients;
      stats.totalClients    = totalClients;
      stats.activeClients   = activeClients;
      stats.totalBalance    = balanceResult[0]?.total || 0;
      stats.pendingRequests = pendingTxns + pendingEdits + pendingClients;
      stats.accountTypes    = accountTypeCounts;

      if (role === 'super_admin') {
        stats.totalUsers = await User.countDocuments();
      }
    }

    res.render('dashboard', { user: req.session.user, clients, stats, recentTxns });
  } catch (err) {
    res.render('dashboard', { user: req.session.user, clients: [], stats: {}, recentTxns: [] });
  }
};

module.exports = { dashboard };
