const path        = require('path');
const fs          = require('fs');
const multer      = require('multer');
const User        = require('../models/User');
const Client      = require('../models/Client');
const Branch      = require('../models/Branch');
const Transaction = require('../models/Transaction');
const ActivityLog = require('../models/ActivityLog');
const logActivity = require('../utils/logActivity');

fs.mkdirSync(path.join(__dirname, '../public/uploads/users'), { recursive: true });

const userPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../public/uploads/users')),
    filename:    (req, file, cb) => cb(null, `${req.params.id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed.'));
  },
}).single('photo');

const getBranches = () => Branch.find({ isActive: true }).sort({ name: 1 }).lean();

const generateStaffId = async () => {
  for (let i = 0; i < 20; i++) {
    const id = String(Math.floor(100000 + Math.random() * 900000));
    if (!await User.exists({ staffId: id })) return id;
  }
  throw new Error('Could not generate a unique staff ID. Please try again.');
};

/* Roles a given actor is allowed to create / manage */
const manageableRoles = (actorRole) =>
  actorRole === 'super_admin' ? ['admin', 'teller'] : ['teller'];

const buildReferees = (body) => [
  { name: body.ref1Name?.trim(), phone: body.ref1Phone?.trim(), email: body.ref1Email?.trim() || undefined, relationship: body.ref1Relationship?.trim() || undefined },
  { name: body.ref2Name?.trim(), phone: body.ref2Phone?.trim(), email: body.ref2Email?.trim() || undefined, relationship: body.ref2Relationship?.trim() || undefined },
].filter(r => r.name);

const validate = (body, isNew) => {
  const errors = [];
  if (!body.name?.trim())  errors.push('Full name is required.');
  if (!body.email?.trim()) errors.push('Email address is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.push('Enter a valid email address.');
  if (!body.phone?.trim()) {
    errors.push('Phone number is required.');
  } else if (!/^0\d{9}$/.test(body.phone.trim())) {
    errors.push('Phone must be a 10-digit number starting with 0 (e.g. 0553676107).');
  }
  if (isNew && !body.password?.trim()) errors.push('Password is required.');
  if (body.password && body.password.length < 6) errors.push('Password must be at least 6 characters.');

  // Referee phone format — only validate if a phone was provided
  if (body.ref1Phone?.trim() && !/^0\d{9}$/.test(body.ref1Phone.trim()))
    errors.push('Referee 1 phone must be a 10-digit number starting with 0.');
  if (body.ref2Phone?.trim() && !/^0\d{9}$/.test(body.ref2Phone.trim()))
    errors.push('Referee 2 phone must be a 10-digit number starting with 0.');

  return errors;
};

/* ── GET /users ─────────────────────────────────── */
const listUsers = async (req, res) => {
  try {
    const roles   = manageableRoles(req.session.user.role);
    const users   = await User.find({ role: { $in: roles } }).sort({ role: 1, name: 1 }).lean();

    // Attach assigned-client counts for tellers
    const tellerIds = users.filter(u => u.role === 'teller').map(u => u._id);
    const counts    = await Client.aggregate([
      { $match: { assignedTeller: { $in: tellerIds }, isDeleted: { $ne: true } } },
      { $group: { _id: '$assignedTeller', count: { $sum: 1 } } },
    ]);
    const countMap  = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
    const usersWithCounts = users.map(u => ({ ...u, clientCount: countMap[String(u._id)] || 0 }));

    res.render('users', { user: req.session.user, users: usersWithCounts, manageableRoles: roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /users/:id ─────────────────────────────── */
const userDetail = async (req, res) => {
  try {
    const roles      = manageableRoles(req.session.user.role);
    const targetUser = await User.findOne({ _id: req.params.id, role: { $in: roles } })
      .populate('branch', 'name code').lean();

    if (!targetUser) {
      req.session.flash = { type: 'error', message: 'Staff member not found.' };
      return res.redirect(303, '/users');
    }

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const uid        = targetUser._id;

    const [
      assignedClients,
      txnsProcessed,
      txnsApprovedCount,
      clientsApprovedCount,
      thisMonthTxns,
      recentActivity,
    ] = await Promise.all([
      Client.countDocuments({ assignedTeller: uid, isDeleted: { $ne: true } }),
      Transaction.countDocuments({ requestedBy: uid, isDeleted: { $ne: true } }),
      Transaction.countDocuments({ approvedBy: uid, isDeleted: { $ne: true } }),
      Client.countDocuments({ approvedBy: uid }),
      Transaction.countDocuments({ requestedBy: uid, isDeleted: { $ne: true }, date: { $gte: monthStart } }),
      ActivityLog.find({ userId: uid }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const perfScore = thisMonthTxns >= 50 ? 'Top Performer'
      : thisMonthTxns >= 20              ? 'High Performer'
      : thisMonthTxns >= 5               ? 'Good Standing'
      : 'Getting Started';

    const perfColor = thisMonthTxns >= 50 ? 'indigo'
      : thisMonthTxns >= 20              ? 'green'
      : thisMonthTxns >= 5               ? 'blue'
      : 'amber';

    res.render('user-detail', {
      user: req.session.user,
      targetUser,
      assignedClients,
      txnsProcessed,
      txnsApprovedCount,
      clientsApprovedCount,
      thisMonthTxns,
      recentActivity,
      perfScore,
      perfColor,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /users/new ─────────────────────────────── */
const newUserForm = async (req, res) => {
  const roles = manageableRoles(req.session.user.role);
  try {
    const branches = await getBranches();
    res.render('user-form', {
      user: req.session.user,
      formUser: { name: '', email: '', role: roles[roles.length - 1] },
      errors: [], isEdit: false, manageableRoles: roles, branches,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /users ────────────────────────────────── */
const createUser = async (req, res) => {
  const roles  = manageableRoles(req.session.user.role);
  const errors = validate(req.body, true);

  if (!roles.includes(req.body.role)) errors.push('Invalid role selection.');
  if (!req.body.branch) errors.push('Branch is required.');

  if (errors.length) {
    const branches = await getBranches().catch(() => []);
    return res.status(422).render('user-form', {
      user: req.session.user, formUser: req.body,
      errors, isEdit: false, manageableRoles: roles, branches,
    });
  }

  try {
    const existing = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (existing) {
      const branches = await getBranches().catch(() => []);
      return res.status(422).render('user-form', {
        user: req.session.user, formUser: req.body,
        errors: ['An account with that email already exists.'], isEdit: false, manageableRoles: roles, branches,
      });
    }

    const staffId = await generateStaffId();
    await User.create({
      name:     req.body.name.trim(),
      email:    req.body.email.toLowerCase().trim(),
      password: req.body.password,
      phone:    req.body.phone.trim(),
      role:     req.body.role,
      staffId,
      branch:   req.body.branch,
      referees: buildReferees(req.body),
    });

    await logActivity(req, 'USER_CREATE', 'user', `Created ${req.body.role} account for ${req.body.name.trim()}`, { role: req.body.role, email: req.body.email });
    req.session.flash = { type: 'success', message: `${req.body.role === 'admin' ? 'Admin' : 'Teller'} account created successfully.` };
    res.redirect(303, '/users');
  } catch (err) {
    const branches = await getBranches().catch(() => []);
    res.status(500).render('user-form', {
      user: req.session.user, formUser: req.body,
      errors: [err.message], isEdit: false, manageableRoles: roles, branches,
    });
  }
};

/* ── GET /users/:id/edit ────────────────────────── */
const editUserForm = async (req, res) => {
  try {
    const roles = manageableRoles(req.session.user.role);
    const [formUser, branches] = await Promise.all([
      User.findOne({ _id: req.params.id, role: { $in: roles } }).populate('branch', 'name code').lean(),
      getBranches(),
    ]);
    if (!formUser) {
      req.session.flash = { type: 'error', message: 'User not found or you do not have permission to edit them.' };
      return res.redirect(303, '/users');
    }

    const refs = formUser.referees || [];
    const flatRefs = {};
    [0, 1].forEach(i => {
      const n = i + 1;
      const r = refs[i] || {};
      flatRefs[`ref${n}Name`]         = r.name || '';
      flatRefs[`ref${n}Phone`]        = r.phone || '';
      flatRefs[`ref${n}Email`]        = r.email || '';
      flatRefs[`ref${n}Relationship`] = r.relationship || '';
    });
    res.render('user-form', {
      user: req.session.user, formUser: { ...formUser, ...flatRefs, password: '' },
      errors: [], isEdit: true, manageableRoles: roles, branches,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /users/:id ────────────────────────────── */
const updateUser = async (req, res) => {
  const roles  = manageableRoles(req.session.user.role);
  const errors = validate(req.body, false);

  if (!roles.includes(req.body.role)) errors.push('Invalid role selection.');

  const formUser = { ...req.body, _id: req.params.id };

  if (errors.length) {
    const branches = await getBranches().catch(() => []);
    return res.status(422).render('user-form', {
      user: req.session.user, formUser,
      errors, isEdit: true, manageableRoles: roles, branches,
    });
  }

  try {
    const target = await User.findOne({ _id: req.params.id, role: { $in: roles } });
    if (!target) {
      req.session.flash = { type: 'error', message: 'User not found or you do not have permission to edit them.' };
      return res.redirect(303, '/users');
    }

    // Check email uniqueness if changed
    if (req.body.email.toLowerCase().trim() !== target.email) {
      const dup = await User.findOne({ email: req.body.email.toLowerCase().trim() });
      if (dup) {
        const branches = await getBranches().catch(() => []);
        return res.status(422).render('user-form', {
          user: req.session.user, formUser,
          errors: ['That email address is already in use.'], isEdit: true, manageableRoles: roles, branches,
        });
      }
    }

    target.name     = req.body.name.trim();
    target.email    = req.body.email.toLowerCase().trim();
    target.phone    = req.body.phone?.trim() || undefined;
    target.role     = req.body.role;
    target.branch   = req.body.branch || undefined;
    target.referees = buildReferees(req.body);
    if (req.body.password?.trim()) target.password = req.body.password;

    await target.save();

    await logActivity(req, 'USER_UPDATE', 'user', `Updated ${target.role} account for ${target.name}`, { role: target.role, email: target.email }, target._id);
    req.session.flash = { type: 'success', message: 'Account updated successfully.' };
    res.redirect(303, '/users');
  } catch (err) {
    const branches = await getBranches().catch(() => []);
    res.status(500).render('user-form', {
      user: req.session.user, formUser,
      errors: [err.message], isEdit: true, manageableRoles: roles, branches,
    });
  }
};

/* ── POST /users/:id/toggle ─────────────────────── */
const toggleUserActive = async (req, res) => {
  try {
    const roles  = manageableRoles(req.session.user.role);
    const target = await User.findOne({ _id: req.params.id, role: { $in: roles } });
    if (!target) {
      req.session.flash = { type: 'error', message: 'User not found.' };
      return res.redirect(303, '/users');
    }

    target.isActive = !target.isActive;
    await target.save();

    const statusLabel = target.isActive ? 'reactivated' : 'deactivated';
    await logActivity(req, 'USER_TOGGLE', 'user', `${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)} ${target.role} account for ${target.name}`, { role: target.role, isActive: target.isActive }, target._id);
    req.session.flash = {
      type: 'success',
      message: `${target.name} has been ${statusLabel}.`,
    };
    res.redirect(303, '/users');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/users');
  }
};

/* ── POST /users/:id/delete ─────────────────────── (super_admin only) */
const deleteUser = async (req, res) => {
  try {
    const roles  = manageableRoles(req.session.user.role);
    const target = await User.findOne({ _id: req.params.id, role: { $in: roles } });
    if (!target) {
      req.session.flash = { type: 'error', message: 'User not found.' };
      return res.redirect(303, '/users');
    }

    // Unassign their clients before archiving
    await Client.updateMany({ assignedTeller: target._id }, { $unset: { assignedTeller: '' } });
    target.isDeleted = true;
    target.deletedAt = new Date();
    target.deletedBy = req.session.user.id;
    target.isActive  = false;
    await target.save();
    await logActivity(req, 'USER_DELETE', 'user', `Archived ${target.role} account for ${target.name}`, { role: target.role, email: target.email });
    req.session.flash = { type: 'success', message: `${target.name}'s account has been archived and will be permanently deleted after 60 days.` };
    res.redirect(303, '/users');
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message };
    res.redirect(303, '/users');
  }
};

/* ── POST /users/:id/photo ──────────────────────── */
const uploadUserPhoto = (req, res) => {
  userPhotoUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    try {
      const isSelf = String(req.params.id) === String(req.session.user.id);
      const roles  = manageableRoles(req.session.user.role);
      const query  = isSelf ? { _id: req.params.id } : { _id: req.params.id, role: { $in: roles } };
      const target = await User.findOne(query);
      if (!target) return res.status(404).json({ error: 'User not found.' });

      if (target.photo) {
        const oldPath = path.join(__dirname, '../public', target.photo);
        fs.unlink(oldPath, () => {});
      }

      target.photo = `/uploads/users/${req.file.filename}`;
      await target.save();
      await logActivity(req, 'USER_PHOTO', 'user', `Updated profile photo for ${target.name}`, {}, target._id);
      res.json({ photo: target.photo });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};

module.exports = { listUsers, userDetail, newUserForm, createUser, editUserForm, updateUser, toggleUserActive, deleteUser, uploadUserPhoto };
