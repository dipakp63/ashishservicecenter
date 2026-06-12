const http = require('http');

const getActiveDate = () => {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/active-date', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve(JSON.parse(data).activeDate);
      });
    }).on('error', reject);
  });
};

const runTest = async () => {
  let date;
  try {
    date = await getActiveDate();
    console.log('Using active date:', date);
  } catch (err) {
    console.error('Failed to fetch active date from server, using fallback:', err.message);
    date = '2026-05-15';
  }

  const sendRequest = (path, payload) => {
    const stringPayload = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: path,
        method: 'POST',
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
      req.write(stringPayload);
      req.end();
    });
  };

  try {
    console.log('--- TEST 1: Saving readings for open date ---');
    const readingsPayload = {
      date: date,
      readings: [
        { nozzle_id: 1, product: 'Petrol', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
        { nozzle_id: 2, product: 'Petrol', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
        { nozzle_id: 3, product: 'Diesel', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
        { nozzle_id: 4, product: 'Diesel', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
        { nozzle_id: 5, product: 'poWer', opening_reading: 10, closing_reading: 20, testing_qty: 0 },
        { nozzle_id: 6, product: 'poWer', opening_reading: 10, closing_reading: 20, testing_qty: 0 }
      ]
    };
    const res1 = await sendRequest('/api/readings', readingsPayload);
    console.log('Status Code:', res1.statusCode);
    console.log('Response:', res1.body);
    if (res1.statusCode !== 200) throw new Error('Saving readings failed!');

    console.log('\n--- TEST 2: Saving rates for open date ---');
    const ratesPayload = { date: date, rate_power: 110, rate_petrol: 100, rate_diesel: 90 };
    const res2 = await sendRequest('/api/rates', ratesPayload);
    console.log('Status Code:', res2.statusCode);
    console.log('Response:', res2.body);
    if (res2.statusCode !== 200) throw new Error('Saving rates failed!');

    console.log('\n--- TEST 3: Saving tank stocks for open date ---');
    const tanksPayload = {
      date: date,
      tanks: [
        { tank_id: 1, tank_name: 'Tank 1', product: 'poWer', capacity: 9000, opening_dip: 50, opening_stock: 4500, closing_dip: 60, closing_stock: 5000, decantation_qty: 0 },
        { tank_id: 2, tank_name: 'Tank 2', product: 'Petrol', capacity: 16000, opening_dip: 80, opening_stock: 8000, closing_dip: 90, closing_stock: 9000, decantation_qty: 0 },
        { tank_id: 3, tank_name: 'Tank 3', product: 'Diesel', capacity: 35000, opening_dip: 120, opening_stock: 17500, closing_dip: 130, closing_stock: 18000, decantation_qty: 0 }
      ]
    };
    const res3 = await sendRequest('/api/tanks', tanksPayload);
    console.log('Status Code:', res3.statusCode);
    console.log('Response:', res3.body);
    if (res3.statusCode !== 200) throw new Error('Saving tank stocks failed!');

    console.log('\n--- TEST 4: Saving cash reconciliation (generates report and closes date) ---');
    const cashPayload = {
      date: date,
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
    };
    const res4 = await sendRequest('/api/cash', cashPayload);
    console.log('Status Code:', res4.statusCode);
    console.log('Response:', res4.body);
    if (res4.statusCode !== 200) throw new Error('Saving cash reconciliation failed!');

    console.log('\n--- TEST 5: Rejecting readings modification on closed date ---');
    const res5 = await sendRequest('/api/readings', readingsPayload);
    console.log('Status Code:', res5.statusCode);
    console.log('Response:', res5.body);
    if (res5.statusCode !== 400 || !res5.body.error.includes('finalized and frozen')) {
      throw new Error('Server failed to reject readings edit on closed date!');
    }

    console.log('\n--- TEST 6: Rejecting rates modification on closed date ---');
    const res6 = await sendRequest('/api/rates', ratesPayload);
    console.log('Status Code:', res6.statusCode);
    console.log('Response:', res6.body);
    if (res6.statusCode !== 400 || !res6.body.error.includes('finalized and frozen')) {
      throw new Error('Server failed to reject rates edit on closed date!');
    }

    console.log('\n--- TEST 7: Rejecting tank stocks modification on closed date ---');
    const res7 = await sendRequest('/api/tanks', tanksPayload);
    console.log('Status Code:', res7.statusCode);
    console.log('Response:', res7.body);
    if (res7.statusCode !== 400 || !res7.body.error.includes('finalized and frozen')) {
      throw new Error('Server failed to reject tank stocks edit on closed date!');
    }

    console.log('\n--- TEST 8: Rejecting cash modification on closed date ---');
    const res8 = await sendRequest('/api/cash', cashPayload);
    console.log('Status Code:', res8.statusCode);
    console.log('Response:', res8.body);
    if (res8.statusCode !== 400 || !res8.body.error.includes('finalized and frozen')) {
      throw new Error('Server failed to reject cash edit on closed date!');
    }

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Freeze state enforcements work perfectly on the server.');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
};

runTest();
