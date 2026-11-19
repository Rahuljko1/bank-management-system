const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = required('SESSION_SECRET');
if (sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters.');
}
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://127.0.0.1:5500')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
if (isProduction) {
  if (!process.env.FRONTEND_ORIGINS || !allowedOrigins.length) {
    throw new Error('Set FRONTEND_ORIGINS to the HTTPS frontend origin(s) in production.');
  }
  for (const origin of allowedOrigins) {
    let parsedOrigin;
    try { parsedOrigin = new URL(origin); }
    catch { throw new Error('Each FRONTEND_ORIGINS value must be an exact origin URL.'); }
    if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== origin) {
      throw new Error('Production FRONTEND_ORIGINS must contain exact HTTPS origins only.');
    }
  }
}
const trustProxyValue = process.env.TRUST_PROXY;
const trustProxy = trustProxyValue === 'true' ? true
  : !trustProxyValue || trustProxyValue === 'false' ? false
  : trustProxyValue && /^\d+$/.test(trustProxyValue) ? Number(trustProxyValue)
    : trustProxyValue;

module.exports = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  allowedOrigins,
  trustProxy,
  sessionSecret,
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'smartbank.sid',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || ''
  },
  fictionalStartingBalance: process.env.FICTIONAL_STARTING_BALANCE || '10000.00',
  sessionTtlMinutes: Math.max(5, Number(process.env.SESSION_TTL_MINUTES || 60)),
  resetTokenTtlMinutes: Math.max(5, Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 15)),
  otpTtlMinutes: Math.min(30, Math.max(1, Number(process.env.OTP_TTL_MINUTES || 5))),
  otpMaxAttempts: Math.min(10, Math.max(1, Number(process.env.OTP_MAX_ATTEMPTS || 5)))
};
