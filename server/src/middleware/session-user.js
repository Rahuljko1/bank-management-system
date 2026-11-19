function requireUser(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Sign in is required for this endpoint.' });
  }
  return next();
}

module.exports = { requireUser };
