// Shared site chrome and session actions for the static learning pages.
import { api } from './api.js';
import { showAdminNav } from './features.js';
const protectedPage = ['dashboard', 'accounts', 'transactions', 'transfer', 'profile', 'beneficiaries', 'bills', 'support', 'admin'].includes(document.body.dataset.page);
const homeHref = protectedPage ? 'dashboard.html' : 'homepage.html';
const homeLabel = protectedPage ? 'Smart Bank dashboard' : 'Smart Bank home';
const navigationLinks = protectedPage
  ? `<li><a href="dashboard.html">Overview</a></li><li><a href="accounts.html">Accounts</a></li>
      <li><a href="transactions.html">Activity</a></li><li><a href="transfer.html">Transfer</a></li>
      <li><a href="bills.html">Bills</a></li><li><a href="beneficiaries.html">Beneficiaries</a></li>
      <li><a href="support.html">Support</a></li><li><a href="profile.html">Profile</a></li>`
  : `<li><a href="homepage.html">Home</a></li><li><a href="about.html">About</a></li>
      <li><a href="payments.html">Services</a></li><li><a href="contact.html">Contact</a></li>`;
const main = document.querySelector('main');
if (main) {
  if (!main.id) main.id = 'main-content';
  const skipLink = document.createElement('a');
  skipLink.className = 'skip-link';
  skipLink.href = '#main-content';
  skipLink.textContent = 'Skip to main content';
  const fictionalBanner = document.createElement('div');
  fictionalBanner.className = 'fictional-banner';
  fictionalBanner.textContent = 'FICTIONAL SERVICE · No real banking, bill payments, cards, investments, or customer support.';
  const firstContent = document.querySelector('header') || main;
  firstContent.before(skipLink, fictionalBanner);
}

const header = document.querySelector('header');
if (header && !header.classList.contains('bank-header')) {
  header.className = 'bank-header';
  header.innerHTML = `
    <a class="logo" href="${homeHref}" aria-label="${homeLabel}">
      <span class="name"><span class="brand-name">SMART BANK</span><span class="tagline">Banking made simple</span></span>
    </a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation" aria-label="Open navigation menu"><span></span><span></span><span></span></button>
    <nav class="menu" id="primary-navigation" aria-label="${protectedPage ? 'Banking navigation' : 'Main navigation'}"><ul class="menu-bar">${navigationLinks}</ul></nav>
    <div class="log"><a href="login.html">Login</a><button type="button" data-logout>Logout</button></div>`;
}

const menuToggle = document.querySelector('.menu-toggle');
const primaryNavigation = document.querySelector('#primary-navigation');
if (menuToggle && primaryNavigation) {
  menuToggle.addEventListener('click', () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
    primaryNavigation.classList.toggle('is-open', !isOpen);
  });
  primaryNavigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation menu');
      primaryNavigation.classList.remove('is-open');
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && primaryNavigation.classList.contains('is-open')) {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation menu');
      primaryNavigation.classList.remove('is-open');
      menuToggle.focus();
    }
  });
}

document.querySelectorAll('#primary-navigation a').forEach((link) => {
  const target = new URL(link.href, window.location.href);
  if (target.pathname === window.location.pathname) {
    link.setAttribute('aria-current', 'page');
  }
});

const footer = document.querySelector('footer');
if (footer) {
  footer.className = 'footer';
  footer.innerHTML = `<div><h2>SMART BANK</h2><p>A learning project for exploring digital banking interfaces.</p></div>
    <div><h3>Quick links</h3><a href="homepage.html">Home</a><a href="about.html">About</a><a href="contact.html">Contact</a><a href="careers.html">Careers</a></div>
    <div><h3>Banking</h3><a href="accounts.html">Accounts</a><a href="loans.html">Loans</a><a href="cards.html">Cards</a><a href="investments.html">Investments</a></div>
    <div><h3>Support</h3><a href="help.html">Help center</a><a href="faq.html">FAQs</a><a href="security.html">Security</a></div>
    <div><p>© 2026 Smart Bank. All Rights Reserved.</p></div>`;
}

document.querySelectorAll('[data-logout]').forEach((button) => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await api('/logout', { method: 'POST' }); }
    catch (error) { console.error(error.message); }
    window.location.replace('login.html');
  });
});

const loginLink = document.querySelector('.log a[href="login.html"]');
const logoutButton = document.querySelector('[data-logout]');
if (loginLink && logoutButton) {
  loginLink.hidden = protectedPage;
  logoutButton.hidden = !protectedPage;

  if (!protectedPage) {
    api('/me').then(({ user }) => {
      loginLink.textContent = 'Dashboard';
      loginLink.href = 'dashboard.html';
      loginLink.hidden = false;
      logoutButton.hidden = false;
      if (user.role === 'admin') showAdminNav();
    }).catch(() => {
      loginLink.textContent = 'Login';
      loginLink.href = 'login.html';
      loginLink.hidden = false;
      logoutButton.hidden = true;
    });
  }
}
