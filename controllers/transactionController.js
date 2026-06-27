const Transaction = require('../models/Transaction');
const Client      = require('../models/Client');
const logActivity = require('../utils/logActivity');

const CATEGORIES          = ['deposit', 'withdrawal', 'transfer', 'payment', 'fee', 'interest', 'loan'];
const TYPES               = ['credit', 'debit'];
const STATUSES            = ['completed', 'pending', 'failed'];
const APPROVAL_CATEGORIES = ['withdrawal', 'loan', 'transfer'];

const validate = (body, isTellerRequest = false) => {
  const errors = [];
  if (!TYPES.includes(body.type))
    errors.push('Transaction type must be credit or debit.');
  if (!body.amount || isNaN(Number(body.amount)) || Number(body.amount) <= 0)
    errors.push('Amount must be a positive number.');
  if (!body.description?.trim())
    errors.push('Description is required.');
  if (!CATEGORIES.includes(body.category))
    errors.push('Category is required.');
  if (!isTellerRequest && !STATUSES.includes(body.status))
    errors.push('Status is required.');
  return errors;
};

const eff = (type, amount) => type === 'credit' ? amount : -amount;

const needsApproval = (role, category) =>
  role === 'teller' && APPROVAL_CATEGORIES.includes(category);

const withinEditWindow = (txn) =>
  (Date.now() - new Date(txn.createdAt).getTime()) < 24 * 60 * 60 * 1000;

const tellerCanEdit = (txn, userId) => {
  const isPendingOwnRequest =
    txn.requiresApproval &&
    txn.approvalStatus === 'pending' &&
    String(txn.requestedBy) === String(userId);
  const isRecentTransaction = !txn.requiresApproval && withinEditWindow(txn);
  return isPendingOwnRequest || isRecentTransaction;
};

/* ── GET: new transaction form ───────────────── */
const newTransactionForm = async (req, res) => {
  try {
    const client = await Client.findById(req.params.clientId).lean();
    if (!client) return res.status(404).render('login', { error: 'Client not found.' });

    res.render('transaction-form', {
      user: req.session.user, client,
      txn: { type: 'credit', category: 'deposit', status: 'completed' },
      errors: [], isEdit: false, isEditRequest: false, hasPendingEdit: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST: create transaction ────────────────── */
const createTransaction = async (req, res) => {
  const role           = req.session.user.role;
  const isRequest      = needsApproval(role, req.body.category);
  const errors         = validate(req.body, isRequest);
  let client;

  try {
    client = await Client.findById(req.params.clientId);
    if (!client) return res.status(404).render('login', { error: 'Client not found.' });

    if (errors.length) {
      return res.status(422).render('transaction-form', {
        user: req.session.user, client: client.toObject(),
        txn: req.body, errors, isEdit: false, isEditRequest: false, hasPendingEdit: false,
      });
    }

    const amount = parseFloat(req.body.amount);

    if (isRequest) {
      // Pending approval: balance not touched yet
      await Transaction.create({
        client:           client._id,
        type:             req.body.type,
        amount,
        description:      req.body.description.trim(),
        category:         req.body.category,
        reference:        req.body.reference?.trim() || undefined,
        balanceAfter:     client.balance,
        status:           'pending',
        date:             new Date(),
        requiresApproval: true,
        approvalStatus:   'pending',
        requestedBy:      req.session.user.id,
      });
      await logActivity(req, 'TXN_REQUEST', 'transaction', `Submitted ${req.body.category} request of $${amount.toFixed(2)} for ${client.name}`, { category: req.body.category, amount, type: req.body.type, clientName: client.name });
      req.session.flash = { type: 'success', message: 'Request submitted and is awaiting admin approval.' };
    } else {
      const newBalance = parseFloat((client.balance + eff(req.body.type, amount)).toFixed(2));
      const txn = await Transaction.create({
        client:       client._id,
        type:         req.body.type,
        amount,
        description:  req.body.description.trim(),
        category:     req.body.category,
        reference:    req.body.reference?.trim() || undefined,
        balanceAfter: newBalance,
        status:       req.body.status,
        date:         new Date(),
      });
      client.balance = newBalance;
      await client.save();
      await logActivity(req, 'TXN_CREATE', 'transaction', `Recorded ${req.body.category} of $${amount.toFixed(2)} for ${client.name}`, { category: req.body.category, amount, type: req.body.type, clientName: client.name }, txn._id);
      req.session.flash = { type: 'success', message: 'Transaction recorded successfully.' };
    }

    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    const c = client?.toObject?.() || {};
    res.status(500).render('transaction-form', {
      user: req.session.user, client: c,
      txn: req.body, errors: [err.message], isEdit: false, isEditRequest: false, hasPendingEdit: false,
    });
  }
};

/* ── GET: edit transaction form ──────────────── */
const editTransactionForm = async (req, res) => {
  try {
    const [client, txn] = await Promise.all([
      Client.findById(req.params.clientId).lean(),
      Transaction.findOne({ _id: req.params.txnId, client: req.params.clientId }).lean(),
    ]);
    if (!client) return res.status(404).render('login', { error: 'Client not found.' });
    if (!txn)    return res.status(404).render('login', { error: 'Transaction not found.' });

    const role    = req.session.user.role;
    const isOld   = !withinEditWindow(txn);
    const isEditRequest = role === 'teller' && isOld && !txn.requiresApproval;

    if (role === 'teller' && !tellerCanEdit(txn, req.session.user.id) && !isEditRequest) {
      req.session.flash = { type: 'error', message: 'You cannot edit this transaction.' };
      return res.redirect(303, `/clients/${client._id}`);
    }

    // Pre-fill form with pending edit values if one already exists
    const hasPendingEdit = isEditRequest && txn.pendingEdit?.editStatus === 'pending';
    let formTxn = txn;
    if (hasPendingEdit) {
      formTxn = { ...txn, ...txn.pendingEdit, _id: txn._id, status: txn.status };
    }

    res.render('transaction-form', {
      user: req.session.user, client,
      txn: formTxn, errors: [], isEdit: true,
      isEditRequest, hasPendingEdit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST: update transaction ────────────────── */
const updateTransaction = async (req, res) => {
  let client, txn;
  try {
    [client, txn] = await Promise.all([
      Client.findById(req.params.clientId),
      Transaction.findOne({ _id: req.params.txnId, client: req.params.clientId }),
    ]);
    if (!client) return res.status(404).render('login', { error: 'Client not found.' });
    if (!txn)    return res.status(404).render('login', { error: 'Transaction not found.' });

    const role          = req.session.user.role;
    const isRequest     = txn.requiresApproval && txn.approvalStatus === 'pending';
    const isOld         = !withinEditWindow(txn);
    const isEditRequest = role === 'teller' && isOld && !txn.requiresApproval;

    // Tellers cannot directly edit old transactions — must go through pendingEdit
    if (role === 'teller' && isOld && !isRequest && !isEditRequest) {
      req.session.flash = { type: 'error', message: 'Transactions older than 24 hours require an edit request.' };
      return res.redirect(303, `/clients/${client._id}`);
    }
    if (role === 'teller' && !tellerCanEdit(txn, req.session.user.id) && !isEditRequest) {
      req.session.flash = { type: 'error', message: 'You cannot edit this transaction.' };
      return res.redirect(303, `/clients/${client._id}`);
    }

    // ── Edit request path (teller + old transaction) ──────────────────
    if (isEditRequest) {
      const errors = validate(req.body, true);
      if (errors.length) {
        const hasPendingEdit = txn.pendingEdit?.editStatus === 'pending';
        return res.status(422).render('transaction-form', {
          user: req.session.user, client: client.toObject(),
          txn: { ...txn.toObject(), ...req.body, _id: txn._id },
          errors, isEdit: true, isEditRequest: true, hasPendingEdit,
        });
      }

      txn.pendingEdit = {
        requestedBy:  req.session.user.id,
        requestedAt:  new Date(),
        type:         req.body.type,
        amount:       parseFloat(req.body.amount),
        description:  req.body.description.trim(),
        category:     req.body.category,
        reference:    req.body.reference?.trim() || txn.reference,
        editStatus:   'pending',
      };
      await txn.save();
      await logActivity(req, 'EDIT_REQUEST', 'transaction', `Submitted edit request for ${txn.category} transaction on ${client.name}'s account`, { clientName: client.name, originalAmount: txn.amount, proposedAmount: parseFloat(req.body.amount) }, txn._id);
      req.session.flash = { type: 'success', message: 'Edit request submitted and awaiting admin approval.' };
      return res.redirect(303, `/clients/${client._id}`);
    }

    // ── Direct edit path ──────────────────────────────────────────────
    const errors = validate(req.body, isRequest);
    if (errors.length) {
      return res.status(422).render('transaction-form', {
        user: req.session.user, client: client.toObject(),
        txn: { ...txn.toObject(), ...req.body, _id: txn._id },
        errors, isEdit: true,
      });
    }

    const newAmt = parseFloat(req.body.amount);

    if (isRequest) {
      txn.type        = req.body.type;
      txn.amount      = newAmt;
      txn.description = req.body.description.trim();
      txn.category    = req.body.category;
      if (req.body.reference?.trim()) txn.reference = req.body.reference.trim();
      await txn.save();
      req.session.flash = { type: 'success', message: 'Request updated.' };
    } else {
      const oldEff = eff(txn.type, txn.amount);
      const newEff = eff(req.body.type, newAmt);
      const delta  = newEff - oldEff;

      txn.type         = req.body.type;
      txn.amount       = newAmt;
      txn.description  = req.body.description.trim();
      txn.category     = req.body.category;
      txn.status       = req.body.status;
      txn.balanceAfter = parseFloat((txn.balanceAfter + delta).toFixed(2));
      if (req.body.reference?.trim()) txn.reference = req.body.reference.trim();
      await txn.save();

      client.balance = parseFloat((client.balance + delta).toFixed(2));
      await client.save();
      req.session.flash = { type: 'success', message: 'Transaction updated successfully.' };
    }

    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    const c = client?.toObject?.() || {};
    res.status(500).render('transaction-form', {
      user: req.session.user, client: c,
      txn: { ...req.body, _id: req.params.txnId }, errors: [err.message], isEdit: true,
    });
  }
};

/* ── POST: delete transaction ────────────────── */
const deleteTransaction = async (req, res) => {
  try {
    const [client, txn] = await Promise.all([
      Client.findById(req.params.clientId),
      Transaction.findOne({ _id: req.params.txnId, client: req.params.clientId }),
    ]);

    if (!client || !txn) {
      req.session.flash = { type: 'error', message: 'Transaction or client not found.' };
      return res.redirect(303, `/clients/${req.params.clientId}`);
    }

    // Only reverse balance for approved/completed transactions
    if (!txn.requiresApproval || txn.approvalStatus === 'approved') {
      client.balance = parseFloat((client.balance - eff(txn.type, txn.amount)).toFixed(2));
      await client.save();
    }

    await Transaction.findByIdAndDelete(txn._id);
    await logActivity(req, 'TXN_DELETE', 'transaction', `Deleted ${txn.category} of $${txn.amount.toFixed(2)} from ${client.name}'s account`, { clientName: client.name, category: txn.category, amount: txn.amount, type: txn.type });
    req.session.flash = { type: 'success', message: 'Transaction deleted.' };
    res.redirect(303, `/clients/${client._id}`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, `/clients/${req.params.clientId}`);
  }
};

/* ── GET: list pending requests (admin/super_admin) ── */
const listRequests = async (req, res) => {
  try {
    const tab = req.query.tab || 'pending';
    let requests = [];

    if (tab === 'edits') {
      requests = await Transaction.find({ 'pendingEdit.editStatus': 'pending' })
        .populate('client', 'name accountNumber')
        .populate({ path: 'pendingEdit.requestedBy', select: 'name' })
        .sort({ 'pendingEdit.requestedAt': -1 })
        .lean();
    } else if (tab === 'accounts') {
      requests = await Client.find({ approvalStatus: { $in: ['pending', 'rejected'] } })
        .populate('requestedBy', 'name')
        .populate('approvedBy', 'name')
        .sort({ createdAt: -1 })
        .lean();
    } else {
      const filter = { requiresApproval: true };
      if (tab === 'pending')  filter.approvalStatus = 'pending';
      if (tab === 'approved') filter.approvalStatus = 'approved';
      if (tab === 'rejected') filter.approvalStatus = 'rejected';
      requests = await Transaction.find(filter)
        .populate('client', 'name accountNumber balance')
        .populate('requestedBy', 'name')
        .populate('approvedBy', 'name')
        .sort({ createdAt: -1 })
        .lean();
    }

    const [pendingCount, pendingEditCount, pendingClientCount] = await Promise.all([
      Transaction.countDocuments({ requiresApproval: true, approvalStatus: 'pending' }),
      Transaction.countDocuments({ 'pendingEdit.editStatus': 'pending' }),
      Client.countDocuments({ approvalStatus: 'pending' }),
    ]);

    res.render('requests', { user: req.session.user, requests, tab, pendingCount, pendingEditCount, pendingClientCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST: approve an edit request ───────────── */
const approveEditRequest = async (req, res) => {
  try {
    const txn = await Transaction.findOne({ _id: req.params.txnId, 'pendingEdit.editStatus': 'pending' });
    if (!txn) {
      req.session.flash = { type: 'error', message: 'Edit request not found or already processed.' };
      return res.redirect(303, '/requests?tab=edits');
    }

    const client = await Client.findById(txn.client);
    const edit   = txn.pendingEdit;

    const oldEff = eff(txn.type, txn.amount);
    const newEff = eff(edit.type, edit.amount);
    const delta  = newEff - oldEff;

    txn.type        = edit.type;
    txn.amount      = edit.amount;
    txn.description = edit.description;
    txn.category    = edit.category;
    if (edit.reference) txn.reference = edit.reference;
    txn.balanceAfter = parseFloat(((txn.balanceAfter || client.balance) + delta).toFixed(2));

    txn.pendingEdit.editStatus  = 'approved';
    txn.pendingEdit.approvedBy  = req.session.user.id;
    txn.pendingEdit.approvedAt  = new Date();
    await txn.save();

    client.balance = parseFloat((client.balance + delta).toFixed(2));
    await client.save();

    await logActivity(req, 'EDIT_APPROVE', 'transaction', `Approved edit request on ${txn.category} transaction for ${client.name}`, { clientName: client.name, category: txn.category, newAmount: edit.amount }, txn._id);
    req.session.flash = { type: 'success', message: 'Edit request approved — transaction updated.' };
    res.redirect(303, req.get('referer') || '/requests?tab=edits');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/requests?tab=edits');
  }
};

/* ── POST: reject an edit request ────────────── */
const rejectEditRequest = async (req, res) => {
  try {
    const txn = await Transaction.findOne({ _id: req.params.txnId, 'pendingEdit.editStatus': 'pending' });
    if (!txn) {
      req.session.flash = { type: 'error', message: 'Edit request not found or already processed.' };
      return res.redirect(303, '/requests?tab=edits');
    }

    txn.pendingEdit.editStatus      = 'rejected';
    txn.pendingEdit.approvedBy      = req.session.user.id;
    txn.pendingEdit.approvedAt      = new Date();
    txn.pendingEdit.rejectionReason = req.body.reason?.trim() || 'No reason provided.';
    await txn.save();

    await logActivity(req, 'EDIT_REJECT', 'transaction', `Rejected edit request on transaction`, { reason: req.body.reason }, txn._id);
    req.session.flash = { type: 'success', message: 'Edit request rejected.' };
    res.redirect(303, req.get('referer') || '/requests?tab=edits');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/requests?tab=edits');
  }
};

/* ── POST: approve a request ──────────────────── */
const approveTransaction = async (req, res) => {
  try {
    const txn = await Transaction.findOne({ _id: req.params.txnId, requiresApproval: true, approvalStatus: 'pending' })
      .populate('client');

    if (!txn) {
      req.session.flash = { type: 'error', message: 'Request not found or already processed.' };
      return res.redirect(303, '/requests');
    }

    const client     = await Client.findById(txn.client._id || txn.client);
    const newBalance = parseFloat((client.balance + eff(txn.type, txn.amount)).toFixed(2));

    txn.approvalStatus = 'approved';
    txn.status         = 'completed';
    txn.balanceAfter   = newBalance;
    txn.approvedBy     = req.session.user.id;
    txn.approvedAt     = new Date();
    await txn.save();

    client.balance = newBalance;
    await client.save();

    await logActivity(req, 'TXN_APPROVE', 'transaction', `Approved ${txn.category} of $${txn.amount.toFixed(2)} for ${client.name}`, { clientName: client.name, category: txn.category, amount: txn.amount, type: txn.type }, txn._id);
    req.session.flash = { type: 'success', message: `Request approved — $${txn.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${txn.category} posted to ${client.name}'s account.` };
    res.redirect(303, req.get('referer') || '/requests');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/requests');
  }
};

/* ── POST: reject a request ───────────────────── */
const rejectTransaction = async (req, res) => {
  try {
    const txn = await Transaction.findOne({ _id: req.params.txnId, requiresApproval: true, approvalStatus: 'pending' })
      .populate('client', 'name');

    if (!txn) {
      req.session.flash = { type: 'error', message: 'Request not found or already processed.' };
      return res.redirect(303, '/requests');
    }

    txn.approvalStatus  = 'rejected';
    txn.status          = 'failed';
    txn.approvedBy      = req.session.user.id;
    txn.approvedAt      = new Date();
    txn.rejectionReason = req.body.reason?.trim() || 'No reason provided.';
    await txn.save();

    await logActivity(req, 'TXN_REJECT', 'transaction', `Rejected ${txn.category} request for ${txn.client?.name || 'client'}`, { clientName: txn.client?.name, category: txn.category, amount: txn.amount, reason: req.body.reason }, txn._id);
    req.session.flash = { type: 'success', message: `Request rejected for ${txn.client?.name || 'client'}.` };
    res.redirect(303, req.get('referer') || '/requests');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/requests');
  }
};

/* ── GET: list all transactions ──────────────── */
const listTransactions = async (req, res) => {
  const { role, id: userId } = req.session.user;
  try {
    const filter = {};

    if (role === 'teller') {
      const clientIds = await Client.find({ assignedTeller: userId }).distinct('_id');
      filter.client = { $in: clientIds };
    }

    if (req.query.type     && TYPES.includes(req.query.type))         filter.type     = req.query.type;
    if (req.query.category && CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    if (req.query.status   && STATUSES.includes(req.query.status))     filter.status   = req.query.status;

    const transactions = await Transaction
      .find(filter)
      .populate('client', 'name accountNumber')
      .sort({ date: -1 })
      .limit(200)
      .lean();

    res.render('transactions', {
      user: req.session.user,
      transactions,
      filters: { type: req.query.type || '', category: req.query.category || '', status: req.query.status || '' },
      CATEGORIES,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  newTransactionForm, createTransaction,
  editTransactionForm, updateTransaction,
  deleteTransaction,
  listRequests,
  listTransactions,
  approveTransaction, rejectTransaction,
  approveEditRequest, rejectEditRequest,
};
