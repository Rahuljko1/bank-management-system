// Finds the Login box by its id.
const loginBox = document.querySelector('#login-box');

// Finds the Create account box by its id.
const signupBox = document.querySelector('#signup-box');

// Finds the Create one button in the Login box.
const showSignupButton = document.querySelector('#show-signup');

// Finds the Sign in button in the Create account box.
const showLoginButton = document.querySelector('#show-login');

// Shows the Create account box.
function showSignup() {
  // Hides the Login box.
  loginBox.classList.add('hide');

  // Shows the Create account box.
  signupBox.classList.remove('hide');
}

// Shows the Login box.
function showLogin() {
  // Shows the Login box.
  loginBox.classList.remove('hide');

  // Hides the Create account box.
  signupBox.classList.add('hide');
}

// Opens Create account when the Create one button is clicked.
showSignupButton.addEventListener('click', showSignup);

// Opens Login when the Sign in button is clicked.
showLoginButton.addEventListener('click', showLogin);

// Checks whether the page was opened from the homepage button.
if (window.location.hash === '#signup') {
  // Opens the Create account box when the URL ends with #signup.
  showSignup();
}
