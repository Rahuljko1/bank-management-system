const crypto = require('node:crypto');

function createDemoOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function createOtpSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashOtp(otp, salt) {
  return crypto.createHash('sha256').update(`${salt}:${otp}`).digest('hex');
}

function otpMatches(otp, salt, expectedHash) {
  const actual = hashOtp(otp, salt);
  const left = Buffer.from(actual);
  const right = Buffer.from(String(expectedHash || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = { createDemoOtp, createOtpSalt, hashOtp, otpMatches };
