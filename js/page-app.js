import { api, json, showMessage, formatRupeeAmount, dateText, download } from './api.js';
import { showAdminNav, renderDashboardReports, initFeaturePages } from './features.js';

const page = document.body.dataset.page;
const protectedPages = new Set(['dashboard', 'accounts', 'transactions', 'transfer', 'profile', 'beneficiaries', 'bills', 'support', 'admin']);
const message = document.querySelector('[data-api-message]');

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function setLoading(target, text = 'Loading account data…') {
  if (target) target.textContent = text;
}

async function checkSession(options = {}) {
  const loginPage = options.loginPage || 'login.html';
  try {
    const { user } = await api('/me');
    document.querySelector('.log a[href="login.html"]')?.remove();
    const logout = document.querySelector('[data-logout]');
    if (logout) logout.hidden = false;
    if (user.role === 'admin') showAdminNav();
    return user;
  }
  catch (error) {
    if (error.status === 401) {
      const returnTo = `${location.pathname.split('/').pop()}${location.search}`;
      location.replace(`${loginPage}?returnTo=${encodeURIComponent(returnTo)}`);
      return null;
    }
    showMessage(message, error.message);
    return null;
  }
}

function dashboardDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: 'Recent', datetime: '' };
  return {
    label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date),
    datetime: date.toISOString()
  };
}

function activityStatus(status) {
  if (!status) return 'Recorded';
  return `${status[0].toUpperCase()}${status.slice(1)}`;
}

function timeBasedGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function renderDashboardActivityMessage(message) {
  const ledger = document.querySelector('[data-dashboard-activity]');
  if (!ledger) return;
  ledger.replaceChildren(node('li', message, 'activity-empty'));
}

function renderDashboardActivity(transactions) {
  const ledger = document.querySelector('[data-dashboard-activity]');
  if (!ledger) return;
  ledger.replaceChildren();

  if (!transactions.length) {
    renderDashboardActivityMessage('No fictional transfers have been recorded yet.');
    return;
  }

  for (const transaction of transactions) {
    const entry = node('li', undefined, 'activity-entry');
    const when = dashboardDate(transaction.createdAt);
    const date = node('time', when.label, 'activity-date');
    if (when.datetime) date.dateTime = when.datetime;

    const copy = node('span', undefined, 'activity-copy');
    copy.append(
      node('strong', transaction.description || 'Fictional transfer'),
      node('span', `${transaction.type === 'credit' ? 'Incoming' : 'Outgoing'} · ${activityStatus(transaction.status)}`)
    );

    const sign = transaction.type === 'debit' ? '−' : '+';
    const amount = node('span', `${sign}${formatRupeeAmount(transaction.amount)}`, `activity-amount ${transaction.type}`);
    entry.append(date, copy, amount);
    ledger.append(entry);
  }
}

async function renderDashboard(user) {
  document.querySelector('[data-welcome]').textContent = `${timeBasedGreeting()}, ${user.fullName}.`;
  const summary = document.querySelector('[data-dashboard-summary]');
  const area = document.querySelector('[data-dashboard-loading]');
  setLoading(area);
  if (summary) summary.setAttribute('aria-busy', 'true');
  try {
    const [{ accounts }, { transactions }] = await Promise.all([api('/accounts'), api('/transactions?limit=3')]);
    const total = accounts.reduce((sum, account) => sum + Math.round(Number(account.balance) * 100), 0) / 100;
    document.querySelector('[data-total-balance]').textContent = formatRupeeAmount(total);
    document.querySelector('[data-account-count]').textContent = String(accounts.length);
    const latest = transactions[0];
    document.querySelector('[data-last-transaction]').textContent = latest
      ? `${latest.type === 'debit' ? '−' : '+'}${formatRupeeAmount(latest.amount)}`
      : 'No transactions yet';
    renderDashboardActivity(transactions);
    area.textContent = accounts.length ? `${accounts.length} fictional account${accounts.length === 1 ? '' : 's'} connected to your profile.` : 'No accounts found.';
    await renderDashboardReports();
  } catch (error) {
    area.textContent = 'The latest account data could not be loaded.';
    showMessage(message, error.message);
    renderDashboardActivityMessage('Recent activity is unavailable while the API is offline.');
  } finally {
    if (summary) summary.setAttribute('aria-busy', 'false');
  }
}

async function renderAccounts() {
  const container = document.querySelector('[data-accounts-list]');
  setLoading(container);
  try {
    const { accounts } = await api('/accounts');
    container.replaceChildren();
    if (!accounts.length) { container.append(node('p', 'No accounts found.')); return; }
    for (const account of accounts) {
      const card = node('article', undefined, 'box');
      card.append(node('h2', `${account.accountType[0].toUpperCase()}${account.accountType.slice(1)} fictional account`));
      card.append(node('p', `Account number: ${account.accountNumber}`));
      card.append(node('p', `IFSC: ${account.ifsc}`));
      if (account.status === 'blocked') card.append(node('p', 'Status: blocked. This fictional account cannot send transfers or pay bills.'));
      const balance = node('div', undefined, 'balance');
      balance.append(node('p', 'Available fictional balance'), node('strong', formatRupeeAmount(account.balance)));
      card.append(balance);
      const link = node('a', 'View transactions', 'button');
      link.href = 'transactions.html';
      card.append(link);
      container.append(card);
    }
  } catch (error) { container.textContent = error.message; }
}

function appendCell(row, text, className) {
  const cell = node('td', text, className);
  row.append(cell);
}

async function loadTransactions(pageNumber = 1) {
  const form = document.querySelector('#transaction-filters');
  const params = new URLSearchParams({ page: String(pageNumber), limit: '10' });
  for (const key of ['type', 'from', 'to', 'search']) {
    const value = form.elements[key].value.trim();
    if (value) params.set(key, value);
  }
  const tbody = document.querySelector('[data-transaction-rows]');
  const status = document.querySelector('[data-transaction-status]');
  tbody.replaceChildren();
  status.textContent = 'Loading transactions…';
  try {
    const data = await api(`/transactions?${params}`);
    for (const item of data.transactions) {
      const row = document.createElement('tr');
      appendCell(row, dateText(item.createdAt));
      appendCell(row, item.description);
      appendCell(row, item.category || 'transfer');
      appendCell(row, item.type[0].toUpperCase() + item.type.slice(1), item.type);
      appendCell(row, `${item.type === 'debit' ? '−' : '+'}${formatRupeeAmount(item.amount)}`);
      appendCell(row, item.status);
      tbody.append(row);
    }
    status.textContent = data.transactions.length ? `Page ${data.pagination.page} of ${Math.max(1, data.pagination.pages)} · ${data.pagination.total} entries` : 'No transactions match these filters.';
    document.querySelector('[data-page-prev]').disabled = data.pagination.page <= 1;
    document.querySelector('[data-page-next]').disabled = data.pagination.page >= data.pagination.pages;
    document.querySelector('[data-page-prev]').dataset.page = String(Math.max(1, data.pagination.page - 1));
    document.querySelector('[data-page-next]').dataset.page = String(data.pagination.page + 1);
  } catch (error) { status.textContent = error.message; }
}

async function initTransactions() {
  const form = document.querySelector('#transaction-filters');
  let currentPage = 1;
  form.addEventListener('submit', (event) => { event.preventDefault(); currentPage = 1; loadTransactions(currentPage); });
  document.querySelector('[data-export-csv]')?.addEventListener('click', async () => {
    const button = document.querySelector('[data-export-csv]');
    const params = new URLSearchParams();
    for (const key of ['type', 'from', 'to', 'search']) {
      const value = form.elements[key].value.trim();
      if (value) params.set(key, value);
    }
    button.disabled = true;
    const status = document.querySelector('[data-transaction-status]');
    const previous = status.textContent;
    status.textContent = 'Preparing fictional CSV…';
    try {
      await download(`/transactions/export?${params}`, 'fictional-transactions.csv');
      status.textContent = 'Downloaded up to 5000 matching fictional rows.';
    } catch (error) {
      status.textContent = previous;
      showMessage(message, error.message);
    } finally { button.disabled = false; }
  });
  for (const button of document.querySelectorAll('[data-page-prev], [data-page-next]')) {
    button.addEventListener('click', () => { currentPage = Number(button.dataset.page); loadTransactions(currentPage); });
  }
  await loadTransactions(currentPage);
}

async function initTransfer() {
  const form = document.querySelector('#transfer-form');
  const select = form.elements.fromAccountId;
  const beneficiarySelect = form.elements.beneficiaryId;
  const [{ accounts }, beneficiaryData] = await Promise.all([api('/accounts'), api('/beneficiaries')]);
  select.replaceChildren();
  for (const account of accounts) {
    const option = node('option', `${account.accountType} · ${account.accountNumber} · ${formatRupeeAmount(account.balance)}${account.status === 'blocked' ? ' · blocked' : ''}`);
    option.value = account.id;
    option.disabled = account.status === 'blocked';
    select.append(option);
  }
  if (!accounts.length) throw new Error('No source account is available.');
  const available = [...select.options].find((option) => !option.disabled);
  if (!available) throw new Error('Every fictional account on this profile is blocked.');
  select.value = available.value;
  beneficiarySelect.replaceChildren(node('option', 'Enter details manually'));
  beneficiarySelect.firstElementChild.value = '';
  for (const beneficiary of beneficiaryData.beneficiaries) {
    const option = node('option', `${beneficiary.nickname} · ${beneficiary.accountNumber}`);
    option.value = beneficiary.id;
    option.dataset.accountNumber = beneficiary.accountNumber;
    option.dataset.ifsc = beneficiary.ifsc;
    beneficiarySelect.append(option);
  }
  const fillBeneficiary = () => {
    const selected = beneficiarySelect.selectedOptions[0];
    const manual = !selected?.dataset.accountNumber;
    form.elements.toAccountNumber.readOnly = !manual;
    form.elements.toIfsc.readOnly = !manual;
    if (!manual) {
      form.elements.toAccountNumber.value = selected.dataset.accountNumber;
      form.elements.toIfsc.value = selected.dataset.ifsc;
    }
  };
  beneficiarySelect.addEventListener('change', fillBeneficiary);
  form.elements.toAccountNumber.addEventListener('input', () => { if (!form.elements.toAccountNumber.readOnly) beneficiarySelect.value = ''; });
  form.elements.toIfsc.addEventListener('input', () => { if (!form.elements.toIfsc.readOnly) beneficiarySelect.value = ''; });
  const review = document.querySelector('#transfer-review');
  const otpPanel = document.querySelector('#transfer-otp');
  const confirmForm = document.querySelector('#transfer-confirm-form');
  const otpForm = document.querySelector('#transfer-otp-form');
  let pending;
  let idempotencyKey;
  let challengeId;
  const showForm = () => { review.hidden = true; otpPanel.hidden = true; form.hidden = false; };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    pending = {
      fromAccountId: select.value,
      toAccountNumber: form.elements.toAccountNumber.value.trim(),
      toIfsc: form.elements.toIfsc.value.trim().toUpperCase(),
      amount: form.elements.amount.value,
      note: form.elements.note.value.trim()
    };
    idempotencyKey = crypto.randomUUID();
    challengeId = undefined;
    document.querySelector('[data-review-destination]').textContent = `${pending.toAccountNumber} · ${pending.toIfsc}`;
    document.querySelector('[data-review-amount]').textContent = formatRupeeAmount(pending.amount);
    review.hidden = false;
    otpPanel.hidden = true;
    form.hidden = true;
  });
  document.querySelector('[data-edit-transfer]').addEventListener('click', () => { idempotencyKey = undefined; challengeId = undefined; showForm(); });
  confirmForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = confirmForm.querySelector('[type="submit"]');
    button.disabled = true;
    showMessage(message, '');
    try {
      const result = await api('/transfer-challenges', { ...json(pending), headers: { 'Idempotency-Key': idempotencyKey } });
      if (result.alreadyCompleted) {
        showMessage(message, `Transfer complete. Reference: ${result.transfer.transferId}`, 'success');
        showForm();
        form.reset();
        return;
      }
      challengeId = result.challengeId;
      const demo = document.querySelector('[data-demo-otp]');
      demo.textContent = result.developmentOtp
        ? `Demo OTP: ${result.developmentOtp}`
        : 'Demo OTP was printed in the API server console. It is not sent by SMS.';
      document.querySelector('[data-otp-expiry]').textContent = `Expires ${dateText(result.expiresAt)}. ${result.attemptsRemaining} attempts.`;
      otpForm.reset();
      review.hidden = true;
      otpPanel.hidden = false;
    } catch (error) { showMessage(message, error.message); }
    finally { button.disabled = false; }
  });
  document.querySelector('[data-cancel-otp]').addEventListener('click', () => { challengeId = undefined; otpPanel.hidden = true; review.hidden = false; });
  otpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!otpForm.reportValidity()) return;
    const button = otpForm.querySelector('[type="submit"]');
    button.disabled = true;
    showMessage(message, 'Checking the fictional OTP…');
    try {
      const result = await api('/transfer', { ...json({ ...pending, challengeId, otp: otpForm.elements.otp.value.trim() }), headers: { 'Idempotency-Key': idempotencyKey } });
      showMessage(message, `Transfer complete. Reference: ${result.transferId}`, 'success');
      otpPanel.hidden = true;
      form.reset();
      beneficiarySelect.value = '';
      form.elements.toAccountNumber.readOnly = false;
      form.elements.toIfsc.readOnly = false;
      form.hidden = false;
      idempotencyKey = undefined;
      challengeId = undefined;
    } catch (error) { showMessage(message, error.message); }
    finally { button.disabled = false; }
  });
}

async function initProfile(user) {
  const form = document.querySelector('#profile-form');
  form.elements.fullName.value = user.fullName;
  form.elements.email.value = user.email;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { user: updated } = await api('/profile', json({ fullName: form.elements.fullName.value, email: form.elements.email.value }, 'PUT'));
      showMessage(message, `Profile saved for ${updated.fullName}.`, 'success');
    } catch (error) { showMessage(message, error.message); }
    finally { button.disabled = false; }
  });
  const passwordForm = document.querySelector('#change-password-form');
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!passwordForm.reportValidity()) return;
    const button = passwordForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await api('/change-password', json({ currentPassword: passwordForm.elements.currentPassword.value, newPassword: passwordForm.elements.newPassword.value }));
      passwordForm.reset();
      showMessage(message, result.message, 'success');
    } catch (error) { showMessage(message, error.message); }
    finally { button.disabled = false; }
  });
}

function initForgotPassword() {
  const requestForm = document.querySelector('#reset-request-form');
  const resetForm = document.querySelector('#reset-form');
  const output = document.querySelector('[data-reset-token]');
  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requestForm.reportValidity()) return;
    try {
      const result = await api('/reset-password/request', json({ email: requestForm.elements.email.value }));
      showMessage(message, result.message, 'success');
      if (result.developmentResetToken) {
        output.hidden = false;
        output.textContent = `Development token: ${result.developmentResetToken}`;
        resetForm.elements.token.value = result.developmentResetToken;
      }
      resetForm.hidden = false;
    } catch (error) { showMessage(message, error.message); }
  });
  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!resetForm.reportValidity()) return;
    try {
      const result = await api('/reset-password', json({ token: resetForm.elements.token.value, newPassword: resetForm.elements.newPassword.value }));
      showMessage(message, result.message, 'success');
      resetForm.reset();
    } catch (error) { showMessage(message, error.message); }
  });
}

function initLoanCalculator() {
  const form = document.querySelector('#emi-form');
  document.querySelectorAll('[data-rate]').forEach((link) => {
    link.addEventListener('click', () => {
      form.elements.rate.value = link.dataset.rate;
      form.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', () => {
    const principal = Number(form.elements.amount.value);
    const annualRate = Number(form.elements.rate.value);
    const months = Number(form.elements.months.value);
    if (!(principal > 0 && annualRate >= 0 && months > 0)) return;
    const monthlyRate = annualRate / 1200;
    const emi = monthlyRate === 0 ? principal / months : principal * monthlyRate * (1 + monthlyRate) ** months / ((1 + monthlyRate) ** months - 1);
    document.querySelector('[data-emi-result]').textContent = `${formatRupeeAmount(emi)} per month (estimate)`;
  });
}

async function start() {
  if (page === 'forgot-password') initForgotPassword();
  if (page === 'loans') initLoanCalculator();
  if (page === 'admin-login') {
    await initFeaturePages({ page, user: null });
    return;
  }
  if (!protectedPages.has(page)) return;
  const user = await checkSession(page === 'admin' ? { loginPage: 'admin-login.html' } : {});
  if (!user) return;
  if (page === 'admin' && user.role !== 'admin') {
    showMessage(message, 'This area is limited to fictional admin accounts.');
    return;
  }
  try {
    if (page === 'dashboard') await renderDashboard(user);
    if (page === 'accounts') await renderAccounts();
    if (page === 'transactions') await initTransactions();
    if (page === 'transfer') await initTransfer();
    if (page === 'profile') await initProfile(user);
    await initFeaturePages({ page, user });
  } catch (error) { showMessage(message, error.message); }
}

start();
