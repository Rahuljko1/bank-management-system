const pool = require('../db');

async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Sign in is required for this endpoint.' });
  }
  try {
    const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.session.userId]);
    if (!rows[0]) return res.status(401).json({ error: 'Session is no longer valid.' });
    if (rows[0].role !== 'admin') return res.status(403).json({ error: 'Admin access is required.' });
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAdmin };
