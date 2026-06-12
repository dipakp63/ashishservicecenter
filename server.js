const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database Initialization Middleware ───────────────────────────────────────
// Runs once on first request (handles Vercel serverless cold starts gracefully)
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      await db.initDatabase();
      dbInitialized = true;
    } catch (err) {
      console.error('[INIT] Database initialization failed:', err);
      return res.status(500).json({ error: 'Database initialization failed.' });
    }
  }
  next();
});

// ── Helper Functions ────────────────────────────────────────────────────────

async function getActiveDate() {
  const row = await db.get('SELECT MAX(date) AS latest_closed_date FROM cash_reconciliation');
  if (row && row.latest_closed_date) {
    const latestDate = new Date(row.latest_closed_date + 'T00:00:00');
    latestDate.setDate(latestDate.getDate() + 1);
    const year = latestDate.getFullYear();
    const month = String(latestDate.getMonth() + 1).padStart(2, '0');
    const day = String(latestDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '2026-05-01';
}

function isLastDayOfMonth(dateStr) {
  if (!dateStr || dateStr.length !== 10) return false;
  const date = new Date(dateStr + 'T00:00:00');
  const month = date.getMonth();
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  return nextDay.getMonth() !== month;
}

function sendWhatsAppReport(monthStr, csvContent) {
  const whatsappNo = '+919970889360';
  const apiURL = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;

  const message = `⛽ *PumpERP GST R1 & 3B Monthly Report* ⛽\n\nReport for Month: *${monthStr}*\n\nThe CSV report has been generated successfully.`;

  if (apiURL && apiToken) {
    console.log(`[WhatsApp Sender] Sending report for ${monthStr} to ${whatsappNo} via API...`);
    const url = new URL(apiURL);
    const https = url.protocol === 'https:' ? require('https') : require('http');

    const payload = JSON.stringify({
      token: apiToken,
      to: whatsappNo,
      body: message,
      filename: `GST_Report_${monthStr}.csv`,
      document: Buffer.from(csvContent).toString('base64'),
    });

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          console.log(`[WhatsApp Sender] API Response status: ${res.statusCode}. Body: ${data}`);
        });
      }
    );

    req.on('error', (e) => {
      console.error('[WhatsApp Sender] HTTP request error:', e.message);
    });

    req.write(payload);
    req.end();
  } else {
    console.log(`\n==================================================`);
    console.log(`📱 [WhatsApp SIMULATION] Sending to ${whatsappNo}`);
    console.log(`💬 Message: \n${message}`);
    console.log(`⚠️ Configuration Status: No WHATSAPP_API_URL or WHATSAPP_API_TOKEN set.`);
    console.log(`==================================================\n`);
  }
}

async function generateAndSendMonthlyReport(monthStr) {
  console.log(`[GST Report] Generating monthly report for ${monthStr}...`);

  const reportQuery = `
    SELECT 
      r.date,
      r.product,
      SUM(r.closing_reading - r.opening_reading - COALESCE(r.testing_qty, 0)) AS sales_qty,
      rt.rate_power,
      rt.rate_petrol,
      rt.rate_diesel
    FROM readings r
    LEFT JOIN rates rt ON r.date = rt.date
    WHERE r.date LIKE ?
    GROUP BY r.date, r.product
    ORDER BY r.date ASC, r.product ASC
  `;

  const rows = await db.all(reportQuery, [`${monthStr}-%`]);

  const reportMap = {};
  rows.forEach((row) => {
    if (!reportMap[row.date]) {
      reportMap[row.date] = {
        date: row.date,
        petrol_qty: 0,
        rate_petrol: row.rate_petrol || 0,
        diesel_qty: 0,
        rate_diesel: row.rate_diesel || 0,
        power_qty: 0,
        rate_power: row.rate_power || 0,
      };
    }

    const dayObj = reportMap[row.date];
    const qty = parseFloat(row.sales_qty) || 0;

    if (row.product === 'Petrol') {
      dayObj.petrol_qty = qty;
    } else if (row.product === 'Diesel') {
      dayObj.diesel_qty = qty;
    } else if (row.product === 'poWer') {
      dayObj.power_qty = qty;
    }
  });

  const reportData = Object.values(reportMap).sort((a, b) => a.date.localeCompare(b.date));

  // Generate CSV content in memory (no filesystem dependency for Vercel compatibility)
  let csvContent =
    'Date,Petrol Qty (L),Petrol Rate (Rs/L),Diesel Qty (L),Diesel Rate (Rs/L),poWer Qty (L),poWer Rate (Rs/L)\n';
  let totalPetrolQty = 0;
  let totalDieselQty = 0;
  let totalPowerQty = 0;

  reportData.forEach((row) => {
    csvContent += `${row.date},${row.petrol_qty.toFixed(2)},${row.rate_petrol.toFixed(2)},${row.diesel_qty.toFixed(2)},${row.rate_diesel.toFixed(2)},${row.power_qty.toFixed(2)},${row.rate_power.toFixed(2)}\n`;
    totalPetrolQty += row.petrol_qty;
    totalDieselQty += row.diesel_qty;
    totalPowerQty += row.power_qty;
  });

  csvContent += `TOTAL,${totalPetrolQty.toFixed(2)},,${totalDieselQty.toFixed(2)},,${totalPowerQty.toFixed(2)},\n`;

  // Save locally only when running outside Vercel
  if (!process.env.VERCEL) {
    try {
      const fs = require('fs');
      const reportDir = path.join(__dirname, 'reports');
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir);
      }
      const reportPath = path.join(reportDir, `GST_Report_${monthStr}.csv`);
      fs.writeFileSync(reportPath, csvContent);
      console.log(`[GST Report] Monthly spreadsheet report saved locally to ${reportPath}`);
    } catch (fsErr) {
      console.warn('[GST Report] Could not save report to filesystem:', fsErr.message);
    }
  }

  sendWhatsAppReport(monthStr, csvContent);
  return csvContent;
}

async function recalculateHpclLedger() {
  const configRow = await db.get(
    `SELECT value FROM hpcl_config WHERE key = 'hpcl_opening_balance'`
  );
  const openingBalance = parseFloat((configRow && configRow.value) || '0');

  const rows = await db.all(
    `SELECT * FROM hpcl_transactions ORDER BY date ASC, id ASC`
  );

  if (rows.length === 0) return;

  let currentBalance = openingBalance;
  const updates = [];

  for (const row of rows) {
    if (row.type === 'CREDIT') {
      currentBalance += row.amount;
    } else if (row.type === 'DEBIT') {
      currentBalance -= row.amount;
    }
    updates.push({
      sql: 'UPDATE hpcl_transactions SET running_balance = ? WHERE id = ?',
      args: [currentBalance, row.id],
    });
  }

  await db.batch(updates);
  console.log('[HPCL Ledger] Ledger recalculated successfully.');
}

// ── API Routes ──────────────────────────────────────────────────────────────

// Endpoint to fetch the current active date for input
app.get('/api/active-date', async (req, res) => {
  try {
    const activeDate = await getActiveDate();
    res.json({ activeDate });
  } catch (err) {
    console.error('Error fetching active date:', err.message);
    res.status(500).json({ error: 'Database error fetching active date.' });
  }
});

// Endpoint to clear the database for testing
app.post('/api/clear-db', async (req, res) => {
  try {
    await db.run('DELETE FROM readings');
    await db.run('DELETE FROM tank_readings');
    await db.run('DELETE FROM rates');
    await db.run('DELETE FROM non_cash_payments');
    await db.run('DELETE FROM cash_reconciliation');
    res.json({ success: true, message: 'Database cleared' });
  } catch (err) {
    console.error('Error clearing database:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to fetch opening readings (today's saved + yesterday's closing)
app.get('/api/readings/opening', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required.' });
    }

    const todayQuery = `
      SELECT nozzle_id, product, opening_reading, closing_reading, testing_qty
      FROM readings
      WHERE date = ?
      ORDER BY nozzle_id ASC
    `;

    const yesterdayQuery = `
      SELECT nozzle_id, product, closing_reading AS opening_reading
      FROM readings
      WHERE date = (
        SELECT MAX(date) FROM readings WHERE date < ?
      )
      ORDER BY nozzle_id ASC
    `;

    const todayRows = await db.all(todayQuery, [date]);
    const yesterdayRows = await db.all(yesterdayQuery, [date]);

    res.json({
      isClosed: todayRows.length === 6,
      savedReadings: todayRows,
      openingReadings: yesterdayRows,
    });
  } catch (err) {
    console.error('Error fetching readings:', err.message);
    res.status(500).json({ error: 'Database error fetching readings.' });
  }
});

// Endpoint to save readings with validation
app.post('/api/readings', async (req, res) => {
  try {
    const { date, readings } = req.body;

    if (!date || !readings || !Array.isArray(readings) || readings.length !== 6) {
      return res.status(400).json({ error: 'Date and exactly 6 nozzle readings are required.' });
    }

    const activeDate = await getActiveDate();
    if (date < activeDate) {
      return res.status(400).json({ error: 'This date has been finalized and frozen. Data cannot be modified.' });
    }
    if (date > activeDate) {
      return res.status(400).json({ error: `This date is locked. You must complete calculations for ${activeDate} first.` });
    }

    // Validate all readings first, before touching the database
    const statements = [];
    for (const r of readings) {
      if (
        r.nozzle_id === undefined ||
        r.product === undefined ||
        r.opening_reading === undefined || r.opening_reading === '' ||
        r.closing_reading === undefined || r.closing_reading === ''
      ) {
        return res.status(400).json({ error: 'Invalid nozzle reading format.' });
      }

      const opening = parseFloat(r.opening_reading);
      const closing = parseFloat(r.closing_reading);
      const testing = r.testing_qty !== undefined ? parseFloat(r.testing_qty) : 0;

      if (closing < opening) {
        return res.status(400).json({
          error: `Nozzle ${r.nozzle_id} closing reading (${closing.toFixed(3)}) cannot be less than opening reading (${opening.toFixed(3)}).`,
        });
      }

      statements.push({
        sql: `INSERT OR REPLACE INTO readings (date, nozzle_id, product, opening_reading, closing_reading, testing_qty)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [date, r.nozzle_id, r.product, opening, closing, testing],
      });
    }

    await db.batch(statements);
    res.json({ message: 'Readings saved successfully for ' + date });
  } catch (err) {
    console.error('Error saving readings:', err.message);
    res.status(500).json({ error: 'Database error saving readings.' });
  }
});

// Endpoint to fetch all readings history
app.get('/api/readings', async (req, res) => {
  try {
    const query = `
      SELECT date, nozzle_id, product, opening_reading, closing_reading, testing_qty,
             (closing_reading - opening_reading) AS difference
      FROM readings
      ORDER BY date DESC, nozzle_id ASC
    `;
    const rows = await db.all(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching readings history:', err.message);
    res.status(500).json({ error: 'Database error fetching readings.' });
  }
});

// Endpoint to fetch tank opening stocks
app.get('/api/tanks/opening', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required.' });
    }

    const todayQuery = `
      SELECT tank_id, tank_name, product, capacity, opening_dip, opening_stock, closing_dip, closing_stock, decantation_qty
      FROM tank_readings
      WHERE date = ?
      ORDER BY tank_id ASC
    `;

    const yesterdayQuery = `
      SELECT tank_id, tank_name, product, capacity, closing_dip AS opening_dip, closing_stock AS opening_stock
      FROM tank_readings
      WHERE date = (
        SELECT MAX(date) FROM tank_readings WHERE date < ?
      )
      ORDER BY tank_id ASC
    `;

    const todayRows = await db.all(todayQuery, [date]);
    const yesterdayRows = await db.all(yesterdayQuery, [date]);

    res.json({
      isClosed: todayRows.length === 3,
      savedTanks: todayRows,
      openingTanks: yesterdayRows,
    });
  } catch (err) {
    console.error('Error fetching tank stocks:', err.message);
    res.status(500).json({ error: 'Database error fetching tank stocks.' });
  }
});

// Endpoint to save tank stock readings
app.post('/api/tanks', async (req, res) => {
  try {
    const { date, tanks } = req.body;

    if (!date || !tanks || !Array.isArray(tanks) || tanks.length !== 3) {
      return res.status(400).json({ error: 'Date and exactly 3 tank readings are required.' });
    }

    const activeDate = await getActiveDate();
    if (date < activeDate) {
      return res.status(400).json({ error: 'This date has been finalized and frozen. Data cannot be modified.' });
    }
    if (date > activeDate) {
      return res.status(400).json({ error: `This date is locked. You must complete calculations for ${activeDate} first.` });
    }

    const statements = [];
    for (const t of tanks) {
      if (
        t.tank_id === undefined ||
        t.tank_name === undefined ||
        t.product === undefined ||
        t.capacity === undefined ||
        t.opening_dip === undefined || t.opening_dip === '' ||
        t.opening_stock === undefined || t.opening_stock === '' ||
        t.closing_dip === undefined || t.closing_dip === '' ||
        t.closing_stock === undefined || t.closing_stock === ''
      ) {
        return res.status(400).json({ error: 'Invalid tank reading format.' });
      }

      const capacity = parseFloat(t.capacity);
      const openingDip = parseFloat(t.opening_dip);
      const opening = parseFloat(t.opening_stock);
      const dip = parseFloat(t.closing_dip);
      const closing = parseFloat(t.closing_stock);
      const decantation = t.decantation_qty !== undefined ? parseFloat(t.decantation_qty) : 0;

      if (isNaN(opening) || opening < 0 || opening > capacity) {
        return res.status(400).json({
          error: `${t.tank_name} (${t.product}) opening stock (${opening} L) must be between 0 and its capacity of ${capacity} L.`,
        });
      }

      if (isNaN(closing) || closing < 0 || closing > capacity) {
        return res.status(400).json({
          error: `${t.tank_name} (${t.product}) closing stock (${closing} L) must be between 0 and its capacity of ${capacity} L.`,
        });
      }

      statements.push({
        sql: `INSERT OR REPLACE INTO tank_readings (date, tank_id, tank_name, product, capacity, opening_dip, opening_stock, closing_dip, closing_stock, decantation_qty)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [date, t.tank_id, t.tank_name, t.product, capacity, openingDip, opening, dip, closing, decantation],
      });
    }

    await db.batch(statements);
    res.json({ message: 'Tank readings saved successfully for ' + date });
  } catch (err) {
    console.error('Error saving tank readings:', err.message);
    res.status(500).json({ error: 'Database error saving tank readings.' });
  }
});

// Endpoint to fetch opening rates
app.get('/api/rates/opening', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required.' });
    }

    const todayRow = await db.get(
      `SELECT rate_power, rate_petrol, rate_diesel FROM rates WHERE date = ?`,
      [date]
    );

    if (todayRow) {
      return res.json({ isSaved: true, rates: todayRow });
    }

    const previousRow = await db.get(
      `SELECT rate_power, rate_petrol, rate_diesel FROM rates WHERE date = (SELECT MAX(date) FROM rates WHERE date < ?)`,
      [date]
    );

    if (previousRow) {
      return res.json({ isSaved: false, rates: previousRow });
    }

    // Default fallback rates
    return res.json({
      isSaved: false,
      rates: { rate_power: 110.0, rate_petrol: 100.0, rate_diesel: 90.0 },
    });
  } catch (err) {
    console.error('Error fetching rates:', err.message);
    res.status(500).json({ error: 'Database error fetching rates.' });
  }
});

// Endpoint to save rates
app.post('/api/rates', async (req, res) => {
  try {
    const { date, rate_power, rate_petrol, rate_diesel } = req.body;

    if (!date || rate_power === undefined || rate_petrol === undefined || rate_diesel === undefined) {
      return res.status(400).json({ error: 'Date and rates for all three products are required.' });
    }

    const power = parseFloat(rate_power);
    const petrol = parseFloat(rate_petrol);
    const diesel = parseFloat(rate_diesel);

    if (isNaN(power) || isNaN(petrol) || isNaN(diesel) || power < 0 || petrol < 0 || diesel < 0) {
      return res.status(400).json({ error: 'Rates must be valid positive numbers.' });
    }

    const activeDate = await getActiveDate();
    if (date < activeDate) {
      return res.status(400).json({ error: 'This date has been finalized and frozen. Data cannot be modified.' });
    }
    if (date > activeDate) {
      return res.status(400).json({ error: `This date is locked. You must complete calculations for ${activeDate} first.` });
    }

    await db.run(
      `INSERT OR REPLACE INTO rates (date, rate_power, rate_petrol, rate_diesel) VALUES (?, ?, ?, ?)`,
      [date, power, petrol, diesel]
    );

    res.json({ message: 'Rates saved successfully for ' + date });
  } catch (err) {
    console.error('Error saving rates:', err.message);
    res.status(500).json({ error: 'Database error saving rates.' });
  }
});

// Endpoint to fetch saved cash reconciliation for today
app.get('/api/cash/opening', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required.' });
    }

    const row = await db.get(
      `SELECT total_sales_value, total_cash_received, shortfall,
              notes_500, notes_200, notes_100, notes_50, notes_20, notes_10, coins,
              coins_20, coins_10, coins_5, coins_2, coins_1
       FROM cash_reconciliation
       WHERE date = ?`,
      [date]
    );

    const nonCashRows = await db.all(
      `SELECT type, description, amount FROM non_cash_payments WHERE date = ? ORDER BY entry_index ASC`,
      [date]
    );

    res.json({
      isSaved: !!row,
      cash: row || null,
      nonCashPayments: nonCashRows || [],
    });
  } catch (err) {
    console.error('Error fetching cash reconciliation:', err.message);
    res.status(500).json({ error: 'Database error fetching cash reconciliation.' });
  }
});

// Endpoint to fetch the LAST CLOSED day's denomination note counts
app.get('/api/cash/last', async (req, res) => {
  try {
    const row = await db.get(
      `SELECT notes_500, notes_200, notes_100, notes_50, notes_20, notes_10
       FROM cash_reconciliation
       ORDER BY date DESC
       LIMIT 1`
    );
    res.json({ cash: row || null });
  } catch (err) {
    console.error('Error fetching last cash denominations:', err.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// Endpoint to save cash reconciliation
app.post('/api/cash', async (req, res) => {
  try {
    const {
      date, total_sales_value, total_cash_received, shortfall,
      notes_500, notes_200, notes_100, notes_50, notes_20, notes_10, coins,
      coins_20, coins_10, coins_5, coins_2, coins_1,
      non_cash_payments,
    } = req.body;

    if (
      !date || total_sales_value === undefined || total_cash_received === undefined || shortfall === undefined ||
      notes_500 === undefined || notes_200 === undefined || notes_100 === undefined ||
      notes_50 === undefined || notes_20 === undefined || notes_10 === undefined || coins === undefined
    ) {
      return res.status(400).json({ error: 'All cash fields and date are required.' });
    }

    const activeDate = await getActiveDate();
    if (date < activeDate) {
      return res.status(400).json({ error: 'This date has been finalized and frozen. Data cannot be modified.' });
    }
    if (date > activeDate) {
      return res.status(400).json({ error: `This date is locked. You must complete calculations for ${activeDate} first.` });
    }

    // Build transaction batch
    const statements = [
      {
        sql: `INSERT OR REPLACE INTO cash_reconciliation (
                date, total_sales_value, total_cash_received, shortfall,
                notes_500, notes_200, notes_100, notes_50, notes_20, notes_10, coins,
                coins_20, coins_10, coins_5, coins_2, coins_1
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          date,
          parseFloat(total_sales_value),
          parseFloat(total_cash_received),
          parseFloat(shortfall),
          parseInt(notes_500, 10),
          parseInt(notes_200, 10),
          parseInt(notes_100, 10),
          parseInt(notes_50, 10),
          parseInt(notes_20, 10),
          parseInt(notes_10, 10),
          parseFloat(coins),
          parseInt(coins_20 || 0, 10),
          parseInt(coins_10 || 0, 10),
          parseInt(coins_5 || 0, 10),
          parseInt(coins_2 || 0, 10),
          parseInt(coins_1 || 0, 10),
        ],
      },
      {
        sql: `DELETE FROM non_cash_payments WHERE date = ?`,
        args: [date],
      },
    ];

    // Add non-cash payment inserts
    const payments = non_cash_payments || [];
    payments.forEach((p, idx) => {
      const amount = parseFloat(p.amount) || 0;
      const description = p.description || '';
      const type = p.type || 'UPI';

      if (amount > 0 || description.trim() !== '') {
        statements.push({
          sql: `INSERT INTO non_cash_payments (date, entry_index, type, description, amount) VALUES (?, ?, ?, ?, ?)`,
          args: [date, idx, type, description, amount],
        });
      }
    });

    await db.batch(statements);

    // End-of-month check to automatically trigger GST report
    if (isLastDayOfMonth(date)) {
      generateAndSendMonthlyReport(date.substring(0, 7)).catch((err) => {
        console.error('[GST Report] Auto-generation failed:', err.message);
      });
    }

    res.json({ message: 'Cash reconciliation saved successfully for ' + date });
  } catch (err) {
    console.error('Error saving cash reconciliation:', err.message);
    res.status(500).json({ error: 'Database error saving cash reconciliation.' });
  }
});

// Endpoint to fetch monthly GST report data
app.get('/api/gst-report', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month parameter in YYYY-MM format is required.' });
    }

    const query = `
      SELECT 
        r.date,
        r.product,
        SUM(r.closing_reading - r.opening_reading - COALESCE(r.testing_qty, 0)) AS sales_qty,
        rt.rate_power,
        rt.rate_petrol,
        rt.rate_diesel,
        (c.date IS NOT NULL) AS is_closed
      FROM readings r
      LEFT JOIN rates rt ON r.date = rt.date
      LEFT JOIN cash_reconciliation c ON r.date = c.date
      WHERE r.date LIKE ?
      GROUP BY r.date, r.product
      ORDER BY r.date ASC, r.product ASC
    `;

    const rows = await db.all(query, [`${month}-%`]);

    const reportMap = {};
    rows.forEach((row) => {
      if (!reportMap[row.date]) {
        reportMap[row.date] = {
          date: row.date,
          is_closed: !!row.is_closed,
          petrol_qty: 0,
          rate_petrol: row.rate_petrol || 0,
          petrol_amt: 0,
          diesel_qty: 0,
          rate_diesel: row.rate_diesel || 0,
          diesel_amt: 0,
          power_qty: 0,
          rate_power: row.rate_power || 0,
          power_amt: 0,
          total_sales: 0,
        };
      }

      const dayObj = reportMap[row.date];
      const qty = parseFloat(row.sales_qty) || 0;

      if (row.product === 'Petrol') {
        dayObj.petrol_qty = qty;
        dayObj.petrol_amt = qty * dayObj.rate_petrol;
      } else if (row.product === 'Diesel') {
        dayObj.diesel_qty = qty;
        dayObj.diesel_amt = qty * dayObj.rate_diesel;
      } else if (row.product === 'poWer') {
        dayObj.power_qty = qty;
        dayObj.power_amt = qty * dayObj.rate_power;
      }

      dayObj.total_sales = dayObj.petrol_amt + dayObj.diesel_amt + dayObj.power_amt;
    });

    const reportData = Object.values(reportMap).sort((a, b) => a.date.localeCompare(b.date));
    res.json(reportData);
  } catch (err) {
    console.error('Error generating GST report:', err.message);
    res.status(500).json({ error: 'Database error generating report.' });
  }
});

// Endpoint to manually trigger sending the WhatsApp report for a month
app.post('/api/send-gst-whatsapp', async (req, res) => {
  try {
    const { month } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month parameter in YYYY-MM format is required.' });
    }

    await generateAndSendMonthlyReport(month);
    res.json({ success: true, message: `Report generated and sent to WhatsApp for ${month}.` });
  } catch (err) {
    console.error('Manual WhatsApp trigger failed:', err.message);
    res.status(500).json({ error: 'Failed to generate and send report: ' + err.message });
  }
});

// ── HPCL Portal Balance Tracker API ─────────────────────────────────────────

// GET /api/hpcl/summary
app.get('/api/hpcl/summary', async (req, res) => {
  try {
    const configRow = await db.get(
      `SELECT value FROM hpcl_config WHERE key = 'hpcl_opening_balance'`
    );
    const openingBalance = parseFloat((configRow && configRow.value) || '0');

    const summaryRow = await db.get(`
      SELECT 
        SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END) AS total_credits,
        SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END) AS total_debits,
        (SELECT running_balance FROM hpcl_transactions ORDER BY date DESC, id DESC LIMIT 1) AS latest_balance
      FROM hpcl_transactions
    `);

    const totalCredits = summaryRow ? summaryRow.total_credits || 0 : 0;
    const totalDebits = summaryRow ? summaryRow.total_debits || 0 : 0;
    const currentBalance =
      summaryRow && summaryRow.latest_balance !== null && summaryRow.latest_balance !== undefined
        ? summaryRow.latest_balance
        : openingBalance;

    res.json({
      opening_balance: openingBalance,
      current_balance: currentBalance,
      total_credits: totalCredits,
      total_debits: totalDebits,
    });
  } catch (err) {
    console.error('[HPCL] Error fetching summary:', err.message);
    res.status(500).json({ error: 'Database error fetching summary.' });
  }
});

// GET /api/hpcl/transactions
app.get('/api/hpcl/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const rows = await db.all(
      `SELECT id, date, description, type, amount, running_balance
       FROM hpcl_transactions
       ORDER BY date DESC, id DESC
       LIMIT ?`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('[HPCL] Error fetching transactions:', err.message);
    res.status(500).json({ error: 'Database error fetching transactions.' });
  }
});

// POST /api/hpcl/transaction
app.post('/api/hpcl/transaction', async (req, res) => {
  try {
    const { date, description, type, amount } = req.body;

    if (!date || !description || !type || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Date, description, type, and amount are required.' });
    }

    if (type !== 'CREDIT' && type !== 'DEBIT') {
      return res.status(400).json({ error: 'Transaction type must be CREDIT or DEBIT.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    const result = await db.run(
      `INSERT INTO hpcl_transactions (date, description, type, amount, running_balance) VALUES (?, ?, ?, ?, 0)`,
      [date, description, type, parsedAmount]
    );

    const newId = result.lastInsertRowid;

    await recalculateHpclLedger();

    const row = await db.get(`SELECT * FROM hpcl_transactions WHERE id = ?`, [newId]);
    res.json({ success: true, transaction: row });
  } catch (err) {
    console.error('[HPCL] Error saving transaction:', err.message);
    res.status(500).json({ error: 'Database error saving transaction.' });
  }
});

// DELETE /api/hpcl/transaction/:id
app.delete('/api/hpcl/transaction/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.run(`DELETE FROM hpcl_transactions WHERE id = ?`, [id]);

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    await recalculateHpclLedger();
    res.json({ success: true, message: 'Transaction deleted and ledger recalculated.' });
  } catch (err) {
    console.error('[HPCL] Error deleting transaction:', err.message);
    res.status(500).json({ error: 'Database error deleting transaction.' });
  }
});

// POST /api/hpcl/opening-balance
app.post('/api/hpcl/opening-balance', async (req, res) => {
  try {
    const { opening_balance } = req.body;

    if (opening_balance === undefined || opening_balance === null) {
      return res.status(400).json({ error: 'opening_balance is required.' });
    }

    const parsedVal = parseFloat(opening_balance);
    if (isNaN(parsedVal)) {
      return res.status(400).json({ error: 'opening_balance must be a valid number.' });
    }

    await db.run(
      `INSERT OR REPLACE INTO hpcl_config (key, value) VALUES ('hpcl_opening_balance', ?)`,
      [parsedVal.toString()]
    );

    await recalculateHpclLedger();
    res.json({
      success: true,
      message: 'Opening balance updated and ledger recalculated.',
      opening_balance: parsedVal,
    });
  } catch (err) {
    console.error('[HPCL] Error updating opening balance:', err.message);
    res.status(500).json({ error: 'Database error saving opening balance.' });
  }
});

// ── Server Start (local development only, skipped on Vercel) ────────────────

if (!process.env.VERCEL) {
  const os = require('os');
  const isOnline = process.argv.includes('--online');

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local Access: http://localhost:${PORT}`);

    // Get and print local network IP address
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
          console.log(`Local Network Access: http://${alias.address}:${PORT}`);
        }
      }
    }

    // If --online flag is passed, start the localtunnel
    if (isOnline) {
      const localtunnel = require('localtunnel');
      (async () => {
        try {
          console.log('Starting online tunnel...');
          const tunnel = await localtunnel({ port: PORT });
          console.log(`\n==================================================`);
          console.log(`🌎 Public Internet Access (Online): ${tunnel.url}`);
          console.log(`==================================================\n`);

          tunnel.on('close', () => {
            console.log('Online tunnel closed.');
          });
        } catch (err) {
          console.error('Failed to start online tunnel:', err.message);
        }
      })();
    }
  });
}

// Export for Vercel serverless function
module.exports = app;
