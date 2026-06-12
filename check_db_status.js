const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

const tables = ['readings', 'tank_readings', 'rates', 'cash_reconciliation'];

db.serialize(() => {
  tables.forEach((table) => {
    db.get(`SELECT COUNT(*) AS count FROM ${table}`, (err, row) => {
      if (err) {
        console.error(`Error querying table ${table}:`, err.message);
      } else {
        console.log(`Table "${table}" has ${row.count} records.`);
      }
    });
  });
});

db.close();
