const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const accountPattern = /^\d{12}$/;

function fieldMessage(field) {
  if (field.validity.valueMissing) return 'This field is required.';
  if (field.type === 'email' && field.validity.typeMismatch) return 'Enter a valid email address.';

  if (field.name === 'toAccountNumber' && !accountPattern.test(field.value.trim())) {
    return 'Enter the 12-digit account number.';
  }

  if (field.id === 'ifsc' && !ifscPattern.test(field.value.trim())) {
    return 'Enter IFSC in the format ABCD0123456.';
  }

  if (field.type === 'password' && field.autocomplete === 'new-password') {
    if (field.value.length < 8 || !/[a-z]/.test(field.value) || !/[A-Z]/.test(field.value) || !/\d/.test(field.value) || !/[^A-Za-z0-9]/.test(field.value)) {
      return 'Use at least 8 characters with uppercase, lowercase, a number, and a symbol.';
    }
  }

  if (field.type === 'number' && field.value && Number(field.value) <= 0) {
    return 'Enter an amount greater than zero.';
  }

  if (field.validity.rangeUnderflow) return `Enter a value of at least ${field.min}.`;
  if (field.validity.stepMismatch) return 'Use a valid amount with no more than two decimal places.';
  return '';
}

function errorFor(field) {
  const fieldId = field.id || `field-${Math.random().toString(36).slice(2)}`;
  field.id = fieldId;
  let error = document.getElementById(`${fieldId}-error`);
  if (!error) {
    error = document.createElement('p');
    error.id = `${fieldId}-error`;
    error.className = 'field-error';
    error.setAttribute('role', 'alert');
    const target = field.parentElement.classList.contains('password-field') ? field.parentElement : field;
    target.insertAdjacentElement('afterend', error);
  }
  return error;
}

function validateField(field, reveal = true) {
  const message = fieldMessage(field);
  field.setCustomValidity(message);
  const error = errorFor(field);
  error.textContent = message;
  error.hidden = !message || !reveal;
  field.setAttribute('aria-invalid', String(Boolean(message)));
  if (message) {
    field.setAttribute('aria-describedby', error.id);
  } else if (field.getAttribute('aria-describedby') === error.id) {
    field.removeAttribute('aria-describedby');
  }
  return !message;
}

document.querySelectorAll('input[type="password"]').forEach((field) => {
  const wrapper = document.createElement('span');
  wrapper.className = 'password-field';
  field.replaceWith(wrapper);
  wrapper.append(field);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
  toggle.textContent = 'Show';
  toggle.setAttribute('aria-label', 'Show password');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    const show = field.type === 'password';
    field.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(show));
    field.focus();
  });
  wrapper.append(toggle);
});

document.querySelectorAll('form').forEach((form) => {
  const fields = [...form.querySelectorAll('input, select, textarea')];
  fields.forEach((field) => {
    if (['amount', 'loan-amount', 'income'].includes(field.id)) {
      field.min = '0.01';
      field.step = '0.01';
    }
    field.addEventListener('input', () => validateField(field));
    field.addEventListener('blur', () => {
      if (field.id === 'ifsc') field.value = field.value.toUpperCase();
      validateField(field);
    });
    field.addEventListener('invalid', () => validateField(field), true);
  });

  if (['login-form', 'signup-form', 'transaction-filters', 'transfer-form', 'transfer-confirm-form', 'transfer-otp-form', 'profile-form', 'change-password-form', 'reset-request-form', 'reset-form', 'emi-form', 'beneficiary-form', 'bill-form', 'bill-confirm-form', 'ticket-form', 'admin-login-form', 'admin-user-search', 'admin-ticket-filter'].includes(form.id)) return;

  form.addEventListener('submit', (event) => {
    if (form.dataset.submitting === 'true') {
      event.preventDefault();
      return;
    }
    const valid = fields.map((field) => validateField(field)).every(Boolean);
    if (!valid) {
      event.preventDefault();
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    form.dataset.submitting = 'true';
    form.setAttribute('aria-busy', 'true');
    const submit = form.querySelector('button[type="submit"], button:not([type])');
    if (submit) {
      submit.disabled = true;
      submit.dataset.originalText = submit.textContent;
      submit.textContent = 'Submitting…';
      const status = document.createElement('p');
      status.className = 'form-status';
      status.setAttribute('role', 'status');
      status.textContent = 'Please wait while your form is submitted.';
      submit.insertAdjacentElement('afterend', status);
    }
  });
});

document.querySelectorAll('.table-wrap table').forEach((table) => {
  const body = table.tBodies[0];
  if (body && body.rows.length === 0) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = table.tHead?.rows[0]?.cells.length || 1;
    cell.className = 'empty-state';
    cell.textContent = 'No records to display yet.';
  }
});

