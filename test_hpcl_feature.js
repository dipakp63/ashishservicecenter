const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');

const dbFile = process.env.DATABASE_FILE || 'database_test.sqlite';
const dbPath = path.join(__dirname, dbFile);

const testPort = process.env.PORT || 3000;

const sendRequest = (path, method, payload) => {
  const stringPayload = payload ? JSON.stringify(payload) : '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: testPort,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(stringPayload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (stringPayload) {
      req.write(stringPayload);
    }
    req.end();
  });
};

const runTest = async () => {
  console.log('--- HPCL Portal Balance Tracker Integration Test ---');
  
  // 1. Clear database
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open database:', err.message);
      process.exit(1);
    }
  });

  console.log('Clearing HPCL database tables...');
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM hpcl_transactions');
      db.run('DELETE FROM cash_reconciliation');
      db.run('DELETE FROM hpcl_config', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // Re-seed opening balance to ensure clean start
  await new Promise((resolve, reject) => {
    db.run(`INSERT OR REPLACE INTO hpcl_config (key, value) VALUES ('hpcl_opening_balance', '4700')`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  db.close();

  try {
    // 2. Fetch summary to verify initial default opening balance
    console.log('\nChecking initial HPCL summary (default ₹4700)...');
    const summaryRes = await sendRequest('/api/hpcl/summary', 'GET');
    console.log('Summary output:', summaryRes.body);
    if (summaryRes.statusCode !== 200) {
      throw new Error(`Failed to fetch summary: ${JSON.stringify(summaryRes.body)}`);
    }
    if (summaryRes.body.opening_balance !== 4700 || summaryRes.body.current_balance !== 4700) {
      throw new Error(`Expected opening and current balance to be 4700, got opening=${summaryRes.body.opening_balance}, current=${summaryRes.body.current_balance}`);
    }
    console.log('🎉 Default opening balance check passed.');

    // 3. Post a CREDIT (RTGS Load) of ₹1,400,000
    console.log('\nPosting Credit (RTGS of ₹1400000)...');
    const creditPayload = {
      date: '2026-06-01',
      description: 'RTGS Ref: 12345',
      type: 'CREDIT',
      amount: 1400000
    };
    const creditRes = await sendRequest('/api/hpcl/transaction', 'POST', creditPayload);
    console.log('Credit response:', creditRes.body);
    if (creditRes.statusCode !== 200) {
      throw new Error(`Failed to post credit: ${JSON.stringify(creditRes.body)}`);
    }
    if (creditRes.body.transaction.running_balance !== 1404700) {
      throw new Error(`Expected running balance to be 1404700, got ${creditRes.body.transaction.running_balance}`);
    }
    console.log('🎉 Credit posting running balance check passed.');

    // 4. Post a DEBIT (Tanker Invoice Allotment) of ₹1,000,000
    console.log('\nPosting Debit (Tanker Invoice of ₹1000000)...');
    const debitPayload = {
      date: '2026-06-02',
      description: 'Tanker Invoice No: 987654',
      type: 'DEBIT',
      amount: 1000000
    };
    const debitRes = await sendRequest('/api/hpcl/transaction', 'POST', debitPayload);
    console.log('Debit response:', debitRes.body);
    if (debitRes.statusCode !== 200) {
      throw new Error(`Failed to post debit: ${JSON.stringify(debitRes.body)}`);
    }
    if (debitRes.body.transaction.running_balance !== 404700) {
      throw new Error(`Expected running balance to be 404700, got ${debitRes.body.transaction.running_balance}`);
    }
    console.log('🎉 Debit posting running balance check passed.');

    // 5. Post 10 more transactions (total 12) to test limit to last 10 entries descending
    console.log('\nPosting 10 additional transactions...');
    for (let i = 1; i <= 10; i++) {
      const dateStr = `2026-06-${String(i + 2).padStart(2, '0')}`;
      const payload = {
        date: dateStr,
        description: `Auto Tx ${i}`,
        type: i % 2 === 0 ? 'CREDIT' : 'DEBIT',
        amount: 10000 * i
      };
      const res = await sendRequest('/api/hpcl/transaction', 'POST', payload);
      if (res.statusCode !== 200) {
        throw new Error(`Failed to post auto transaction ${i}`);
      }
    }

    console.log('\nFetching last 10 transactions...');
    const listRes = await sendRequest('/api/hpcl/transactions', 'GET');
    if (listRes.statusCode !== 200) {
      throw new Error('Failed to fetch transaction list');
    }
    console.log(`Number of transactions returned: ${listRes.body.length} (Expected: 10)`);
    if (listRes.body.length !== 10) {
      throw new Error(`Expected exactly 10 transactions, got ${listRes.body.length}`);
    }
    
    // Ensure descending order (newest date first)
    console.log('Verifying sorting descending (newest date first)...');
    for (let i = 0; i < 9; i++) {
      const date1 = new Date(listRes.body[i].date);
      const date2 = new Date(listRes.body[i + 1].date);
      if (date1 < date2) {
        throw new Error(`Transactions not in descending order: ${listRes.body[i].date} is after ${listRes.body[i+1].date}`);
      }
    }
    console.log('🎉 Descending sorting check passed.');

    // 6. Delete a transaction and verify recalculation of running balances
    // Let's get the list of ALL transactions directly from SQLite to see the running balances first
    const dbInspect = new sqlite3.Database(dbPath);
    let allTxBefore = [];
    await new Promise((resolve) => {
      dbInspect.all(`SELECT * FROM hpcl_transactions ORDER BY date ASC, id ASC`, (err, rows) => {
        allTxBefore = rows;
        resolve();
      });
    });
    
    console.log('\nLedger before voiding transaction:');
    allTxBefore.forEach(t => console.log(`ID: ${t.id} | Date: ${t.date} | ${t.type} | Amount: ${t.amount} | Bal: ${t.running_balance}`));
    
    // Let's void/delete the transaction with ID = 2 (which is the Debit of 1000000)
    // Running balance before voiding:
    // Starting balance = 4700
    // Tx 1: Credit + 1400000 -> Bal = 1404700
    // Tx 2 (to delete): Debit - 1000000 -> Bal = 404700
    // Tx 3: Debit - 10000 -> Bal = 394700
    // If Tx 2 is deleted:
    // Starting balance = 4700
    // Tx 1: Credit + 1400000 -> Bal = 1404700
    // Tx 3: Debit - 10000 -> Bal = 1394700 (it should recalculate to 1394700 instead of 394700!)
    const targetTx = allTxBefore.find(t => t.description.includes('Tanker Invoice'));
    const deleteId = targetTx.id;
    console.log(`\nVoiding/Deleting transaction ID ${deleteId} (Debit of 1000000)...`);
    const deleteRes = await sendRequest(`/api/hpcl/transaction/${deleteId}`, 'DELETE');
    console.log('Delete API Response:', deleteRes.body);
    if (deleteRes.statusCode !== 200) {
      throw new Error(`Failed to delete transaction: ${JSON.stringify(deleteRes.body)}`);
    }

    let allTxAfter = [];
    await new Promise((resolve) => {
      dbInspect.all(`SELECT * FROM hpcl_transactions ORDER BY date ASC, id ASC`, (err, rows) => {
        allTxAfter = rows;
        resolve();
      });
    });
    
    console.log('\nLedger after voiding transaction:');
    allTxAfter.forEach(t => console.log(`ID: ${t.id} | Date: ${t.date} | ${t.type} | Amount: ${t.amount} | Bal: ${t.running_balance}`));

    // Find the next transaction in the sequence (Auto Tx 1, which was a Debit of 10000 on 2026-06-03)
    const nextTx = allTxAfter.find(t => t.description === 'Auto Tx 1');
    console.log(`Checking recalculated balance of ${nextTx.description}. Expected: 1394700, Got: ${nextTx.running_balance}`);
    if (nextTx.running_balance !== 1394700) {
      throw new Error(`Running balance was not recalculated correctly! Expected 1394700, got ${nextTx.running_balance}`);
    }
    console.log('🎉 Deletion ledger recalculation passed.');

    // 7. Change the opening balance to ₹10,000 and verify all transactions shift by +5300 (10000 - 4700)
    console.log('\nUpdating opening balance to ₹10000...');
    const changeOpRes = await sendRequest('/api/hpcl/opening-balance', 'POST', { opening_balance: 10000 });
    console.log('Opening balance update response:', changeOpRes.body);
    if (changeOpRes.statusCode !== 200) {
      throw new Error(`Failed to change opening balance: ${JSON.stringify(changeOpRes.body)}`);
    }

    let allTxAfterOpChange = [];
    await new Promise((resolve) => {
      dbInspect.all(`SELECT * FROM hpcl_transactions ORDER BY date ASC, id ASC`, (err, rows) => {
        allTxAfterOpChange = rows;
        resolve();
      });
    });

    console.log('\nLedger after opening balance change:');
    allTxAfterOpChange.forEach(t => console.log(`ID: ${t.id} | Date: ${t.date} | ${t.type} | Amount: ${t.amount} | Bal: ${t.running_balance}`));

    // Transaction 1 (Credit + 1400000) should now have running balance = 1410000 (10000 + 1400000)
    const tx1Recalculated = allTxAfterOpChange.find(t => t.description.includes('RTGS'));
    console.log(`Checking shifted balance of first credit. Expected: 1410000, Got: ${tx1Recalculated.running_balance}`);
    if (tx1Recalculated.running_balance !== 1410000) {
      throw new Error(`Expected first credit running balance to be 1410000, got ${tx1Recalculated.running_balance}`);
    }

    // Testing Reset Endpoint
    console.log('\nTesting Reset Endpoint...');
    const resetRes = await sendRequest('/api/hpcl/reset', 'POST');
    if (resetRes.statusCode !== 200) {
      throw new Error(`Failed to reset HPCL tracker: ${JSON.stringify(resetRes.body)}`);
    }
    console.log('Reset response:', resetRes.body);

    // Verify database directly
    let txCountAfterReset = -1;
    await new Promise((resolve) => {
      dbInspect.all(`SELECT COUNT(*) AS cnt FROM hpcl_transactions`, (err, rows) => {
        txCountAfterReset = rows[0].cnt;
        resolve();
      });
    });
    console.log(`Checking transaction count after reset. Expected: 0, Got: ${txCountAfterReset}`);
    if (txCountAfterReset !== 0) {
      throw new Error(`Expected 0 transactions after reset, got ${txCountAfterReset}`);
    }

    let openingBalanceAfterReset = null;
    await new Promise((resolve) => {
      dbInspect.all(`SELECT value FROM hpcl_config WHERE key = 'hpcl_opening_balance'`, (err, rows) => {
        openingBalanceAfterReset = rows[0]?.value;
        resolve();
      });
    });
    console.log(`Checking config opening balance after reset. Expected: '0', Got: '${openingBalanceAfterReset}'`);
    if (openingBalanceAfterReset !== '0') {
      throw new Error(`Expected opening balance config to be '0', got '${openingBalanceAfterReset}'`);
    }

    // Verify summary endpoint response after reset
    const summaryResAfterReset = await sendRequest('/api/hpcl/summary', 'GET');
    console.log('Summary response after reset:', summaryResAfterReset.body);
    if (summaryResAfterReset.body.opening_balance !== 0) {
      throw new Error(`Expected summary opening_balance to be 0, got ${summaryResAfterReset.body.opening_balance}`);
    }
    if (summaryResAfterReset.body.current_balance !== 0) {
      throw new Error(`Expected summary current_balance to be 0, got ${summaryResAfterReset.body.current_balance}`);
    }

    dbInspect.close();
    console.log('\n🎉 ALL HPCL PORTAL BALANCE TRACKER TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
};

runTest();
