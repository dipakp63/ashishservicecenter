const http = require('http');

const testPort = process.env.PORT || 3000;

const getActiveDate = () => {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${testPort}/api/active-date`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve(JSON.parse(data).activeDate);
      });
    }).on('error', reject);
  });
};

const sendRequest = (path, method, headers = {}, payload = null) => {
  const stringPayload = payload ? JSON.stringify(payload) : '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: testPort,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(stringPayload),
        ...headers
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

const runTest = async () => {
  let originalDate;
  try {
    originalDate = await getActiveDate();
    console.log('Original active date:', originalDate);
  } catch (err) {
    console.error('Failed to connect to server. Please ensure the server is running on port 3000.', err.message);
    process.exit(1);
  }

  // Step 1: Save Readings
  console.log('\n--- STEP 1: Saving Readings ---');
  const readingsRes = await sendRequest('/api/readings', 'POST', {}, {
    date: originalDate,
    readings: [
      { nozzle_id: 1, product: 'Petrol', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
      { nozzle_id: 2, product: 'Petrol', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
      { nozzle_id: 3, product: 'Diesel', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
      { nozzle_id: 4, product: 'Diesel', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
      { nozzle_id: 5, product: 'poWer', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
      { nozzle_id: 6, product: 'poWer', opening_reading: 10, closing_reading: 20, testing_qty: 0 }
    ]
  });
  console.log('Status Code:', readingsRes.statusCode);
  console.log('Response:', readingsRes.body);
  if (readingsRes.statusCode !== 200) {
    console.error('Failed to save readings:', readingsRes.body);
    process.exit(1);
  }

  // Step 2: Save Rates
  console.log('\n--- STEP 2: Saving Rates ---');
  const ratesRes = await sendRequest('/api/rates', 'POST', {}, {
    date: originalDate,
    rate_power: 110,
    rate_petrol: 100,
    rate_diesel: 90
  });
  console.log('Status Code:', ratesRes.statusCode);
  console.log('Response:', ratesRes.body);
  if (ratesRes.statusCode !== 200) {
    console.error('Failed to save rates:', ratesRes.body);
    process.exit(1);
  }

  // Step 3: Save Tanks
  console.log('\n--- STEP 3: Saving Tank Stocks ---');
  const tanksRes = await sendRequest('/api/tanks', 'POST', {}, {
    date: originalDate,
    tanks: [
      { tank_id: 1, tank_name: 'Tank 1', product: 'poWer', capacity: 9000, opening_dip: 50, opening_stock: 4500, closing_dip: 60, closing_stock: 5000, decantation_qty: 0 },
      { tank_id: 2, tank_name: 'Tank 2', product: 'Petrol', capacity: 16000, opening_dip: 80, opening_stock: 8000, closing_dip: 90, closing_stock: 9000, decantation_qty: 0 },
      { tank_id: 3, tank_name: 'Tank 3', product: 'Diesel', capacity: 35000, opening_dip: 120, opening_stock: 17500, closing_dip: 130, closing_stock: 18000, decantation_qty: 0 }
    ]
  });
  console.log('Status Code:', tanksRes.statusCode);
  console.log('Response:', tanksRes.body);
  if (tanksRes.statusCode !== 200) {
    console.error('Failed to save tanks:', tanksRes.body);
    process.exit(1);
  }

  // Step 4: Save Cash Reconciliation (finalizes/closes date)
  console.log('\n--- STEP 4: Saving Cash Reconciliation (Day Closing) ---');
  const cashRes = await sendRequest('/api/cash', 'POST', {}, {
    date: originalDate,
    total_sales_value: 1000,
    total_cash_received: 1000,
    shortfall: 0,
    notes_500: 2,
    notes_200: 0,
    notes_100: 0,
    notes_50: 0,
    notes_20: 0,
    notes_10: 0,
    coins: 0
  });
  console.log('Status Code:', cashRes.statusCode);
  console.log('Response:', cashRes.body);
  if (cashRes.statusCode !== 200) {
    console.error('Failed to finalize day calculations:', cashRes.body);
    process.exit(1);
  }

  // Confirm date has advanced
  const newActiveDate = await getActiveDate();
  console.log('\nNew active date after day closing:', newActiveDate);
  if (newActiveDate === originalDate) {
    console.error('Error: Active date did not advance after day closing.');
    process.exit(1);
  }

  // Step 5: Try to reverse last day calculations as manager
  console.log('\n--- STEP 5: Attempt Reversal as Manager (Should Fail) ---');
  const reverseManagerRes = await sendRequest('/api/admin/reverse-last-day', 'POST', {
    'x-user-role': 'manager'
  });
  console.log('Status Code:', reverseManagerRes.statusCode);
  console.log('Response:', reverseManagerRes.body);
  if (reverseManagerRes.statusCode !== 403) {
    console.error('Error: Reversal did not block manager role.');
    process.exit(1);
  }

  // Step 6: Reverse last day calculations as admin
  console.log('\n--- STEP 6: Attempt Reversal as Admin (Should Pass) ---');
  const reverseAdminRes = await sendRequest('/api/admin/reverse-last-day', 'POST', {
    'x-user-role': 'admin'
  });
  console.log('Status Code:', reverseAdminRes.statusCode);
  console.log('Response:', reverseAdminRes.body);
  if (reverseAdminRes.statusCode !== 200) {
    console.error('Error: Rollback failed for admin role.');
    process.exit(1);
  }

  // Step 7: Confirm date has reverted
  const finalActiveDate = await getActiveDate();
  console.log('\nActive date after rollback:', finalActiveDate);
  if (finalActiveDate !== originalDate) {
    console.error(`Error: Active date (${finalActiveDate}) did not revert to original date (${originalDate}).`);
    process.exit(1);
  }

  console.log('\n🎉 ALL ROLLBACK TESTS PASSED SUCCESSFULLY! Authorization and rollback database actions are validated.');
};

runTest();
