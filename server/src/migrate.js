const pool = require('./db');
const config = require('./config');

async function columnExists(table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS present FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [config.db.database, table, column]
  );
  return Number(rows[0].present) > 0;
}

async function ensureColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`Column ${table}.${column} already exists.`);
    return;
  }
  await pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  console.log(`Added ${table}.${column}.`);
}

async function migrate() {
  await ensureColumn('users', 'role', "role ENUM('user', 'admin') NOT NULL DEFAULT 'user'");
  await ensureColumn('accounts', 'status', "status ENUM('active', 'blocked') NOT NULL DEFAULT 'active'");
  await ensureColumn('transactions', 'category', "category VARCHAR(40) NOT NULL DEFAULT 'transfer'");

  await pool.execute(`CREATE TABLE IF NOT EXISTS beneficiaries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    nickname VARCHAR(60) NOT NULL,
    account_holder VARCHAR(100) NOT NULL,
    account_number CHAR(12) NOT NULL,
    ifsc CHAR(11) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_beneficiaries_account (user_id, account_number, ifsc),
    KEY ix_beneficiaries_user (user_id),
    CONSTRAINT fk_beneficiaries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS transfer_challenges (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    idempotency_key CHAR(36) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    otp_salt CHAR(32) NOT NULL,
    otp_hash CHAR(64) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 5,
    expires_at DATETIME NOT NULL,
    verified_at DATETIME NULL,
    consumed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_transfer_challenge_key (user_id, idempotency_key),
    CONSTRAINT fk_transfer_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS bill_payments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    idempotency_key CHAR(36) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    category ENUM('electricity', 'mobile', 'broadband', 'gas', 'insurance') NOT NULL,
    consumer_reference VARCHAR(40) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency CHAR(4) NOT NULL DEFAULT 'INR',
    transaction_id BIGINT UNSIGNED NULL,
    response_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bill_payments_key (user_id, idempotency_key),
    KEY ix_bill_payments_user_created (user_id, created_at),
    CONSTRAINT fk_bill_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_bill_payments_account FOREIGN KEY (account_id) REFERENCES accounts(id),
    CONSTRAINT fk_bill_payments_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    CONSTRAINT chk_bill_payments_amount_positive CHECK (amount > 0)
  ) ENGINE=InnoDB`);

  await pool.execute(`CREATE TABLE IF NOT EXISTS support_tickets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    subject VARCHAR(120) NOT NULL,
    message VARCHAR(2000) NOT NULL,
    status ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_support_tickets_user (user_id, created_at),
    KEY ix_support_tickets_status (status, updated_at),
    CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  console.log('New tables are ready.');
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail) {
    const [result] = await pool.execute('UPDATE users SET role = \'admin\' WHERE email = ?', [adminEmail]);
    console.log(result.affectedRows ? `Promoted ${adminEmail} to admin.` : `No registered user matched ADMIN_EMAIL.`);
  } else {
    console.log('Set ADMIN_EMAIL and run this again to promote an existing user, or update users.role in MySQL.');
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
