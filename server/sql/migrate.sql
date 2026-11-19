-- Idempotent migration for an existing smart_bank database.
-- From the server directory, prefer: npm run migrate
-- This file is the same change set, written out for review.
-- Re-running the ALTER statements by hand fails once the column exists.
-- npm run migrate checks information_schema and skips columns that are already present.

USE smart_bank;

ALTER TABLE users ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user';
ALTER TABLE accounts ADD COLUMN status ENUM('active', 'blocked') NOT NULL DEFAULT 'active';
ALTER TABLE transactions ADD COLUMN category VARCHAR(40) NOT NULL DEFAULT 'transfer';

-- Then run the CREATE TABLE statements for beneficiaries, transfer_challenges,
-- bill_payments, and support_tickets from schema.sql.
-- Those statements use CREATE TABLE IF NOT EXISTS.

-- Optional admin promotion after the person has registered:
-- UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
