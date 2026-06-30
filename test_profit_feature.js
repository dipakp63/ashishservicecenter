const http = require('http');

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
  console.log('--- Profit Margin API Verification Test ---');

  // Test 1: Fetch default margins (use a future month to avoid pre-existing database records)
  const testMonth = '2027-11';
  console.log(`\nTesting: Get Default Margins for ${testMonth}...`);
  const resGetDefault = await sendRequest(`/api/profit-margins?month=${testMonth}`, 'GET');
  console.log('Status Code:', resGetDefault.statusCode);
  console.log('Margins:', resGetDefault.body);
  if (resGetDefault.statusCode === 200 && resGetDefault.body.dealer_power === 3.0 && resGetDefault.body.diff_diesel === 0.2) {
    console.log('[OK] Default margins matched expectations.');
  } else {
    console.error('[FAIL] Expected default margins, got:', resGetDefault.body);
    process.exit(1);
  }

  // Test 2: Save custom margins
  console.log(`\nTesting: Save Custom Margins for ${testMonth}...`);
  const customPayload = {
    month: testMonth,
    dealer_power: 3.5,
    dealer_petrol: 3.2,
    dealer_diesel: 2.1,
    diff_power: 0.6,
    diff_petrol: 0.55,
    diff_diesel: 0.25
  };
  const resSave = await sendRequest('/api/profit-margins', 'POST', customPayload);
  console.log('Status Code:', resSave.statusCode);
  console.log('Response:', resSave.body);
  if (resSave.statusCode === 200 && resSave.body.success === true) {
    console.log('[OK] Custom margins saved successfully.');
  } else {
    console.error('[FAIL] Failed to save custom margins:', resSave.body);
    process.exit(1);
  }

  // Test 3: Fetch updated margins
  console.log(`\nTesting: Get Updated Margins for ${testMonth}...`);
  const resGetUpdated = await sendRequest(`/api/profit-margins?month=${testMonth}`, 'GET');
  console.log('Status Code:', resGetUpdated.statusCode);
  console.log('Updated Margins:', resGetUpdated.body);
  if (
    resGetUpdated.statusCode === 200 &&
    resGetUpdated.body.dealer_power === 3.5 &&
    resGetUpdated.body.dealer_petrol === 3.2 &&
    resGetUpdated.body.dealer_diesel === 2.1 &&
    resGetUpdated.body.diff_power === 0.6 &&
    resGetUpdated.body.diff_petrol === 0.55 &&
    resGetUpdated.body.diff_diesel === 0.25
  ) {
    console.log('[OK] Updated margins verified.');
  } else {
    console.error('[FAIL] Margins mismatch after update:', resGetUpdated.body);
    process.exit(1);
  }

  console.log('\n🎉 ALL PROFIT MARGIN API TESTS PASSED SUCCESSFULLY!');
};

runTest().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
