const crypto = require('node:crypto');
const { parseAmountCents } = require('./validation');

const idempotencyKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readTransferInput(body) {
  const sourceId = String(body.fromAccountId ?? '');
  const fromAccountId = /^\d+$/.test(sourceId) ? Number(sourceId) : NaN;
  const receiverNumber = typeof body.toAccountNumber === 'string' ? body.toAccountNumber.trim() : '';
  const receiverIfsc = typeof body.toIfsc === 'string' ? body.toIfsc.trim().toUpperCase() : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 120) : '';
  const cents = parseAmountCents(body.amount);
  if (!Number.isSafeInteger(fromAccountId) || fromAccountId < 1) return { error: 'Select a valid source account.' };
  if (!/^\d{12}$/.test(receiverNumber)) return { error: 'Receiver account number must contain 12 digits.' };
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(receiverIfsc)) return { error: 'Enter a valid IFSC.' };
  if (cents === null || cents <= 0n) return { error: 'Amount must be greater than zero.' };
  const value = { fromAccountId, toAccountNumber: receiverNumber, toIfsc: receiverIfsc, note, cents };
  value.requestHash = crypto.createHash('sha256').update(JSON.stringify({
    fromAccountId,
    toAccountNumber: receiverNumber,
    toIfsc: receiverIfsc,
    amountCents: cents.toString(),
    note
  })).digest('hex');
  return { value };
}

function readIdempotencyKey(headerValue) {
  const idempotencyKey = headerValue || '';
  if (!idempotencyKeyPattern.test(idempotencyKey)) return { error: 'A valid Idempotency-Key UUID is required.' };
  return { idempotencyKey };
}

module.exports = { idempotencyKeyPattern, readTransferInput, readIdempotencyKey };
