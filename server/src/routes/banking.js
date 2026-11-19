const { Router } = require('express');
const crypto = require('node:crypto');
const pool = require('../db');
const config = require('../config');
const { requireUser } = require('../middleware/session-user');
const { emailPattern, normalizeEmail, centsToAmount, parseAmountCents } = require('../utils/validation');
const { buildLedgerFilters, LEDGER_SELECT, LEDGER_FROM } = require('../utils/ledger-query');
const { readTransferInput, readIdempotencyKey } = require('../utils/transfer-input');
const { toCsv } = require('../utils/csv');
const { createDemoOtp, createOtpSalt, hashOtp, otpMatches } = require('../utils/otp');
const { parseId } = require('../utils/ids');

const router = Router();
router.use(requireUser);

function previousJson(row) {
  if (!row?.response) return null;
  return typeof row.response === 'string' ? JSON.parse(row.response) : row.response;
}

router.get('/accounts', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, account_number AS accountNumber, ifsc, account_type AS accountType, balance, currency, status FROM accounts WHERE user_id = ? ORDER BY id',
      [req.session.userId]
    );
    return res.json({ accounts: rows });
  } catch (error) { return next(error); }
});

router.get('/transactions/export', async (req, res, next) => {
  const filters = buildLedgerFilters(req.session.userId, req.query);
  if (filters.error) return res.status(400).json({ error: filters.error });
  try {
    const [rows] = await pool.execute(
      `${LEDGER_SELECT} WHERE ${filters.where} ORDER BY t.created_at DESC, t.id DESC LIMIT 5000`,
      filters.params
    );
    const csv = toCsv(
      ['Date', 'Description', 'Category', 'Type', 'Amount', 'Currency', 'Status', 'Counterparty', 'Fictional'],
      rows.map((row) => [row.createdAt, row.description, row.category, row.type, row.amount, row.currency, row.status, row.counterpartyAccount, 'yes'])
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fictional-transactions.csv"');
    return res.send(csv);
  } catch (error) { return next(error); }
});

router.get('/transactions', async (req, res, next) => {
  const page = Number.parseInt(req.query.page || '1', 10);
  const limit = Number.parseInt(req.query.limit || '10', 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'Page must be positive and limit must be between 1 and 100.' });
  }
  const filters = buildLedgerFilters(req.session.userId, req.query);
  if (filters.error) return res.status(400).json({ error: filters.error });
  try {
    const [[count]] = await pool.execute(`SELECT COUNT(*) AS total ${LEDGER_FROM} WHERE ${filters.where}`, filters.params);
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute(
      `${LEDGER_SELECT} WHERE ${filters.where} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
      [...filters.params, limit, offset]
    );
    return res.json({ transactions: rows, pagination: { page, limit, total: count.total, pages: Math.ceil(count.total / limit) } });
  } catch (error) { return next(error); }
});

router.post('/transfer-challenges', async (req, res, next) => {
  const key = readIdempotencyKey(req.get('Idempotency-Key'));
  if (key.error) return res.status(400).json({ error: key.error });
  const parsed = readTransferInput(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const transfer = parsed.value;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [completed] = await connection.execute(
      'SELECT request_hash AS requestHash, response_json AS response FROM transfer_requests WHERE user_id = ? AND idempotency_key = ? FOR UPDATE',
      [req.session.userId, key.idempotencyKey]
    );
    if (completed[0]?.response && completed[0].requestHash === transfer.requestHash) {
      await connection.rollback();
      return res.status(200).json({ alreadyCompleted: true, transfer: previousJson(completed[0]) });
    }
    const [accounts] = await connection.execute(
      'SELECT id, user_id, account_number, ifsc, balance, currency, status FROM accounts WHERE id = ? OR account_number = ? ORDER BY id FOR UPDATE',
      [transfer.fromAccountId, transfer.toAccountNumber]
    );
    const sender = accounts.find((account) => Number(account.id) === transfer.fromAccountId && Number(account.user_id) === Number(req.session.userId));
    const receiver = accounts.find((account) => account.account_number === transfer.toAccountNumber && account.ifsc === transfer.toIfsc);
    if (!sender) { await connection.rollback(); return res.status(404).json({ error: 'Source account was not found.' }); }
    if (sender.status === 'blocked') { await connection.rollback(); return res.status(403).json({ error: 'This fictional account is blocked and cannot send transfers.' }); }
    if (!receiver) { await connection.rollback(); return res.status(404).json({ error: 'Receiver account was not found.' }); }
    if (Number(sender.id) === Number(receiver.id)) { await connection.rollback(); return res.status(400).json({ error: 'You cannot transfer to the same account.' }); }
    if (sender.currency !== receiver.currency || sender.currency !== 'INR') { await connection.rollback(); return res.status(400).json({ error: 'These fictional accounts cannot transfer between currencies.' }); }
    const senderCents = parseAmountCents(sender.balance) || 0n;
    if (senderCents < transfer.cents) { await connection.rollback(); return res.status(409).json({ error: 'Insufficient fictional balance.' }); }

    const otp = createDemoOtp();
    const salt = createOtpSalt();
    const otpHash = hashOtp(otp, salt);
    const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60 * 1000);
    const [existing] = await connection.execute(
      'SELECT id, request_hash AS requestHash, consumed_at AS consumedAt FROM transfer_challenges WHERE user_id = ? AND idempotency_key = ? FOR UPDATE',
      [req.session.userId, key.idempotencyKey]
    );
    let challengeId;
    if (existing[0]) {
      if (existing[0].requestHash !== transfer.requestHash) {
        await connection.rollback();
        return res.status(409).json({ error: 'This idempotency key was already used for different transfer details.' });
      }
      if (existing[0].consumedAt) {
        await connection.rollback();
        return res.status(409).json({ error: 'This transfer request was already verified.' });
      }
      challengeId = existing[0].id;
      await connection.execute(
        'UPDATE transfer_challenges SET otp_salt = ?, otp_hash = ?, attempts = 0, max_attempts = ?, expires_at = ?, verified_at = NULL WHERE id = ?',
        [salt, otpHash, config.otpMaxAttempts, expiresAt, challengeId]
      );
    } else {
      const [inserted] = await connection.execute(
        'INSERT INTO transfer_challenges (user_id, idempotency_key, request_hash, otp_salt, otp_hash, max_attempts, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [req.session.userId, key.idempotencyKey, transfer.requestHash, salt, otpHash, config.otpMaxAttempts, expiresAt]
      );
      challengeId = inserted.insertId;
    }
    await connection.commit();
    console.log(`[smart-bank demo OTP] challenge ${challengeId} code ${otp} (fictional, not sent by SMS)`);
    const payload = {
      challengeId,
      expiresAt: expiresAt.toISOString(),
      attemptsRemaining: config.otpMaxAttempts,
      fictional: true
    };
    if (!config.isProduction) payload.developmentOtp = otp;
    return res.status(201).json(payload);
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally { connection.release(); }
});

router.post('/transfer', async (req, res, next) => {
  const key = readIdempotencyKey(req.get('Idempotency-Key'));
  if (key.error) return res.status(400).json({ error: key.error });
  const parsed = readTransferInput(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const challengeId = parseId(req.body?.challengeId);
  const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
  if (!challengeId) return res.status(400).json({ error: 'OTP verification is required before this transfer can be completed.' });
  if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Enter the 6-digit fictional OTP.' });
  const transfer = parsed.value;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      'SELECT request_hash AS requestHash, response_json AS response FROM transfer_requests WHERE user_id = ? AND idempotency_key = ? FOR UPDATE',
      [req.session.userId, key.idempotencyKey]
    );
    if (existing[0]) {
      await connection.rollback();
      if (existing[0].requestHash !== transfer.requestHash) return res.status(409).json({ error: 'This idempotency key was already used for different transfer details.' });
      if (!existing[0].response) return res.status(409).json({ error: 'This transfer request is still being processed. Retry shortly.' });
      return res.status(200).json(previousJson(existing[0]));
    }

    const [challenges] = await connection.execute(
      'SELECT id, request_hash AS requestHash, otp_salt AS otpSalt, otp_hash AS otpHash, attempts, max_attempts AS maxAttempts, (expires_at > NOW()) AS isCurrent, consumed_at AS consumedAt FROM transfer_challenges WHERE id = ? AND user_id = ? FOR UPDATE',
      [challengeId, req.session.userId]
    );
    const challenge = challenges[0];
    if (!challenge || challenge.requestHash !== transfer.requestHash) {
      await connection.rollback();
      return res.status(400).json({ error: 'OTP verification does not match this transfer.' });
    }
    if (challenge.consumedAt) {
      await connection.rollback();
      return res.status(409).json({ error: 'This OTP was already used.' });
    }
    if (!Number(challenge.isCurrent)) {
      await connection.rollback();
      return res.status(400).json({ error: 'This OTP has expired. Start the transfer again.' });
    }
    if (Number(challenge.attempts) >= Number(challenge.maxAttempts)) {
      await connection.rollback();
      return res.status(429).json({ error: 'Too many incorrect OTP attempts. Start the transfer again.' });
    }
    if (!otpMatches(otp, challenge.otpSalt, challenge.otpHash)) {
      await connection.execute('UPDATE transfer_challenges SET attempts = attempts + 1 WHERE id = ?', [challenge.id]);
      await connection.commit();
      const remaining = Number(challenge.maxAttempts) - Number(challenge.attempts) - 1;
      const error = remaining > 0
        ? `That OTP is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many incorrect OTP attempts. Start the transfer again.';
      return res.status(401).json({ error });
    }

    await connection.execute(
      'INSERT INTO transfer_requests (user_id, idempotency_key, request_hash) VALUES (?, ?, ?)',
      [req.session.userId, key.idempotencyKey, transfer.requestHash]
    );
    const [accounts] = await connection.execute(
      'SELECT id, user_id, account_number, ifsc, balance, currency, status FROM accounts WHERE id = ? OR account_number = ? ORDER BY id FOR UPDATE',
      [transfer.fromAccountId, transfer.toAccountNumber]
    );
    const sender = accounts.find((account) => Number(account.id) === transfer.fromAccountId && Number(account.user_id) === Number(req.session.userId));
    const receiver = accounts.find((account) => account.account_number === transfer.toAccountNumber && account.ifsc === transfer.toIfsc);
    if (!sender) { await connection.rollback(); return res.status(404).json({ error: 'Source account was not found.' }); }
    if (sender.status === 'blocked') { await connection.rollback(); return res.status(403).json({ error: 'This fictional account is blocked and cannot send transfers.' }); }
    if (!receiver) { await connection.rollback(); return res.status(404).json({ error: 'Receiver account was not found.' }); }
    if (Number(sender.id) === Number(receiver.id)) { await connection.rollback(); return res.status(400).json({ error: 'You cannot transfer to the same account.' }); }
    if (sender.currency !== receiver.currency || sender.currency !== 'INR') { await connection.rollback(); return res.status(400).json({ error: 'These fictional accounts cannot transfer between currencies.' }); }
    const senderCents = parseAmountCents(sender.balance) || 0n;
    if (senderCents < transfer.cents) { await connection.rollback(); return res.status(409).json({ error: 'Insufficient fictional balance.' }); }
    const transferId = crypto.randomUUID();
    const amount = centsToAmount(transfer.cents);
    await connection.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, sender.id]);
    await connection.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, receiver.id]);
    await connection.execute(
      'INSERT INTO transactions (transfer_id, account_id, counterparty_account_id, type, amount, currency, status, description, category) VALUES (?, ?, ?, \'debit\', ?, \'INR\', \'completed\', ?, \'transfer\'), (?, ?, ?, \'credit\', ?, \'INR\', \'completed\', ?, \'transfer\')',
      [transferId, sender.id, receiver.id, amount, transfer.note || 'Fictional transfer sent', transferId, receiver.id, sender.id, amount, 'Fictional transfer received']
    );
    const [[updatedSender]] = await connection.execute('SELECT balance FROM accounts WHERE id = ?', [sender.id]);
    const result = { transferId, status: 'completed', amount, currency: 'INR', fromBalance: updatedSender.balance };
    await connection.execute(
      'UPDATE transfer_challenges SET verified_at = NOW(), consumed_at = NOW() WHERE id = ?',
      [challenge.id]
    );
    await connection.execute(
      'UPDATE transfer_requests SET response_json = ? WHERE user_id = ? AND idempotency_key = ?',
      [JSON.stringify(result), req.session.userId, key.idempotencyKey]
    );
    await connection.commit();
    return res.status(201).json(result);
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally { connection.release(); }
});

router.put('/profile', async (req, res, next) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const email = normalizeEmail(req.body.email);
  if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: 'Full name must be 2–100 characters.' });
  if (!emailPattern.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    await pool.execute('UPDATE users SET full_name = ?, email = ? WHERE id = ?', [fullName, email, req.session.userId]);
    const [rows] = await pool.execute('SELECT id, username, email, full_name AS fullName, role FROM users WHERE id = ?', [req.session.userId]);
    return res.json({ user: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email is already in use.' });
    return next(error);
  }
});

module.exports = router;
