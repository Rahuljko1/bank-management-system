const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const pool = require('../db');
const config = require('../config');
const {
  emailPattern,
  usernamePattern,
  normalizeEmail,
  isStrongPassword,
  parseAmountCents
} = require('../utils/validation');
const { generateFictionalAccount } = require('../utils/fictional-account');

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' }
});

function establishSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenerateError) => {
      if (regenerateError) return reject(regenerateError);
      req.session.userId = userId;
      req.session.save((saveError) => saveError ? reject(saveError) : resolve());
    });
  });
}

function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email, fullName: row.full_name, role: row.role || 'user' };
}

router.get('/me', require('../middleware/session-user').requireUser, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, username, email, full_name AS fullName, role FROM users WHERE id = ?', [req.session.userId]);
    if (!rows[0]) return res.status(401).json({ error: 'Session is no longer valid.' });
    return res.json({ user: rows[0] });
  } catch (error) { return next(error); }
});

router.post('/change-password', require('../middleware/session-user').requireUser, authLimiter, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || currentPassword.length > 200 || !isStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'Enter your current password and a strong new password.' });
  }
  try {
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.session.userId]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.session.userId]);
    return res.json({ message: 'Password changed successfully.' });
  } catch (error) { return next(error); }
});

router.post('/register', authLimiter, async (req, res, next) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const email = normalizeEmail(req.body.email);
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const password = req.body.password;
  if (!usernamePattern.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–40 letters, numbers, or underscores.' });
  }
  if (!emailPattern.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (fullName.length < 2 || fullName.length > 100) {
    return res.status(400).json({ error: 'Full name must be 2–100 characters.' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: 'Password needs 8+ characters, uppercase, lowercase, a number, and a symbol.' });
  }
  const startingCents = parseAmountCents(config.fictionalStartingBalance);
  if (!startingCents) return res.status(500).json({ error: 'Fictional balance configuration is invalid.' });

  const connection = await pool.getConnection();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.beginTransaction();
    const [insertUser] = await connection.execute(
      'INSERT INTO users (username, email, full_name, password_hash) VALUES (?, ?, ?, ?)',
      [username, email, fullName, passwordHash]
    );

    let account;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateFictionalAccount();
      try {
        const [insertAccount] = await connection.execute(
          'INSERT INTO accounts (user_id, account_number, ifsc, account_type, balance, currency) VALUES (?, ?, ?, \'savings\', ?, \'INR\')',
          [insertUser.insertId, candidate.accountNumber, candidate.ifsc, config.fictionalStartingBalance]
        );
        account = { id: insertAccount.insertId, accountNumber: candidate.accountNumber, ifsc: candidate.ifsc, balance: config.fictionalStartingBalance, currency: 'INR' };
        break;
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY' || attempt === 4) throw error;
      }
    }
    await connection.commit();
    await establishSession(req, insertUser.insertId);
    return res.status(201).json({ user: { id: insertUser.insertId, username, email, fullName, role: 'user' }, account });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username or email is already registered.' });
    return next(error);
  } finally {
    connection.release();
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;
  if (!emailPattern.test(email) || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'Enter a valid email and password.' });
  }
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, email, full_name, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    const matches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!matches) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await establishSession(req, user.id);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res, next) => {
  if (!req.session) return res.status(204).end();
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(config.sessionCookieName, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: config.isProduction ? 'none' : 'lax',
      path: '/'
    });
    return res.status(204).end();
  });
});

router.post('/reset-password/request', authLimiter, async (req, res, next) => {
  const email = normalizeEmail(req.body.email);
  if (!emailPattern.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (config.isProduction) {
    return res.status(503).json({ error: 'Password reset is unavailable because this learning project has no email delivery provider.' });
  }
  try {
    const [users] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!users[0]) return res.json({ message: 'If that email is registered, reset instructions would be sent. This learning project does not send email.' });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + config.resetTokenTtlMinutes * 60 * 1000);
    await pool.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [users[0].id]);
    await pool.execute(
      'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      [tokenHash, users[0].id, expiresAt]
    );
    const response = { message: 'If that email is registered, reset instructions would be sent. This learning project does not send email.' };
    if (!config.isProduction) response.developmentResetToken = rawToken;
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.post('/reset-password', authLimiter, async (req, res, next) => {
  const { token, newPassword } = req.body;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ error: 'A valid reset token is required.' });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'Password needs 8+ characters, uppercase, lowercase, a number, and a symbol.' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [tokens] = await connection.execute(
      'SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE',
      [tokenHash]
    );
    if (!tokens[0]) {
      await connection.rollback();
      return res.status(400).json({ error: 'This reset token is invalid or expired.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await connection.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, tokens[0].user_id]);
    await connection.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = ?', [tokenHash]);
    await connection.commit();
    return res.json({ message: 'Password updated. Sign in with your new password.' });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

module.exports = router;
