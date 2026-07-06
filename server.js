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

let activeDateCache = {
  date: null,
  timestamp: 0
};

async function getActiveDate() {
  const now = Date.now();
  if (activeDateCache.date && (now - activeDateCache.timestamp < 5000)) {
    return activeDateCache.date;
  }

  const row = await db.get("SELECT MAX(date) AS latest_closed_date FROM cash_reconciliation WHERE date >= '2026-06-26'");
  if (row && row.latest_closed_date) {
    const [y, m, d] = row.latest_closed_date.split('-');
    const latestDate = new Date(Date.UTC(y, m - 1, d));
    latestDate.setUTCDate(latestDate.getUTCDate() + 1);
    const year = latestDate.getUTCFullYear();
    const month = String(latestDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(latestDate.getUTCDate()).padStart(2, '0');
    
    activeDateCache.date = `${year}-${month}-${day}`;
    activeDateCache.timestamp = now;
    return activeDateCache.date;
  }
  activeDateCache.date = '2026-06-26';
  activeDateCache.timestamp = now;
  return activeDateCache.date;
}

async function realignTtTrips(baseTripId, action) {
  try {
    // Fetch all trips in chronological order
    const trips = await db.all(`SELECT * FROM tt_trips ORDER BY date ASC, id ASC`);
    if (trips.length === 0) return;

    if (action === 'DELETE') {
      // If a trip was deleted, ensure forward continuity from the first trip to the last.
      for (let i = 1; i < trips.length; i++) {
        const prev = trips[i - 1];
        const curr = trips[i];
        if (curr.start_km !== prev.end_km) {
          const runKm = curr.end_km - curr.start_km;
          const newStart = prev.end_km;
          const newEnd = newStart + runKm;
          await db.run(
            `UPDATE tt_trips SET start_km = ?, end_km = ?, run_km = ? WHERE id = ?`,
            [newStart, newEnd, runKm, curr.id]
          );
          curr.start_km = newStart;
          curr.end_km = newEnd;
        }
      }
    } else if (action === 'EDIT' && baseTripId) {
      // Find the index of the edited trip
      const idx = trips.findIndex(t => t.id === parseInt(baseTripId));
      if (idx === -1) return;

      // Propagate backwards from idx to 0
      for (let i = idx; i > 0; i--) {
        const curr = trips[i];
        const prev = trips[i - 1];
        if (prev.end_km !== curr.start_km) {
          const newEnd = curr.start_km;
          const newRun = newEnd - prev.start_km;
          await db.run(
            `UPDATE tt_trips SET end_km = ?, run_km = ? WHERE id = ?`,
            [newEnd, newRun, prev.id]
          );
          prev.end_km = newEnd;
          prev.run_km = newRun;
        }
      }

      // Propagate forwards from idx to the end
      for (let i = idx; i < trips.length - 1; i++) {
        const curr = trips[i];
        const next = trips[i + 1];
        if (next.start_km !== curr.end_km) {
          const runKm = next.end_km - next.start_km;
          const newStart = curr.end_km;
          const newEnd = newStart + runKm;
          await db.run(
            `UPDATE tt_trips SET start_km = ?, end_km = ?, run_km = ? WHERE id = ?`,
            [newStart, newEnd, runKm, next.id]
          );
          next.start_km = newStart;
          next.end_km = newEnd;
        }
      }
    }
  } catch (err) {
    console.error('Error in realignTtTrips:', err.message);
  }
}

function isLastDayOfMonth(dateStr) {
  if (!dateStr || dateStr.length !== 10) return false;
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Date.UTC(y, m - 1, d));
  const month = date.getUTCMonth();
  const nextDay = new Date(date);
  nextDay.setUTCDate(date.getUTCDate() + 1);
  return nextDay.getUTCMonth() !== month;
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

// Endpoint to fetch the current server time (milliseconds since epoch)
app.get('/api/server-time', (req, res) => {
  res.json({ serverTime: Date.now() });
});

// Combined Endpoint to fetch all necessary data for the day closing view in one call
app.get('/api/day-data', async (req, res) => {
  try {
    const { date } = req.query;
    const activeDate = await getActiveDate();
    const targetDate = date || activeDate;

    // Fetch these in parallel from the DB
    const [
      readingsResponse,
      tanksResponse,
      ratesResponse,
      cashResponse
    ] = await Promise.all([
      // get readings
      (async () => {
        const todayRows = await db.all(
          `SELECT nozzle_id, product, opening_reading, closing_reading, testing_qty FROM readings WHERE date = ? ORDER BY nozzle_id ASC`,
          [targetDate]
        );
        const yesterdayRows = await db.all(
          `SELECT nozzle_id, product, closing_reading AS opening_reading FROM readings WHERE date = (SELECT MAX(date) FROM readings WHERE date < ? AND date >= '2026-06-26') ORDER BY nozzle_id ASC`,
          [targetDate]
        );
        return { isClosed: todayRows.length === 6, savedReadings: todayRows, openingReadings: yesterdayRows };
      })(),
      
      // get tanks
      (async () => {
        const todayRows = await db.all(
          `SELECT tank_id, tank_name, product, capacity, opening_dip, opening_stock, closing_dip, closing_stock, decantation_qty, tt_decantation FROM tank_readings WHERE date = ? ORDER BY tank_id ASC`,
          [targetDate]
        );
        const yesterdayRows = await db.all(
          `SELECT tank_id, tank_name, product, capacity, closing_dip AS opening_dip, closing_stock AS opening_stock FROM tank_readings WHERE date = (SELECT MAX(date) FROM tank_readings WHERE date < ? AND date >= '2026-06-26') ORDER BY tank_id ASC`,
          [targetDate]
        );
        return { isClosed: todayRows.length === 3, savedTanks: todayRows, openingTanks: yesterdayRows };
      })(),
      
      // get rates
      (async () => {
        const todayRow = await db.get(`SELECT rate_power, rate_petrol, rate_diesel FROM rates WHERE date = ?`, [targetDate]);
        if (todayRow) return { isSaved: true, rates: todayRow };
        const previousRow = await db.get(`SELECT rate_power, rate_petrol, rate_diesel FROM rates WHERE date = (SELECT MAX(date) FROM rates WHERE date < ? AND date >= '2026-06-26')`, [targetDate]);
        if (previousRow) return { isSaved: false, rates: previousRow };
        return { isSaved: false, rates: { rate_power: 110.0, rate_petrol: 100.0, rate_diesel: 90.0 } };
      })(),
      
      // get cash
      (async () => {
        const row = await db.get(
          `SELECT total_sales_value, total_cash_received, shortfall, notes_500, notes_200, notes_100, notes_50, notes_20, notes_10, coins, coins_20, coins_10, coins_5, coins_2, coins_1 FROM cash_reconciliation WHERE date = ?`,
          [targetDate]
        );
        const nonCashRows = await db.all(
          `SELECT type, description, amount FROM non_cash_payments WHERE date = ? ORDER BY entry_index ASC`,
          [targetDate]
        );
        return { isSaved: !!row, cash: row || null, nonCashPayments: nonCashRows || [] };
      })()
    ]);

    res.json({
      activeDate,
      targetDate,
      readings: readingsResponse,
      tanks: tanksResponse,
      rates: ratesResponse,
      cash: cashResponse
    });
  } catch (err) {
    console.error('Error fetching combined day data:', err.message);
    res.status(500).json({ error: 'Database error fetching day data.' });
  }
});

// Endpoint to fetch the current active date for input
app.get('/api/active-date', async (req, res) => {
  try {
    const row = await db.get('SELECT MAX(date) AS latest_closed_date FROM cash_reconciliation');
    const latestClosedDate = row ? row.latest_closed_date : null;
    let activeDate = '2026-06-26';
    if (latestClosedDate) {
      const [y, m, d] = latestClosedDate.split('-');
      const latestDate = new Date(Date.UTC(y, m - 1, d));
      latestDate.setUTCDate(latestDate.getUTCDate() + 1);
      const year = latestDate.getUTCFullYear();
      const month = String(latestDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(latestDate.getUTCDate()).padStart(2, '0');
      activeDate = `${year}-${month}-${day}`;
    }
    res.json({ activeDate, latestClosedDate });
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
        SELECT MAX(date) FROM readings WHERE date < ? AND date >= '2026-06-26'
      )
      ORDER BY nozzle_id ASC
    `;

    const [todayRows, yesterdayRows] = await Promise.all([
      db.all(todayQuery, [date]),
      db.all(yesterdayQuery, [date])
    ]);

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
      SELECT tank_id, tank_name, product, capacity, opening_dip, opening_stock, closing_dip, closing_stock, decantation_qty, tt_decantation
      FROM tank_readings
      WHERE date = ?
      ORDER BY tank_id ASC
    `;

    const yesterdayQuery = `
      SELECT tank_id, tank_name, product, capacity, closing_dip AS opening_dip, closing_stock AS opening_stock
      FROM tank_readings
      WHERE date = (
        SELECT MAX(date) FROM tank_readings WHERE date < ? AND date >= '2026-06-26'
      )
      ORDER BY tank_id ASC
    `;

    const [todayRows, yesterdayRows] = await Promise.all([
      db.all(todayQuery, [date]),
      db.all(yesterdayQuery, [date])
    ]);

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

      const ttDecant = parseInt(t.tt_decantation, 10) || 0;

      statements.push({
        sql: `INSERT OR REPLACE INTO tank_readings (date, tank_id, tank_name, product, capacity, opening_dip, opening_stock, closing_dip, closing_stock, decantation_qty, tt_decantation)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [date, t.tank_id, t.tank_name, t.product, capacity, openingDip, opening, dip, closing, decantation, ttDecant],
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
      `SELECT rate_power, rate_petrol, rate_diesel FROM rates WHERE date = (SELECT MAX(date) FROM rates WHERE date < ? AND date >= '2026-06-26')`,
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
      decantation_yes, own_tanker_yes, own_tanker_amount
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

    // Fetch diesel rate for the date to compute fuel filled (liters) if own tanker decants
    const rateRow = await db.get(
      `SELECT rate_diesel FROM rates WHERE date = ?`,
      [date]
    );
    const rateDiesel = rateRow ? parseFloat(rateRow.rate_diesel) : 0;

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
      {
        sql: `DELETE FROM debtor_transactions WHERE transaction_date = ? AND description LIKE 'Credit Sale (Day Closing)%'`,
        args: [date],
      },
      {
        sql: `DELETE FROM employee_transactions WHERE transaction_date = ? AND description LIKE 'Employee Payment (Day Closing)%'`,
        args: [date],
      },
      {
        sql: `DELETE FROM tt_transactions WHERE date = ? AND source = 'AUTO' AND particular1 = 'Day Closing'`,
        args: [date],
      },
    ];

    // Add non-cash payment inserts
    const payments = non_cash_payments || [];
    payments.forEach((p, idx) => {
      const amount = parseFloat(p.amount) || 0;
      const description = p.description || '';
      const type = p.type || 'UPI';

      // Only save rows that have a non-zero amount — skip blank/zero rows entirely
      if (amount > 0) {
        statements.push({
          sql: `INSERT INTO non_cash_payments (date, entry_index, type, description, amount) VALUES (?, ?, ?, ?, ?)`,
          args: [date, idx, type, description, amount],
        });

        // Automatically create a DEBIT transaction in the debtor ledger if this is a Credit type payment
        if ((type === 'Credit' || type === 'Old Credit' || type === 'Fresh Credit') && amount > 0 && description.startsWith('debtor_id:')) {
          const debtorId = parseInt(description.split(':')[1], 10);
          if (!isNaN(debtorId)) {
            statements.push({
              sql: `INSERT INTO debtor_transactions (debtor_id, transaction_date, transaction_type, description, debit_amount, credit_amount)
                    VALUES (?, ?, 'DEBIT', 'Credit Sale (Day Closing)', ?, 0)`,
              args: [debtorId, date, amount],
            });
          }
        }

        // Automatically create an Advance Given transaction in the employee ledger if this is an Employee type payment
        if (type === 'Employee' && amount > 0 && description.startsWith('employee_id:')) {
          const employeeId = parseInt(description.split(':')[1], 10);
          if (!isNaN(employeeId)) {
            statements.push({
              sql: `INSERT INTO employee_transactions (employee_id, transaction_date, transaction_type, description, advance_given, amount_settled)
                    VALUES (?, ?, 'Advance Given', 'Employee Payment (Day Closing)', ?, 0)`,
              args: [employeeId, date, amount],
            });
          }
        }

        // Automatically create a DEBIT transaction in the TT ledger if this is a TT (MH-19-CY-5682) type payment
        if (type === 'MH-19-CY-5682' && amount > 0) {
          statements.push({
            sql: `INSERT INTO tt_transactions (date, type, source, amount, particular1, description, notes)
                  VALUES (?, 'DEBIT', 'AUTO', ?, 'Day Closing', ?, 'Auto-logged from Day Closing non-cash payments')`,
            args: [date, amount, description],
          });
        }

      }
    });

    await db.batch(statements);

    // Hook for MH-19-CY-5682 Ledger and Fuel Filled auto-log
    if (decantation_yes && own_tanker_yes) {
      const ownAmt = parseFloat(own_tanker_amount) || 0;
      if (ownAmt > 0) {
        // Part 2: Push Debit entry to TT Ledger if it doesn't exist
        const existingDebit = await db.get(
          `SELECT id FROM tt_transactions WHERE date = ? AND type = 'DEBIT' LIMIT 1`,
          [date]
        );
        if (!existingDebit) {
          await db.run(
            `INSERT INTO tt_transactions (date, type, source, amount, description)
             VALUES (?, 'DEBIT', 'AUTO', ?, 'Day Closing Auto-Entry')`,
            [date, ownAmt]
          );
        }

        // Part 3: Calculate and push Fuel Filled (L) to tt_trips
        if (rateDiesel > 0) {
          const liters = Math.floor((ownAmt / rateDiesel) * 100) / 100;
          const completedTrip = await db.get(
            `SELECT id, fuel_filled FROM tt_trips WHERE end_km > start_km ORDER BY date DESC, id DESC LIMIT 1`
          );

          if (completedTrip) {
            await db.run(
              `UPDATE tt_trips SET fuel_filled = ? WHERE id = ?`,
              [liters, completedTrip.id]
            );
          } else {
            const existingTrip = await db.get(
              `SELECT id, fuel_filled FROM tt_trips WHERE date = ? LIMIT 1`,
              [date]
            );
            if (existingTrip) {
              await db.run(
                `UPDATE tt_trips SET fuel_filled = ? WHERE id = ?`,
                [liters, existingTrip.id]
              );
            } else {
              await db.run(
                `INSERT INTO tt_trips (date, start_km, end_km, run_km, fuel_filled, load_qty, driver_name, notes)
                 VALUES (?, 0, 0, 0, ?, 0, '', 'Auto-logged from Day Closing')`,
                [date, liters]
              );
            }
          }
        }
      }
    }

    // Sync with Chillar Record
    try {
      await db.run(`DELETE FROM chillar_transactions WHERE date = ? AND type = 'DAY_CLOSE'`, [date]);
      const chillarNotes20 = parseInt(notes_20 || 0, 10);
      const chillarNotes10 = parseInt(notes_10 || 0, 10);
      const chillarCoins20 = parseInt(coins_20 || 0, 10);
      const chillarCoins10 = parseInt(coins_10 || 0, 10);
      const chillarCoins5 = parseInt(coins_5 || 0, 10);
      const chillarCoins2 = parseInt(coins_2 || 0, 10);
      const chillarCoins1 = parseInt(coins_1 || 0, 10);
      const chillarTotal = (chillarNotes20 * 20) + (chillarNotes10 * 10) + (chillarCoins20 * 20) + (chillarCoins10 * 10) + (chillarCoins5 * 5) + (chillarCoins2 * 2) + (chillarCoins1 * 1);
      
      if (chillarTotal > 0 || chillarNotes20 > 0 || chillarNotes10 > 0 || chillarCoins20 > 0 || chillarCoins10 > 0 || chillarCoins5 > 0 || chillarCoins2 > 0 || chillarCoins1 > 0) {
        await db.run(
          `INSERT INTO chillar_transactions (date, type, description, notes_20, notes_10, coins_20, coins_10, coins_5, coins_2, coins_1, total_amount)
           VALUES (?, 'DAY_CLOSE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [date, `Day Closing Chillar Entry`, chillarNotes20, chillarNotes10, chillarCoins20, chillarCoins10, chillarCoins5, chillarCoins2, chillarCoins1, chillarTotal]
        );
      }
    } catch (err) {
      console.error('[CHILLAR] Failed to auto-sync day closing cash:', err.message);
    }

    // Invalidate active date cache
    activeDateCache.timestamp = 0;

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

// GET /api/profit-margins — Get margins for a specific month
app.get('/api/profit-margins', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month parameter in YYYY-MM format is required.' });
    }

    const row = await db.get('SELECT * FROM profit_margins WHERE month = ?', [month]);
    if (row) {
      return res.json(row);
    }

    // Default values if no entry exists
    res.json({
      month,
      dealer_power: 3.0,
      dealer_petrol: 3.0,
      dealer_diesel: 2.0,
      diff_power: 0.5,
      diff_petrol: 0.5,
      diff_diesel: 0.2
    });
  } catch (err) {
    console.error('Error fetching profit margins:', err.message);
    res.status(500).json({ error: 'Database error fetching profit margins.' });
  }
});

// POST /api/profit-margins — Save or update margins for a specific month
app.post('/api/profit-margins', async (req, res) => {
  try {
    const { month, dealer_power, dealer_petrol, dealer_diesel, diff_power, diff_petrol, diff_diesel } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month parameter in YYYY-MM format is required.' });
    }

    const dPower = parseFloat(dealer_power) || 0;
    const dPetrol = parseFloat(dealer_petrol) || 0;
    const dDiesel = parseFloat(dealer_diesel) || 0;
    const dfPower = parseFloat(diff_power) || 0;
    const dfPetrol = parseFloat(diff_petrol) || 0;
    const dfDiesel = parseFloat(diff_diesel) || 0;

    await db.run(
      `INSERT OR REPLACE INTO profit_margins (month, dealer_power, dealer_petrol, dealer_diesel, diff_power, diff_petrol, diff_diesel)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [month, dPower, dPetrol, dDiesel, dfPower, dfPetrol, dfDiesel]
    );

    res.json({ success: true, message: 'Margins saved successfully.' });
  } catch (err) {
    console.error('Error saving profit margins:', err.message);
    res.status(500).json({ error: 'Database error saving profit margins.' });
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
    const [configRow, summaryRow] = await Promise.all([
      db.get(`SELECT value FROM hpcl_config WHERE key = 'hpcl_opening_balance'`),
      db.get(`
        SELECT 
          SUM(CASE WHEN type = 'CREDIT' THEN amount ELSE 0 END) AS total_credits,
          SUM(CASE WHEN type = 'DEBIT' THEN amount ELSE 0 END) AS total_debits,
          (SELECT running_balance FROM hpcl_transactions ORDER BY date DESC, id DESC LIMIT 1) AS latest_balance
        FROM hpcl_transactions
      `)
    ]);

    const openingBalance = parseFloat((configRow && configRow.value) || '0');

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

// PUT /api/hpcl/transaction/:id
app.put('/api/hpcl/transaction/:id', async (req, res) => {
  try {
    const { id } = req.params;
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
      `UPDATE hpcl_transactions SET date = ?, description = ?, type = ?, amount = ? WHERE id = ?`,
      [date, description, type, parsedAmount, id]
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    await recalculateHpclLedger();

    const row = await db.get(`SELECT * FROM hpcl_transactions WHERE id = ?`, [id]);
    res.json({ success: true, transaction: row });
  } catch (err) {
    console.error('[HPCL] Error updating transaction:', err.message);
    res.status(500).json({ error: 'Database error updating transaction.' });
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

    const latestClosed = await db.get('SELECT MAX(date) AS latest_closed_date FROM cash_reconciliation');
    if (latestClosed && latestClosed.latest_closed_date) {
      return res.status(403).json({ error: 'Cannot modify opening balance once a day closing has been finalized.' });
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

// ── Debtor Management (Udhari) API ──────────────────────────────────────────

// GET /api/debtors/total-outstanding — Dashboard card: total outstanding across all debtors
app.get('/api/debtors/total-outstanding', async (req, res) => {
  try {
    const row = await db.get(`
      SELECT COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) AS total_outstanding
      FROM debtor_transactions
    `);
    res.json({ total_outstanding: parseFloat((row && row.total_outstanding) || 0) });
  } catch (err) {
    console.error('[Udhari] Error fetching total outstanding:', err.message);
    res.status(500).json({ error: 'Database error fetching total outstanding.' });
  }
});

// GET /api/debtors/summary — All debtors with total debit, credit, outstanding sorted by highest
app.get('/api/debtors/summary', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT 
        d.id,
        d.debtor_name,
        d.mobile,
        COALESCE(SUM(dt.debit_amount), 0) AS total_debit,
        COALESCE(SUM(dt.credit_amount), 0) AS total_credit,
        COALESCE(SUM(dt.debit_amount), 0) - COALESCE(SUM(dt.credit_amount), 0) AS outstanding
      FROM debtors d
      LEFT JOIN debtor_transactions dt ON d.id = dt.debtor_id
      GROUP BY d.id
      ORDER BY outstanding DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Udhari] Error fetching debtor summary:', err.message);
    res.status(500).json({ error: 'Database error fetching debtor summary.' });
  }
});

// GET /api/debtors — List all debtors with outstanding balance
app.get('/api/debtors', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT 
        d.id,
        d.debtor_name,
        d.mobile,
        d.address,
        d.is_active,
        d.created_at,
        COALESCE(SUM(dt.debit_amount), 0) - COALESCE(SUM(dt.credit_amount), 0) AS outstanding
      FROM debtors d
      LEFT JOIN debtor_transactions dt ON d.id = dt.debtor_id
      GROUP BY d.id
      ORDER BY d.debtor_name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Udhari] Error fetching debtors:', err.message);
    res.status(500).json({ error: 'Database error fetching debtors.' });
  }
});

// POST /api/debtors — Add a new debtor
app.post('/api/debtors', async (req, res) => {
  try {
    const { debtor_name, mobile, address } = req.body;

    if (!debtor_name || debtor_name.trim() === '') {
      return res.status(400).json({ error: 'Debtor name cannot be blank.' });
    }

    const trimmedName = debtor_name.trim();

    // Check for duplicate
    const existing = await db.get(
      `SELECT id FROM debtors WHERE LOWER(debtor_name) = LOWER(?)`,
      [trimmedName]
    );
    if (existing) {
      return res.status(400).json({ error: 'A debtor with this name already exists.' });
    }

    const result = await db.run(
      `INSERT INTO debtors (debtor_name, mobile, address) VALUES (?, ?, ?)`,
      [trimmedName, (mobile || '').trim(), (address || '').trim()]
    );

    res.json({
      success: true,
      message: 'Debtor added successfully.',
      debtor: { id: result.lastInsertRowid, debtor_name: trimmedName, mobile: (mobile || '').trim(), address: (address || '').trim() },
    });
  } catch (err) {
    console.error('[Udhari] Error adding debtor:', err.message);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A debtor with this name already exists.' });
    }
    res.status(500).json({ error: 'Database error adding debtor.' });
  }
});

// PUT /api/debtors/:id — Update debtor details
app.put('/api/debtors/:id', async (req, res) => {
  try {
    const debtorId = req.params.id;
    const { debtor_name, mobile, address } = req.body;
    
    if (!debtor_name || debtor_name.trim() === '') {
      return res.status(400).json({ error: 'Debtor name is required.' });
    }
    
    await db.run(
      `UPDATE debtors SET debtor_name = ?, mobile = ?, address = ? WHERE id = ?`,
      [debtor_name.trim(), (mobile || '').trim(), (address || '').trim(), debtorId]
    );
    
    res.json({ success: true, message: 'Debtor updated successfully.' });
  } catch (err) {
    console.error('[Udhari] Error updating debtor:', err.message);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'A debtor with this name already exists.' });
    }
    res.status(500).json({ error: 'Database error updating debtor.' });
  }
});

// DELETE /api/debtors/:id — Delete debtor only if outstanding = 0
app.delete('/api/debtors/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check outstanding balance
    const balanceRow = await db.get(`
      SELECT COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0) AS outstanding
      FROM debtor_transactions
      WHERE debtor_id = ?
    `, [id]);

    const outstanding = parseFloat((balanceRow && balanceRow.outstanding) || 0);
    if (Math.abs(outstanding) > 0.005) {
      return res.status(400).json({
        error: 'Cannot delete debtor because outstanding balance exists.',
        outstanding: outstanding,
      });
    }

    const activeDate = await getActiveDate();
    const lockedTx = await db.get(`
      SELECT id FROM debtor_transactions 
      WHERE debtor_id = ? AND transaction_date < ?
      LIMIT 1
    `, [id, activeDate]);
    if (lockedTx) {
      return res.status(403).json({ error: 'Cannot delete debtor with transaction history in finalized/locked dates.' });
    }

    // Delete transactions first (should be zero-sum), then debtor
    await db.run(`DELETE FROM debtor_transactions WHERE debtor_id = ?`, [id]);
    const result = await db.run(`DELETE FROM debtors WHERE id = ?`, [id]);

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Debtor not found.' });
    }

    res.json({ success: true, message: 'Debtor deleted successfully.' });
  } catch (err) {
    console.error('[Udhari] Error deleting debtor:', err.message);
    res.status(500).json({ error: 'Database error deleting debtor.' });
  }
});

// POST /api/debtor-transactions — Add a credit sale (DEBIT) or cash received (CREDIT)
app.post('/api/debtor-transactions', async (req, res) => {
  try {
    const { debtor_id, transaction_date, transaction_type, description, debit_amount, credit_amount } = req.body;

    if (!debtor_id || !transaction_date || !transaction_type) {
      return res.status(400).json({ error: 'Debtor, date, and transaction type are required.' });
    }

    // Bypassed lock validation for Category B debtor transactions

    if (transaction_type !== 'DEBIT' && transaction_type !== 'CREDIT') {
      return res.status(400).json({ error: 'Transaction type must be DEBIT or CREDIT.' });
    }

    const debit = parseFloat(debit_amount) || 0;
    const credit = parseFloat(credit_amount) || 0;

    if (transaction_type === 'DEBIT' && debit <= 0) {
      return res.status(400).json({ error: 'Debit amount must be a positive number.' });
    }

    if (transaction_type === 'CREDIT' && credit <= 0) {
      return res.status(400).json({ error: 'Credit amount must be a positive number.' });
    }

    // Verify debtor exists
    const debtor = await db.get(`SELECT id FROM debtors WHERE id = ?`, [debtor_id]);
    if (!debtor) {
      return res.status(404).json({ error: 'Debtor not found.' });
    }

    await db.run(
      `INSERT INTO debtor_transactions (debtor_id, transaction_date, transaction_type, description, debit_amount, credit_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [debtor_id, transaction_date, transaction_type, description || '', debit, credit]
    );

    res.json({ success: true, message: `${transaction_type === 'DEBIT' ? 'Credit sale' : 'Payment'} recorded successfully.` });
  } catch (err) {
    console.error('[Udhari] Error adding transaction:', err.message);
    res.status(500).json({ error: 'Database error saving transaction.' });
  }
});

// GET /api/debtors/:id/transactions — Full ledger for a debtor with running balance
app.get('/api/debtors/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;

    const debtor = await db.get(`SELECT id, debtor_name FROM debtors WHERE id = ?`, [id]);
    if (!debtor) {
      return res.status(404).json({ error: 'Debtor not found.' });
    }

    const rows = await db.all(`
      SELECT id, transaction_date, transaction_type, description, debit_amount, credit_amount, remarks
      FROM debtor_transactions
      WHERE debtor_id = ?
      ORDER BY transaction_date ASC, id ASC
    `, [id]);

    // Calculate running balance
    let runningBalance = 0;
    const transactions = rows.map(row => {
      runningBalance += (row.debit_amount || 0) - (row.credit_amount || 0);
      return {
        ...row,
        running_balance: parseFloat(runningBalance.toFixed(2)),
      };
    });

    res.json({
      debtor_name: debtor.debtor_name,
      transactions: transactions,
    });
  } catch (err) {
    console.error('[Udhari] Error fetching debtor ledger:', err.message);
    res.status(500).json({ error: 'Database error fetching ledger.' });
  }
});

// PUT /api/debtor-transactions/:id — Update debtor transaction details
app.put('/api/debtor-transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { transaction_date, description, debit_amount, credit_amount, remarks } = req.body;

    if (!transaction_date) {
      return res.status(400).json({ error: 'Transaction date is required.' });
    }

    const tx = await db.get(`SELECT transaction_date FROM debtor_transactions WHERE id = ?`, [id]);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    // Bypassed lock validation for Category B debtor transactions

    const parsedDebit = parseFloat(debit_amount) || 0;
    const parsedCredit = parseFloat(credit_amount) || 0;

    await db.run(
      `UPDATE debtor_transactions
       SET transaction_date = ?, description = ?, debit_amount = ?, credit_amount = ?, remarks = ?
       WHERE id = ?`,
      [transaction_date, description || '', parsedDebit, parsedCredit, remarks || '', id]
    );

    res.json({ success: true, message: 'Transaction updated successfully.' });
  } catch (err) {
    console.error('[Udhari] Error updating debtor transaction:', err.message);
    res.status(500).json({ error: 'Database error updating transaction.' });
  }
});

// GET /api/debtor-transactions/date — Date-wise / range report with optional filters
app.get('/api/debtor-transactions/date', async (req, res) => {
  try {
    const { date, startDate, endDate, debtorId, type } = req.query;

    let start = startDate || date;
    let end = endDate || date;

    if (!start || !end) {
      return res.status(400).json({ error: 'Date or date range parameters are required.' });
    }

    let sql = `
      SELECT 
        dt.id,
        dt.transaction_date,
        d.debtor_name,
        dt.transaction_type,
        dt.description,
        dt.debit_amount,
        dt.credit_amount
      FROM debtor_transactions dt
      JOIN debtors d ON dt.debtor_id = d.id
      WHERE dt.transaction_date BETWEEN ? AND ?
    `;
    const params = [start, end];

    if (debtorId) {
      sql += ` AND dt.debtor_id = ?`;
      params.push(debtorId);
    }

    if (type) {
      sql += ` AND dt.transaction_type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY dt.transaction_date ASC, dt.id ASC`;

    const rows = await db.all(sql, params);

    // Calculate totals
    let totalDebit = 0;
    let totalCredit = 0;
    rows.forEach(r => {
      totalDebit += r.debit_amount || 0;
      totalCredit += r.credit_amount || 0;
    });

    res.json({
      startDate: start,
      endDate: end,
      transactions: rows,
      total_debit: parseFloat(totalDebit.toFixed(2)),
      total_credit: parseFloat(totalCredit.toFixed(2)),
      net_change: parseFloat((totalDebit - totalCredit).toFixed(2)),
    });
  } catch (err) {
    console.error('[Udhari] Error fetching date range report:', err.message);
    res.status(500).json({ error: 'Database error fetching date range report.' });
  }
});

// ── Employee Management API ─────────────────────────────────────────────────

// GET /api/employees — list all employees with month-wise given/settled/balance
// ?month=YYYY-MM  defaults to current month
app.get('/api/employees', async (req, res) => {
  try {
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month))
      ? req.query.month : defaultMonth;

    // Prune logic: Keep employee transactions for last two months only
    const activeDate = await getActiveDate();
    const [y, m] = activeDate.split('-');
    const limitDate = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, 1));
    limitDate.setUTCMonth(limitDate.getUTCMonth() - 1);
    const limitStr = `${limitDate.getUTCFullYear()}-${String(limitDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
    await db.run('DELETE FROM employee_transactions WHERE transaction_date < ?', [limitStr]);

    const rows = await db.all(`
      SELECT 
        e.id, 
        e.name, 
        e.mobile, 
        e.is_active,
        0 AS opening_balance,
        COALESCE((SELECT SUM(advance_given) FROM employee_transactions
          WHERE employee_id = e.id AND strftime('%Y-%m', transaction_date) = ?), 0) AS month_given,
        COALESCE((SELECT SUM(amount_settled) FROM employee_transactions
          WHERE employee_id = e.id AND strftime('%Y-%m', transaction_date) = ?), 0) AS month_settled
      FROM employees e
      ORDER BY e.name ASC
    `, [month, month]);

    res.json({ employees: rows, month });
  } catch (err) {
    console.error('Error fetching employees:', err.message);
    res.status(500).json({ error: 'Database error fetching employees.' });
  }
});

// POST /api/employees — Add new employee
app.post('/api/employees', async (req, res) => {
  try {
    const { name, mobile } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Employee name is required.' });
    }
    const trimmedName = name.trim();
    const existing = await db.get(`SELECT id FROM employees WHERE name = ?`, [trimmedName]);
    if (existing) {
      return res.status(400).json({ error: 'An employee with this name already exists.' });
    }
    const result = await db.run(
      `INSERT INTO employees (name, mobile) VALUES (?, ?)`,
      [trimmedName, (mobile || '').trim()]
    );
    res.json({ success: true, message: 'Employee added successfully.', employee: { id: result.lastInsertRowid, name: trimmedName } });
  } catch (err) {
    console.error('Error adding employee:', err.message);
    res.status(500).json({ error: 'Database error adding employee.' });
  }
});

// PUT /api/employees/:id — Edit employee name and mobile
app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Employee name is required.' });
    }
    const trimmedName = name.trim();
    const existing = await db.get(`SELECT id FROM employees WHERE name = ? AND id != ?`, [trimmedName, id]);
    if (existing) {
      return res.status(400).json({ error: 'Another employee with this name already exists.' });
    }
    const result = await db.run(
      `UPDATE employees SET name = ?, mobile = ? WHERE id = ?`,
      [trimmedName, (mobile || '').trim(), id]
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    res.json({ success: true, message: 'Employee updated successfully.' });
  } catch (err) {
    console.error('Error updating employee:', err.message);
    res.status(500).json({ error: 'Database error updating employee.' });
  }
});

// DELETE /api/employees/:id
app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const activeDate = await getActiveDate();
    const lockedTx = await db.get(`
      SELECT id FROM employee_transactions 
      WHERE employee_id = ? AND transaction_date < ?
      LIMIT 1
    `, [id, activeDate]);
    if (lockedTx) {
      return res.status(403).json({ error: 'Cannot delete employee with transaction history in finalized/locked dates.' });
    }
    await db.run(`DELETE FROM employee_transactions WHERE employee_id = ?`, [id]);
    const result = await db.run(`DELETE FROM employees WHERE id = ?`, [id]);
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Employee not found.' });
    res.json({ success: true, message: 'Employee deleted successfully.' });
  } catch (err) {
    console.error('Error deleting employee:', err.message);
    res.status(500).json({ error: 'Database error deleting employee.' });
  }
});

// GET /api/employees/:id/transactions — month-filtered ledger with running balance
// ?month=YYYY-MM  filters to that month only; running balance resets to 0 at month start
app.get('/api/employees/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month))
      ? req.query.month : defaultMonth;

    const openingBalance = 0;

    const rows = await db.all(`
      SELECT id, transaction_date, transaction_type, description, advance_given, amount_settled, remarks
      FROM employee_transactions WHERE employee_id = ?
        AND strftime('%Y-%m', transaction_date) = ?
      ORDER BY transaction_date ASC, id ASC
    `, [id, month]);

    // Running balance starts from opening balance (carried forward, which is always 0)
    let runningBalance = openingBalance;
    const transactions = rows.map(row => {
      runningBalance += (row.advance_given || 0) - (row.amount_settled || 0);
      return { ...row, running_balance: parseFloat(runningBalance.toFixed(2)) };
    });
    res.json({ transactions, month, openingBalance });
  } catch (err) {
    console.error('Error fetching employee transactions:', err.message);
    res.status(500).json({ error: 'Database error fetching employee transactions.' });
  }
});

// POST /api/employees/:id/transactions — Add advance or settlement
app.post('/api/employees/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, type, amount, description } = req.body;
    if (!id || !date || !type || amount === undefined) {
      return res.status(400).json({ error: 'Employee, date, transaction type, and amount are required.' });
    }

    // Bypassed lock validation for Category B employee transactions

    const val = parseFloat(amount) || 0;
    if (val <= 0) return res.status(400).json({ error: 'Amount must be positive.' });

    // type: 'Advance Given' → advance_given, anything else → amount_settled
    const isAdvance = type === 'Advance Given';
    const advance_given = isAdvance ? val : 0;
    const amount_settled = !isAdvance ? val : 0;

    await db.run(
      `INSERT INTO employee_transactions (employee_id, transaction_date, transaction_type, description, advance_given, amount_settled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, date, type, description || '', advance_given, amount_settled]
    );
    res.json({ success: true, message: 'Transaction recorded successfully.' });
  } catch (err) {
    console.error('Error adding employee transaction:', err.message);
    res.status(500).json({ error: 'Database error adding employee transaction.' });
  }
});

// PUT /api/employees/transactions/:txnId — Edit an employee transaction
app.put('/api/employees/transactions/:txnId', async (req, res) => {
  try {
    const { txnId } = req.params;
    const { date, type, amount, description, remarks, advance_given, amount_settled } = req.body;
    if (!txnId || !date) {
      return res.status(400).json({ error: 'Transaction ID and date are required.' });
    }

    const tx = await db.get(`SELECT transaction_date FROM employee_transactions WHERE id = ?`, [txnId]);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    // Bypassed lock validation for Category B employee transactions

    let final_given = 0;
    let final_settled = 0;
    let final_type = type;

    if (advance_given !== undefined && amount_settled !== undefined) {
      final_given = parseFloat(advance_given) || 0;
      final_settled = parseFloat(amount_settled) || 0;
      final_type = final_given > 0 ? 'Advance Given' : 'Advance Settled';
    } else {
      const val = parseFloat(amount) || 0;
      if (val <= 0) return res.status(400).json({ error: 'Amount must be positive.' });
      const isAdvance = type === 'Advance Given';
      final_given = isAdvance ? val : 0;
      final_settled = !isAdvance ? val : 0;
    }

    await db.run(
      `UPDATE employee_transactions
       SET transaction_date = ?, transaction_type = ?, description = ?, advance_given = ?, amount_settled = ?, remarks = ?
       WHERE id = ?`,
      [date, final_type, description || '', final_given, final_settled, remarks || '', txnId]
    );
    res.json({ success: true, message: 'Transaction updated successfully.' });
  } catch (err) {
    console.error('Error updating employee transaction:', err.message);
    res.status(500).json({ error: 'Database error updating employee transaction.' });
  }
});

// DELETE /api/employees/transactions/:txnId — Delete an employee transaction
app.delete('/api/employees/transactions/:txnId', async (req, res) => {
  try {
    const { txnId } = req.params;
    if (!txnId) {
      return res.status(400).json({ error: 'Transaction ID is required.' });
    }

    // Bypassed lock validation for Category B employee transactions

    await db.run(`DELETE FROM employee_transactions WHERE id = ?`, [txnId]);
    res.json({ success: true, message: 'Transaction deleted successfully.' });
  } catch (err) {
    console.error('Error deleting employee transaction:', err.message);
    res.status(500).json({ error: 'Database error deleting employee transaction.' });
  }
});

// ── TT (MH-19-CY-5682) Ledger Endpoints ─────────────────────────────────────

// GET /api/tt/transactions — Get statement entries and opening balance for a specific month
app.get('/api/tt/transactions', async (req, res) => {
  try {
    const { month } = req.query; // format 'YYYY-MM'
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month parameter in YYYY-MM format is required.' });
    }

    const rows = await db.all('SELECT * FROM tt_transactions ORDER BY date ASC, id ASC');
    
    let running = 0;
    let firstIndexInMonth = -1;
    
    const processed = rows.map((r, idx) => {
      const amt = parseFloat(r.amount);
      if (r.type === 'CREDIT') {
        running += amt;
      } else if (r.type === 'DEBIT') {
        running -= amt;
      }
      
      const isTargetMonth = r.date.startsWith(month);
      if (isTargetMonth && firstIndexInMonth === -1) {
        firstIndexInMonth = idx;
      }
      
      return {
        ...r,
        running_balance: running
      };
    });
    
    const monthTransactions = processed.filter(r => r.date.startsWith(month));
    
    let openingBalance = 0;
    if (firstIndexInMonth > 0) {
      openingBalance = processed[firstIndexInMonth - 1].running_balance;
    } else if (firstIndexInMonth === -1 && processed.length > 0) {
      let lastTxBefore = null;
      for (let i = processed.length - 1; i >= 0; i--) {
        if (processed[i].date < `${month}-01`) {
          lastTxBefore = processed[i];
          break;
        }
      }
      if (lastTxBefore) {
        openingBalance = lastTxBefore.running_balance;
      }
    }
    
    res.json({
      transactions: monthTransactions,
      openingBalance: openingBalance
    });
  } catch (err) {
    console.error('Error fetching TT transactions:', err.message);
    res.status(500).json({ error: 'Database error fetching transactions.' });
  }
});

// POST /api/tt/transactions/manual — Add a manual debit or credit entry
app.post('/api/tt/transactions/manual', async (req, res) => {
  try {
    const { date, type, amount, notes } = req.body;
    if (!date || !type || amount === undefined || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'Date, type (DEBIT/CREDIT), and valid amount are required.' });
    }

    // Bypassed lock validation for Category B TT transactions

    if (type !== 'DEBIT' && type !== 'CREDIT') {
      return res.status(400).json({ error: 'Type must be DEBIT or CREDIT.' });
    }
    const amt = parseFloat(amount);
    if (amt <= 0) {
      return res.status(400).json({ error: 'Amount must be positive.' });
    }
    const description = type === 'DEBIT' ? 'Manual Debit' : 'Manual Credit';
    await db.run(
      `INSERT INTO tt_transactions (date, type, source, amount, description, notes)
       VALUES (?, ?, 'MANUAL', ?, ?, ?)`,
      [date, type, amt, description, notes || '']
    );
    res.json({ success: true, message: 'Manual entry saved successfully.' });
  } catch (err) {
    console.error('Error saving manual TT transaction:', err.message);
    res.status(500).json({ error: 'Database error saving manual entry.' });
  }
});

// POST /api/tt/transactions/settlement — Record monthly settlement (CREDIT) and compute profit
app.post('/api/tt/transactions/settlement', async (req, res) => {
  try {
    const { settlement_month, date, amount, overwrite } = req.body;
    if (!settlement_month || !/^\d{4}-\d{2}$/.test(settlement_month) || !date || amount === undefined || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'Settlement month (YYYY-MM), date, and valid amount are required.' });
    }
    const amt = parseFloat(amount);
    if (amt <= 0) {
      return res.status(400).json({ error: 'Amount must be positive.' });
    }

    // Check for existing settlement
    const existing = await db.get(
      `SELECT * FROM tt_transactions WHERE source = 'SETTLEMENT' AND settlement_month = ?`,
      [settlement_month]
    );

    if (existing) {
      if (!overwrite) {
        return res.status(409).json({
          error: 'already_exists',
          message: `A settlement of ₹${Math.round(existing.amount)} is already recorded for ${settlement_month}.`,
          existingAmount: existing.amount
        });
      }
    }

    // Auto-calculate profit = amount - total debits for the calendar month
    const debitRow = await db.get(
      `SELECT SUM(amount) AS total_debits FROM tt_transactions WHERE type = 'DEBIT' AND date LIKE ?`,
      [`${settlement_month}-%`]
    );
    const totalDebits = parseFloat((debitRow && debitRow.total_debits) || '0');
    const profit = amt - totalDebits;

    if (existing && overwrite) {
      await db.run(
        `UPDATE tt_transactions
         SET date = ?, amount = ?, profit = ?, description = ?
         WHERE id = ?`,
        [date, amt, profit, 'Settlement Received', existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO tt_transactions (date, type, source, amount, profit, description, settlement_month)
         VALUES (?, 'CREDIT', 'SETTLEMENT', ?, ?, ?, ?)`,
        [date, amt, profit, 'Settlement Received', settlement_month]
      );
    }

    res.json({ success: true, message: 'Settlement recorded successfully.' });
  } catch (err) {
    console.error('Error saving settlement:', err.message);
    res.status(500).json({ error: 'Database error saving settlement.' });
  }
});

// GET /api/tt/entries — Fetch entries for a specific month (YYYY-MM)
app.get('/api/tt/entries', async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month parameter in YYYY-MM format is required.' });
    }
    
    const entries = await db.all(
      `SELECT * FROM tt_entries WHERE date LIKE ? ORDER BY date ASC, id ASC`,
      [`${month}-%`]
    );

    res.json({ success: true, entries: entries });
  } catch (err) {
    console.error('Error fetching TT entries:', err.message);
    res.status(500).json({ error: 'Database error fetching entries.' });
  }
});

// POST /api/tt/entries — Log a new trip entry
app.post('/api/tt/entries', async (req, res) => {
  try {
    const { date, trip_for, entry_given, remark1, remark2 } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Date is required.' });
    }
    // Bypassed lock validation for Category B TT entries
    if (!trip_for || !entry_given) {
      return res.status(400).json({ error: 'Trip For and Entry Given are required.' });
    }

    const runRes = await db.run(
      `INSERT INTO tt_entries (date, trip_for, entry_given, remark1, remark2)
       VALUES (?, ?, ?, ?, ?)`,
      [date, trip_for, entry_given, remark1 || '', remark2 || '']
    );
    const lastID = runRes.lastInsertRowid;

    // Automatically sync to tt_transactions (expenses ledger)
    const tripAmount = parseFloat(remark1) || 750;
    await db.run(
      `INSERT INTO tt_transactions (date, type, source, amount, description, tt_entry_id)
       VALUES (?, 'DEBIT', 'Trip', ?, ?, ?)`,
      [date, tripAmount, `Trip to ${trip_for} (Given: ${entry_given})`, lastID]
    );

    res.json({ success: true, message: 'Entry recorded successfully.' });
  } catch (err) {
    console.error('Error saving TT entry:', err.message);
    res.status(500).json({ error: 'Database error saving entry.' });
  }
});

// PUT /api/tt/entries/:id — Edit an entry inline
app.put('/api/tt/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, trip_for, entry_given, remark1, remark2 } = req.body;

    if (!date || !trip_for || !entry_given) {
      return res.status(400).json({ error: 'Date, Trip For, and Entry Given are required.' });
    }

    // Bypassed lock validation for Category B TT entries

    await db.run(
      `UPDATE tt_entries 
       SET date = ?, trip_for = ?, entry_given = ?, remark1 = ?, remark2 = ?
       WHERE id = ?`,
      [date, trip_for, entry_given, remark1 || '', remark2 || '', id]
    );

    // Automatically sync to tt_transactions (expenses ledger)
    const tripAmount = parseFloat(remark1) || 750;
    const existingTx = await db.get(`SELECT id FROM tt_transactions WHERE tt_entry_id = ?`, [id]);
    if (existingTx) {
      await db.run(
        `UPDATE tt_transactions
         SET date = ?, amount = ?, description = ?
         WHERE tt_entry_id = ?`,
        [date, tripAmount, `Trip to ${trip_for} (Given: ${entry_given})`, id]
      );
    } else {
      await db.run(
        `INSERT INTO tt_transactions (date, type, source, amount, description, tt_entry_id)
         VALUES (?, 'DEBIT', 'Trip', ?, ?, ?)`,
        [date, tripAmount, `Trip to ${trip_for} (Given: ${entry_given})`, id]
      );
    }

    res.json({ success: true, message: 'Entry updated successfully.' });
  } catch (err) {
    console.error('Error updating TT entry:', err.message);
    res.status(500).json({ error: 'Database error updating entry.' });
  }
});

// DELETE /api/tt/entries/:id — Delete an entry
app.delete('/api/tt/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Bypassed lock validation for Category B TT entries

    await db.run(`DELETE FROM tt_entries WHERE id = ?`, [id]);
    // Automatically delete from tt_transactions (expenses ledger)
    await db.run(`DELETE FROM tt_transactions WHERE tt_entry_id = ?`, [id]);

    res.json({ success: true, message: 'Entry deleted successfully.' });
  } catch (err) {
    console.error('Error deleting TT entry:', err.message);
    res.status(500).json({ error: 'Database error deleting entry.' });
  }
});

// GET /api/tt/trips — Fetch trips for a specific month (YYYY-MM)
app.get('/api/tt/trips', async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month parameter in YYYY-MM format is required.' });
    }
    
    const trips = await db.all(
      `SELECT * FROM tt_trips WHERE date LIKE ? ORDER BY date ASC, id ASC`,
      [`${month}-%`]
    );

    const totals = await db.get(
      `SELECT COUNT(id) AS total_trips, SUM(run_km) AS total_run, SUM(fuel_filled) AS total_fuel
       FROM tt_trips WHERE date LIKE ? AND end_km > start_km AND fuel_filled > 0`,
      [`${month}-%`]
    );

    res.json({
      trips: trips,
      totalTrips: totals.total_trips || 0,
      totalRun: totals.total_run || 0,
      totalFuel: totals.total_fuel || 0
    });
  } catch (err) {
    console.error('Error fetching TT trips:', err.message);
    res.status(500).json({ error: 'Database error fetching trips.' });
  }
});

// POST /api/tt/trips/decant-log — Auto-log trip from Day Closing Decantation
app.post('/api/tt/trips/decant-log', async (req, res) => {
  try {
    const { date, km_reading } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Date is required.' });
    }
    // Bypassed lock validation for Category B TT decant-log
    const K = parseFloat(km_reading);
    if (isNaN(K)) {
      return res.status(400).json({ error: 'Kilometer reading is required.' });
    }

    // Check if we already have an auto-logged trip for this date
    const existingTrip = await db.get(
      `SELECT id, start_km FROM tt_trips WHERE date = ? AND notes = ? LIMIT 1`,
      [date, 'Auto-logged from Decantation Details']
    );

    if (existingTrip) {
      // Find the trip before this existing trip to update its closing reading
      const prevTrip = await db.get(
        `SELECT id, start_km FROM tt_trips WHERE id < ? ORDER BY id DESC LIMIT 1`,
        [existingTrip.id]
      );
      if (prevTrip) {
        const prevRunKm = K - prevTrip.start_km;
        await db.run(
          `UPDATE tt_trips SET end_km = ?, run_km = ? WHERE id = ?`,
          [K, prevRunKm, prevTrip.id]
        );
      }
      
      // Update the existing trip
      await db.run(
        `UPDATE tt_trips SET start_km = ?, end_km = ?, run_km = 0, fuel_filled = 0, load_qty = 14000 WHERE id = ?`,
        [K, K, existingTrip.id]
      );
    } else {
      // Find the previous latest trip in the database
      const prevTrip = await db.get(
        `SELECT id, start_km FROM tt_trips ORDER BY date DESC, id DESC LIMIT 1`
      );
      if (prevTrip) {
        const prevRunKm = K - prevTrip.start_km;
        await db.run(
          `UPDATE tt_trips SET end_km = ?, run_km = ? WHERE id = ?`,
          [K, prevRunKm, prevTrip.id]
        );
      }

      // Insert new trip for the active day
      await db.run(
        `INSERT INTO tt_trips (date, start_km, end_km, run_km, fuel_filled, load_qty, driver_name, notes)
         VALUES (?, ?, ?, 0, 0, 14000, '', ?)`,
        [date, K, K, 'Auto-logged from Decantation Details']
      );
    }

    res.json({ success: true, message: 'Decantation trip logged successfully.' });
  } catch (err) {
    console.error('Error logging decantation trip:', err.message);
    res.status(500).json({ error: 'Database error logging decantation trip.' });
  }
});

// POST /api/tt/trips — Log a new journey/trip for the tanker
app.post('/api/tt/trips', async (req, res) => {
  try {
    const { date, start_km, end_km, fuel_filled, load_qty, driver_name, notes } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Date is required.' });
    }
    // Bypassed lock validation for Category B TT trips

    let startKm = parseFloat(start_km);
    let endKm = parseFloat(end_km);
    
    if (isNaN(startKm)) {
      const lastTrip = await db.get(`SELECT end_km FROM tt_trips ORDER BY date DESC, id DESC LIMIT 1`);
      startKm = lastTrip ? parseFloat(lastTrip.end_km) : 0;
    }
    
    if (isNaN(endKm)) {
      return res.status(400).json({ error: 'End KM reading is required.' });
    }
    
    const runKm = endKm - startKm;
    const fuelFilled = parseFloat(fuel_filled) || 0;
    const loadQty = parseFloat(load_qty) || 0;

    const result = await db.run(
      `INSERT INTO tt_trips (date, start_km, end_km, run_km, fuel_filled, load_qty, driver_name, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, startKm, endKm, runKm, fuelFilled, loadQty, driver_name || '', notes || '']
    );

    await realignTtTrips(result.lastInsertRowid, 'EDIT');

    res.json({ success: true, message: 'Trip recorded successfully.' });
  } catch (err) {
    console.error('Error saving TT trip:', err.message);
    res.status(500).json({ error: 'Database error saving trip.' });
  }
});

// PUT /api/tt/trips/:id — Edit a trip inline
app.put('/api/tt/trips/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, start_km, end_km, fuel_filled, load_qty, driver_name, notes } = req.body;
    
    const startKm = parseFloat(start_km);
    const endKm = parseFloat(end_km);
    if (isNaN(startKm) || isNaN(endKm)) {
      return res.status(400).json({ error: 'Valid Start KM and End KM are required.' });
    }
    const runKm = endKm - startKm;
    const fuelFilled = parseFloat(fuel_filled) || 0;
    const loadQty = parseFloat(load_qty) || 0;

    // Bypassed lock validation for Category B TT trips

    await db.run(
      `UPDATE tt_trips 
       SET date = ?, start_km = ?, end_km = ?, run_km = ?, fuel_filled = ?, load_qty = ?, driver_name = ?, notes = ?
       WHERE id = ?`,
      [date, startKm, endKm, runKm, fuelFilled, loadQty, driver_name || '', notes || '', id]
    );

    await realignTtTrips(id, 'EDIT');

    res.json({ success: true, message: 'Trip updated successfully.' });
  } catch (err) {
    console.error('Error updating TT trip:', err.message);
    res.status(500).json({ error: 'Database error updating trip.' });
  }
});

// DELETE /api/tt/trips/:id — Remove a trip
app.delete('/api/tt/trips/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Bypassed lock validation for Category B TT trips

    await db.run(`DELETE FROM tt_trips WHERE id = ?`, [id]);

    await realignTtTrips(null, 'DELETE');

    res.json({ success: true, message: 'Trip deleted successfully.' });
  } catch (err) {
    console.error('Error deleting TT trip:', err.message);
    res.status(500).json({ error: 'Database error deleting trip.' });
  }
});

// PUT /api/tt/transactions/:id — Edit a ledger transaction inline
app.put('/api/tt/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, description, type, amount, notes } = req.body;
    
    if (!date || !type || amount === undefined || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'Date, type, and valid amount are required.' });
    }
    
    const amt = parseFloat(amount);
    if (type !== 'DEBIT' && type !== 'CREDIT') {
      return res.status(400).json({ error: 'Type must be DEBIT or CREDIT.' });
    }

    // Bypassed lock validation for Category B TT transactions

    await db.run(
      `UPDATE tt_transactions
       SET date = ?, description = ?, type = ?, amount = ?, notes = ?
       WHERE id = ?`,
      [date, description || '', type, amt, notes || '', id]
    );

    res.json({ success: true, message: 'Transaction updated successfully.' });
  } catch (err) {
    console.error('Error updating TT transaction:', err.message);
    res.status(500).json({ error: 'Database error updating transaction.' });
  }
});

// DELETE /api/tt/transactions/:id — Delete a ledger transaction
app.delete('/api/tt/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Bypassed lock validation for Category B TT transactions

    await db.run(`DELETE FROM tt_transactions WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Transaction deleted successfully.' });
  } catch (err) {
    console.error('Error deleting TT transaction:', err.message);
    res.status(500).json({ error: 'Database error deleting transaction.' });
  }
});

// GET /api/tt/average — Compute fuel efficiency stats (last 10 trips average & trip-wise listing)
app.get('/api/tt/average', async (req, res) => {
  try {
    const last10 = await db.all(
      `SELECT run_km, fuel_filled FROM tt_trips WHERE run_km > 0 AND fuel_filled > 0 ORDER BY date DESC, id DESC LIMIT 10`
    );
    let last10Run = 0;
    let last10Fuel = 0;
    last10.forEach(t => {
      last10Run += t.run_km || 0;
      last10Fuel += t.fuel_filled || 0;
    });
    const last10Average = last10Fuel > 0 ? (last10Run / last10Fuel) : 0;

    const trips = await db.all(
      `SELECT id, date, start_km, end_km, run_km, fuel_filled, load_qty, driver_name, notes FROM tt_trips ORDER BY date DESC, id DESC`
    );

    res.json({
      last10Average: last10Average,
      trips: trips
    });
  } catch (err) {
    console.error('Error fetching TT average:', err.message);
    res.status(500).json({ error: 'Database error fetching average data.' });
  }
});

// GET /api/porancha-hishob — Fetch shift entries and testing data for a date
app.get('/api/porancha-hishob', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required.' });
    }
    const [entries, testing] = await Promise.all([
      db.all(
        `SELECT date, shift, nozzle_index, product, employee_id, opening_reading, closing_reading, difference_sale, rate, final_amount, phonepe_amount 
         FROM porancha_hishob_entries 
         WHERE date = ? 
         ORDER BY shift ASC, nozzle_index ASC`,
        [date]
      ),
      db.all(
        `SELECT 
           r.nozzle_id AS nozzle_index,
           t.employee_id,
           COALESCE(r.testing_qty, 0) AS testing_qty,
           COALESCE(t.phonepe_amount, 0) AS phonepe_amount
         FROM readings r
         LEFT JOIN porancha_hishob_testing t 
           ON r.date = t.date AND r.nozzle_id = t.nozzle_index
         WHERE r.date = ?
         ORDER BY r.nozzle_id ASC`,
        [date]
      )
    ]);
    res.json({ entries, testing });
  } catch (err) {
    console.error('Error fetching shift entries:', err.message);
    res.status(500).json({ error: 'Database error fetching shift entries.' });
  }
});

// POST /api/porancha-hishob — Save/update shift entries and testing data for a date
app.post('/api/porancha-hishob', async (req, res) => {
  try {
    const { date, entries, testing } = req.body;
    if (!date || !Array.isArray(entries)) {
      return res.status(400).json({ error: 'Date and entries array are required.' });
    }

    const statements = [];
    // Delete existing entries for this date
    statements.push({
      sql: `DELETE FROM porancha_hishob_entries WHERE date = ?`,
      args: [date]
    });
    statements.push({
      sql: `DELETE FROM porancha_hishob_testing WHERE date = ?`,
      args: [date]
    });

    // Insert new shift entries
    entries.forEach(e => {
      statements.push({
        sql: `INSERT INTO porancha_hishob_entries 
              (date, shift, nozzle_index, product, employee_id, opening_reading, closing_reading, difference_sale, rate, final_amount, phonepe_amount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          date,
          e.shift,
          e.nozzle_index,
          e.product,
          e.employee_id || null,
          e.opening_reading,
          e.closing_reading,
          e.difference_sale,
          e.rate,
          e.final_amount,
          e.phonepe_amount
        ]
      });
    });

    // Insert new testing entries
    if (Array.isArray(testing)) {
      testing.forEach(t => {
        statements.push({
          sql: `INSERT INTO porancha_hishob_testing (date, nozzle_index, employee_id, testing_qty, phonepe_amount) VALUES (?, ?, ?, ?, ?)`,
          args: [date, t.nozzle_index, t.employee_id || null, t.testing_qty, t.phonepe_amount]
        });
      });
    }

    await db.batch(statements);
    res.json({ success: true, message: 'Shift sales and testing data saved successfully.' });
  } catch (err) {
    console.error('Error saving shift entries:', err.message);
    res.status(500).json({ error: 'Database error saving shift entries.' });
  }
});

// ── CHILLAR RECORD ENDPOINTS ────────────────────────────────────────────────

// GET /api/chillar/status — Current counts of denominations and running balance
app.get('/api/chillar/status', async (req, res) => {
  try {
    const status = await db.get(`
      SELECT 
        COALESCE(SUM(notes_20), 0) AS notes_20,
        COALESCE(SUM(notes_10), 0) AS notes_10,
        COALESCE(SUM(coins_20), 0) AS coins_20,
        COALESCE(SUM(coins_10), 0) AS coins_10,
        COALESCE(SUM(coins_5), 0) AS coins_5,
        COALESCE(SUM(coins_2), 0) AS coins_2,
        COALESCE(SUM(coins_1), 0) AS coins_1,
        COALESCE(SUM(total_amount), 0.0) AS total_amount
      FROM chillar_transactions
    `);
    res.json(status);
  } catch (err) {
    console.error('Error fetching chillar status:', err.message);
    res.status(500).json({ error: 'Database error fetching chillar status.' });
  }
});

// GET /api/chillar/transactions — Ledger transactions with in-memory running balance
app.get('/api/chillar/transactions', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT id, date, type, description, notes_20, notes_10, coins_20, coins_10, coins_5, coins_2, coins_1, total_amount 
      FROM chillar_transactions 
      ORDER BY date ASC, id ASC
    `);
    
    let running = 0;
    const transactions = rows.map(r => {
      running += r.total_amount;
      return {
        ...r,
        running_balance: running
      };
    });
    
    // Sort latest first for display
    transactions.reverse();
    
    res.json({ transactions });
  } catch (err) {
    console.error('Error fetching chillar transactions:', err.message);
    res.status(500).json({ error: 'Database error fetching chillar transactions.' });
  }
});

// POST /api/chillar/transaction — Create a manual credit/debit transaction
app.post('/api/chillar/transaction', async (req, res) => {
  try {
    const { date, type, description, notes_20, notes_10, coins_20, coins_10, coins_5, coins_2, coins_1 } = req.body;
    if (!date || !type || !description) {
      return res.status(400).json({ error: 'Date, type, and description are required.' });
    }

    const isDebit = type === 'MANUAL_DEBIT';
    const factor = isDebit ? -1 : 1;

    const n20 = parseInt(notes_20 || 0, 10) * factor;
    const n10 = parseInt(notes_10 || 0, 10) * factor;
    const c20 = parseInt(coins_20 || 0, 10) * factor;
    const c10 = parseInt(coins_10 || 0, 10) * factor;
    const c5 = parseInt(coins_5 || 0, 10) * factor;
    const c2 = parseInt(coins_2 || 0, 10) * factor;
    const c1 = parseInt(coins_1 || 0, 10) * factor;

    const total = ((n20 * 20) + (n10 * 10) + (c20 * 20) + (c10 * 10) + (c5 * 5) + (c2 * 2) + (c1 * 1));

    await db.run(`
      INSERT INTO chillar_transactions (date, type, description, notes_20, notes_10, coins_20, coins_10, coins_5, coins_2, coins_1, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [date, type, description, n20, n10, c20, c10, c5, c2, c1, total]);

    res.json({ success: true, message: 'Chillar transaction saved successfully.' });
  } catch (err) {
    console.error('Error saving chillar transaction:', err.message);
    res.status(500).json({ error: 'Database error saving chillar transaction.' });
  }
});

// POST /api/chillar/opening — Reset initial opening balance
app.post('/api/chillar/opening', async (req, res) => {
  try {
    const { notes_20, notes_10, coins_20, coins_10, coins_5, coins_2, coins_1 } = req.body;
    const n20 = parseInt(notes_20 || 0, 10);
    const n10 = parseInt(notes_10 || 0, 10);
    const c20 = parseInt(coins_20 || 0, 10);
    const c10 = parseInt(coins_10 || 0, 10);
    const c5 = parseInt(coins_5 || 0, 10);
    const c2 = parseInt(coins_2 || 0, 10);
    const c1 = parseInt(coins_1 || 0, 10);
    const total = (n20 * 20) + (n10 * 10) + (c20 * 20) + (c10 * 10) + (c5 * 5) + (c2 * 2) + (c1 * 1);

    await db.batch([
      { sql: `DELETE FROM chillar_transactions WHERE type = 'OPENING'` },
      {
        sql: `INSERT INTO chillar_transactions (date, type, description, notes_20, notes_10, coins_20, coins_10, coins_5, coins_2, coins_1, total_amount)
              VALUES ('2026-06-26', 'OPENING', 'Opening Balance', ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [n20, n10, c20, c10, c5, c2, c1, total]
      }
    ]);

    res.json({ success: true, message: 'Opening balance updated successfully.' });
  } catch (err) {
    console.error('Error updating chillar opening balance:', err.message);
    res.status(500).json({ error: 'Database error updating opening balance.' });
  }
});

// DELETE /api/chillar/transaction/:id — Delete a specific chillar transaction
app.delete('/api/chillar/transaction/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run(`DELETE FROM chillar_transactions WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Transaction deleted successfully.' });
  } catch (err) {
    console.error('Error deleting chillar transaction:', err.message);
    res.status(500).json({ error: 'Database error deleting transaction.' });
  }
});

// POST /api/chillar/clear — Clear all chillar transactions (reconciled to zero)
app.post('/api/chillar/clear', async (req, res) => {
  try {
    await db.run(`DELETE FROM chillar_transactions`);
    res.json({ success: true, message: 'All chillar records cleared to zero.' });
  } catch (err) {
    console.error('Error clearing chillar records:', err.message);
    res.status(500).json({ error: 'Database error clearing chillar records.' });
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
