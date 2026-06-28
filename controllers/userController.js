const User        = require('../models/User');
const Client      = require('../models/Client');
const logActivity = require('../utils/logActivity');

/* Roles a given actor is allowed to create / manage */
const manageableRoles = (actorRole) =>
  actorRole === 'super_admin' ? ['admin', 'teller'] : ['teller'];

const validate = (body, isNew) => {
  const errors = [];
  if (!body.name?.trim())  errors.push('Full name is required.');
  if (!body.email?.trim()) errors.push('Email address is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.push('Enter a valid email address.');
  if (isNew && !body.password?.trim()) errors.push('Password is required.');
  if (body.password && body.password.length < 6) errors.push('Password must be at least 6 characters.');
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

/* ── GET /users/new ─────────────────────────────── */
const newUserForm = (req, res) => {
  const roles = manageableRoles(req.session.user.role);
  res.render('user-form', {
    user: req.session.user,
    formUser: { name: '', email: '', role: roles[roles.length - 1] },
    errors: [], isEdit: false, manageableRoles: roles,
  });
};

/* ── POST /users ────────────────────────────────── */
const createUser = async (req, res) => {
  const roles  = manageableRoles(req.session.user.role);
  const errors = validate(req.body, true);

  if (!roles.includes(req.body.role)) errors.push('Invalid role selection.');

  if (errors.length) {
    return res.status(422).render('user-form', {
      user: req.session.user, formUser: req.body,
      errors, isEdit: false, manageableRoles: roles,
    });
  }

  try {
    const existing = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (existing) {
      return res.status(422).render('user-form', {
        user: req.session.user, formUser: req.body,
        errors: ['An account with that email already exists.'], isEdit: false, manageableRoles: roles,
      });
    }

    await User.create({
      name:     req.body.name.trim(),
      email:    req.body.email.toLowerCase().trim(),
      password: req.body.password,
      role:     req.body.role,
    });

    await logActivity(req, 'USER_CREATE', 'user', `Created ${req.body.role} account for ${req.body.name.trim()}`, { role: req.body.role, email: req.body.email });
    req.session.flash = { type: 'success', message: `${req.body.role === 'admin' ? 'Admin' : 'Teller'} account created successfully.` };
    res.redirect(303, '/users');
  } catch (err) {
    res.status(500).render('user-form', {
      user: req.session.user, formUser: req.body,
      errors: [err.message], isEdit: false, manageableRoles: roles,
    });
  }
};

/* ── GET /users/:id/edit ────────────────────────── */
const editUserForm = async (req, res) => {
  try {
    const roles    = manageableRoles(req.session.user.role);
    const formUser = await User.findOne({ _id: req.params.id, role: { $in: roles } }).lean();
    if (!formUser) {
      req.session.flash = { type: 'error', message: 'User not found or you do not have permission to edit them.' };
      return res.redirect(303, '/users');
    }

    res.render('user-form', {
      user: req.session.user, formUser: { ...formUser, password: '' },
      errors: [], isEdit: true, manageableRoles: roles,
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
    return res.status(422).render('user-form', {
      user: req.session.user, formUser,
      errors, isEdit: true, manageableRoles: roles,
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
        return res.status(422).render('user-form', {
          user: req.session.user, formUser,
          errors: ['That email address is already in use.'], isEdit: true, manageableRoles: roles,
        });
      }
    }

    target.name  = req.body.name.trim();
    target.email = req.body.email.toLowerCase().trim();
    target.role  = req.body.role;
    if (req.body.password?.trim()) target.password = req.body.password;

    await target.save();

    await logActivity(req, 'USER_UPDATE', 'user', `Updated ${target.role} account for ${target.name}`, { role: target.role, email: target.email }, target._id);
    req.session.flash = { type: 'success', message: 'Account updated successfully.' };
    res.redirect(303, '/users');
  } catch (err) {
    res.status(500).render('user-form', {
      user: req.session.user, formUser,
      errors: [err.message], isEdit: true, manageableRoles: roles,
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

module.exports = { listUsers, newUserForm, createUser, editUserForm, updateUser, toggleUserActive, deleteUser };
