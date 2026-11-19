function parseId(value) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

module.exports = { parseId };
