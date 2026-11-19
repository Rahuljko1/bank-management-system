import { api, json, showMessage } from './api.js';

const loginBox = document.querySelector('#login-box');
const signupBox = document.querySelector('#signup-box');
const message = document.querySelector('#auth-message');
const setMode = (mode) => {
  const signup = mode === 'signup';
  loginBox.classList.toggle('hide', signup);
  signupBox.classList.toggle('hide', !signup);
  window.history.replaceState(null, '', signup ? '#signup' : '#login');
  showMessage(message, '');
};

document.querySelector('#show-signup')?.addEventListener('click', () => setMode('signup'));
document.querySelector('#show-login')?.addEventListener('click', () => setMode('login'));

async function submitForm(form, endpoint, data) {
  const button = form.querySelector('[type="submit"]');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Please wait…';
  showMessage(message, '');
  try {
    await api(endpoint, json(data));
    const allowedReturnPages = new Set(['dashboard.html', 'accounts.html', 'transactions.html', 'transfer.html', 'profile.html', 'beneficiaries.html', 'bills.html', 'support.html', 'admin.html']);
    const requestedPage = new URLSearchParams(window.location.search).get('returnTo');
    window.location.assign(allowedReturnPages.has(requestedPage) ? requestedPage : 'dashboard.html');
  } catch (error) {
    showMessage(message, error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

document.querySelector('#login-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  submitForm(form, '/login', { email: form.elements.email.value, password: form.elements.password.value });
});

document.querySelector('#signup-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  submitForm(form, '/register', {
    username: form.elements.username.value,
    email: form.elements.email.value,
    fullName: form.elements.fullName.value,
    password: form.elements.password.value
  });
});

setMode(window.location.hash === '#signup' ? 'signup' : 'login');
