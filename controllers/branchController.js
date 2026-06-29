const Branch  = require('../models/Branch');
const Client  = require('../models/Client');
const logActivity = require('../utils/logActivity');

/* ── LIST ────────────────────────────────────── */
const listBranches = async (req, res) => {
  try {
    const branches = await Branch.find().sort({ name: 1 }).lean();
    res.render('branches', { user: req.session.user, branches, flash: req.session.flash });
    delete req.session.flash;
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── CREATE ──────────────────────────────────── */
const createBranch = async (req, res) => {
  const name = req.body.name?.trim();
  const code = req.body.code?.trim().toUpperCase() || undefined;

  if (!name) {
    req.session.flash = { type: 'error', message: 'Branch name is required.' };
    return res.redirect(303, '/branches');
  }

  try {
    const exists = await Branch.findOne({ name: new RegExp(`^${name}$`, 'i') }).lean();
    if (exists) {
      req.session.flash = { type: 'error', message: `A branch named "${name}" already exists.` };
      return res.redirect(303, '/branches');
    }

    const branch = await Branch.create({ name, code });
    await logActivity(req, 'BRANCH_CREATE', 'branch', `Created branch "${branch.name}"`, { code: branch.code }, branch._id);
    req.session.flash = { type: 'success', message: `Branch "${branch.name}" created.` };
    res.redirect(303, '/branches');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/branches');
  }
};

/* ── TOGGLE ACTIVE ───────────────────────────── */
const toggleBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      req.session.flash = { type: 'error', message: 'Branch not found.' };
      return res.redirect(303, '/branches');
    }
    branch.isActive = !branch.isActive;
    await branch.save();
    await logActivity(req, 'BRANCH_TOGGLE', 'branch', `${branch.isActive ? 'Activated' : 'Deactivated'} branch "${branch.name}"`, {}, branch._id);
    req.session.flash = { type: 'success', message: `Branch "${branch.name}" ${branch.isActive ? 'activated' : 'deactivated'}.` };
    res.redirect(303, '/branches');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/branches');
  }
};

/* ── DELETE ──────────────────────────────────── */
const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndDelete(req.params.id);
    if (!branch) {
      req.session.flash = { type: 'error', message: 'Branch not found.' };
      return res.redirect(303, '/branches');
    }
    await logActivity(req, 'BRANCH_DELETE', 'branch', `Deleted branch "${branch.name}"`, {}, branch._id);
    req.session.flash = { type: 'success', message: `Branch "${branch.name}" deleted.` };
    res.redirect(303, '/branches');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/branches');
  }
};

/* ── BALANCE BREAKDOWN BY BRANCH ─────────────── */
const branchBalances = async (req, res) => {
  try {
    const rows = await Client.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: {
        _id:          '$homeBranch',
        totalBalance: { $sum: '$balance' },
        clientCount:  { $sum: 1 },
        activeCount:  { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
      }},
      { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
      { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
      { $sort: { totalBalance: -1 } },
    ]);

    const grandTotal = rows.reduce((s, r) => s + r.totalBalance, 0);

    res.render('branch-balances', { user: req.session.user, rows, grandTotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { listBranches, createBranch, toggleBranch, deleteBranch, branchBalances };
