const { Router } = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/require-admin');
const { parseId } = require('../utils/ids');
const { buildLedgerFilters, LEDGER_SELECT } = require('../utils/ledger-query');
const { loadUserReport } = require('../utils/user-report');
const { formatMoney } = require('../utils/money');

const router = Router();
router.use('/admin', requireAdmin);

const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

function likeTerm(value) {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

router.get('/admin/summary', async (req, res, next) => {
  try {
    const [[users]] = await pool.execute("SELECT COUNT(*) AS total FROM users WHERE username <> 'fictional_billers'");
    const [[accounts]] = await pool.execute(
      "SELECT COUNT(*) AS total FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.username <> 'fictional_billers'"
    );
    const [[transfers]] = await pool.execute(
      "SELECT COUNT(DISTINCT t.transfer_id) AS total FROM transactions t WHERE t.category = 'transfer'"
    );
    const [[balance]] = await pool.execute(
      "SELECT COALESCE(SUM(a.balance), 0) AS total FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.username <> 'fictional_billers'"
    );
    const [[bills]] = await pool.execute('SELECT COUNT(*) AS total FROM bill_payments WHERE response_json IS NOT NULL');
    const [[openTickets]] = await pool.execute("SELECT COUNT(*) AS total FROM support_tickets WHERE status IN ('open', 'in_progress')");
    return res.json({
      fictional: true,
      users: Number(users.total),
      accounts: Number(accounts.total),
      transfers: Number(transfers.total),
      totalBalance: formatMoney(balance.total),
      billPayments: Number(bills.total),
      openTickets: Number(openTickets.total)
    });
  } catch (error) { return next(error); }
});

router.get('/admin/users', async (req, res, next) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const term = likeTerm(search);
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.email, u.full_name AS fullName, u.role, u.created_at AS createdAt
        FROM users u
        WHERE u.username <> 'fictional_billers'
          AND (? = '' OR u.username LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\' OR u.full_name LIKE ? ESCAPE '\\\\')
        ORDER BY u.id DESC
        LIMIT 50`,
      [search, term, term, term]
    );
    return res.json({ users: rows });
  } catch (error) { return next(error); }
});

router.get('/admin/users/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'A valid user id is required.' });
  try {
    const [users] = await pool.execute(
      "SELECT id, username, email, full_name AS fullName, role, created_at AS createdAt FROM users WHERE id = ? AND username <> 'fictional_billers'",
      [id]
    );
    if (!users[0]) return res.status(404).json({ error: 'User was not found.' });
    const [accounts] = await pool.execute(
      'SELECT id, account_number AS accountNumber, ifsc, account_type AS accountType, balance, currency, status FROM accounts WHERE user_id = ? ORDER BY id',
      [id]
    );
    const filters = buildLedgerFilters(id, {});
    const [transactions] = await pool.execute(`${LEDGER_SELECT} WHERE ${filters.where} ORDER BY t.created_at DESC, t.id DESC LIMIT 20`, filters.params);
    return res.json({ user: users[0], accounts, transactions });
  } catch (error) { return next(error); }
});

router.get('/admin/users/:id/transactions', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'A valid user id is required.' });
  const filters = buildLedgerFilters(id, req.query);
  if (filters.error) return res.status(400).json({ error: filters.error });
  try {
    const [owners] = await pool.execute("SELECT id FROM users WHERE id = ? AND username <> 'fictional_billers'", [id]);
    if (!owners[0]) return res.status(404).json({ error: 'User was not found.' });
    const [rows] = await pool.execute(
      `${LEDGER_SELECT} WHERE ${filters.where} ORDER BY t.created_at DESC, t.id DESC LIMIT 100`,
      filters.params
    );
    return res.json({ transactions: rows });
  } catch (error) { return next(error); }
});

router.get('/admin/users/:id/reports', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'A valid user id is required.' });
  try {
    const [owners] = await pool.execute("SELECT id FROM users WHERE id = ? AND username <> 'fictional_billers'", [id]);
    if (!owners[0]) return res.status(404).json({ error: 'User was not found.' });
    const report = await loadUserReport(id);
    return res.json({ ...report, fictional: true, userId: id });
  } catch (error) { return next(error); }
});

router.patch('/admin/accounts/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  const status = req.body?.status;
  if (!id) return res.status(400).json({ error: 'A valid account id is required.' });
  if (!['active', 'blocked'].includes(status)) return res.status(400).json({ error: 'Status must be active or blocked.' });
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, u.username FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.id = ?`,
      [id]
    );
    if (!rows[0] || rows[0].username === 'fictional_billers') {
      return res.status(404).json({ error: 'Account was not found.' });
    }
    await pool.execute('UPDATE accounts SET status = ? WHERE id = ?', [status, id]);
    const [accounts] = await pool.execute(
      'SELECT id, user_id AS userId, account_number AS accountNumber, ifsc, account_type AS accountType, balance, currency, status FROM accounts WHERE id = ?',
      [id]
    );
    return res.json({ account: accounts[0] });
  } catch (error) { return next(error); }
});

router.get('/admin/tickets', async (req, res, next) => {
  const status = req.query.status;
  if (status && !TICKET_STATUSES.includes(status)) return res.status(400).json({ error: 'Ticket status is not valid.' });
  try {
    const filters = [];
    const params = [];
    if (status) { filters.push('t.status = ?'); params.push(status); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT t.id, t.user_id AS userId, u.username, u.email, t.subject, t.message, t.status, t.created_at AS createdAt, t.updated_at AS updatedAt
        FROM support_tickets t JOIN users u ON u.id = t.user_id
        ${where}
        ORDER BY t.updated_at DESC, t.id DESC
        LIMIT 100`,
      params
    );
    return res.json({ tickets: rows });
  } catch (error) { return next(error); }
});

router.patch('/admin/tickets/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  const status = req.body?.status;
  if (!id) return res.status(400).json({ error: 'A valid ticket id is required.' });
  if (!TICKET_STATUSES.includes(status)) return res.status(400).json({ error: 'Ticket status is not valid.' });
  try {
    const [result] = await pool.execute('UPDATE support_tickets SET status = ? WHERE id = ?', [status, id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Ticket was not found.' });
    const [rows] = await pool.execute(
      `SELECT t.id, t.user_id AS userId, t.subject, t.message, t.status, t.created_at AS createdAt, t.updated_at AS updatedAt
        FROM support_tickets t WHERE t.id = ?`,
      [id]
    );
    return res.json({ ticket: rows[0] });
  } catch (error) { return next(error); }
});

module.exports = router;
