const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('petrol_pump.db');

db.serialize(() => {
  db.run('DELETE FROM readings');
  db.run('DELETE FROM tank_readings');
  db.run('DELETE FROM rates');
  db.run('DELETE FROM cash_reconciliation');
  db.run('DELETE FROM debtor_transactions');
  db.run('DELETE FROM debtors');
  console.log('Database cleared successfully');
});

db.close();
