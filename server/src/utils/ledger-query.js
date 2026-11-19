const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const LEDGER_FROM = `FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  JOIN accounts cp ON cp.id = t.counterparty_account_id`;

const LEDGER_SELECT = `SELECT t.id, t.transfer_id AS transferId, t.type, t.category, t.amount, t.currency, t.status, t.description, cp.account_number AS counterpartyAccount, t.created_at AS createdAt ${LEDGER_FROM}`;

function buildLedgerFilters(userId, query) {
  const type = query.type;
  if (type && !['credit', 'debit'].includes(type)) return { error: 'Type must be credit or debit.' };
  const from = query.from;
  const to = query.to;
  if ((from && !datePattern.test(String(from))) || (to && !datePattern.test(String(to)))) {
    return { error: 'Dates must use YYYY-MM-DD format.' };
  }
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  const filters = ['a.user_id = ?'];
  const params = [userId];
  if (type) { filters.push('t.type = ?'); params.push(type); }
  if (from) { filters.push('t.created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (to) { filters.push('t.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${to} 00:00:00`); }
  if (search) {
    filters.push('(t.description LIKE ? OR cp.account_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  return { where: filters.join(' AND '), params };
}

module.exports = { LEDGER_FROM, LEDGER_SELECT, buildLedgerFilters };
