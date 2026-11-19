const { Router } = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireUser } = require('../middleware/session-user');
const { parseId } = require('../utils/ids');
const { parseAmountCents, centsToAmount } = require('../utils/validation');
const { readIdempotencyKey } = require('../utils/transfer-input');
const { generateFictionalAccount } = require('../utils/fictional-account');

const router = Router();
router.use(requireUser);

const CATEGORIES = {
  electricity: 'Electricity',
  mobile: 'Mobile recharge',
  broadband: 'Broadband',
  gas: 'Gas',
  insurance: 'Insurance'
};

function readBill(body) {
  const accountId = parseId(body.fromAccountId);
  const category = typeof body.category === 'string' ? body.category.trim().toLowerCase() : '';
  const consumerReference = typeof body.consumerReference === 'string' ? body.consumerReference.trim() : '';
  const cents = parseAmountCents(body.amount);
  if (!accountId) return { error: 'Select a valid source account.' };
  if (!CATEGORIES[category]) return { error: 'Choose a fictional bill category.' };
  if (!/^[A-Za-z0-9-]{4,40}$/.test(consumerReference)) return { error: 'Enter a 4–40 character demo consumer reference.' };
  if (cents === null || cents <= 0n) return { error: 'Amount must be greater than zero.' };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({
    fromAccountId: accountId,
    category,
    consumerReference,
    amountCents: cents.toString()
  })).digest('hex');
  return { value: { accountId, category, consumerReference, cents, requestHash } };
}

function storedResponse(row) {
  if (!row) return null;
  return typeof row.response === 'string' ? JSON.parse(row.response) : row.response;
}

async function ensureBillerAccountId() {
  const [existing] = await pool.execute(
    `SELECT a.id FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.username = 'fictional_billers' ORDER BY a.id LIMIT 1`
  );
  if (existing[0]) return existing[0].id;

  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute("SELECT id FROM users WHERE username = 'fictional_billers' LIMIT 1 FOR UPDATE");
    let userId = users[0]?.id;
    if (!userId) {
      const [created] = await connection.execute(
        "INSERT INTO users (username, email, full_name, password_hash, role) VALUES ('fictional_billers', 'billers@smartbank.invalid', 'Fictional Billers', ?, 'user')",
        [passwordHash]
      );
      userId = created.insertId;
    }
    const [accounts] = await connection.execute('SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1 FOR UPDATE', [userId]);
    if (accounts[0]) {
      await connection.commit();
      return accounts[0].id;
    }
    let accountId;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateFictionalAccount();
      try {
        const [inserted] = await connection.execute(
          "INSERT INTO accounts (user_id, account_number, ifsc, account_type, balance, currency, status) VALUES (?, ?, ?, 'current', 0.00, 'INR', 'active')",
          [userId, candidate.accountNumber, candidate.ifsc]
        );
        accountId = inserted.insertId;
        break;
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY' || attempt === 4) throw error;
      }
    }
    await connection.commit();
    return accountId;
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const [again] = await pool.execute(
        `SELECT a.id FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.username = 'fictional_billers' ORDER BY a.id LIMIT 1`
      );
      if (again[0]) return again[0].id;
    }
    throw error;
  } finally {
    connection.release();
  }
}

router.get('/bills', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, category, consumer_reference AS consumerReference, amount, currency, created_at AS createdAt
        FROM bill_payments WHERE user_id = ? AND response_json IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 50`,
      [req.session.userId]
    );
    return res.json({
      bills: rows.map((row) => ({ ...row, label: CATEGORIES[row.category] || row.category, fictional: true }))
    });
  } catch (error) { return next(error); }
});

router.post('/bills', async (req, res, next) => {
  const key = readIdempotencyKey(req.get('Idempotency-Key'));
  if (key.error) return res.status(400).json({ error: key.error });
  const parsed = readBill(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { accountId, category, consumerReference, cents, requestHash } = parsed.value;
  let billerAccountId;
  try {
    billerAccountId = await ensureBillerAccountId();
  } catch (error) { return next(error); }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute(
      'SELECT request_hash AS requestHash, response_json AS response FROM bill_payments WHERE user_id = ? AND idempotency_key = ? FOR UPDATE',
      [req.session.userId, key.idempotencyKey]
    );
    if (existing[0]) {
      await connection.rollback();
      if (existing[0].requestHash !== requestHash) return res.status(409).json({ error: 'This idempotency key was already used for different bill details.' });
      const previous = storedResponse(existing[0]);
      if (!previous) return res.status(409).json({ error: 'This bill payment is still being processed. Retry shortly.' });
      return res.status(200).json(previous);
    }

    const [accounts] = await connection.execute(
      'SELECT id, user_id, balance, currency, status FROM accounts WHERE id = ? OR id = ? ORDER BY id FOR UPDATE',
      [accountId, billerAccountId]
    );
    const sender = accounts.find((account) => Number(account.id) === accountId && Number(account.user_id) === Number(req.session.userId));
    const biller = accounts.find((account) => Number(account.id) === Number(billerAccountId));
    if (!sender) { await connection.rollback(); return res.status(404).json({ error: 'Source account was not found.' }); }
    if (sender.status === 'blocked') { await connection.rollback(); return res.status(403).json({ error: 'This fictional account is blocked and cannot send payments.' }); }
    if (!biller) { await connection.rollback(); return res.status(500).json({ error: 'The fictional biller account is unavailable.' }); }
    const senderCents = parseAmountCents(sender.balance) || 0n;
    if (senderCents < cents) { await connection.rollback(); return res.status(409).json({ error: 'Insufficient fictional balance.' }); }

    await connection.execute(
      'INSERT INTO bill_payments (user_id, account_id, idempotency_key, request_hash, category, consumer_reference, amount, currency) VALUES (?, ?, ?, ?, ?, ?, ?, \'INR\')',
      [req.session.userId, sender.id, key.idempotencyKey, requestHash, category, consumerReference, centsToAmount(cents)]
    );
    const amount = centsToAmount(cents);
    const label = CATEGORIES[category];
    const transferId = crypto.randomUUID();
    const debitDescription = `Fictional ${label} payment · ref ${consumerReference}`.slice(0, 160);
    await connection.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, sender.id]);
    await connection.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, biller.id]);
    const [debit] = await connection.execute(
      'INSERT INTO transactions (transfer_id, account_id, counterparty_account_id, type, amount, currency, status, description, category) VALUES (?, ?, ?, \'debit\', ?, \'INR\', \'completed\', ?, ?)',
      [transferId, sender.id, biller.id, amount, debitDescription, category]
    );
    await connection.execute(
      'INSERT INTO transactions (transfer_id, account_id, counterparty_account_id, type, amount, currency, status, description, category) VALUES (?, ?, ?, \'credit\', ?, \'INR\', \'completed\', ?, ?)',
      [transferId, biller.id, sender.id, amount, `Fictional biller receipt · ${label}`.slice(0, 160), category]
    );
    const [[updatedSender]] = await connection.execute('SELECT balance FROM accounts WHERE id = ?', [sender.id]);
    const result = {
      paymentId: transferId,
      status: 'completed',
      category,
      label,
      consumerReference,
      amount,
      currency: 'INR',
      fromBalance: updatedSender.balance,
      fictional: true
    };
    await connection.execute(
      'UPDATE bill_payments SET transaction_id = ?, response_json = ? WHERE user_id = ? AND idempotency_key = ?',
      [debit.insertId, JSON.stringify(result), req.session.userId, key.idempotencyKey]
    );
    await connection.commit();
    return res.status(201).json(result);
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This bill payment request is still being processed. Retry shortly.' });
    return next(error);
  } finally { connection.release(); }
});

module.exports = router;
