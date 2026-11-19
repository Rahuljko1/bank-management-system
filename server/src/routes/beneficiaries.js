const { Router } = require('express');
const pool = require('../db');
const { requireUser } = require('../middleware/session-user');
const { parseId } = require('../utils/ids');

const router = Router();
router.use(requireUser);

const BENEFICIARY_SELECT = `SELECT id, nickname, account_holder AS accountHolder, account_number AS accountNumber, ifsc, created_at AS createdAt, updated_at AS updatedAt FROM beneficiaries`;

function readBeneficiary(body) {
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  const accountHolder = typeof body.accountHolder === 'string' ? body.accountHolder.trim() : '';
  const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.trim() : '';
  const ifsc = typeof body.ifsc === 'string' ? body.ifsc.trim().toUpperCase() : '';
  if (nickname.length < 2 || nickname.length > 60) return { error: 'Nickname must be 2–60 characters.' };
  if (accountHolder.length < 2 || accountHolder.length > 100) return { error: 'Account holder name must be 2–100 characters.' };
  if (!/^\d{12}$/.test(accountNumber)) return { error: 'Receiver account number must contain 12 digits.' };
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return { error: 'Enter a valid IFSC.' };
  return { value: { nickname, accountHolder, accountNumber, ifsc } };
}

router.get('/beneficiaries', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`${BENEFICIARY_SELECT} WHERE user_id = ? ORDER BY nickname, id`, [req.session.userId]);
    return res.json({ beneficiaries: rows });
  } catch (error) { return next(error); }
});

router.post('/beneficiaries', async (req, res, next) => {
  const parsed = readBeneficiary(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { nickname, accountHolder, accountNumber, ifsc } = parsed.value;
  try {
    const [result] = await pool.execute(
      'INSERT INTO beneficiaries (user_id, nickname, account_holder, account_number, ifsc) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, nickname, accountHolder, accountNumber, ifsc]
    );
    const [rows] = await pool.execute(`${BENEFICIARY_SELECT} WHERE id = ? AND user_id = ?`, [result.insertId, req.session.userId]);
    return res.status(201).json({ beneficiary: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That account is already saved.' });
    return next(error);
  }
});

router.put('/beneficiaries/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  const parsed = readBeneficiary(req.body || {});
  if (!id) return res.status(400).json({ error: 'A valid beneficiary id is required.' });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { nickname, accountHolder, accountNumber, ifsc } = parsed.value;
  try {
    const [result] = await pool.execute(
      'UPDATE beneficiaries SET nickname = ?, account_holder = ?, account_number = ?, ifsc = ? WHERE id = ? AND user_id = ?',
      [nickname, accountHolder, accountNumber, ifsc, id, req.session.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Beneficiary was not found.' });
    const [rows] = await pool.execute(`${BENEFICIARY_SELECT} WHERE id = ? AND user_id = ?`, [id, req.session.userId]);
    return res.json({ beneficiary: rows[0] });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That account is already saved.' });
    return next(error);
  }
});

router.delete('/beneficiaries/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'A valid beneficiary id is required.' });
  try {
    const [result] = await pool.execute('DELETE FROM beneficiaries WHERE id = ? AND user_id = ?', [id, req.session.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Beneficiary was not found.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

module.exports = router;
