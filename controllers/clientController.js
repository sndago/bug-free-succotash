const path        = require('path');
const fs          = require('fs');
const multer      = require('multer');
const Client      = require('../models/Client');
const Transaction = require('../models/Transaction');
const User        = require('../models/User');
const Branch      = require('../models/Branch');
const logActivity = require('../utils/logActivity');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/clients')),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.id}-${Date.now()}${ext}`);
  },
});

const photoUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed.'));
  },
}).single('photo');

const VALID_RANGES = ['30', '90', '365', 'all'];

/* ── helpers ─────────────────────────────────── */
const getTellers  = () => User.find({ role: 'teller', isActive: true }).select('name').lean();
const getBranches = () => Branch.find({ isActive: true }).sort({ name: 1 }).lean();

const generateAccountNumber = async (phone, branchId) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  const last7 = digits.slice(-7);
  let prefix = '';
  if (branchId) {
    const branch = await Branch.findById(branchId).select('code').lean();
    if (branch?.code) prefix = branch.code;
  }
  const base = (prefix + last7).toUpperCase();
  if (!await Client.exists({ accountNumber: base })) return base;
  for (let i = 1; i <= 99; i++) {
    const candidate = `${base}${i}`;
    if (!await Client.exists({ accountNumber: candidate })) return candidate;
  }
  return base + Date.now().toString().slice(-4);
};

const validate = (body, existingId = null) => {
  const errors = [];
  if (!body.name?.trim())          errors.push('Full name is required.');
  if (!body.accountNumber?.trim()) errors.push('Account number is required.');
  if (!body.accountType)           errors.push('Account type is required.');
  if (!body.phone?.trim()) {
    errors.push('Phone number is required.');
  } else if (!/^0\d{9}$/.test(body.phone.trim())) {
    errors.push('Phone must be a 10-digit number starting with 0 (e.g. 0553676107).');
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

    const client = await Client.findOne(filter).populate('assignedTeller', 'name').populate('homeBranch', 'name code').lean();
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
        { $match: { client: client._id, status: 'completed', isDeleted: { $ne: true } } },
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
    const [tellers, branches] = await Promise.all([
      isTeller ? [] : getTellers(),
      getBranches(),
    ]);
    res.render('client-form', {
      user: req.session.user,
      tellers,
      branches,
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
  req.body.accountNumber = await generateAccountNumber(req.body.phone, req.body.homeBranch);
  const errors = validate(req.body);
  if (!req.body.homeBranch) errors.push('Home branch is required.');
  try {
    if (errors.length) {
      const [tellers, branches] = await Promise.all([
        isTeller ? [] : getTellers(),
        getBranches(),
      ]);
      return res.status(422).render('client-form', {
        user: req.session.user, tellers, branches, client: req.body, errors, isEdit: false, isTeller,
      });
    }

    const client = await Client.create({
      name:           req.body.name.trim(),
      email:          req.body.email?.trim()   || undefined,
      phone:          req.body.phone.trim(),
      accountNumber:  req.body.accountNumber.trim().toUpperCase(),
      accountType:    req.body.accountType,
      balance:        0,
      status:         isTeller ? 'inactive' : (req.body.status || 'active'),
      assignedTeller: isTeller ? userId : (req.body.assignedTeller || undefined),
      homeBranch:     req.body.homeBranch || undefined,
      approvalStatus: isTeller ? 'pending' : 'approved',
      requestedBy:    isTeller ? userId : undefined,
    });

    await logActivity(req, 'CLIENT_CREATE', 'client', `${isTeller ? 'Submitted' : 'Created'} client account for ${client.name}`, { accountNumber: client.accountNumber }, client._id);
    req.session.flash = isTeller
      ? { type: 'success', message: `Account for "${client.name}" submitted — awaiting admin approval.` }
      : { type: 'success', message: `Client "${client.name}" created successfully.` };
    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    const [tellers, branches] = await Promise.all([
      isTeller ? [] : getTellers(),
      getBranches(),
    ]);
    res.status(500).render('client-form', {
      user: req.session.user, tellers, branches, client: req.body,
      errors: [err.message], isEdit: false, isTeller,
    });
  }
};

/* ── UPDATE: show form ───────────────────────── */
const editClientForm = async (req, res) => {
  try {
    const [client, tellers, branches] = await Promise.all([
      Client.findById(req.params.id).populate('assignedTeller', 'name').populate('homeBranch', 'name code').lean(),
      getTellers(),
      getBranches(),
    ]);
    if (!client) return res.status(404).render('login', { error: 'Client not found.' });

    res.render('client-form', {
      user: req.session.user, tellers, branches, client, errors: [], isEdit: true,
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
      const [tellers, branches] = await Promise.all([getTellers(), getBranches()]);
      return res.status(422).render('client-form', {
        user: req.session.user, tellers, branches,
        client: { ...req.body, _id: req.params.id },
        errors, isEdit: true,
        isTeller: req.session.user.role === 'teller',
      });
    }

    await Client.findByIdAndUpdate(req.params.id, {
      name:           req.body.name.trim(),
      email:          req.body.email?.trim()   || undefined,
      phone:          req.body.phone.trim(),
      accountNumber:  req.body.accountNumber.trim().toUpperCase(),
      accountType:    req.body.accountType,
      balance:        parseFloat(req.body.balance) || 0,
      status:         req.body.status || 'active',
      assignedTeller: req.body.assignedTeller || undefined,
      homeBranch:     req.body.homeBranch     || undefined,
    }, { runValidators: true });

    await logActivity(req, 'CLIENT_UPDATE', 'client', `Updated client account for ${req.body.name.trim()}`, { accountNumber: req.body.accountNumber }, req.params.id);
    req.session.flash = { type: 'success', message: 'Client updated successfully.' };
    res.redirect(303, `/clients/${req.params.id}`);
  } catch (err) {
    const [tellers, branches] = await Promise.all([getTellers(), getBranches()]);
    res.status(500).render('client-form', {
      user: req.session.user, tellers, branches,
      client: { ...req.body, _id: req.params.id },
      errors: [err.message], isEdit: true,
      isTeller: req.session.user.role === 'teller',
    });
  }
};

/* ── DELETE (soft) ───────────────────────────── */
const deleteClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      req.session.flash = { type: 'error', message: 'Client not found.' };
      return res.redirect(303, '/dashboard');
    }
    client.isDeleted = true;
    client.deletedAt = new Date();
    client.deletedBy = req.session.user.id;
    await client.save();
    await logActivity(req, 'CLIENT_DELETE', 'client', `Archived client account for ${client.name}`, { accountNumber: client.accountNumber }, client._id);
    req.session.flash = { type: 'success', message: 'Client archived and will be permanently deleted after 60 days.' };
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

/* ── PHOTO UPLOAD ────────────────────────────── */
const uploadPhoto = (req, res) => {
  photoUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    try {
      const { role, id: userId } = req.session.user;
      const filter = { _id: req.params.id };
      if (role === 'teller') filter.assignedTeller = userId;

      const client = await Client.findOne(filter);
      if (!client) return res.status(404).json({ error: 'Client not found or access denied.' });

      // Delete old photo file if it exists
      if (client.photo) {
        const oldPath = path.join(__dirname, '../public', client.photo);
        fs.unlink(oldPath, () => {});
      }

      const photoUrl = `/uploads/clients/${req.file.filename}`;
      client.photo = photoUrl;
      await client.save();

      await logActivity(req, 'CLIENT_PHOTO', 'client', `Updated profile photo for ${client.name}`, {}, client._id);
      res.json({ photo: photoUrl });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
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

module.exports = { listClients, clientDetail, newClientForm, createClient, editClientForm, updateClient, deleteClient, approveClient, rejectClient, uploadPhoto };
