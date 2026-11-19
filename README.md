# Smart Banking Management System

A BCA final-year learning project that simulates digital banking workflows. Every account, rupee balance, transfer, bill payment, OTP and support ticket is fictional. It must not be used for real banking.

## Implemented modules

- Session-based registration, login, logout, profile update and password reset
- Fictional savings account dashboard, account status and transaction filtering/pagination
- OTP-verified fictional transfers with expiry, attempt limits, database transactions and duplicate-request protection
- Beneficiary add, edit, delete and selection in the transfer form
- Fictional bill payments for electricity, mobile, broadband, gas and insurance
- CSV export and dashboard activity summaries by month/category
- Support-ticket creation and per-user ticket history
- Role-protected admin panel for users, account blocking/unblocking and ticket-status updates

## Technology

HTML, CSS and browser JavaScript frontend; Node.js/Express backend; MySQL 8 database; bcrypt password hashing; server-side sessions; Helmet, CORS and rate limiting.

## Run locally

1. In `server`, run `npm install`.
2. Copy `server/.env.example` to `server/.env`, then set a private `SESSION_SECRET` and your local MySQL credentials. Never commit this file.
3. For a new database, run `server/sql/schema.sql` in MySQL. For an existing database, run `npm run migrate` from `server`.
4. Optionally set `ADMIN_EMAIL` in `.env`, register that email, then run `npm run migrate` again to give it the `admin` role.
5. Run `npm start` in `server` and serve the project root with a static server at an origin listed in `FRONTEND_ORIGINS` (for example `http://localhost:5500`).
6. Open `pages/homepage.html` through that static server.

Run `npm test` in `server` for utility tests. See [server/TESTING.md](server/TESTING.md) for the manual functional checklist.

## Database tables

`users`, `accounts`, `transactions`, `transfer_requests`, `transfer_challenges`, `beneficiaries`, `bill_payments`, `support_tickets` and `password_reset_tokens`.

## Demo limitations

- OTP is displayed only in development/server console; no SMS is sent.
- Password-reset token is returned only in development; no email is sent.
- No real bank, card, biller, investment, payment gateway or customer-support system is connected.
- The biller account is a local fictional ledger account created by the app.
