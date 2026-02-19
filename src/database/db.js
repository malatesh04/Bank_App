/**
 * State Bank of Karnataka — Database Layer
 *
 * LOCAL  (development) : sql.js SQLite  → bank.db
 * PRODUCTION (Vercel)  : Neon PostgreSQL → DATABASE_URL env var
 *
 * Exports a unified async interface:
 *   getDb()                       → db handle
 *   dbGet(db, sql, params)        → first row object | null
 *   dbAll(db, sql, params)        → array of row objects
 *   dbRun(db, sql, params)        → void
 *   persistDb()                   → void (no-op on Postgres)
 *   lastInsertRowid(db)           → number  (SQLite only — Postgres uses RETURNING)
 *   generateAccountNumber(db)     → string
 */

const isProd = process.env.NODE_ENV === 'production' && !!process.env.DATABASE_URL;

// ═══════════════════════════════════════════════════════
//  PRODUCTION — Neon / PostgreSQL
// ═══════════════════════════════════════════════════════
if (isProd) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  /** Convert ? placeholders (SQLite style) to $1 $2 … (Postgres style) */
  function toPostgres(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  async function getDb() {
    const client = await pool.connect();
    try {
      // Create schema (idempotent)
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id             SERIAL PRIMARY KEY,
          username       TEXT    NOT NULL,
          phone          TEXT    UNIQUE NOT NULL,
          password       TEXT    NOT NULL,
          balance        NUMERIC(15,2) NOT NULL DEFAULT 0.00,
          account_number TEXT    UNIQUE,
          jwt_token      TEXT,
          created_at     TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id          SERIAL PRIMARY KEY,
          sender_id   INTEGER NOT NULL REFERENCES users(id),
          receiver_id INTEGER NOT NULL REFERENCES users(id),
          amount      NUMERIC(15,2) NOT NULL,
          type        TEXT NOT NULL DEFAULT 'transfer',
          timestamp   TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('✅ PostgreSQL schema ready');
    } finally {
      client.release();
    }
    return pool; // return pool as db handle
  }

  async function dbRun(db, sql, params) {
    await db.query(toPostgres(sql), params || []);
  }

  async function dbGet(db, sql, params) {
    const res = await db.query(toPostgres(sql), params || []);
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async function dbAll(db, sql, params) {
    const res = await db.query(toPostgres(sql), params || []);
    return res.rows;
  }

  /** No-op — Postgres persists automatically */
  function persistDb() { }

  /** Not used in Postgres routes — they use RETURNING id directly */
  function lastInsertRowid() { return null; }

  async function generateAccountNumber(db) {
    const BANK_CODE = '4501';
    let acctNum;
    let attempts = 0;
    do {
      if (attempts++ > 100) throw new Error('Could not generate unique account number.');
      const random6 = String(Math.floor(100000 + Math.random() * 900000));
      acctNum = BANK_CODE + random6;
      const row = await dbGet(db, 'SELECT id FROM users WHERE account_number = ?', [acctNum]);
      if (!row) break;
    } while (true);
    return acctNum;
  }

  module.exports = { getDb, dbRun, dbGet, dbAll, persistDb, lastInsertRowid, generateAccountNumber };

} else {
  // ═══════════════════════════════════════════════════════
  //  LOCAL — sql.js SQLite
  // ═══════════════════════════════════════════════════════
  const initSqlJs = require('sql.js');
  const path = require('path');
  const fs = require('fs');

  const DB_PATH = path.join(__dirname, '..', '..', 'bank.db');
  let db = null;

  function persistDb() {
    try {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (err) {
      console.error('❌ DB persist error:', err.message);
    }
  }

  async function getDb() {
    if (db) return db;
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
      console.log('✅ Loaded existing database from disk');
    } else {
      db = new SQL.Database();
      console.log('✅ Created new database');
    }

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
    // Migrations
    try { db.run(`ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'transfer'`); } catch (_) { }
    try { db.run(`ALTER TABLE users ADD COLUMN account_number TEXT`); } catch (_) { }

    persistDb();
    console.log('✅ Database schema ready');
    return db;
  }

  function dbRun(db, sql, params) { db.run(sql, params || []); }

  function dbGet(db, sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length > 0) stmt.bind(params);
    const hasRow = stmt.step();
    if (!hasRow) { stmt.free(); return null; }
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }

  function dbAll(db, sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function lastInsertRowid(db) {
    const row = dbGet(db, 'SELECT last_insert_rowid() AS id');
    return row ? row.id : null;
  }

  function generateAccountNumber(db) {
    const BANK_CODE = '4501';
    let acctNum;
    let attempts = 0;
    do {
      if (attempts++ > 100) throw new Error('Could not generate unique account number.');
      const random6 = String(Math.floor(100000 + Math.random() * 900000));
      acctNum = BANK_CODE + random6;
      const existing = dbGet(db, 'SELECT id FROM users WHERE account_number = ?', [acctNum]);
      if (!existing) break;
    } while (true);
    return acctNum;
  }

  module.exports = { getDb, dbRun, dbGet, dbAll, persistDb, lastInsertRowid, generateAccountNumber };
}
