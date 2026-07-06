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
  console.log('--- Missing Features Integration Test ---');

  // Initialize the database tables if they do not exist
  try {
    const dbInitializer = require('./db');
    await dbInitializer.initDatabase();
  } catch (err) {
    console.error('Failed to initialize database schema in test:', err.message);
  }

  // 1. Clear database tables
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open database:', err.message);
      process.exit(1);
    }
  });

  console.log('Clearing database tables...');
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM chillar_transactions');
      db.run('DELETE FROM porancha_hishob_entries');
      db.run('DELETE FROM porancha_hishob_testing');
      db.run('DELETE FROM readings');
      db.run('DELETE FROM rates');
      db.run('DELETE FROM cash_reconciliation', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  db.close();

  try {
    // ── Test 1: Chillar Initial Status ──
    console.log('\nChecking initial Chillar status...');
    const statusRes1 = await sendRequest('/api/chillar/status', 'GET');
    console.log('Initial Status:', statusRes1.body);
    if (statusRes1.statusCode !== 200) throw new Error('Status fetch failed.');
    if (statusRes1.body.total_amount !== 0) throw new Error(`Expected total to be 0, got ${statusRes1.body.total_amount}`);

    // ── Test 2: Chillar Opening Balance ──
    console.log('\nSetting Chillar opening balance...');
    const openingPayload = {
      notes_10: 10,  // 100
      coins_20: 5,   // 100
      coins_10: 0,
      coins_5: 0,
      coins_2: 0,
      coins_1: 0
    };
    const openRes = await sendRequest('/api/chillar/opening', 'POST', openingPayload);
    console.log('Opening balance response:', openRes.body);
    if (openRes.statusCode !== 200) throw new Error('Failed to set opening balance.');

    const statusRes2 = await sendRequest('/api/chillar/status', 'GET');
    console.log('New Status:', statusRes2.body);
    if (statusRes2.body.total_amount !== 200) throw new Error(`Expected total to be 200, got ${statusRes2.body.total_amount}`);

    // ── Test 3: Chillar Manual CREDIT ──
    console.log('\nAdding Chillar Credit adjustment...');
    const creditPayload = {
      date: '2026-06-27',
      type: 'MANUAL_CREDIT',
      description: 'Found extra change',
      notes_10: 0,
      coins_20: 0,
      coins_10: 5,  // 50
      coins_5: 0,
      coins_2: 0,
      coins_1: 0
    };
    const creditRes = await sendRequest('/api/chillar/transaction', 'POST', creditPayload);
    console.log('Credit response:', creditRes.body);
    if (creditRes.statusCode !== 200) throw new Error('Failed to save credit.');

    const statusRes3 = await sendRequest('/api/chillar/status', 'GET');
    console.log('New Status:', statusRes3.body);
    if (statusRes3.body.total_amount !== 250) throw new Error(`Expected total to be 250, got ${statusRes3.body.total_amount}`);

    // ── Test 4: Chillar Manual DEBIT ──
    console.log('\nAdding Chillar Debit adjustment...');
    const debitPayload = {
      date: '2026-06-27',
      type: 'MANUAL_DEBIT',
      description: 'Used for office tea',
      notes_10: 0,
      coins_20: 0,
      coins_10: 0,
      coins_5: 4,   // 20
      coins_2: 0,
      coins_1: 0
    };
    const debitRes = await sendRequest('/api/chillar/transaction', 'POST', debitPayload);
    console.log('Debit response:', debitRes.body);
    if (debitRes.statusCode !== 200) throw new Error('Failed to save debit.');

    const statusRes4 = await sendRequest('/api/chillar/status', 'GET');
    console.log('New Status:', statusRes4.body);
    if (statusRes4.body.total_amount !== 230) throw new Error(`Expected total to be 230, got ${statusRes4.body.total_amount}`);

    // ── Test 5: Fetching Transactions List ──
    console.log('\nFetching Chillar transactions history...');
    const txRes = await sendRequest('/api/chillar/transactions', 'GET');
    const transactions = txRes.body.transactions || [];
    console.log('Number of transactions returned:', transactions.length);
    if (txRes.statusCode !== 200) throw new Error('Failed to fetch transactions.');
    if (transactions.length !== 3) throw new Error(`Expected 3 transactions, got ${transactions.length}`);
    
    // Check running balance calculations
    console.log('Transactions detail:', transactions);
    const manualTx = transactions.find(tx => tx.description === 'Found extra change');
    if (!manualTx || manualTx.running_balance !== 250) {
      throw new Error(`Expected running balance after credit to be 250, got ${manualTx ? manualTx.running_balance : 'undefined'}`);
    }

    // ── Test 6: Deleting manual transaction ──
    console.log(`\nDeleting transaction ID: ${manualTx.id}...`);
    const delRes = await sendRequest(`/api/chillar/transaction/${manualTx.id}`, 'DELETE');
    console.log('Delete response:', delRes.body);
    if (delRes.statusCode !== 200) throw new Error('Delete transaction failed.');

    const statusRes5 = await sendRequest('/api/chillar/status', 'GET');
    console.log('Status after deletion:', statusRes5.body);
    if (statusRes5.body.total_amount !== 180) throw new Error(`Expected total to be 180, got ${statusRes5.body.total_amount}`);


    // ── Test 6b: Clear Chillar Data ──
    console.log('\nTesting Clear Chillar Data...');
    const clearRes = await sendRequest('/api/chillar/clear', 'POST');
    console.log('Clear response:', clearRes.body);
    if (clearRes.statusCode !== 200) throw new Error('Clear chillar data failed.');

    const statusRes5b = await sendRequest('/api/chillar/status', 'GET');
    console.log('Status after clearing:', statusRes5b.body);
    if (statusRes5b.body.total_amount !== 0) throw new Error(`Expected total to be 0 after clear, got ${statusRes5b.body.total_amount}`);
    if (statusRes5b.body.notes_10 !== 0 || statusRes5b.body.coins_20 !== 0) {
      throw new Error('Expected all coin counts to be 0 after clear.');
    }

    const txRes5b = await sendRequest('/api/chillar/transactions', 'GET');
    const transactions5b = txRes5b.body.transactions || [];
    console.log('Number of transactions after clear:', transactions5b.length);
    if (transactions5b.length !== 0) throw new Error('Expected 0 transactions after clear.');


    // ── Test 7: Porancha Hishob (Blocked day check) ──
    console.log('\nTesting Porancha Hishob for non-closed date 2026-06-27...');
    const checkRes1 = await sendRequest('/api/readings/opening?date=2026-06-27', 'GET');
    console.log('Date closed state:', checkRes1.body.isClosed);
    if (checkRes1.body.isClosed) throw new Error('Expected date to be open.');

    // ── Test 8: Porancha Hishob with Finalized Day ──
    console.log('\nSeeding database with finalized readings for 2026-06-27...');
    const testDb = new sqlite3.Database(dbPath);
    await new Promise((resolve, reject) => {
      testDb.serialize(() => {
        // Seed 6 nozzles
        const nozzleStmt = testDb.prepare('INSERT INTO readings (date, nozzle_id, product, opening_reading, closing_reading, testing_qty) VALUES (?, ?, ?, ?, ?, ?)');
        nozzleStmt.run('2026-06-27', 1, 'Petrol', 10, 20, 5);
        nozzleStmt.run('2026-06-27', 2, 'Petrol', 10, 20, 0);
        nozzleStmt.run('2026-06-27', 3, 'Petrol', 10, 20, 0);
        nozzleStmt.run('2026-06-27', 4, 'Diesel', 10, 20, 0);
        nozzleStmt.run('2026-06-27', 5, 'Diesel', 10, 20, 0);
        nozzleStmt.run('2026-06-27', 6, 'poWer', 10, 20, 0);
        nozzleStmt.finalize();

        // Seed rates
        testDb.run("INSERT INTO rates (date, rate_power, rate_petrol, rate_diesel) VALUES ('2026-06-27', 110, 100, 90)");

        // Close day (cash_reconciliation)
        testDb.run("INSERT INTO cash_reconciliation (date, total_sales_value, total_cash_received, shortfall) VALUES ('2026-06-27', 1000, 1000, 0)", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    testDb.close();

    const checkRes2 = await sendRequest('/api/readings/opening?date=2026-06-27', 'GET');
    console.log('Date closed state after seeding:', checkRes2.body.isClosed);
    if (!checkRes2.body.isClosed) throw new Error('Expected date to be closed.');

    // ── Test 9: Get Shift entries for the date (should be empty initially but return testing nozzles) ──
    console.log('\nFetching initial shift details...');
    const hishobGetRes1 = await sendRequest('/api/porancha-hishob?date=2026-06-27', 'GET');
    console.log('Entries length:', hishobGetRes1.body.entries.length);
    console.log('Testing entries length:', hishobGetRes1.body.testing.length);
    if (hishobGetRes1.body.entries.length !== 0) throw new Error('Expected no shift entries saved yet.');
    if (hishobGetRes1.body.testing.length !== 6) throw new Error('Expected 6 nozzle testing rows.');

    // ── Test 10: Saving shift entries and testing data ──
    console.log('\nSaving shift entries...');
    const hishobSavePayload = {
      date: '2026-06-27',
      entries: [
        { shift: 1, nozzle_index: 1, product: 'Petrol', employee_id: 1, opening_reading: 10, closing_reading: 15, difference_sale: 5, rate: 100, final_amount: 500, phonepe_amount: 0 },
        { shift: 2, nozzle_index: 1, product: 'Petrol', employee_id: 2, opening_reading: 15, closing_reading: 20, difference_sale: 5, rate: 100, final_amount: 500, phonepe_amount: 0 }
      ],
      testing: [
        { nozzle_index: 1, employee_id: 1, testing_qty: 5, phonepe_amount: 0 }
      ]
    };
    const hishobSaveRes = await sendRequest('/api/porancha-hishob', 'POST', hishobSavePayload);
    console.log('Save shift response:', hishobSaveRes.body);
    if (hishobSaveRes.statusCode !== 200) throw new Error('Failed to save shift details.');

    // ── Test 11: Fetching saved shift entries ──
    console.log('\nFetching saved shift details...');
    const hishobGetRes2 = await sendRequest('/api/porancha-hishob?date=2026-06-27', 'GET');
    console.log('Entries length after save:', hishobGetRes2.body.entries.length);
    console.log('Testing entries after save:', hishobGetRes2.body.testing);
    if (hishobGetRes2.body.entries.length !== 2) throw new Error('Expected 2 shift entries saved.');
    if (hishobGetRes2.body.testing[0].employee_id !== 1 || hishobGetRes2.body.testing[0].testing_qty !== 5) {
      throw new Error('Testing row details do not match saved payload.');
    }

    // ── Test 12: TT Auto-Sync to Expenses Ledger ──
    console.log('\nTesting TT Auto-Sync to Expenses Ledger...');
    
    // Clear existing TT entries/transactions to make assertion predictable
    const cleanupDb = new sqlite3.Database(dbPath);
    await new Promise((resolve, reject) => {
      cleanupDb.serialize(() => {
        cleanupDb.run('DELETE FROM tt_entries');
        cleanupDb.run('DELETE FROM tt_transactions', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    cleanupDb.close();

    // 1. Add Trip Entry
    console.log('Adding trip entry...');
    const tripPayload = {
      date: '2026-06-27',
      trip_for: 'Pimpalgaon',
      entry_given: 'Yes',
      remark1: '800',
      remark2: 'Test Remark'
    };
    const addTripRes = await sendRequest('/api/tt/entries', 'POST', tripPayload);
    if (addTripRes.statusCode !== 200) throw new Error('Failed to add trip entry');
    
    // Fetch entries to get the entry ID
    const entriesRes = await sendRequest('/api/tt/entries?month=2026-06', 'GET');
    const entry = entriesRes.body.entries[0];
    if (!entry) throw new Error('Expected trip entry to exist.');
    const entryId = entry.id;

    // Fetch TT Ledger (Expenses Ledger) to verify auto-sync
    const txRes1 = await sendRequest('/api/tt/transactions?month=2026-06', 'GET');
    console.log('TT Ledger after add:', txRes1.body.transactions);
    const tx1 = txRes1.body.transactions.find(t => t.tt_entry_id === entryId);
    if (!tx1) throw new Error('Expected auto-synced transaction to exist in ledger.');
    if (tx1.amount !== 800) throw new Error(`Expected amount 800, got ${tx1.amount}`);
    if (tx1.type !== 'DEBIT') throw new Error(`Expected type DEBIT, got ${tx1.type}`);
    if (!tx1.description.includes('Pimpalgaon')) throw new Error(`Expected description to contain Pimpalgaon, got ${tx1.description}`);

    // 2. Edit Trip Entry
    console.log('Editing trip entry...');
    const editPayload = {
      date: '2026-06-27',
      trip_for: 'Wakod',
      entry_given: 'Yes',
      remark1: '780',
      remark2: 'Updated Remark'
    };
    const editRes = await sendRequest(`/api/tt/entries/${entryId}`, 'PUT', editPayload);
    if (editRes.statusCode !== 200) throw new Error('Failed to edit trip entry');

    // Fetch TT Ledger to verify auto-update
    const txRes2 = await sendRequest('/api/tt/transactions?month=2026-06', 'GET');
    console.log('TT Ledger after edit:', txRes2.body.transactions);
    const tx2 = txRes2.body.transactions.find(t => t.tt_entry_id === entryId);
    if (!tx2) throw new Error('Expected auto-synced transaction to exist after edit.');
    if (tx2.amount !== 780) throw new Error(`Expected amount 780, got ${tx2.amount}`);
    if (!tx2.description.includes('Wakod')) throw new Error(`Expected description to contain Wakod, got ${tx2.description}`);

    // 3. Delete Trip Entry
    console.log('Deleting trip entry...');
    const deleteRes = await sendRequest(`/api/tt/entries/${entryId}`, 'DELETE');
    if (deleteRes.statusCode !== 200) throw new Error('Failed to delete trip entry');

    // Fetch TT Ledger to verify auto-deletion
    const txRes3 = await sendRequest('/api/tt/transactions?month=2026-06', 'GET');
    console.log('TT Ledger after delete:', txRes3.body.transactions);
    const tx3 = txRes3.body.transactions.find(t => t.tt_entry_id === entryId);
    if (tx3) throw new Error('Expected auto-synced transaction to be deleted.');

    console.log('\n🎉 ALL MISSING FEATURES AUTOMATED TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
};

runTest();
