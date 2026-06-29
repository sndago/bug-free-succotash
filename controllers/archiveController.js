const Client      = require('../models/Client');
const Account     = require('../models/Account');
const Transaction = require('../models/Transaction');
const User        = require('../models/User');
const logActivity = require('../utils/logActivity');

const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;

const daysRemaining = (deletedAt) =>
  Math.max(0, Math.ceil((new Date(deletedAt).getTime() + SIXTY_DAYS - Date.now()) / (24 * 60 * 60 * 1000)));

const eff = (type, amount) => (type === 'credit' ? amount : -amount);

/* ── GET /archive ─────────────────────────────── */
const listArchive = async (req, res) => {
  try {
    const [clients, transactions, users] = await Promise.all([
      Client.find({ isDeleted: true })
        .populate('deletedBy', 'name')
        .sort({ deletedAt: -1 })
        .lean(),
      Transaction.find({ isDeleted: true })
        .populate('client', 'name')
        .populate('account', 'accountNumber accountType')
        .populate('deletedBy', 'name')
        .sort({ deletedAt: -1 })
        .lean(),
      User.find({ isDeleted: true })
        .populate('deletedBy', 'name')
        .sort({ deletedAt: -1 })
        .lean(),
    ]);

    const addDays = (items) => items.map(item => ({ ...item, daysRemaining: daysRemaining(item.deletedAt) }));

    res.render('archive', {
      user: req.session.user,
      clients:      addDays(clients),
      transactions: addDays(transactions),
      users:        addDays(users),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /archive/clients/:id/restore ────────── */
const restoreClient = async (req, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, isDeleted: true });
    if (!client) {
      req.session.flash = { type: 'error', message: 'Archived client not found.' };
      return res.redirect(303, '/archive');
    }
    client.isDeleted = false;
    client.deletedAt = undefined;
    client.deletedBy = undefined;
    await client.save();

    // Restore all accounts that were deleted at the same time
    await Account.updateMany(
      { client: client._id, isDeleted: true },
      { isDeleted: false, $unset: { deletedAt: 1, deletedBy: 1 } },
    );

    await logActivity(req, 'CLIENT_RESTORE', 'client', `Restored archived client account for ${client.name}`, {}, client._id);
    req.session.flash = { type: 'success', message: `Client "${client.name}" has been restored.` };
    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/archive');
  }
};

/* ── POST /archive/transactions/:id/restore ───── */
const restoreTransaction = async (req, res) => {
  try {
    const txn = await Transaction.findOne({ _id: req.params.id, isDeleted: true });
    if (!txn) {
      req.session.flash = { type: 'error', message: 'Archived transaction not found.' };
      return res.redirect(303, '/archive');
    }

    const client = await Client.findById(txn.client);
    if (!client) {
      req.session.flash = { type: 'error', message: 'The client for this transaction no longer exists.' };
      return res.redirect(303, '/archive');
    }

    // Re-apply the balance effect on the relevant account
    if (!txn.requiresApproval || txn.approvalStatus === 'approved') {
      let account = null;
      if (txn.account) {
        account = await Account.findById(txn.account);
      }
      if (!account) {
        account = await Account.findOne({ client: txn.client }).sort({ createdAt: 1 });
      }
      if (account) {
        account.balance = parseFloat((account.balance + eff(txn.type, txn.amount)).toFixed(2));
        await account.save();
      }
    }

    txn.isDeleted = false;
    txn.deletedAt = undefined;
    txn.deletedBy = undefined;
    await txn.save();
    await logActivity(req, 'TXN_RESTORE', 'transaction', `Restored archived ${txn.category} of ₵${txn.amount.toFixed(2)} for ${client.name}`, { clientName: client.name, category: txn.category, amount: txn.amount, type: txn.type }, txn._id);
    req.session.flash = { type: 'success', message: 'Transaction restored and balance updated.' };
    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/archive');
  }
};

/* ── POST /archive/users/:id/restore ─────────── */
const restoreUser = async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, isDeleted: true });
    if (!target) {
      req.session.flash = { type: 'error', message: 'Archived user not found.' };
      return res.redirect(303, '/archive');
    }
    target.isDeleted = false;
    target.deletedAt = undefined;
    target.deletedBy = undefined;
    target.isActive  = true;
    await target.save();
    await logActivity(req, 'USER_RESTORE', 'user', `Restored archived ${target.role} account for ${target.name}`, { role: target.role, email: target.email }, target._id);
    req.session.flash = { type: 'success', message: `${target.name}'s account has been restored.` };
    res.redirect(303, '/users');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/archive');
  }
};

module.exports = { listArchive, restoreClient, restoreTransaction, restoreUser };
