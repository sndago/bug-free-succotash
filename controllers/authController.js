const User        = require('../models/User');
const logActivity = require('../utils/logActivity');

const showLogin = (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
};

const login = async (req, res) => {
  const { identifier, password } = req.body;
  const id = (identifier || '').trim();
  try {
    const user = await User.findOne({ staffId: id, isActive: true });
    if (!user || !(await user.comparePassword(password))) {
      return res.render('login', { error: 'Invalid Staff ID or password.' });
    }
    req.session.user = { id: user._id, name: user.name, email: user.email, role: user.role };
    await logActivity(req, 'LOGIN', 'auth', `${user.name} logged in`, {}, user._id);
    res.redirect(303, '/dashboard');
  } catch {
    res.render('login', { error: 'Something went wrong. Please try again.' });
  }
};

const logout = async (req, res) => {
  await logActivity(req, 'LOGOUT', 'auth', `${req.session.user?.name || 'User'} logged out`);
  req.session.destroy(() => res.redirect('/'));
};

module.exports = { showLogin, login, logout };
