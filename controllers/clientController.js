const Client      = require('../models/Client');
const Transaction = require('../models/Transaction');
const User        = require('../models/User');

const VALID_RANGES = ['30', '90', '365', 'all'];

/* ── helpers ─────────────────────────────────── */
const getTellers = () => User.find({ role: 'teller', isActive: true }).select('name').lean();

const validate = (body, existingId = null) => {
  const errors = [];
  if (!body.name?.trim())          errors.push('Full name is required.');
  if (!body.accountNumber?.trim()) errors.push('Account number is required.');
  if (!body.accountType)           errors.push('Account type is required.');
  if (body.balance === '' || body.balance === undefined || isNaN(Number(body.balance))) {
    errors.push('A valid opening balance is required.');
  } else if (Number(body.balance) < 0) {
    errors.push('Balance cannot be negative.');
  }
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
    const tellers = await getTellers();
    res.render('client-form', {
      user: req.session.user,
      tellers,
      client:  {},
      errors:  [],
      isEdit:  false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── CREATE: handle POST ─────────────────────── */
const createClient = async (req, res) => {
  const errors = validate(req.body);
  try {
    // Unique account number check
    if (req.body.accountNumber?.trim()) {
      const dup = await Client.findOne({ accountNumber: req.body.accountNumber.trim().toUpperCase() }).lean();
      if (dup) errors.push('Account number already exists.');
    }

    if (errors.length) {
      const tellers = await getTellers();
      return res.status(422).render('client-form', {
        user: req.session.user, tellers, client: req.body, errors, isEdit: false,
      });
    }

    const client = await Client.create({
      name:           req.body.name.trim(),
      email:          req.body.email?.trim()   || undefined,
      phone:          req.body.phone?.trim()   || undefined,
      accountNumber:  req.body.accountNumber.trim().toUpperCase(),
      accountType:    req.body.accountType,
      balance:        parseFloat(req.body.balance) || 0,
      status:         req.body.status || 'active',
      assignedTeller: req.body.assignedTeller || undefined,
    });

    req.session.flash = { type: 'success', message: `Client "${client.name}" created successfully.` };
    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    const tellers = await getTellers();
    res.status(500).render('client-form', {
      user: req.session.user, tellers, client: req.body,
      errors: [err.message], isEdit: false,
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
    await Promise.all([
      Client.findByIdAndDelete(req.params.id),
      Transaction.deleteMany({ client: req.params.id }),
    ]);
    req.session.flash = { type: 'success', message: 'Client and all associated records deleted.' };
    res.redirect(303, '/dashboard');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, `/clients/${req.params.id}`);
  }
};

module.exports = { clientDetail, newClientForm, createClient, editClientForm, updateClient, deleteClient };
