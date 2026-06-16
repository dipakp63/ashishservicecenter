const db = require('./db');

async function test() {
  await db.initDatabase();
  try {
    const res = await db.batch([{
      sql: `INSERT INTO debtor_transactions (debtor_id, transaction_date, transaction_type, description, debit_amount, credit_amount) VALUES (?, ?, 'DEBIT', 'Credit Sale (Day Closing)', ?, 0)`,
      args: [1, '2026-06-28', 500]
    }]);
    console.log('BATCH OK', res);
  } catch (e) {
    console.log('BATCH ERR:', e);
  }
}

test();
