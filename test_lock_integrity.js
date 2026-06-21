const http = require('http');

const getActiveDate = () => {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/active-date', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).activeDate);
        } catch (e) {
          reject(new Error('Invalid JSON: ' + data));
        }
      });
    }).on('error', reject);
  });
};

const makeRequest = (method, path, payload) => {
  const stringPayload = payload ? JSON.stringify(payload) : '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
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

    req.on('error', (err) => reject(err));
    if (stringPayload) {
      req.write(stringPayload);
    }
    req.end();
  });
};

const run = async () => {
  try {
    const activeDate = await getActiveDate();
    console.log('Active Date is:', activeDate);
    
    // We want a locked date: activeDate is usually '2026-06-05' or similar.
    // Let's use '2026-05-15' (guaranteed to be locked)
    const lockedDate = '2026-05-15';
    console.log('Using locked date for test:', lockedDate);

    // Prepare a test employee profile
    console.log('\nCreating an employee...');
    const uniqueName1 = 'Lock Test Emp ' + Date.now();
    const createEmpRes = await makeRequest('POST', '/api/employees', { name: uniqueName1, mobile: '9998887776' });
    console.log('Create Emp Status:', createEmpRes.statusCode);
    const empId = createEmpRes.body.employee ? createEmpRes.body.employee.id : createEmpRes.body.employeeId;
    if (!empId) {
      throw new Error('Failed to create test employee: ' + JSON.stringify(createEmpRes.body));
    }
    console.log('Created Emp ID:', empId);

    // Add transaction to employee on open/current date (should succeed)
    console.log('\nAdding transaction to employee on current date...');
    const addTxOpen = await makeRequest('POST', `/api/employees/${empId}/transactions`, {
      date: activeDate,
      type: 'Advance Given',
      amount: 100,
      description: 'Open day txn'
    });
    console.log('Add open tx status:', addTxOpen.statusCode);

    // Try to delete employee (should succeed since no transactions on locked dates)
    console.log('\nTesting employee deletion with only open transactions...');
    const deleteEmpOpen = await makeRequest('DELETE', `/api/employees/${empId}`);
    console.log('Delete open emp status:', deleteEmpOpen.statusCode);
    if (deleteEmpOpen.statusCode !== 200) {
      throw new Error('Employee delete failed when only open txns existed.');
    }

    // Recreate employee for locked transaction test
    console.log('\nRecreating employee for locked transaction test...');
    const uniqueName2 = 'Lock Test Emp 2 ' + Date.now();
    const createEmpRes2 = await makeRequest('POST', '/api/employees', { name: uniqueName2, mobile: '9998887775' });
    const empId2 = createEmpRes2.body.employee ? createEmpRes2.body.employee.id : createEmpRes2.body.employeeId;

    // Directly insert a transaction on a locked date via DB if we can, or just use the endpoint with a mock insert
    // Wait, the API endpoint POST /api/employees/:id/transactions itself blocks insertion on locked dates!
    // So we can check that first:
    // Under the new rule, adding transactions to historical locked dates is allowed.
    console.log('\nTesting: Allow inserting transaction on locked date...');
    const addTxLocked = await makeRequest('POST', `/api/employees/${empId2}/transactions`, {
      date: lockedDate,
      type: 'Advance Given',
      amount: 100,
      description: 'Locked day txn'
    });
    console.log('Add locked tx status:', addTxLocked.statusCode, addTxLocked.body);
    if (addTxLocked.statusCode !== 200) {
      throw new Error('Add transaction on locked date should succeed (return 200)');
    }

    // However, deleting the employee master record is still blocked since it has transactions on locked dates.
    console.log('\nTesting: Block deleting employee with transaction history on locked date...');
    const deleteEmpLocked = await makeRequest('DELETE', `/api/employees/${empId2}`);
    console.log('Delete employee status:', deleteEmpLocked.statusCode, deleteEmpLocked.body);
    if (deleteEmpLocked.statusCode !== 403) {
      throw new Error('Delete employee with transactions on locked date should return 403');
    }

    // --- TT ENTRIES TESTS ---
    console.log('\nTesting: Allow inserting TT entry on locked date...');
    const postTtEntryRes = await makeRequest('POST', '/api/tt/entries', {
      date: lockedDate,
      trip_for: 'Wakod',
      entry_given: 'Yes',
      remark1: 'TestLockIntegrity',
      remark2: 'Test'
    });
    console.log('Post TT entry status:', postTtEntryRes.statusCode, postTtEntryRes.body);
    if (postTtEntryRes.statusCode !== 200) {
      throw new Error('Post TT entry on locked date should return 200');
    }

    // --- TT TRIPS TESTS ---
    console.log('\nTesting: Allow inserting TT trip on locked date...');
    const postTtTripRes = await makeRequest('POST', '/api/tt/trips', {
      date: lockedDate,
      start_km: 1000,
      end_km: 1200,
      fuel_filled: 50,
      load_qty: 14000,
      driver_name: 'Driver',
      notes: 'TestLockIntegrity'
    });
    console.log('Post TT trip status:', postTtTripRes.statusCode, postTtTripRes.body);
    if (postTtTripRes.statusCode !== 200) {
      throw new Error('Post TT trip on locked date should return 200');
    }

    // --- TT DECANT-LOG TESTS ---
    console.log('\nTesting: Allow inserting TT decant-log on locked date...');
    const postTtDecantRes = await makeRequest('POST', '/api/tt/trips/decant-log', {
      date: lockedDate,
      km_reading: 1000
    });
    console.log('Post TT decant-log status:', postTtDecantRes.statusCode, postTtDecantRes.body);
    if (postTtDecantRes.statusCode !== 200) {
      throw new Error('Post TT decant-log on locked date should return 200');
    }

    // --- CLEAN UP TEST DATA ---
    console.log('\nCleaning up TT entries on locked date...');
    const ttMonth = lockedDate.substring(0, 7);
    const getTtEntries = await makeRequest('GET', `/api/tt/entries?month=${ttMonth}`);
    const entries = getTtEntries.body.entries || [];
    for (const e of entries) {
      if (e.remark1 === 'TestLockIntegrity') {
        console.log('Deleting entry:', e.id);
        await makeRequest('DELETE', `/api/tt/entries/${e.id}`);
      }
    }

    console.log('\nCleaning up TT trips on locked date...');
    const getTtTrips = await makeRequest('GET', `/api/tt/trips?month=${ttMonth}`);
    const trips = getTtTrips.body.trips || [];
    for (const t of trips) {
      if (t.notes === 'TestLockIntegrity' || t.notes === 'Auto-logged from Decantation Details') {
        console.log('Deleting trip:', t.id);
        await makeRequest('DELETE', `/api/tt/trips/${t.id}`);
      }
    }

    console.log('\nCleaning up employee transaction on locked date...');
    const getEmpTxns = await makeRequest('GET', `/api/employees/${empId2}/transactions?month=${ttMonth}`);
    const empTxns = getEmpTxns.body.transactions || [];
    for (const tx of empTxns) {
      if (tx.transaction_date === lockedDate) {
        console.log('Deleting employee transaction:', tx.id);
        await makeRequest('DELETE', `/api/employees/transactions/${tx.id}`);
      }
    }

    // Clean up second test employee (should now succeed)
    console.log('\nDeleting second test employee...');
    const deleteEmp2Res = await makeRequest('DELETE', `/api/employees/${empId2}`);
    console.log('Delete second test employee status:', deleteEmp2Res.statusCode);
    if (deleteEmp2Res.statusCode !== 200) {
      throw new Error('Failed to clean up employee after deleting transaction history');
    }

    console.log('\n🎉 ALL LOCK INTEGRITY API TESTS PASSED!');
  } catch (err) {
    console.error('❌ Test execution failed:', err.message);
    process.exit(1);
  }
};

run();
