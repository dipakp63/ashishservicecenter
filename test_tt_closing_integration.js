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
  console.log('--- TT Day Closing Integration Verification Test ---');

  // Step 1: Get active date
  console.log('\nFetching current active date...');
  const resActiveDate = await sendRequest('/api/active-date', 'GET');
  console.log('Active Date Status:', resActiveDate.statusCode);
  console.log('Active Date:', resActiveDate.body);
  const activeDate = resActiveDate.body.activeDate;
  if (!activeDate) {
    console.error('[FAIL] Could not retrieve active date.');
    process.exit(1);
  }

  // Step 2: Post cash reconciliation with a TT expense entry
  console.log(`\nPosting cash reconciliation for ${activeDate}...`);
  const cashPayload = {
    date: activeDate,
    total_sales_value: 20000,
    total_cash_received: 5000,
    shortfall: 0,
    notes_500: 10,
    notes_200: 0,
    notes_100: 0,
    notes_50: 0,
    notes_20: 0,
    notes_10: 0,
    coins: 0,
    non_cash_payments: [
      { type: 'MH-19-CY-5682', amount: 15000, description: 'Diesel' }
    ]
  };

  const resPostCash = await sendRequest('/api/cash', 'POST', cashPayload);
  console.log('Status Code:', resPostCash.statusCode);
  console.log('Response:', resPostCash.body);
  if (resPostCash.statusCode !== 200) {
    console.error('[FAIL] Failed to post cash reconciliation:', resPostCash.body);
    process.exit(1);
  }

  // Step 3: Fetch the TT ledger for the month of active date
  const targetMonth = activeDate.substring(0, 7); // YYYY-MM
  console.log(`\nFetching TT Ledger for ${targetMonth}...`);
  const resGetTT = await sendRequest(`/api/tt/transactions?month=${targetMonth}`, 'GET');
  console.log('Status Code:', resGetTT.statusCode);
  console.log('TT Transactions:', resGetTT.body.transactions);

  const txs = resGetTT.body.transactions || [];
  const autoExpense = txs.find(t => t.date === activeDate && t.type === 'DEBIT' && t.particular1 === 'Day Closing' && t.amount === 15000 && t.description === 'Diesel');

  if (autoExpense) {
    console.log('\n[OK] TT Expense ledger successfully updated from Day Closing!');
    console.log('Found Auto-Logged Transaction:', autoExpense);
    console.log('\n🎉 TT INTEGRATION TEST PASSED SUCCESSFULLY!');
  } else {
    console.error('\n[FAIL] Auto-logged TT transaction not found in ledger!');
    process.exit(1);
  }
};

runTest().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
