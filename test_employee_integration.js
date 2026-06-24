process.env.DATABASE_FILE = process.env.DATABASE_FILE || 'database_test.sqlite';
const db = require('./db');

async function runIntegrationTest() {
  console.log('Initializing DB for Integration Test...');
  await db.initDatabase();
  console.log('DB initialized.');

  console.log('\n--- Rigorous Employee Integration Testing ---');
  
  const testName = 'Integration Test Employee ' + Date.now();
  let employeeId = null;

  try {
    // 1. Add employee
    const addRes = await db.run(`INSERT INTO employees (name, mobile) VALUES (?, ?)`, [testName, '1122334455']);
    employeeId = addRes.lastInsertRowid;
    console.log(`[OK] Added Employee (ID: ${employeeId})`);

    // 2. Add Transactions in May 2026
    // Give 2000 advance on 2026-05-10
    await db.run(`
      INSERT INTO employee_transactions (employee_id, transaction_date, transaction_type, advance_given, amount_settled, description)
      VALUES (?, ?, 'Advance Given', 2000, 0, 'May Advance')
    `, [employeeId, '2026-05-10']);

    // Settle 800 on 2026-05-20
    await db.run(`
      INSERT INTO employee_transactions (employee_id, transaction_date, transaction_type, advance_given, amount_settled, description)
      VALUES (?, ?, 'Advance Settled', 0, 800, 'May Settlement')
    `, [employeeId, '2026-05-20']);

    console.log('[OK] Added May transactions (Given: 2000, Settled: 800, Outstanding: 1200)');

    // 2.5. Add Transactions in April 2026 for Prune Testing
    // Give 1000 advance on 2026-04-20
    await db.run(`
      INSERT INTO employee_transactions (employee_id, transaction_date, transaction_type, advance_given, amount_settled, description)
      VALUES (?, ?, 'Advance Given', 1000, 0, 'April Advance')
    `, [employeeId, '2026-04-20']);
    console.log('[OK] Added April transaction (Given: 1000)');

    // 3. Add Transactions in June 2026
    // Give 1500 advance on 2026-06-05
    await db.run(`
      INSERT INTO employee_transactions (employee_id, transaction_date, transaction_type, advance_given, amount_settled, description)
      VALUES (?, ?, 'Advance Given', 1500, 0, 'June Advance')
    `, [employeeId, '2026-06-05']);

    // Settle 1000 on 2026-06-15
    await db.run(`
      INSERT INTO employee_transactions (employee_id, transaction_date, transaction_type, advance_given, amount_settled, description)
      VALUES (?, ?, 'Advance Settled', 0, 1000, 'June Settlement')
    `, [employeeId, '2026-06-15']);

    console.log('[OK] Added June transactions (Given: 1500, Settled: 1000)');

    // 3.5. Verify Pruning Logic
    // Active date is June 2026 (e.g. '2026-06-15').
    // The previous calendar month is May 2026.
    // We expect transactions before '2026-05-01' (like April) to be pruned.
    const activeDate = '2026-06-15';
    const [y, m] = activeDate.split('-');
    const limitDate = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, 1));
    limitDate.setUTCMonth(limitDate.getUTCMonth() - 1);
    const limitStr = `${limitDate.getUTCFullYear()}-${String(limitDate.getUTCMonth() + 1).padStart(2, '0')}-01`;

    const beforePrune = await db.get(`SELECT COUNT(*) AS count FROM employee_transactions WHERE employee_id = ? AND transaction_date < ?`, [employeeId, limitStr]);
    if (beforePrune.count !== 1) throw new Error('April transaction should exist before pruning');

    // Perform prune
    await db.run('DELETE FROM employee_transactions WHERE transaction_date < ?', [limitStr]);

    const afterPrune = await db.get(`SELECT COUNT(*) AS count FROM employee_transactions WHERE employee_id = ? AND transaction_date < ?`, [employeeId, limitStr]);
    if (afterPrune.count !== 0) throw new Error('April transaction should be pruned');

    const mayCount = await db.get(`SELECT COUNT(*) AS count FROM employee_transactions WHERE employee_id = ? AND strftime('%Y-%m', transaction_date) = '2026-05'`, [employeeId]);
    if (mayCount.count !== 2) throw new Error('May transactions should be retained');

    const juneCount = await db.get(`SELECT COUNT(*) AS count FROM employee_transactions WHERE employee_id = ? AND strftime('%Y-%m', transaction_date) = '2026-06'`, [employeeId]);
    if (juneCount.count !== 2) throw new Error('June transactions should be retained');

    console.log('[PASS] Pruning verification successful. April records pruned, May & June retained.');

    // 4. Verify May Register Query
    const mayRows = await db.all(`
      SELECT 
        e.id, 
        e.name, 
        0 AS opening_balance,
        COALESCE((SELECT SUM(advance_given) FROM employee_transactions
          WHERE employee_id = e.id AND strftime('%Y-%m', transaction_date) = '2026-05'), 0) AS month_given,
        COALESCE((SELECT SUM(amount_settled) FROM employee_transactions
          WHERE employee_id = e.id AND strftime('%Y-%m', transaction_date) = '2026-05'), 0) AS month_settled
      FROM employees e WHERE e.id = ?
    `, [employeeId]);

    const mayData = mayRows[0];
    console.log('\nMay 2026 Query Results:', mayData);
    if (mayData.opening_balance !== 0) throw new Error('May opening balance should be 0');
    if (mayData.month_given !== 2000) throw new Error('May given should be 2000');
    if (mayData.month_settled !== 800) throw new Error('May settled should be 800');
    console.log('[PASS] May register verification successful.');

    // 5. Verify June Register Query (should have 0 opening balance under new rules)
    const juneRows = await db.all(`
      SELECT 
        e.id, 
        e.name, 
        0 AS opening_balance,
        COALESCE((SELECT SUM(advance_given) FROM employee_transactions
          WHERE employee_id = e.id AND strftime('%Y-%m', transaction_date) = '2026-06'), 0) AS month_given,
        COALESCE((SELECT SUM(amount_settled) FROM employee_transactions
          WHERE employee_id = e.id AND strftime('%Y-%m', transaction_date) = '2026-06'), 0) AS month_settled
      FROM employees e WHERE e.id = ?
    `, [employeeId]);

    const juneData = juneRows[0];
    console.log('\nJune 2026 Query Results:', juneData);
    if (juneData.opening_balance !== 0) throw new Error('June opening balance should be 0');
    if (juneData.month_given !== 1500) throw new Error('June given should be 1500');
    if (juneData.month_settled !== 1000) throw new Error('June settled should be 1000');
    console.log('[PASS] June register verification successful.');

    // 6. Verify June Ledger Query & Running Balance
    const openingBalance = 0;

    const txRows = await db.all(`
      SELECT id, transaction_date, transaction_type, description, advance_given, amount_settled
      FROM employee_transactions WHERE employee_id = ?
        AND strftime('%Y-%m', transaction_date) = '2026-06'
      ORDER BY transaction_date ASC, id ASC
    `, [employeeId]);

    let runningBalance = openingBalance;
    const transactions = txRows.map(row => {
      runningBalance += (row.advance_given || 0) - (row.amount_settled || 0);
      return { ...row, running_balance: parseFloat(runningBalance.toFixed(2)) };
    });

    console.log('\nJune 2026 Ledger Results:');
    console.log(`Opening Balance: ${openingBalance}`);
    transactions.forEach(t => {
      console.log(`Date: ${t.transaction_date} | Type: ${t.transaction_type} | Given: ${t.advance_given} | Settled: ${t.amount_settled} | Running Bal: ${t.running_balance}`);
    });

    if (openingBalance !== 0) throw new Error('Ledger opening balance should be 0');
    if (transactions[0].running_balance !== 1500) throw new Error('First transaction running balance should be 1500 (0 + 1500)');
    if (transactions[1].running_balance !== 500) throw new Error('Second transaction running balance should be 500 (1500 - 1000)');
    console.log('[PASS] June ledger and running balance verification successful.');

    // 7. Verify Employee Deletion Constraint (outstanding balance is 1700, should block deletion)
    const deleteCheckRow = await db.get(`
      SELECT COALESCE(SUM(advance_given), 0) - COALESCE(SUM(amount_settled), 0) AS outstanding
      FROM employee_transactions WHERE employee_id = ?
    `, [employeeId]);
    const totalOutstanding = parseFloat((deleteCheckRow && deleteCheckRow.outstanding) || 0);
    console.log(`\nChecking deletion constraint. Total outstanding across all time: ${totalOutstanding}`);
    if (totalOutstanding !== 1700) throw new Error('Total outstanding should be 1700');

    console.log('[PASS] Deletion constraint verification successful.');

  } catch (err) {
    console.error('\n[FAIL] Integration test failed:', err.message);
  } finally {
    // Cleanup
    if (employeeId) {
      console.log('\nCleaning up test data...');
      await db.run(`DELETE FROM employee_transactions WHERE employee_id = ?`, [employeeId]);
      await db.run(`DELETE FROM employees WHERE id = ?`, [employeeId]);
      console.log('Cleanup complete.');
    }
    console.log('\nIntegration Test Run Finished.');
  }
}

runIntegrationTest();
