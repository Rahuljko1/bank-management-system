import { api, json, formatRupeeAmount, dateText, showMessage } from './api.js';

const row = (values) => {
  const tr = document.createElement('tr');
  values.forEach((value) => { const td = document.createElement('td'); td.textContent = value ?? ''; tr.append(td); });
  return tr;
};

export function showAdminNav() {
  const menu = document.querySelector('#primary-navigation ul');
  if (!menu || menu.querySelector('[data-admin-link]')) return;
  const li = document.createElement('li');
  li.innerHTML = '<a data-admin-link href="admin.html">Admin</a>';
  menu.append(li);
}

export async function renderDashboardReports() {
  const target = document.querySelector('[data-report-summary]');
  if (!target) return;
  try {
    const report = await api('/reports/overview');
    target.replaceChildren();
    const highest = Math.max(1, ...report.monthly.flatMap((r) => [Number(r.credit), Number(r.debit)]));
    const monthly = document.createElement('div'); const monthlyTitle = document.createElement('h3'); monthlyTitle.textContent = 'Monthly credit / debit chart'; monthly.append(monthlyTitle);
    const chart = document.createElement('div'); chart.className = 'report-bars'; chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', 'Monthly fictional credit and debit totals');
    (report.monthly.length ? report.monthly : [{ month: 'No activity', credit: 0, debit: 0, count: 0 }]).forEach((r) => {
      const item = document.createElement('div'); item.className = 'report-bar-group';
      const label = document.createElement('span'); label.textContent = r.month; const credit = document.createElement('i'); credit.className = 'credit-bar'; credit.style.height = `${Math.max(3, Number(r.credit) / highest * 100)}%`; credit.title = `Credit ${formatRupeeAmount(r.credit)}`;
      const debit = document.createElement('i'); debit.className = 'debit-bar'; debit.style.height = `${Math.max(3, Number(r.debit) / highest * 100)}%`; debit.title = `Debit ${formatRupeeAmount(r.debit)}`;
      item.append(credit, debit, label); chart.append(item);
    });
    monthly.append(chart); target.append(monthly);
    const sections = [['By category', report.byCategory.map((r) => `${r.category}: ${formatRupeeAmount(r.total)} (${r.count})`)]];
    for (const [title, values] of sections) {
      const block = document.createElement('div'); const heading = document.createElement('h3'); heading.textContent = title;
      const list = document.createElement('ul');
      (values.length ? values : ['No fictional activity yet.']).forEach((text) => { const item = document.createElement('li'); item.textContent = text; list.append(item); });
      block.append(heading, list); target.append(block);
    }
  } catch { target.textContent = 'Reports are unavailable while the API is offline.'; }
}

async function initBeneficiaries() {
  const form = document.querySelector('#beneficiary-form'); const body = document.querySelector('[data-beneficiary-rows]');
  const message = document.querySelector('[data-api-message]'); let editingId = null;
  const load = async () => {
    const { beneficiaries } = await api('/beneficiaries'); body.replaceChildren();
    if (!beneficiaries.length) body.append(row(['No saved beneficiaries', '', '', '', '']));
    beneficiaries.forEach((b) => {
      const tr = row([b.nickname, b.accountHolder, b.accountNumber, b.ifsc]); const actions = document.createElement('td');
      for (const [label, handler] of [['Edit', () => { editingId = b.id; form.elements.nickname.value = b.nickname; form.elements.accountHolder.value = b.accountHolder; form.elements.accountNumber.value = b.accountNumber; form.elements.ifsc.value = b.ifsc; form.querySelector('button[type="submit"]').textContent = 'Save beneficiary'; }], ['Delete', async () => { if (!confirm(`Delete ${b.nickname}?`)) return; await api(`/beneficiaries/${b.id}`, { method: 'DELETE' }); await load(); }]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', () => handler().catch((e) => showMessage(message, e.message))); actions.append(button);
      }
      tr.append(actions); body.append(tr);
    });
  };
  form.addEventListener('submit', async (event) => { event.preventDefault(); if (!form.reportValidity()) return; const data = Object.fromEntries(new FormData(form)); try { await api(editingId ? `/beneficiaries/${editingId}` : '/beneficiaries', json(data, editingId ? 'PUT' : 'POST')); editingId = null; form.reset(); form.querySelector('button[type="submit"]').textContent = 'Save beneficiary'; showMessage(message, 'Beneficiary saved.', 'success'); await load(); } catch (e) { showMessage(message, e.message); } });
  await load();
}

async function initBills() {
  const form = document.querySelector('#bill-form'); const accounts = await api('/accounts'); const select = form.elements.fromAccountId; const message = document.querySelector('[data-api-message]');
  select.replaceChildren(); accounts.accounts.forEach((account) => { const option = new Option(`${account.accountNumber} · ${formatRupeeAmount(account.balance)}${account.status === 'blocked' ? ' · blocked' : ''}`, account.id); option.disabled = account.status === 'blocked'; select.add(option); });
  const load = async () => { const { bills } = await api('/bills'); const body = document.querySelector('[data-bill-rows]'); body.replaceChildren(); if (!bills.length) body.append(row(['No fictional bill payments yet.', '', '', ''])); bills.forEach((b) => body.append(row([dateText(b.createdAt), b.label, b.consumerReference, formatRupeeAmount(b.amount)]))); };
  form.addEventListener('submit', async (event) => { event.preventDefault(); if (!form.reportValidity()) return; const data = Object.fromEntries(new FormData(form)); if (!confirm(`Complete this fictional ${data.category} payment of ${formatRupeeAmount(data.amount)}?`)) return; const button = form.querySelector('[type="submit"]'); button.disabled = true; try { const result = await api('/bills', { ...json(data), headers: { 'Idempotency-Key': crypto.randomUUID() } }); showMessage(message, `Fictional payment complete. Reference: ${result.paymentId}`, 'success'); form.reset(); await load(); } catch (e) { showMessage(message, e.message); } finally { button.disabled = false; } });
  await load();
}

async function initSupport() {
  const form = document.querySelector('#ticket-form'); const body = document.querySelector('[data-ticket-rows]'); const message = document.querySelector('[data-api-message]');
  const load = async () => { const { tickets } = await api('/tickets'); body.replaceChildren(); if (!tickets.length) body.append(row(['No support tickets yet.', '', '', ''])); tickets.forEach((t) => body.append(row([dateText(t.createdAt), t.subject, t.status, t.message]))); };
  form.addEventListener('submit', async (event) => { event.preventDefault(); if (!form.reportValidity()) return; try { await api('/tickets', json(Object.fromEntries(new FormData(form)))); form.reset(); showMessage(message, 'Your fictional support ticket was created.', 'success'); await load(); } catch (e) { showMessage(message, e.message); } });
  await load();
}

async function initAdminLogin() {
  const form = document.querySelector('#admin-login-form'); const message = document.querySelector('[data-api-message]');
  form.addEventListener('submit', async (event) => { event.preventDefault(); if (!form.reportValidity()) return; try { await api('/login', json(Object.fromEntries(new FormData(form)))); const { user } = await api('/me'); if (user.role !== 'admin') { await api('/logout', { method: 'POST' }); throw new Error('This account does not have admin access.'); } location.assign('admin.html'); } catch (e) { showMessage(message, e.message); } });
}

async function initAdmin() {
  const message = document.querySelector('[data-api-message]'); const summary = await api('/admin/summary');
  document.querySelector('[data-admin-summary]').textContent = `${summary.users} users · ${summary.accounts} accounts · ${summary.transfers} transfers · ${formatRupeeAmount(summary.totalBalance)} fictional balance`;
  const userBody = document.querySelector('[data-admin-users]'); const detail = document.querySelector('[data-admin-detail]');
  const loadUsers = async (search = '') => { const data = await api(`/admin/users?search=${encodeURIComponent(search)}`); userBody.replaceChildren(); data.users.forEach((u) => { const tr = row([u.id, u.fullName, u.email, u.role]); const action = document.createElement('td'); const button = document.createElement('button'); button.type = 'button'; button.textContent = 'View'; button.addEventListener('click', () => showUser(u.id)); action.append(button); tr.append(action); userBody.append(tr); }); };
  const showUser = async (id) => { try { const data = await api(`/admin/users/${id}`); detail.replaceChildren(); const heading = document.createElement('h2'); heading.textContent = `${data.user.fullName} — accounts`; detail.append(heading); data.accounts.forEach((a) => { const p = document.createElement('p'); const button = document.createElement('button'); button.type = 'button'; button.textContent = a.status === 'active' ? 'Block' : 'Activate'; button.addEventListener('click', async () => { await api(`/admin/accounts/${a.id}`, json({ status: a.status === 'active' ? 'blocked' : 'active' }, 'PATCH')); await showUser(id); }); p.textContent = `${a.accountNumber} · ${formatRupeeAmount(a.balance)} · ${a.status} `; p.append(button); detail.append(p); }); } catch (e) { showMessage(message, e.message); } };
  document.querySelector('#admin-user-search').addEventListener('submit', (event) => { event.preventDefault(); loadUsers(event.currentTarget.elements.search.value).catch((e) => showMessage(message, e.message)); });
  const ticketBody = document.querySelector('[data-admin-tickets]'); const loadTickets = async () => { const { tickets } = await api('/admin/tickets'); ticketBody.replaceChildren(); tickets.forEach((t) => { const tr = row([t.id, t.username, t.subject, t.status]); const action = document.createElement('td'); const select = document.createElement('select'); ['open', 'in_progress', 'resolved', 'closed'].forEach((status) => select.add(new Option(status, status, false, status === t.status))); select.addEventListener('change', async () => { await api(`/admin/tickets/${t.id}`, json({ status: select.value }, 'PATCH')); await loadTickets(); }); action.append(select); tr.append(action); ticketBody.append(tr); }); };
  await Promise.all([loadUsers(), loadTickets()]);
}

export async function initFeaturePages({ page }) {
  if (page === 'beneficiaries') return initBeneficiaries();
  if (page === 'bills') return initBills();
  if (page === 'support') return initSupport();
  if (page === 'admin-login') return initAdminLogin();
  if (page === 'admin') return initAdmin();
}
