// Local static servers use port 4000 for the API. When the Node server serves
// this frontend (including through a secure tunnel), API and frontend share one origin.
const apiProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
const isLocalStaticServer = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  && window.location.port !== '4000';
export const API_BASE = window.SMART_BANK_API || (isLocalStaticServer
  ? `${apiProtocol}//${window.location.hostname}:4000`
  : window.location.origin);

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
    });
  } catch {
    throw new Error('Cannot reach the API. Start the backend and check its address.');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export const json = (body, method = 'POST') => ({ method, body: JSON.stringify(body) });

export async function download(path, filename) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  } catch {
    throw new Error('Cannot reach the API. Start the backend and check its address.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'The download could not be completed.');
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function showMessage(target, message, state = 'error') {
  if (!target) return;
  target.textContent = message;
  target.className = `api-message ${state}`;
  target.hidden = !message;
}

export function formatRupeeAmount(amount) {
  const value = Number(amount);
  return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

export function dateText(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

