const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/tmp/bank.db'
  : path.join(__dirname, '..', '..', 'bank.db');

let db = null;

/** Persist the in-memory DB to disk */
function persistDb() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('❌ DB persist error:', err.message);
  }
}

/** Initialize and return the database (singleton) */
async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('✅ Loaded existing database from disk');
  } else {
    db = new SQL.Database();
    console.log('✅ Created new database');
  }

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT    NOT NULL,
      phone          TEXT    UNIQUE NOT NULL,
      password       TEXT    NOT NULL,
      balance        REAL    NOT NULL DEFAULT 0.0,
      account_number TEXT    UNIQUE,
      jwt_token      TEXT,
      created_at     TEXT    DEFAULT (datetime('now'))
    )
  `);

  // Transactions table — includes optional 'type' column
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      amount      REAL    NOT NULL,
      type        TEXT    NOT NULL DEFAULT 'transfer',
      timestamp   TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (sender_id)   REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `);

  // Migrate: add 'type' column if it doesn't exist yet (for existing DBs)
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'transfer'`);
    console.log('✅ Migrated: added type column to transactions');
  } catch (_) {
    // Column already exists — fine
  }

  // Migrate: add account_number column if it doesn't exist yet (for existing DBs)
  try {
    db.run(`ALTER TABLE users ADD COLUMN account_number TEXT`);
    console.log('✅ Migrated: added account_number column to users');
  } catch (_) {
    // Column already exists — fine
  }

  persistDb();
  console.log('✅ Database schema ready');
  return db;
}

/** Run INSERT/UPDATE/DELETE — does NOT auto-persist (caller should call persistDb after tx) */
function dbRun(db, sql, params) {
  db.run(sql, params || []);
}

/** SELECT first row → plain object or null */
function dbGet(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params && params.length > 0) stmt.bind(params);
  const hasRow = stmt.step();
  if (!hasRow) { stmt.free(); return null; }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

/** SELECT all rows → array of plain objects */
function dbAll(db, sql, params) {
  const stmt = db.prepare(sql);
  if (params && params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Get last auto-inserted row ID */
function lastInsertRowid(db) {
  const row = dbGet(db, 'SELECT last_insert_rowid() AS id');
  return row ? row.id : null;
}

/**
 * Generate a unique SBK account number.
 * Format: SBK + 4-digit bank code (4501) + 6 random digits = 13 chars
 * Numeric-only visible portion: 450100000000 – 450199999999
 * Displayed as: SBK 4501 XXXXXX (space-grouped for readability)
 * Collision check is performed before returning.
 *
 * @param {object} db  - sql.js database instance
 * @returns {string}   - unique account number string
 */
function generateAccountNumber(db) {
  const BANK_CODE = '4501';
  let acctNum;
  let attempts = 0;
  do {
    if (attempts++ > 100) throw new Error('Could not generate unique account number after 100 attempts.');
    const random6 = String(Math.floor(100000 + Math.random() * 900000)); // always 6 digits
    acctNum = BANK_CODE + random6; // 10-digit number
    const existing = dbGet(db, 'SELECT id FROM users WHERE account_number = ?', [acctNum]);
    if (!existing) break;
  } while (true);
  return acctNum;
}

module.exports = { getDb, dbRun, dbGet, dbAll, persistDb, lastInsertRowid, generateAccountNumber };
