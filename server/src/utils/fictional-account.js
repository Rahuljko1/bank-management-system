const crypto = require('node:crypto');

function generateFictionalAccount() {
  const accountNumber = String(crypto.randomInt(100000000000, 999999999999));
  const suffix = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 6);
  return { accountNumber, ifsc: `SBIN0${suffix}` };
}

module.exports = { generateFictionalAccount };
