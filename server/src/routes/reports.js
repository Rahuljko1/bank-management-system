const { Router } = require('express');
const { requireUser } = require('../middleware/session-user');
const { loadUserReport } = require('../utils/user-report');

const router = Router();
router.use(requireUser);

router.get('/reports/overview', async (req, res, next) => {
  try {
    const report = await loadUserReport(req.session.userId);
    return res.json({ ...report, fictional: true });
  } catch (error) { return next(error); }
});

module.exports = router;
