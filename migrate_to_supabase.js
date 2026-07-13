const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

const connectionString = 'postgresql://postgres:Jivesh%402751@db.jsrqqafwhxcfigpqhumy.supabase.co:5432/postgres';

const pool = new Pool({ connectionString });

const sqliteDb = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

const tables = [
  'readings',
  'tank_readings',
  'rates',
  'cash_reconciliation',
  'non_cash_payments',
  'hpcl_config',
  'hpcl_transactions',
  'debtors',
  'debtor_transactions',
  'employees',
  'employee_transactions',
  'tt_transactions',
  'tt_trips',
  'tt_entries',
  'porancha_hishob_entries',
  'porancha_hishob_testing',
  'chillar_transactions',
  'profit_margins'
];

async function migrate() {
  const pgClient = await pool.connect();
  
  try {
    // Disable foreign key checks for migration
    await pgClient.query("SET session_replication_role = 'replica';");
    
    for (const table of tables) {
      console.log(`Migrating table: ${table}`);
      
      const rows = await new Promise((resolve, reject) => {
        sqliteDb.all(`SELECT * FROM ${table}`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      if (rows.length === 0) {
        console.log(`- 0 rows to migrate.`);
        continue;
      }
      
      // Get column names
      const columns = Object.keys(rows[0]);
      
      // Clear target table
      await pgClient.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      
      for (const row of rows) {
        const values = columns.map(col => row[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        
        await pgClient.query(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }
      
      console.log(`- Migrated ${rows.length} rows.`);
    }
    
    // Re-enable foreign key checks
    await pgClient.query("SET session_replication_role = 'origin';");
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pgClient.release();
    await pool.end();
    sqliteDb.close();
  }
}

migrate();
