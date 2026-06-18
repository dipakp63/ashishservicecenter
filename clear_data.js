const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  console.log('Connected to the SQLite database.');

  db.serialize(() => {
    db.run('DELETE FROM readings', (err) => {
      if (err) console.error('Error clearing readings:', err.message);
      else console.log('Table "readings" cleared.');
    });

    db.run('DELETE FROM tank_readings', (err) => {
      if (err) console.error('Error clearing tank_readings:', err.message);
      else console.log('Table "tank_readings" cleared.');
    });

    db.run('DELETE FROM rates', (err) => {
      if (err) console.error('Error clearing rates:', err.message);
      else console.log('Table "rates" cleared.');
    });

    db.run('DELETE FROM cash_reconciliation', (err) => {
      if (err) console.error('Error clearing cash_reconciliation:', err.message);
      else console.log('Table "cash_reconciliation" cleared.');
    });

    db.run('DELETE FROM non_cash_payments', (err) => {
      if (err) console.error('Error clearing non_cash_payments:', err.message);
      else console.log('Table "non_cash_payments" cleared.');
    });

    db.run('DELETE FROM debtor_transactions', (err) => {
      if (err) console.error('Error clearing debtor_transactions:', err.message);
      else console.log('Table "debtor_transactions" cleared.');
    });

    db.run('DELETE FROM debtors', (err) => {
      if (err) console.error('Error clearing debtors:', err.message);
      else console.log('Table "debtors" cleared.');
    });

    db.run('DELETE FROM hpcl_transactions', (err) => {
      if (err) console.error('Error clearing hpcl_transactions:', err.message);
      else console.log('Table "hpcl_transactions" cleared.');
    });

    db.run('DELETE FROM hpcl_config', (err) => {
      if (err) console.error('Error clearing hpcl_config:', err.message);
      else console.log('Table "hpcl_config" cleared.');
    });

    db.run("INSERT INTO hpcl_config (key, value) VALUES ('hpcl_opening_balance', '4700')", (err) => {
      if (err) console.error('Error seeding hpcl_opening_balance:', err.message);
      else console.log('Seeded default opening balance ₹4,700.');
    });

    db.run('DELETE FROM employee_transactions', (err) => {
      if (err) console.error('Error clearing employee_transactions:', err.message);
      else console.log('Table "employee_transactions" cleared.');
    });

    db.run('DELETE FROM employees', (err) => {
      if (err) console.error('Error clearing employees:', err.message);
      else console.log('Table "employees" cleared.');
    });

    db.run('DELETE FROM tt_transactions', (err) => {
      if (err) console.error('Error clearing tt_transactions:', err.message);
      else console.log('Table "tt_transactions" cleared.');
    });
  });

  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    else console.log('Database connection closed.');
  });
});
