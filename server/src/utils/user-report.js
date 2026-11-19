const pool = require('../db');
const { formatMoney } = require('./money');

async function loadUserReport(userId) {
  const [monthly] = await pool.execute(
    `SELECT DATE_FORMAT(t.created_at, '%Y-%m') AS month,
        COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) AS creditTotal,
        COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) AS debitTotal,
        COUNT(*) AS txnCount
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE a.user_id = ?
      GROUP BY DATE_FORMAT(t.created_at, '%Y-%m')
      ORDER BY month DESC
      LIMIT 12`,
    [userId]
  );
  const [byType] = await pool.execute(
    `SELECT t.type, COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS txnCount
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE a.user_id = ?
      GROUP BY t.type`,
    [userId]
  );
  const [byCategory] = await pool.execute(
    `SELECT t.category, COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS txnCount
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE a.user_id = ?
      GROUP BY t.category
      ORDER BY total DESC, t.category`,
    [userId]
  );
  return {
    monthly: monthly.map((row) => ({
      month: row.month,
      credit: formatMoney(row.creditTotal),
      debit: formatMoney(row.debitTotal),
      count: Number(row.txnCount)
    })).reverse(),
    byType: byType.map((row) => ({
      type: row.type,
      total: formatMoney(row.total),
      count: Number(row.txnCount)
    })),
    byCategory: byCategory.map((row) => ({
      category: row.category,
      total: formatMoney(row.total),
      count: Number(row.txnCount)
    }))
  };
}

module.exports = { loadUserReport };
