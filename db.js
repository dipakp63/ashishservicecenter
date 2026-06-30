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
    const dbFile = process.env.DATABASE_FILE || 'database.sqlite';
    const dbPath = path.join(__dirname, dbFile);
    sqliteDb = new sqlite3.Database(dbPath);
    console.log(`[DB] Connected to local SQLite database: ${dbFile}`);
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
        remarks TEXT,
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
        remarks TEXT,
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
    {
      sql: `CREATE TABLE IF NOT EXISTS porancha_hishob_entries (
        date TEXT NOT NULL,
        shift INTEGER NOT NULL,
        nozzle_index INTEGER NOT NULL,
        product TEXT NOT NULL,
        employee_id INTEGER,
        opening_reading REAL,
        closing_reading REAL,
        difference_sale REAL,
        rate REAL,
        final_amount REAL,
        phonepe_amount REAL,
        PRIMARY KEY (date, shift, nozzle_index),
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS porancha_hishob_testing (
        date TEXT NOT NULL,
        nozzle_index INTEGER NOT NULL,
        employee_id INTEGER,
        testing_qty REAL NOT NULL DEFAULT 5.0,
        phonepe_amount REAL NOT NULL DEFAULT 0.0,
        PRIMARY KEY (date, nozzle_index),
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS chillar_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        notes_10 INTEGER DEFAULT 0,
        coins_20 INTEGER DEFAULT 0,
        coins_10 INTEGER DEFAULT 0,
        coins_5 INTEGER DEFAULT 0,
        coins_2 INTEGER DEFAULT 0,
        coins_1 INTEGER DEFAULT 0,
        total_amount REAL NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS profit_margins (
        month TEXT PRIMARY KEY,
        dealer_petrol REAL DEFAULT 3.0,
        dealer_diesel REAL DEFAULT 2.0,
        dealer_power REAL DEFAULT 3.0,
        diff_petrol REAL DEFAULT 0.5,
        diff_diesel REAL DEFAULT 0.2,
        diff_power REAL DEFAULT 0.5
      )`,
    },
  ];

  // Run CREATE TABLE statements concurrently to avoid Vercel 10s timeouts on cold starts
  await Promise.all(tableStatements.map(stmt => run(stmt.sql, stmt.args || [])));

  console.log('[DB] All tables initialized successfully.');

  // ── Indexes ────────────────────────────────────────────────────────────────
  const indexStatements = [
    { sql: `CREATE INDEX IF NOT EXISTS idx_readings_date ON readings(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_tank_readings_date ON tank_readings(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_non_cash_payments_date ON non_cash_payments(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_hpcl_transactions_date ON hpcl_transactions(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_debtor_transactions_debtor_date ON debtor_transactions(debtor_id, transaction_date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_employee_transactions_employee_date ON employee_transactions(employee_id, transaction_date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_tt_transactions_date ON tt_transactions(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_tt_trips_date ON tt_trips(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_tt_entries_date ON tt_entries(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_chillar_transactions_date ON chillar_transactions(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_porancha_hishob_entries_date ON porancha_hishob_entries(date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_debtor_transactions_id_date ON debtor_transactions(debtor_id, transaction_date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_employee_transactions_id_date ON employee_transactions(employee_id, transaction_date)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_porancha_hishob_date ON porancha_hishob_entries(date)` }
  ];
  await Promise.all(indexStatements.map(stmt => run(stmt.sql, stmt.args || [])));
  console.log('[DB] All indexes initialized successfully.');

  // ── Migrations ────────────────────────────────────────────────────────────

  // Run all migrations concurrently (failures are ignored if column already exists)
  await Promise.allSettled([
    run(`ALTER TABLE employee_transactions ADD COLUMN remarks TEXT`),
    run(`CREATE INDEX IF NOT EXISTS idx_debtor_transactions_id_date ON debtor_transactions(debtor_id, transaction_date)`),
    run(`CREATE INDEX IF NOT EXISTS idx_employee_transactions_id_date ON employee_transactions(employee_id, transaction_date)`),
    run(`CREATE INDEX IF NOT EXISTS idx_tt_transactions_date ON tt_transactions(date)`),
    run(`CREATE INDEX IF NOT EXISTS idx_tt_trips_date ON tt_trips(date)`),
    run(`CREATE INDEX IF NOT EXISTS idx_tt_entries_date ON tt_entries(date)`),
    run(`CREATE INDEX IF NOT EXISTS idx_porancha_hishob_date ON porancha_hishob_entries(date)`)
  ]);
  console.log('[DB] Migrations processed.');
}

module.exports = { run, get, all, batch, initDatabase };
