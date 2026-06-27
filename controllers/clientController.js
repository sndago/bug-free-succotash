const Client      = require('../models/Client');
const Transaction = require('../models/Transaction');
const User        = require('../models/User');
const logActivity = require('../utils/logActivity');

const VALID_RANGES = ['30', '90', '365', 'all'];

/* ── helpers ─────────────────────────────────── */
const getTellers = () => User.find({ role: 'teller', isActive: true }).select('name').lean();

const validate = (body, existingId = null) => {
  const errors = [];
  if (!body.name?.trim())          errors.push('Full name is required.');
  if (!body.accountNumber?.trim()) errors.push('Account number is required.');
  if (!body.accountType)           errors.push('Account type is required.');
  if (body.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    errors.push('Email address is not valid.');
  }
  return errors;
};

/* ── READ: client detail ─────────────────────── */
const clientDetail = async (req, res) => {
  const { role, id: userId } = req.session.user;
  try {
    const filter = { _id: req.params.id };
    if (role === 'teller') filter.assignedTeller = userId;

    const client = await Client.findOne(filter).populate('assignedTeller', 'name').lean();
    if (!client) return res.status(404).render('login', { error: 'Client not found or access denied.' });

    const range     = VALID_RANGES.includes(req.query.range) ? req.query.range : '90';
    const txnFilter = { client: client._id };
    if (range !== 'all') {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(range));
      txnFilter.date = { $gte: since };
    }

    const [transactions, allTimeSummary] = await Promise.all([
      Transaction.find(txnFilter).sort({ date: -1 }).lean(),
      Transaction.aggregate([
        { $match: { client: client._id, status: 'completed' } },
        { $group: {
          _id:     null,
          credits: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] } },
          debits:  { $sum: { $cond: [{ $eq: ['$type', 'debit']  }, '$amount', 0] } },
          count:   { $sum: 1 },
        }},
      ]),
    ]);

    const completed = transactions.filter(t => t.status === 'completed');
    const stats = {
      balance:        client.balance,
      periodCredits:  completed.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
      periodDebits:   completed.filter(t => t.type === 'debit' ).reduce((s, t) => s + t.amount, 0),
      periodCount:    transactions.length,
      allTimeCredits: allTimeSummary[0]?.credits || 0,
      allTimeDebits:  allTimeSummary[0]?.debits  || 0,
      allTimeCount:   allTimeSummary[0]?.count   || 0,
    };

    res.render('client', { user: req.session.user, client, transactions, stats, range });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── CREATE: show form ───────────────────────── */
const newClientForm = async (req, res) => {
  try {
    const isTeller = req.session.user.role === 'teller';
    const tellers  = isTeller ? [] : await getTellers();
    res.render('client-form', {
      user: req.session.user,
      tellers,
      client:  {},
      errors:  [],
      isEdit:  false,
      isTeller,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── CREATE: handle POST ─────────────────────── */
const createClient = async (req, res) => {
  const { role, id: userId } = req.session.user;
  const isTeller = role === 'teller';
  const errors = validate(req.body);
  try {
    // Unique account number check
    if (req.body.accountNumber?.trim()) {
      const dup = await Client.findOne({ accountNumber: req.body.accountNumber.trim().toUpperCase() }).lean();
      if (dup) errors.push('Account number already exists.');
    }

    if (errors.length) {
      const tellers = isTeller ? [] : await getTellers();
      return res.status(422).render('client-form', {
        user: req.session.user, tellers, client: req.body, errors, isEdit: false, isTeller,
      });
    }

    const client = await Client.create({
      name:           req.body.name.trim(),
      email:          req.body.email?.trim()   || undefined,
      phone:          req.body.phone?.trim()   || undefined,
      accountNumber:  req.body.accountNumber.trim().toUpperCase(),
      accountType:    req.body.accountType,
      balance:        0,
      status:         isTeller ? 'inactive' : (req.body.status || 'active'),
      assignedTeller: isTeller ? userId : (req.body.assignedTeller || undefined),
      approvalStatus: isTeller ? 'pending' : 'approved',
      requestedBy:    isTeller ? userId : undefined,
    });

    await logActivity(req, 'CLIENT_CREATE', 'client', `${isTeller ? 'Submitted' : 'Created'} client account for ${client.name}`, { accountNumber: client.accountNumber }, client._id);
    req.session.flash = isTeller
      ? { type: 'success', message: `Account for "${client.name}" submitted — awaiting admin approval.` }
      : { type: 'success', message: `Client "${client.name}" created successfully.` };
    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    const tellers = isTeller ? [] : await getTellers();
    res.status(500).render('client-form', {
      user: req.session.user, tellers, client: req.body,
      errors: [err.message], isEdit: false, isTeller,
    });
  }
};

/* ── UPDATE: show form ───────────────────────── */
const editClientForm = async (req, res) => {
  try {
    const [client, tellers] = await Promise.all([
      Client.findById(req.params.id).populate('assignedTeller', 'name').lean(),
      getTellers(),
    ]);
    if (!client) return res.status(404).render('login', { error: 'Client not found.' });

    res.render('client-form', {
      user: req.session.user, tellers, client, errors: [], isEdit: true,
      isTeller: req.session.user.role === 'teller',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── UPDATE: handle POST ─────────────────────── */
const updateClient = async (req, res) => {
  const errors = validate(req.body);
  try {
    // Unique account number check (exclude self)
    if (req.body.accountNumber?.trim()) {
      const dup = await Client.findOne({
        accountNumber: req.body.accountNumber.trim().toUpperCase(),
        _id: { $ne: req.params.id },
      }).lean();
      if (dup) errors.push('Account number already exists.');
    }

    if (errors.length) {
      const tellers = await getTellers();
      return res.status(422).render('client-form', {
        user: req.session.user, tellers,
        client: { ...req.body, _id: req.params.id },
        errors, isEdit: true,
      });
    }

    await Client.findByIdAndUpdate(req.params.id, {
      name:           req.body.name.trim(),
      email:          req.body.email?.trim()   || undefined,
      phone:          req.body.phone?.trim()   || undefined,
      accountNumber:  req.body.accountNumber.trim().toUpperCase(),
      accountType:    req.body.accountType,
      balance:        parseFloat(req.body.balance) || 0,
      status:         req.body.status || 'active',
      assignedTeller: req.body.assignedTeller || undefined,
    }, { runValidators: true });

    await logActivity(req, 'CLIENT_UPDATE', 'client', `Updated client account for ${req.body.name.trim()}`, { accountNumber: req.body.accountNumber }, req.params.id);
    req.session.flash = { type: 'success', message: 'Client updated successfully.' };
    res.redirect(303, `/clients/${req.params.id}`);
  } catch (err) {
    const tellers = await getTellers();
    res.status(500).render('client-form', {
      user: req.session.user, tellers,
      client: { ...req.body, _id: req.params.id },
      errors: [err.message], isEdit: true,
    });
  }
};

/* ── DELETE ──────────────────────────────────── */
const deleteClient = async (req, res) => {
  try {
    const deleted = await Client.findById(req.params.id).lean();
    await Promise.all([
      Client.findByIdAndDelete(req.params.id),
      Transaction.deleteMany({ client: req.params.id }),
    ]);
    await logActivity(req, 'CLIENT_DELETE', 'client', `Deleted client account for ${deleted?.name || req.params.id}`, { accountNumber: deleted?.accountNumber });
    req.session.flash = { type: 'success', message: 'Client and all associated records deleted.' };
    res.redirect(303, '/dashboard');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, `/clients/${req.params.id}`);
  }
};

/* ── APPROVE: client registration ───────────── */
const approveClient = async (req, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, approvalStatus: 'pending' });
    if (!client) {
      req.session.flash = { type: 'error', message: 'Client request not found or already processed.' };
      return res.redirect(303, '/requests?tab=accounts');
    }

    client.approvalStatus = 'approved';
    client.status         = 'active';
    client.approvedBy     = req.session.user.id;
    await client.save();

    await logActivity(req, 'CLIENT_APPROVE', 'client', `Approved new client account for ${client.name}`, { accountNumber: client.accountNumber }, client._id);
    req.session.flash = { type: 'success', message: `"${client.name}" approved — account is now active.` };
    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/requests?tab=accounts');
  }
};

/* ── REJECT: client registration ─────────────── */
const rejectClient = async (req, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, approvalStatus: 'pending' });
    if (!client) {
      req.session.flash = { type: 'error', message: 'Client request not found or already processed.' };
      return res.redirect(303, '/requests?tab=accounts');
    }

    client.approvalStatus  = 'rejected';
    client.approvedBy      = req.session.user.id;
    client.rejectionReason = req.body.reason?.trim() || 'No reason provided.';
    await client.save();

    await logActivity(req, 'CLIENT_REJECT', 'client', `Rejected new client account for ${client.name}`, { accountNumber: client.accountNumber, reason: client.rejectionReason }, client._id);
    req.session.flash = { type: 'success', message: `Registration for "${client.name}" rejected.` };
    res.redirect(303, '/requests?tab=accounts');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/requests?tab=accounts');
  }
};

/* ── LIST: all clients ───────────────────────── */
const listClients = async (req, res) => {
  const { role, id: userId } = req.session.user;
  try {
    const filter = {};
    if (role === 'teller') filter.assignedTeller = userId;

    const clients = await Client
      .find(filter)
      .populate('assignedTeller', 'name')
      .sort({ name: 1 })
      .lean();

    res.render('clients', { user: req.session.user, clients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { listClients, clientDetail, newClientForm, createClient, editClientForm, updateClient, deleteClient, approveClient, rejectClient };
