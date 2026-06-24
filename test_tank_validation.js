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

const runTest = async () => {
  let date;
  try {
    date = await getActiveDate();
    console.log('Using active date:', date);
  } catch (err) {
    console.error('Failed to fetch active date from server, using fallback:', err.message);
    date = '2026-05-01';
  }

  const testPayload = (tanks) => JSON.stringify({
    date: date,
    tanks: tanks
  });

  const sendRequest = (payload) => {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: testPort,
        path: '/api/tanks',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
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
      req.write(payload);
      req.end();
    });
  };

  console.log('--- TEST 1: Saving valid tank stocks ---');
  const validTanks = [
    { tank_id: 1, tank_name: 'Tank 1', product: 'poWer', capacity: 9000, opening_dip: 50.0, opening_stock: 4500, closing_dip: 60.0, closing_stock: 5000, decantation_qty: 0 },
    { tank_id: 2, tank_name: 'Tank 2', product: 'Petrol', capacity: 16000, opening_dip: 80.0, opening_stock: 8000, closing_dip: 90.0, closing_stock: 9000, decantation_qty: 0 },
    { tank_id: 3, tank_name: 'Tank 3', product: 'Diesel', capacity: 35000, opening_dip: 120.0, opening_stock: 17500, closing_dip: 130.0, closing_stock: 18000, decantation_qty: 0 }
  ];

  try {
    const res1 = await sendRequest(testPayload(validTanks));
    console.log('Status Code:', res1.statusCode);
    console.log('Response:', res1.body);
    if (res1.statusCode !== 200) {
      throw new Error('Valid tank stock save failed!');
    }

    console.log('\n--- TEST 2: Rejecting stock exceeding capacity ---');
    const invalidTanksExceeding = JSON.parse(JSON.stringify(validTanks));
    invalidTanksExceeding[0].closing_stock = 9500; // Capacity is 9000

    const res2 = await sendRequest(testPayload(invalidTanksExceeding));
    console.log('Status Code:', res2.statusCode);
    console.log('Response:', res2.body);
    if ((res2.statusCode !== 400 && res2.statusCode !== 500) || !res2.body.error.includes('closing stock')) {
      throw new Error('Exceeding capacity check failed to be rejected properly!');
    }

    console.log('\n--- TEST 3: Rejecting negative stock ---');
    const invalidTanksNegative = JSON.parse(JSON.stringify(validTanks));
    invalidTanksNegative[1].opening_stock = -100; // Negative stock

    const res3 = await sendRequest(testPayload(invalidTanksNegative));
    console.log('Status Code:', res3.statusCode);
    console.log('Response:', res3.body);
    if ((res3.statusCode !== 400 && res3.statusCode !== 500) || !res3.body.error.includes('opening stock')) {
      throw new Error('Negative stock check failed to be rejected properly!');
    }

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Enforcements work on the server side.');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
};

runTest();
