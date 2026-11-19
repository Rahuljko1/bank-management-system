function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '0.00';
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return '0.00';
  const [whole, fraction = ''] = text.split('.');
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

module.exports = { formatMoney };
