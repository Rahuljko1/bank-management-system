const { Router } = require('express');
const pool = require('../db');
const { requireUser } = require('../middleware/session-user');
const { parseId } = require('../utils/ids');

const router = Router();
router.use(requireUser);

const TICKET_SELECT = `SELECT id, subject, message, status, created_at AS createdAt, updated_at AS updatedAt FROM support_tickets`;

function readTicket(body) {
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (subject.length < 4 || subject.length > 120) return { error: 'Subject must be 4–120 characters.' };
  if (message.length < 10 || message.length > 2000) return { error: 'Message must be 10–2000 characters.' };
  return { value: { subject, message } };
}

router.get('/tickets', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`${TICKET_SELECT} WHERE user_id = ? ORDER BY created_at DESC, id DESC`, [req.session.userId]);
    return res.json({ tickets: rows });
  } catch (error) { return next(error); }
});

router.post('/tickets', async (req, res, next) => {
  const parsed = readTicket(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const [result] = await pool.execute(
      'INSERT INTO support_tickets (user_id, subject, message) VALUES (?, ?, ?)',
      [req.session.userId, parsed.value.subject, parsed.value.message]
    );
    const [rows] = await pool.execute(`${TICKET_SELECT} WHERE id = ? AND user_id = ?`, [result.insertId, req.session.userId]);
    return res.status(201).json({ ticket: rows[0], fictional: true });
  } catch (error) { return next(error); }
});

router.get('/tickets/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'A valid ticket id is required.' });
  try {
    const [rows] = await pool.execute(`${TICKET_SELECT} WHERE id = ? AND user_id = ?`, [id, req.session.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Ticket was not found.' });
    return res.json({ ticket: rows[0] });
  } catch (error) { return next(error); }
});

module.exports = router;
