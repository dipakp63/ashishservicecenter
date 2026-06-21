// db.js — Database Abstraction Layer
// Supports two backends:
//   1. Turso (cloud LibSQL) — used on Vercel via TURSO_DATABASE_URL env var
//   2. Local SQLite — used for local development when no Turso URL is set
//
// Both backends expose the same async API: run(), get(), all(), batch()

let backend; // 'turso' or 'sqlite'
let tursoClient;
let sqliteDb;

function initialize() {
  if (backend) return; // Already initialized

  if (process.env.TURSO_DATABASE_URL) {
    backend = 'turso';
    const { createClient } = require('@libsql/client');
    tursoClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    console.log('[DB] Connected to Turso cloud database.');
  } else {
    backend = 'sqlite';
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    const dbPath = path.join(__dirname, 'database.sqlite');
    sqliteDb = new sqlite3.Database(dbPath);
    console.log('[DB] Connected to local SQLite database.');
  }
}

// ── SQLite Promise Wrappers ─────────────────────────────────────────────────

function sqliteRun(sql, args = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.run(sql, args, function (err) {
      if (err) reject(err);
      else resolve({ rowsAffected: this.changes, lastInsertRowid: this.lastID });
    });
  });
}

function sqliteGet(sql, args = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.get(sql, args, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function sqliteAll(sql, args = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, args, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// ── Unified Async API ───────────────────────────────────────────────────────

/**
 * Execute a single SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
 * @returns {{ rowsAffected: number, lastInsertRowid: number }}
 */
async function run(sql, args = []) {
  initialize();
  if (backend === 'turso') {
    const result = await tursoClient.execute({ sql, args });
    return {
      rowsAffected: result.rowsAffected,
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  } else {
    return sqliteRun(sql, args);
  }
}

/**
 * Fetch a single row. Returns null if no match.
 */
async function get(sql, args = []) {
  initialize();
  if (backend === 'turso') {
    const result = await tursoClient.execute({ sql, args });
    return result.rows.length > 0 ? result.rows[0] : null;
  } else {
    return sqliteGet(sql, args);
  }
}

/**
 * Fetch all matching rows. Returns an empty array if none.
 */
async function all(sql, args = []) {
  initialize();
  if (backend === 'turso') {
    const result = await tursoClient.execute({ sql, args });
    return result.rows;
  } else {
    return sqliteAll(sql, args);
  }
}

/**
 * Execute multiple statements in a single atomic transaction.
 * Each entry: { sql: '...', args: [...] }
 */
async function batch(statements) {
  initialize();
  if (backend === 'turso') {
    return tursoClient.batch(
      statements.map((s) => ({ sql: s.sql, args: s.args || [] })),
      'write'
    );
  } else {
    // SQLite: wrap in explicit transaction
    await sqliteRun('BEGIN TRANSACTION');
    try {
      const results = [];
      for (const s of statements) {
        results.push(await sqliteRun(s.sql, s.args || []));
      }
      await sqliteRun('COMMIT');
      return results;
    } catch (err) {
      await sqliteRun('ROLLBACK').catch(() => {});
      throw err;
    }
  }
}

// ── Database Schema Initialization ──────────────────────────────────────────

async function initDatabase() {
  initialize();

  const tableStatements = [
    {
      sql: `CREATE TABLE IF NOT EXISTS readings (
        date TEXT NOT NULL,
        nozzle_id INTEGER NOT NULL,
        product TEXT NOT NULL,
        opening_reading REAL NOT NULL,
        closing_reading REAL NOT NULL,
        testing_qty REAL DEFAULT 0,
        PRIMARY KEY (date, nozzle_id)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS tank_readings (
        date TEXT NOT NULL,
        tank_id INTEGER NOT NULL,
        tank_name TEXT NOT NULL,
        product TEXT NOT NULL,
        capacity REAL NOT NULL,
        opening_dip REAL DEFAULT 0,
        opening_stock REAL NOT NULL,
        closing_dip REAL NOT NULL,
        closing_stock REAL NOT NULL,
        decantation_qty REAL DEFAULT 0,
        tt_decantation INTEGER DEFAULT 0,
        PRIMARY KEY (date, tank_id)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS rates (
        date TEXT NOT NULL PRIMARY KEY,
        rate_power REAL NOT NULL,
        rate_petrol REAL NOT NULL,
        rate_diesel REAL NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS cash_reconciliation (
        date TEXT NOT NULL PRIMARY KEY,
        total_sales_value REAL NOT NULL,
        total_cash_received REAL NOT NULL,
        shortfall REAL NOT NULL,
        notes_500 INTEGER DEFAULT 0,
        notes_200 INTEGER DEFAULT 0,
        notes_100 INTEGER DEFAULT 0,
        notes_50 INTEGER DEFAULT 0,
        notes_20 INTEGER DEFAULT 0,
        notes_10 INTEGER DEFAULT 0,
        coins REAL DEFAULT 0,
        coins_20 INTEGER DEFAULT 0,
        coins_10 INTEGER DEFAULT 0,
        coins_5 INTEGER DEFAULT 0,
        coins_2 INTEGER DEFAULT 0,
        coins_1 INTEGER DEFAULT 0
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS non_cash_payments (
        date TEXT NOT NULL,
        entry_index INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        PRIMARY KEY (date, entry_index)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS hpcl_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS hpcl_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        running_balance REAL NOT NULL
      )`,
    },
    {
      sql: `INSERT OR IGNORE INTO hpcl_config (key, value) VALUES ('hpcl_opening_balance', '4700')`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS debtors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debtor_name TEXT UNIQUE NOT NULL,
        mobile TEXT,
        address TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS debtor_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debtor_id INTEGER NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        description TEXT,
        debit_amount REAL DEFAULT 0,
        credit_amount REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (debtor_id) REFERENCES debtors(id)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        mobile TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS employee_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        transaction_date DATE NOT NULL,
        transaction_type TEXT NOT NULL,
        description TEXT,
        advance_given REAL DEFAULT 0,
        amount_settled REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS tt_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        amount REAL NOT NULL,
        profit REAL DEFAULT NULL,
        particular1 TEXT DEFAULT '',
        description TEXT NOT NULL,
        notes TEXT,
        settlement_month TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS tt_trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        start_km REAL NOT NULL,
        end_km REAL NOT NULL,
        run_km REAL NOT NULL,
        fuel_filled REAL DEFAULT 0,
        load_qty REAL DEFAULT 0,
        driver_name TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS tt_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        trip_for TEXT NOT NULL,
        entry_given TEXT NOT NULL,
        remark1 TEXT,
        remark2 TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    },
  ];

  // Run each CREATE TABLE individually (batch may not work well with DDL on all backends)
  for (const stmt of tableStatements) {
    await run(stmt.sql, stmt.args || []);
  }

  console.log('[DB] All tables initialized successfully.');

  // ── Migrations ────────────────────────────────────────────────────────────
  // Add particular1 column to tt_transactions if it doesn't exist
  try {
    await run(`ALTER TABLE tt_transactions ADD COLUMN particular1 TEXT DEFAULT ''`);
    console.log('[DB] Migration: added particular1 column to tt_transactions.');
  } catch (e) {
    // Column already exists — ignore
  }

  // Add tt_decantation column to tank_readings if it doesn't exist
  try {
    await run(`ALTER TABLE tank_readings ADD COLUMN tt_decantation INTEGER DEFAULT 0`);
    console.log('[DB] Migration: added tt_decantation column to tank_readings.');
  } catch (e) {
    // Column already exists — ignore
  }
}

module.exports = { run, get, all, batch, initDatabase };
