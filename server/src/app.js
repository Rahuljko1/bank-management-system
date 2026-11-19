const express = require('express');
const path = require('node:path');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const bankingRoutes = require('./routes/banking');
const beneficiaryRoutes = require('./routes/beneficiaries');
const billRoutes = require('./routes/bills');
const ticketRoutes = require('./routes/tickets');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');

const app = express();
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: config.sessionTtlMinutes * 60 * 1000
});

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '20kb' }));
app.use(session({
  name: config.sessionCookieName,
  secret: config.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    maxAge: config.sessionTtlMinutes * 60 * 1000,
    path: '/'
  }
}));

// Cookie-authenticated state changes must originate from the configured frontend.
// Requiring Origin prevents cross-site form submissions from exercising a session.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('Origin');
  if (!origin || !config.allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'A trusted request origin is required.' });
  }
  return next();
});

app.get('/health', async (req, res, next) => {
  try { await pool.query('SELECT 1'); return res.json({ status: 'ok', database: 'connected' }); }
  catch (error) { return next(error); }
});
// Serve the static frontend before protected route middleware. API paths have
// no matching static files, so they continue to the API routers below.
app.use(express.static(path.resolve(__dirname, '../..')));
app.use(authRoutes);
app.use(bankingRoutes);
app.use(beneficiaryRoutes);
app.use(billRoutes);
app.use(ticketRoutes);
app.use(reportRoutes);
app.use(adminRoutes);
app.use((req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  if (error.message === 'Origin is not allowed by CORS.') return res.status(403).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: 'Server error. Please try again.' });
});

module.exports = app;
