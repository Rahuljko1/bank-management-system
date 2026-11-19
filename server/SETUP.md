# Smart Bank API setup

This is a learning backend. Balances use fictional rupee values and must not represent real money or bank accounts.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0 or newer

## Install and configure

1. Open a terminal in the `server` directory.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set a private `SESSION_SECRET` of at least 32 characters and your local MySQL credentials. Keep `.env` private.
4. In MySQL Workbench or the MySQL CLI, run `sql/schema.sql`. It creates `smart_bank` and its tables. Give the configured database user access to this database. If you already have the earlier project database, run `npm run migrate` instead.
5. Run `npm start` (or `npm run dev` while developing). The API listens on `http://localhost:4000`.
6. Open `http://localhost:4000/health`; a successful response reports `database: connected`.
7. Serve the project root as static files (for example, use VS Code Live Server on the project root at `http://localhost:5500`) and open `http://localhost:5500/`. Keep `localhost` consistent so the browser sends the session cookie. The frontend defaults to an API at the same hostname on port `4000`.

The browser origin(s) that call the API must appear in `FRONTEND_ORIGINS`. The default allows common local static-server origins; update it when your frontend runs on a different port or host. Session requests must send credentials/cookies, and state-changing requests must include an allowed browser `Origin` header. Production startup requires exact HTTPS frontend origins. Serve the API over HTTPS and set `window.SMART_BANK_API` to its HTTPS base URL before loading the frontend modules (for example, through a deployment-specific configuration script). The frontend's fallback follows the page protocol and uses port 4000; it does not configure TLS on the API server. If TLS terminates at a reverse proxy, set `TRUST_PROXY` to the number of trusted proxy hops so secure session cookies work; do not enable this for an untrusted or directly exposed proxy chain.

## Project structure

```text
server/
  .env.example
  package.json
  SETUP.md
  sql/schema.sql
  src/
    app.js
    config.js
    db.js
    server.js
    middleware/session-user.js
    routes/auth.js
    routes/banking.js
    utils/validation.js
```

## API

JSON request/response API; account IDs are numeric database IDs. All protected endpoints require the session cookie created by register/login.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/register` | Public | Create a user and fictional savings account; body: `username`, `email`, `fullName`, `password` |
| POST | `/login` | Public | Sign in with `email` and `password` |
| POST | `/logout` | Public | Destroy the server session and clear its cookie |
| GET | `/me` | Session | Return the signed-in user's public profile |
| POST | `/change-password` | Session | Change password with `currentPassword` and `newPassword` |
| POST | `/reset-password/request` | Public | Request a one-time reset token; development returns `developmentResetToken` because no email provider is configured |
| POST | `/reset-password` | Public | Set `newPassword` with the reset `token` |
| GET | `/accounts` | Session | List the signed-in user's accounts |
| GET | `/transactions?page=1&limit=10&type=credit&from=YYYY-MM-DD&to=YYYY-MM-DD&search=` | Session | List that user's ledger entries with filters and pagination |
| POST | `/transfer` | Session | Transfer fictional rupee values; requires a unique UUID `Idempotency-Key` request header; body: `fromAccountId`, `toAccountNumber`, `toIfsc`, `amount` |
| PUT | `/profile` | Session | Update `fullName` and `email` |
| GET/POST/PUT/DELETE | `/beneficiaries` | Session | Manage saved fictional transfer destinations |
| POST | `/transfer-challenges` | Session | Start a fictional OTP challenge before transfer |
| POST | `/transfer` | Session | Verify OTP and complete a fictional transfer |
| GET/POST | `/bills` | Session | View or complete a fictional bill payment |
| GET/POST | `/tickets` | Session | View or create a fictional support ticket |
| GET | `/reports/overview` | Session | Current user's fictional activity summaries |
| `/admin/*` | Admin role | Admin summary, users, account status and tickets |

Transfers lock both account rows and update both balances plus the matching debit/credit ledger entries in one MySQL transaction. Any failure rolls the transaction back. Amounts must be positive and the source must have sufficient balance. Each new fictional account starts with the configured fictional balance.

Password reset delivery is deliberately not connected to email. The endpoint returns a reset token only in development and responds with `503` in production until an email provider and public reset link are configured. Re-run `sql/schema.sql` against an existing database to create the transfer idempotency table. If you already created that table before `request_hash` was added, run `ALTER TABLE transfer_requests ADD COLUMN request_hash CHAR(64) NULL;` once; prior keys cannot be replayed safely, while new requests will store a fingerprint.
