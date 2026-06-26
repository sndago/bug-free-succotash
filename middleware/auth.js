const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/');
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.user) return res.redirect('/');
  if (!['admin', 'super_admin'].includes(req.session.user.role)) {
    return res.status(403).render('login', { error: 'Access denied. Admin privileges required.' });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.session.user) return res.redirect('/');
  if (req.session.user.role !== 'super_admin') {
    return res.status(403).render('login', { error: 'Access denied. Super Admin only.' });
  }
  next();
};

module.exports = { requireAuth, requireAdmin, requireSuperAdmin };
