const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmountCents, centsToAmount } = require('../src/utils/validation');
const { createDemoOtp, createOtpSalt, hashOtp, otpMatches } = require('../src/utils/otp');

test('amounts are converted without floating point rounding', () => {
  assert.equal(parseAmountCents('10.25'), 1025n);
  assert.equal(centsToAmount(1025n), '10.25');
  assert.equal(parseAmountCents('10.999'), null);
  assert.equal(parseAmountCents('-1'), null);
});

test('OTP hashes match only the original OTP', () => {
  const otp = createDemoOtp();
  const salt = createOtpSalt();
  const hash = hashOtp(otp, salt);
  assert.equal(otpMatches(otp, salt, hash), true);
  assert.equal(otpMatches('000000', salt, hash), otp === '000000');
});
