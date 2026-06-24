const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');
const fs = require('fs');

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
  console.log('--- GST Feature Integration Test ---');
  
  // 1. Initialize SQLite connection and insert test records for May 1 - May 30
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open database:', err.message);
      process.exit(1);
    }
  });

  console.log('Clearing database tables...');
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM readings');
      db.run('DELETE FROM tank_readings');
      db.run('DELETE FROM rates');
      db.run('DELETE FROM cash_reconciliation');
      db.run('DELETE FROM non_cash_payments', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  console.log('Seeding database with May 1 to May 30 data...');
  const insertStmtReadings = db.prepare('INSERT INTO readings (date, nozzle_id, product, opening_reading, closing_reading, testing_qty) VALUES (?, ?, ?, ?, ?, ?)');
  const insertStmtRates = db.prepare('INSERT INTO rates (date, rate_power, rate_petrol, rate_diesel) VALUES (?, ?, ?, ?)');
  const insertStmtCash = db.prepare('INSERT INTO cash_reconciliation (date, total_sales_value, total_cash_received, shortfall) VALUES (?, ?, ?, ?)');

  await new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      for (let day = 1; day <= 30; day++) {
        const dateStr = `2026-05-${String(day).padStart(2, '0')}`;
        
        // Insert readings (6 nozzles)
        for (let nozzle = 1; nozzle <= 6; nozzle++) {
          const product = nozzle <= 3 ? 'Petrol' : (nozzle <= 5 ? 'Diesel' : 'poWer');
          insertStmtReadings.run(dateStr, nozzle, product, 100.0, 150.0, 5.0); // Net sale = 45 L per nozzle
        }

        // Insert rates
        insertStmtRates.run(dateStr, 110.0, 100.0, 90.0);

        // Insert cash reconciliation (closes the day)
        insertStmtCash.run(dateStr, 10000.0, 10000.0, 0.0);
      }

      db.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  insertStmtReadings.finalize();
  insertStmtRates.finalize();
  insertStmtCash.finalize();
  db.close();
  console.log('Database seeding complete. May 31 is now the active open date.');

  try {
    // 2. Fetch active date from API to verify it is May 31st
    console.log('\nFetching active date from server...');
    const activeDateRes = await sendRequest('/api/active-date', 'GET');
    console.log('Active date:', activeDateRes.body.activeDate);
    if (activeDateRes.body.activeDate !== '2026-05-31') {
      throw new Error(`Expected active date to be 2026-05-31, got ${activeDateRes.body.activeDate}`);
    }

    // 3. Save readings for May 31st (using the API)
    console.log('\nSaving readings for May 31st...');
    const readingsPayload = {
      date: '2026-05-31',
      readings: [
        { nozzle_id: 1, product: 'Petrol', opening_reading: 100.0, closing_reading: 150.0, testing_qty: 5.0 },
        { nozzle_id: 2, product: 'Petrol', opening_reading: 100.0, closing_reading: 150.0, testing_qty: 5.0 },
        { nozzle_id: 3, product: 'Petrol', opening_reading: 100.0, closing_reading: 150.0, testing_qty: 5.0 },
        { nozzle_id: 4, product: 'Diesel', opening_reading: 100.0, closing_reading: 150.0, testing_qty: 5.0 },
        { nozzle_id: 5, product: 'Diesel', opening_reading: 100.0, closing_reading: 150.0, testing_qty: 5.0 },
        { nozzle_id: 6, product: 'poWer', opening_reading: 100.0, closing_reading: 150.0, testing_qty: 5.0 }
      ]
    };
    const saveReadingsRes = await sendRequest('/api/readings', 'POST', readingsPayload);
    if (saveReadingsRes.statusCode !== 200) {
      throw new Error(`Failed to save readings: ${JSON.stringify(saveReadingsRes.body)}`);
    }

    // 4. Save rates for May 31st (using the API)
    console.log('Saving rates for May 31st...');
    const ratesPayload = {
      date: '2026-05-31',
      rate_power: 110.0,
      rate_petrol: 100.0,
      rate_diesel: 90.0
    };
    const saveRatesRes = await sendRequest('/api/rates', 'POST', ratesPayload);
    if (saveRatesRes.statusCode !== 200) {
      throw new Error(`Failed to save rates: ${JSON.stringify(saveRatesRes.body)}`);
    }

    // 5. Close May 31st by saving Cash Reconciliation (using the API)
    // This is the last day of the month and should trigger the automatic GST monthly report generation and WhatsApp trigger!
    console.log('Saving cash reconciliation to close May 31st (Last day of month)...');
    const cashPayload = {
      date: '2026-05-31',
      total_sales_value: 26100.0, // Calculated value: (135L * 100) + (90L * 90) + (45L * 110) = 13500 + 8100 + 4950 = 26550. Let's send the correct totals:
      total_cash_received: 26550.0,
      shortfall: 0.0,
      notes_500: 53,
      notes_200: 0,
      notes_100: 0,
      notes_50: 1,
      notes_20: 0,
      notes_10: 0,
      coins: 0.0
    };
    const saveCashRes = await sendRequest('/api/cash', 'POST', cashPayload);
    if (saveCashRes.statusCode !== 200) {
      throw new Error(`Failed to close May 31st: ${JSON.stringify(saveCashRes.body)}`);
    }
    console.log('Server response:', saveCashRes.body);
    
    // Wait for the async end-of-month report generation to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // 6. Verify that report was generated on disk
    console.log('\nChecking if the monthly report CSV file was generated...');
    const reportFilePath = path.join(__dirname, 'reports', 'GST_Report_2026-05.csv');
    if (!fs.existsSync(reportFilePath)) {
      throw new Error('Monthly GST CSV report was not created on disk!');
    }
    console.log(`🎉 Success! Report exists at: ${reportFilePath}`);
    
    // Print a few lines of the CSV file
    const csvContent = fs.readFileSync(reportFilePath, 'utf8');
    console.log('CSV Report Preview (First 5 lines):');
    console.log(csvContent.split('\n').slice(0, 5).join('\n'));
    console.log('CSV Report Totals Row (Last line):');
    console.log(csvContent.trim().split('\n').slice(-1)[0]);

    // 7. Verify the GET /api/gst-report endpoint
    console.log('\nFetching report via GET /api/gst-report?month=2026-05...');
    const getReportRes = await sendRequest('/api/gst-report?month=2026-05', 'GET');
    if (getReportRes.statusCode !== 200) {
      throw new Error(`Failed to get GST report: ${JSON.stringify(getReportRes.body)}`);
    }
    
    const reportData = getReportRes.body;
    console.log(`Number of records returned: ${reportData.length} days`);
    if (reportData.length !== 31) {
      throw new Error(`Expected 31 daily records, got ${reportData.length}`);
    }

    // Verify last day's pivoted calculations
    const lastDay = reportData[30];
    console.log('May 31st data returned by API:', lastDay);
    if (lastDay.petrol_qty !== 135.0 || lastDay.diesel_qty !== 90.0 || lastDay.power_qty !== 45.0) {
      throw new Error('May 31st quantities do not match nozzle calculations!');
    }
    if (lastDay.is_closed !== true) {
      throw new Error('Expected May 31st to be marked as closed!');
    }

    console.log('\n🎉 ALL GST FEATURE AUTOMATED TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
};

runTest();
