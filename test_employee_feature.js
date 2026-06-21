const db = require('./db');

async function testEmployees() {
  console.log('Initializing DB...');
  await db.initDatabase();
  console.log('DB initialized.');

  console.log('\n--- Testing Employee Management ---');

  try {
    // 1. Add an employee
    const addRes = await db.run(`INSERT INTO employees (name, mobile) VALUES (?, ?)`, ['Test Employee', '9876543210']);
    const employeeId = addRes.lastInsertRowid;
    console.log(`[OK] Added Employee: Test Employee (ID: ${employeeId})`);

    // 2. Fetch employees
    const employees = await db.all(`
      SELECT e.*, 
             (SELECT COALESCE(SUM(advance_given) - SUM(amount_settled), 0) FROM employee_transactions WHERE employee_id = e.id) as outstanding_advance
      FROM employees e
    `);
    console.log(`[OK] Fetched Employees:`, employees);

    // 3. Add a transaction (Advance)
    await db.run(`
      INSERT INTO employee_transactions (employee_id, transaction_date, transaction_type, advance_given, amount_settled, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [employeeId, '2026-06-18', 'ADVANCE', 1000, 0, 'Initial Advance']);
    console.log(`[OK] Added Advance Transaction of 1000`);

    // 4. Fetch ledger
    const ledger = await db.all(`SELECT * FROM employee_transactions WHERE employee_id = ? ORDER BY transaction_date ASC, id ASC`, [employeeId]);
    console.log(`[OK] Fetched Ledger for Employee ${employeeId}:`, ledger);

    // 5. Cleanup
    await db.run(`DELETE FROM employees WHERE id = ?`, [employeeId]);
    console.log(`[OK] Deleted test employee`);
    
    console.log('\nAll Employee tests passed successfully!');
  } catch (e) {
    console.error('Test failed:', e);
  }
}

testEmployees();
