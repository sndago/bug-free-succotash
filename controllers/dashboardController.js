const Client = require('../models/Client');
const User = require('../models/User');

const dashboard = async (req, res) => {
  const { role, id } = req.session.user;
  try {
    let clients;
    const stats = {};

    if (role === 'teller') {
      clients = await Client.find({ assignedTeller: id }).lean();
      stats.totalClients = clients.length;
    } else {
      const [allClients, totalClients, activeClients, balanceResult] = await Promise.all([
        Client.find().populate('assignedTeller', 'name').lean(),
        Client.countDocuments(),
        Client.countDocuments({ status: 'active' }),
        Client.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
      ]);
      clients = allClients;
      stats.totalClients  = totalClients;
      stats.activeClients = activeClients;
      stats.totalBalance  = balanceResult[0]?.total || 0;

      if (role === 'super_admin') {
        stats.totalUsers = await User.countDocuments();
      }
    }

    res.render('dashboard', { user: req.session.user, clients, stats });
  } catch {
    res.render('dashboard', { user: req.session.user, clients: [], stats: {} });
  }
};

module.exports = { dashboard };
