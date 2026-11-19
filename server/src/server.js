const config = require('./config');
const pool = require('./db');
const app = require('./app');

async function warnIfMigrationMissing() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS present FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
      [config.db.database]
    );
    if (!Number(rows[0].present)) {
      console.warn('Database is missing the newer project columns. From the server directory run: npm run migrate');
    }
  } catch (error) {
    console.error(`Could not check database migration state. ${error.message}`);
  }
}

app.listen(config.port, () => {
  console.log(`Smart Bank API listening on http://localhost:${config.port}`);
  warnIfMigrationMissing();
});
