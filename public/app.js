document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('readings-form');
  const dateInput = document.getElementById('reading-date');

  // Dynamic row generation for non-cash payments
  function adjustNonCashRows(targetCount) {
    const container = document.getElementById('other-payments-rows');
    if (!container) return;
    
    const currentRows = container.querySelectorAll('tr');
    const currentCount = currentRows.length;
    
    if (currentCount < targetCount) {
      for (let i = currentCount; i < targetCount; i++) {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        row.innerHTML = `
          <td style="padding: 0.35rem; text-align: center; color: var(--text-muted); font-weight: 600;">${i + 1}</td>
          <td style="padding: 0.35rem;">
            <select class="non-cash-type-input" style="width: 100%; background: rgba(8,12,22,0.6); border: 1px solid rgba(255,255,255,0.08); color: var(--text-main); font-size: 0.75rem; padding: 0.15rem; border-radius: 0.25rem; height: 26px;">
              <option value="UPI">UPI</option>
              <option value="Credit">Credit</option>
              <option value="Other">Other</option>
            </select>
          </td>
          <td style="padding: 0.35rem;">
            <input type="text" class="non-cash-desc-input" placeholder="e.g. UPI Ref / Customer Name" style="width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.75rem; padding: 0.15rem; height: 26px;">
          </td>
          <td style="padding: 0.35rem;">
            <input type="number" class="non-cash-amount-input" placeholder="0.00" min="0" step="0.01" style="width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.75rem; padding: 0.15rem; text-align: right; font-weight: 600; height: 26px;">
          </td>
        `;
        // Wire amount input to recalculate live
        row.querySelector('.non-cash-amount-input').addEventListener('input', updateOtherPaymentsCalculations);
        container.appendChild(row);
      }
    } else if (currentCount > targetCount) {
      for (let i = currentCount - 1; i >= targetCount; i--) {
        container.removeChild(currentRows[i]);
      }
    }

    // Update the row count badge
    const badge = document.getElementById('non-cash-row-badge');
    const newCount = container.querySelectorAll('tr').length;
    if (badge) badge.textContent = `${newCount} row${newCount !== 1 ? 's' : ''}`;
  }

  // Start with 5 rows by default
  adjustNonCashRows(5);

  // + Add Row button — appends one row at a time
  const btnAddNonCashRow = document.getElementById('btn-add-noncash-row');
  if (btnAddNonCashRow) {
    btnAddNonCashRow.addEventListener('click', () => {
      const container = document.getElementById('other-payments-rows');
      if (!container) return;
      const newIndex = container.querySelectorAll('tr').length;
      adjustNonCashRows(newIndex + 1);
      updateOtherPaymentsCalculations();
      // Scroll the new row into view and focus the description
      const scrollEl = document.getElementById('other-payments-scroll');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      const lastDesc = container.querySelectorAll('.non-cash-desc-input');
      if (lastDesc.length) lastDesc[lastDesc.length - 1].focus();
    });
  }

  // − Remove Row button — deletes the last row (minimum 5 rows enforced)
  const btnRemoveNonCashRow = document.getElementById('btn-remove-noncash-row');
  if (btnRemoveNonCashRow) {
    btnRemoveNonCashRow.addEventListener('click', () => {
      const container = document.getElementById('other-payments-rows');
      if (!container) return;
      const rows = container.querySelectorAll('tr');
      if (rows.length <= 5) {
        showToast('Minimum 5 rows required. Cannot remove further.', 'warning');
        return;
      }
      // Remove the last row
      container.removeChild(rows[rows.length - 1]);
      // Update badge
      const badge = document.getElementById('non-cash-row-badge');
      const newCount = container.querySelectorAll('tr').length;
      if (badge) badge.textContent = `${newCount} row${newCount !== 1 ? 's' : ''}`;
      updateOtherPaymentsCalculations();
    });
  }

  // Set default starting date to 2026-05-01 for hard testing setup
  dateInput.value = '2026-05-01';

  // Theme Switching Logic
  const themeBtns = document.querySelectorAll('.theme-btn');
  const savedTheme = localStorage.getItem('erp-theme') || 'dark';
  
  function setTheme(theme) {
    if (theme === 'hpcl') {
      document.body.classList.add('theme-hpcl');
    } else {
      document.body.classList.remove('theme-hpcl');
    }
    localStorage.setItem('erp-theme', theme);
    themeBtns.forEach(btn => {
      if (btn.getAttribute('data-theme') === theme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  setTheme(savedTheme);

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.getAttribute('data-theme'));
    });
  });

  // Global active date and closed state
  let activeDate = '2026-05-01';
  let isDayClosed = false;

  async function fetchActiveDate() {
    try {
      const response = await fetch('/api/active-date');
      if (!response.ok) {
        throw new Error('Failed to fetch active date');
      }
      const data = await response.json();
      activeDate = data.activeDate;
    } catch (error) {
      console.error('Error fetching active date:', error);
      activeDate = '2026-05-02'; // Fallback
    }
  }

  // Global cached memory states for daily closing calculations
  let currentDuReadings = [];
  let currentTankReadings = [];
  let currentDecantation = {
    Petrol: 0,
    Diesel: 0,
    poWer: 0
  };
  let currentRates = {
    Petrol: 100.0,
    Diesel: 90.0,
    poWer: 110.0
  };

  // View Switching Logic (Wizard Navigation under single "Day Closing" flow)
  const navDayClosing = document.getElementById('nav-day-closing');
  const btnEditReadings = document.getElementById('btn-edit-readings');
  const btnStartNewDay = document.getElementById('btn-start-new-day');

  // "Bank Deposit Calculator" button on finish page → navigate to Cash Calculator
  const btnGotoCashCalcFromFinish = document.getElementById('btn-goto-cash-calc-from-finish');
  if (btnGotoCashCalcFromFinish) {
    btnGotoCashCalcFromFinish.addEventListener('click', () => {
      // Set deposit date to today
      const bankDateEl = document.getElementById('bank-detail-date');
      if (bankDateEl && !bankDateEl.value) {
        bankDateEl.value = new Date().toISOString().split('T')[0];
      }
      showView('cash-calc');
    });
  }

  const btnBackToDu = document.getElementById('btn-back-to-du');
  const btnBackToTesting = document.getElementById('btn-back-to-testing');
  const testingForm = document.getElementById('testing-form');
  const tankForm = document.getElementById('tank-form');
  const ratesForm = document.getElementById('rates-form');
  const btnBackToRates = document.getElementById('btn-back-to-rates');

  const viewDuCalc = document.getElementById('view-du-calculations');
  const viewNozzleTesting = document.getElementById('view-nozzle-testing');
  const viewRateConfirmation = document.getElementById('view-rate-confirmation');
  const viewTankStock = document.getElementById('view-tank-stock');
  const viewDecantation = document.getElementById('view-decantation');
  const viewDsrData = document.getElementById('view-dsr-data');
  const viewCashReconciliation = document.getElementById('view-cash-reconciliation');
  const viewOtherPayments = document.getElementById('view-other-payments');
  const viewFinish = document.getElementById('view-finish');
  const viewPreview = document.getElementById('view-preview');
  const viewGstData = document.getElementById('view-gst-data');

  const cashForm = document.getElementById('cash-form');
  const btnBackToDecantationOrTank = document.getElementById('btn-back-to-decantation-or-tank');
  const btnDsrNext = document.getElementById('btn-dsr-next');
  const btnBackToDecantationOrTankFromDsr = document.getElementById('btn-back-to-decantation-or-tank-from-dsr');

  function showView(viewName) {
    const hasDecantation = document.querySelector('input[name="decantation-toggle"]:checked').value === 'yes';

    viewDuCalc.style.display = viewName === 'du' ? 'block' : 'none';
    viewNozzleTesting.style.display = viewName === 'testing' ? 'block' : 'none';
    viewRateConfirmation.style.display = viewName === 'rates' ? 'block' : 'none';
    viewTankStock.style.display = viewName === 'tank' ? 'block' : 'none';
    viewDecantation.style.display = viewName === 'decantation' ? 'block' : 'none';
    viewDsrData.style.display = viewName === 'dsr' ? 'block' : 'none';
    viewCashReconciliation.style.display = viewName === 'cash' ? 'block' : 'none';
    viewOtherPayments.style.display = viewName === 'other' ? 'block' : 'none';
    if (viewPreview) viewPreview.style.display = viewName === 'preview' ? 'block' : 'none';
    viewFinish.style.display = viewName === 'finish' ? 'block' : 'none';
    if (viewGstData) viewGstData.style.display = viewName === 'gst' ? 'block' : 'none';
    
    const viewHpclTracker = document.getElementById('view-hpcl-tracker');
    if (viewHpclTracker) viewHpclTracker.style.display = viewName === 'hpcl' ? 'block' : 'none';
    
    const viewTankerCalculation = document.getElementById('view-tanker-calculation');
    const viewCashCalculator = document.getElementById('view-cash-calculator');
    if (viewTankerCalculation) viewTankerCalculation.style.display = viewName === 'tanker' ? 'block' : 'none';
    if (viewCashCalculator) viewCashCalculator.style.display = viewName === 'cash-calc' ? 'block' : 'none';

    // Update active nav
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => item.classList.remove('active'));
    const navTankerCalc = document.getElementById('nav-tanker-calc');
    const navCashCalc = document.getElementById('nav-cash-calc');
    const navGst = document.getElementById('nav-gst');
    const navHpclTracker = document.getElementById('nav-hpcl-tracker');
    
    if (viewName === 'tanker' && navTankerCalc) navTankerCalc.classList.add('active');
    else if (viewName === 'cash-calc' && navCashCalc) navCashCalc.classList.add('active');
    else if (viewName === 'gst' && navGst) navGst.classList.add('active');
    else if (viewName === 'hpcl' && navHpclTracker) navHpclTracker.classList.add('active');
    else if (navDayClosing) navDayClosing.classList.add('active');

    // Update steps title texts dynamically
    if (hasDecantation) {
      document.querySelector('#view-decantation .subtitle').textContent = 'Step 5: Decantation Details (Record received fuel loads)';
      document.querySelector('#view-dsr-data .subtitle').textContent = 'Step 6: DSR (Daily Sales & Stock Reconciliation)';
      document.querySelector('#view-cash-reconciliation .subtitle').textContent = 'Step 7: Cash Reconciliation (Record bank notes & coins)';
      document.querySelector('#view-other-payments .subtitle').textContent = 'Step 8: Other Payments / Credit (Record UPI & Credit Sales)';
      if (document.querySelector('#view-preview .subtitle')) document.querySelector('#view-preview .subtitle').textContent = 'Step 9: Preview — Verify before closing';
      document.querySelector('#view-finish .subtitle').textContent = 'Step 10: Day Closing Summary & Finish';
    } else {
      document.querySelector('#view-dsr-data .subtitle').textContent = 'Step 5: DSR (Daily Sales & Stock Reconciliation)';
      document.querySelector('#view-cash-reconciliation .subtitle').textContent = 'Step 6: Cash Reconciliation (Record bank notes & coins)';
      document.querySelector('#view-other-payments .subtitle').textContent = 'Step 7: Other Payments / Credit (Record UPI & Credit Sales)';
      if (document.querySelector('#view-preview .subtitle')) document.querySelector('#view-preview .subtitle').textContent = 'Step 8: Preview — Verify before closing';
      document.querySelector('#view-finish .subtitle').textContent = 'Step 9: Day Closing Summary & Finish';
    }

    // Automatically focus the first active/editable input for the shown view to enable fast keyboard navigation
    setTimeout(() => {
      let firstInput = null;
      if (viewName === 'du') {
        firstInput = document.getElementById('nozzle-1-closing');
      } else if (viewName === 'testing') {
        firstInput = document.getElementById('nozzle-1-test-qty');
      } else if (viewName === 'rates') {
        firstInput = document.getElementById('rate-power');
      } else if (viewName === 'tank') {
        firstInput = document.getElementById('tank-1-dip');
      } else if (viewName === 'decantation') {
        firstInput = document.getElementById('load-power');
      } else if (viewName === 'dsr') {
        firstInput = document.getElementById('btn-dsr-next');
      } else if (viewName === 'cash') {
        firstInput = document.getElementById('notes-500');
      } else if (viewName === 'other') {
        const firstAmountInput = document.querySelector('.non-cash-amount-input');
        if (firstAmountInput) firstInput = firstAmountInput;
      } else if (viewName === 'preview') {
        firstInput = document.getElementById('btn-preview-confirm');
      } else if (viewName === 'finish') {
        firstInput = document.getElementById('btn-start-new-day');
      }

      if (firstInput && !firstInput.disabled) {
        firstInput.focus();
        if (firstInput.tagName === 'INPUT' && typeof firstInput.select === 'function') {
          firstInput.select();
        }
      }
    }, 100);
  }

  navDayClosing.addEventListener('click', (e) => {
    e.preventDefault();
    showView('du'); // Reset to step 1
  });

  const navTankerCalc = document.getElementById('nav-tanker-calc');
  if (navTankerCalc) {
    navTankerCalc.addEventListener('click', (e) => {
      e.preventDefault();
      showView('tanker');
    });
  }

  const navCashCalc = document.getElementById('nav-cash-calc');
  if (navCashCalc) {
    navCashCalc.addEventListener('click', async (e) => {
      e.preventDefault();
      
      try {
        const response = await fetch(`/api/cash/opening?date=${dateInput.value}`);
        if (response.ok) {
          const data = await response.json();
          if (data.cash) {
            document.getElementById('calc-count-500').value = data.cash.count_500 || '';
            document.getElementById('calc-count-200').value = data.cash.count_200 || '';
            document.getElementById('calc-count-100').value = data.cash.count_100 || '';
            document.getElementById('calc-count-50').value = data.cash.count_50 || '';
            document.getElementById('calc-count-20').value = data.cash.count_20 || '';
            document.getElementById('calc-count-10').value = 0; // Exclude 10 rupee note
            document.getElementById('calc-count-coins').value = data.cash.coins || '';
            
            const event = new Event('input');
            document.getElementById('calc-count-500').dispatchEvent(event);
          }
        }
      } catch (err) {
        console.error('Failed to fetch cash for calculator', err);
      }
      
      showView('cash-calc');
    });
  }

  btnBackToDu.addEventListener('click', () => {
    showView('du');
  });

  btnBackToTesting.addEventListener('click', () => {
    showView('testing');
  });

  const btnBackToTestingFromRates = document.getElementById('btn-back-to-testing');
  if (btnBackToTestingFromRates) {
    btnBackToTestingFromRates.addEventListener('click', () => {
      showView('testing');
    });
  }

  if (btnBackToRates) {
    btnBackToRates.addEventListener('click', () => {
      showView('rates');
    });
  }

  if (btnEditReadings) {
    btnEditReadings.addEventListener('click', () => {
      showView('cash');
    });
  }

  btnStartNewDay.addEventListener('click', async () => {
    await fetchActiveDate();
    dateInput.value = activeDate;
    dateInput.max = activeDate;

    const formattedDisplay = document.getElementById('formatted-date-display');
    if (formattedDisplay) {
      formattedDisplay.textContent = formatDate(activeDate);
    }

    isDayClosed = false;

    // Clear closing nozzle inputs
    for (let id = 1; id <= 6; id++) {
      document.getElementById(`nozzle-${id}-closing`).value = '';
    }

    // Clear closing tank stock and DIP inputs
    for (let id = 1; id <= 3; id++) {
      document.getElementById(`tank-${id}-dip`).value = '';
      document.getElementById(`tank-${id}-closing`).value = '';
    }

    clearCashInputs();

    // Load opening readings, opening tank stocks, and rates for the new date
    await fetchOpeningReadings(dateInput.value);
    await fetchOpeningTankStocks(dateInput.value);
    await fetchOpeningRates(dateInput.value);
    await fetchOpeningCash(dateInput.value);

    // Transition back to step 1
    showView('du');
  });

  // Fetch opening readings for selected date
  async function fetchOpeningReadings(selectedDate) {
    try {
      const response = await fetch(`/api/readings/opening?date=${selectedDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch opening readings');
      }
      const data = await response.json();
      
      const readings = data.savedReadings;
      const openingData = data.openingReadings;

      if (readings && readings.length === 6) {
        // Today already has saved readings: load them, freeze opening, keep closing/testing editable
        currentDuReadings = readings.map(r => ({
          nozzle_id: r.nozzle_id,
          product: r.product,
          opening_reading: r.opening_reading,
          closing_reading: r.closing_reading,
          testing_qty: r.testing_qty
        }));

        readings.forEach(r => {
          const openingInput = document.getElementById(`nozzle-${r.nozzle_id}-opening`);
          const closingInput = document.getElementById(`nozzle-${r.nozzle_id}-closing`);
          
          openingInput.value = parseFloat(r.opening_reading).toFixed(3);
          closingInput.value = parseFloat(r.closing_reading).toFixed(3);
          
          openingInput.disabled = true;
          closingInput.disabled = false; // Keep closing editable
          
          updateDifference(r.nozzle_id);

          // Populate Step 2 (Nozzle Testing)
          const diff = r.closing_reading - r.opening_reading;
          document.getElementById(`nozzle-${r.nozzle_id}-test-diff`).textContent = diff.toFixed(3);
          
          const testInput = document.getElementById(`nozzle-${r.nozzle_id}-test-qty`);
          const defaultVal = diff >= 5 ? 5 : Math.max(0, diff);
          const testQty = (r.testing_qty === 0 && diff > 0) ? defaultVal : (r.testing_qty !== undefined ? r.testing_qty : defaultVal);
          testInput.value = parseFloat(testQty).toFixed(3);
          testInput.disabled = false; // Keep Step 2 inputs editable
        });
      } else {
        // No saved readings for today: load opening readings from yesterday's closing
        if (openingData && openingData.length === 6) {
          openingData.forEach(r => {
            const openingInput = document.getElementById(`nozzle-${r.nozzle_id}-opening`);
            const closingInput = document.getElementById(`nozzle-${r.nozzle_id}-closing`);
            
            openingInput.value = parseFloat(r.opening_reading).toFixed(3);
            closingInput.value = ''; // Let them type closing readings
            
            openingInput.disabled = true; // Lock opening readings
            closingInput.disabled = false; // Allow typing closing readings
            
            updateDifference(r.nozzle_id);
          });
          showToast('Fetched opening readings from database.', 'success');
        } else {
          // Day 1 / No previous readings: Enable editing and default to 10
          for (let id = 1; id <= 6; id++) {
            const openingInput = document.getElementById(`nozzle-${id}-opening`);
            const closingInput = document.getElementById(`nozzle-${id}-closing`);
            
            openingInput.value = parseFloat(10).toFixed(3);
            closingInput.value = '';
            
            openingInput.disabled = false; // Make editable for Day 1 setup
            closingInput.disabled = false;
            updateDifference(id);
          }
          showToast('No previous readings found. Initialized with default opening reading (10.000).', 'warning');
        }
      }
      enforceFreezeState();
    } catch (error) {
      console.error('Error fetching opening readings:', error);
      showToast('Error loading opening readings.', 'error');
    }
  }

  // Fetch opening tank stocks for selected date (closing stock of previous day)
  async function fetchOpeningTankStocks(selectedDate) {
    try {
      const response = await fetch(`/api/tanks/opening?date=${selectedDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch opening tank stocks');
      }
      const data = await response.json();
      
      const savedTanks = data.savedTanks;
      const openingTanks = data.openingTanks;

      if (savedTanks && savedTanks.length === 3) {
        // Today already has saved tank readings: load them, freeze opening, keep closing editable
        currentTankReadings = savedTanks.map(t => ({
          tank_id: t.tank_id,
          tank_name: t.tank_name,
          product: t.product,
          capacity: t.capacity,
          opening_dip: t.opening_dip,
          opening_stock: t.opening_stock,
          closing_dip: t.closing_dip,
          closing_stock: t.closing_stock,
          decantation_qty: t.decantation_qty || 0
        }));

        let hasDecantation = false;
        savedTanks.forEach(t => {
          const openingDipInput = document.getElementById(`tank-${t.tank_id}-opening-dip`);
          const openingStockInput = document.getElementById(`tank-${t.tank_id}-opening`);
          const closingDipInput = document.getElementById(`tank-${t.tank_id}-dip`);
          const closingStockInput = document.getElementById(`tank-${t.tank_id}-closing`);
          
          openingDipInput.value = parseFloat(t.opening_dip || 0).toFixed(1);
          openingStockInput.value = parseFloat(t.opening_stock || 0).toFixed(2);
          closingDipInput.value = parseFloat(t.closing_dip || 0).toFixed(1);
          closingStockInput.value = parseFloat(t.closing_stock || 0).toFixed(2);
          
          openingDipInput.disabled = true;
          openingStockInput.disabled = true;
          closingDipInput.disabled = false; // Keep closing editable
          closingStockInput.disabled = false;

          // Track decantation loads
          currentDecantation[t.product] = t.decantation_qty || 0;
          if (t.decantation_qty > 0) {
            hasDecantation = true;
          }
          const loadInput = document.getElementById(`load-${t.product.toLowerCase()}`);
          if (loadInput) {
            loadInput.value = parseFloat(t.decantation_qty || 0).toFixed(0);
          }
        });

        const nextBtn = document.getElementById('btn-tank-next');
        if (hasDecantation) {
          document.querySelector('input[name="decantation-toggle"][value="yes"]').checked = true;
          if (nextBtn) nextBtn.innerHTML = 'Next Step: Decantation Details ➔';
        } else {
          document.querySelector('input[name="decantation-toggle"][value="no"]').checked = true;
          if (nextBtn) nextBtn.innerHTML = 'Next Step: DSR Reconciliation ➔';
        }
      } else {
        // Reset decantation toggles
        document.querySelector('input[name="decantation-toggle"][value="no"]').checked = true;
        const nextBtn = document.getElementById('btn-tank-next');
        if (nextBtn) nextBtn.innerHTML = 'Next Step: DSR Reconciliation ➔';
        document.getElementById('load-petrol').value = '0';
        document.getElementById('load-diesel').value = '0';
        document.getElementById('load-power').value = '0';
        currentDecantation = { Petrol: 0, Diesel: 0, poWer: 0 };
        // No saved tank readings for today: load opening values from yesterday's closing
        if (openingTanks && openingTanks.length === 3) {
          openingTanks.forEach(t => {
            const openingDipInput = document.getElementById(`tank-${t.tank_id}-opening-dip`);
            const openingStockInput = document.getElementById(`tank-${t.tank_id}-opening`);
            const closingDipInput = document.getElementById(`tank-${t.tank_id}-dip`);
            const closingStockInput = document.getElementById(`tank-${t.tank_id}-closing`);
            
            openingDipInput.value = parseFloat(t.opening_dip || 0).toFixed(1);
            openingStockInput.value = parseFloat(t.opening_stock || 0).toFixed(2);
            closingDipInput.value = '';
            closingStockInput.value = '';
            
            openingDipInput.disabled = true; // Lock opening values
            openingStockInput.disabled = true;
            closingDipInput.disabled = false; // Allow typing closing stock
            closingStockInput.disabled = false;
          });
          showToast('Fetched opening tank stocks from database.', 'success');
        } else {
          // Day 1 / No previous readings: Default to HALF of the tank capacity
          const capacities = { 1: 9000, 2: 16000, 3: 35000 };
          for (let id = 1; id <= 3; id++) {
            const openingDipInput = document.getElementById(`tank-${id}-opening-dip`);
            const openingStockInput = document.getElementById(`tank-${id}-opening`);
            const closingDipInput = document.getElementById(`tank-${id}-dip`);
            const closingStockInput = document.getElementById(`tank-${id}-closing`);
            
            openingDipInput.value = parseFloat(0).toFixed(1);
            openingStockInput.value = parseFloat(capacities[id] / 2).toFixed(2);
            closingDipInput.value = '';
            closingStockInput.value = '';
            
            openingDipInput.disabled = false; // Make editable for Day 1 setup
            openingStockInput.disabled = false;
            closingDipInput.disabled = false;
            closingStockInput.disabled = false;
          }
          showToast('No previous tank stocks found. Initialized with half-capacity default opening stocks.', 'warning');
        }
      }
      
      updateTankVisuals();
      enforceFreezeState();
    } catch (error) {
      console.error('Error fetching opening tank stocks:', error);
      showToast('Error loading opening tank stocks.', 'error');
    }
  }

  // Fetch opening rates for selected date
  async function fetchOpeningRates(selectedDate) {
    try {
      const response = await fetch(`/api/rates/opening?date=${selectedDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch opening rates');
      }
      const data = await response.json();
      
      const rates = data.rates;
      const isSaved = data.isSaved;

      if (rates) {
        currentRates.poWer = rates.rate_power;
        currentRates.Petrol = rates.rate_petrol;
        currentRates.Diesel = rates.rate_diesel;

        document.getElementById('rate-power').value = parseFloat(rates.rate_power).toFixed(2);
        document.getElementById('rate-petrol').value = parseFloat(rates.rate_petrol).toFixed(2);
        document.getElementById('rate-diesel').value = parseFloat(rates.rate_diesel).toFixed(2);

        document.getElementById('rate-power').disabled = false;
        document.getElementById('rate-petrol').disabled = false;
        document.getElementById('rate-diesel').disabled = false;

        if (isSaved) {
          showToast('Loaded saved rates for today.', 'success');
        }
      }
      enforceFreezeState();
    } catch (error) {
      console.error('Error fetching rates:', error);
      showToast('Error loading daily selling rates.', 'error');
    }
  }

  // Visual Tank Animation & Status Update Function
  function updateTankVisuals() {
    const capacities = { 1: 9000, 2: 16000, 3: 35000 };
    for (let id = 1; id <= 3; id++) {
      const openingEl = document.getElementById(`tank-${id}-opening`);
      const closingEl = document.getElementById(`tank-${id}-closing`);
      
      const openingVal = parseFloat(openingEl.value) || 0;
      const closingVal = closingEl.value !== '' ? parseFloat(closingEl.value) : openingVal;
      
      const cap = capacities[id];
      const pct = Math.min(100, Math.max(0, (closingVal / cap) * 100));
      
      const wave = document.getElementById(`fluid-wave-${id}`);
      if (wave) {
        wave.style.height = `${pct}%`;
      }
      
      const label = document.getElementById(`tank-fill-label-${id}`);
      if (label) {
        label.textContent = `${Math.round(pct)}%`;
      }
      
      const status = document.getElementById(`tank-status-${id}`);
      if (status) {
        status.textContent = `${closingVal.toFixed(2)} L / ${cap.toLocaleString()} L`;
      }
    }
  }

  // Bind listeners for real-time tank visuals updates
  setTimeout(() => {
    for (let id = 1; id <= 3; id++) {
      const openingEl = document.getElementById(`tank-${id}-opening`);
      const closingEl = document.getElementById(`tank-${id}-closing`);
      if (openingEl && closingEl) {
        openingEl.addEventListener('input', updateTankVisuals);
        closingEl.addEventListener('input', updateTankVisuals);
      }
    }
  }, 100);

  // Helper to calculate and show difference without triggering styling validation
  function updateDifference(nozzleId) {
    const openingEl = document.getElementById(`nozzle-${nozzleId}-opening`);
    const closingEl = document.getElementById(`nozzle-${nozzleId}-closing`);
    const diffEl = document.getElementById(`nozzle-${nozzleId}-diff`);

    const opening = parseFloat(openingEl.value) || 0;
    const closing = parseFloat(closingEl.value) || 0;
    const difference = closing - opening;

    diffEl.textContent = difference.toFixed(3);

    // Apply color class to difference display
    diffEl.className = 'diff-val';
    if (difference > 0) {
      diffEl.classList.add('positive');
    } else if (difference < 0) {
      diffEl.classList.add('negative');
    } else {
      diffEl.classList.add('zero');
    }
  }

  // Validate individual nozzle closing reading on blur (when user moves to next textbox)
  function validateNozzleInput(nozzleId) {
    const openingEl = document.getElementById(`nozzle-${nozzleId}-opening`);
    const closingEl = document.getElementById(`nozzle-${nozzleId}-closing`);
    const rowEl = closingEl.closest('.nozzle-form-row');

    const opening = parseFloat(openingEl.value) || 0;
    const closing = parseFloat(closingEl.value) || 0;
    const difference = closing - opening;

    if (difference < 0 && closingEl.value !== '') {
      closingEl.classList.add('input-error');
      rowEl.classList.add('has-error');
    } else {
      closingEl.classList.remove('input-error');
      rowEl.classList.remove('has-error');
    }

    // Check errors globally to toggle error banner
    checkFormErrors();
  }

  // Clear validation styling when user focuses the field to start editing
  function clearNozzleValidation(nozzleId) {
    const closingEl = document.getElementById(`nozzle-${nozzleId}-closing`);
    const rowEl = closingEl.closest('.nozzle-form-row');

    closingEl.classList.remove('input-error');
    rowEl.classList.remove('has-error');

    checkFormErrors();
  }

  // Scan nozzle rows and display error banner
  function checkFormErrors() {
    const errorRows = document.querySelectorAll('.nozzle-form-row.has-error');
    const errorBanner = document.getElementById('form-error-banner');
    
    if (errorRows.length > 0) {
      const errorNozzles = Array.from(errorRows).map(row => {
        return row.querySelector('.nozzle-badge').textContent;
      });
      errorBanner.textContent = `Closing reading cannot be less than opening reading for: ${errorNozzles.join(', ')}`;
      errorBanner.style.display = 'flex';
    } else {
      errorBanner.style.display = 'none';
    }
  }

  // Format date helper (YYYY-MM-DD to D Month YYYY, e.g. 1 May 2026)
  function formatDate(dateString) {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      return `${day} ${months[monthIndex]} ${year}`;
    }
    return dateString;
  }

  // Listeners for live difference calculations & validation triggers
  for (let id = 1; id <= 6; id++) {
    const openingEl = document.getElementById(`nozzle-${id}-opening`);
    const closingEl = document.getElementById(`nozzle-${id}-closing`);

    // Live calculation while typing
    closingEl.addEventListener('input', () => updateDifference(id));
    openingEl.addEventListener('input', () => updateDifference(id));

    // Validate only on blur (moving focus away)
    closingEl.addEventListener('blur', () => validateNozzleInput(id));
    openingEl.addEventListener('blur', () => validateNozzleInput(id));

    // Clear validation styling when focusing (giving clean slate to edit)
    closingEl.addEventListener('focus', () => clearNozzleValidation(id));
  }

  // Tank stock live validation listeners
  for (let id = 1; id <= 3; id++) {
    const openingEl = document.getElementById(`tank-${id}-opening`);
    const closingEl = document.getElementById(`tank-${id}-closing`);
    const rowEl = document.querySelector(`.tank-form-row[data-tank="${id}"]`);
    const capacity = parseFloat(rowEl.getAttribute('data-capacity'));

    function validateTankInput(el, typeLabel) {
      const val = parseFloat(el.value);
      if (el.value !== '' && (isNaN(val) || val < 0 || val > capacity)) {
        el.classList.add('input-error');
        showToast(`${rowEl.getAttribute('data-name')} (${rowEl.getAttribute('data-product')}) ${typeLabel} stock must be between 0 and ${capacity.toLocaleString()} L.`, 'error');
      } else {
        el.classList.remove('input-error');
      }
    }

    openingEl.addEventListener('blur', () => validateTankInput(openingEl, 'opening'));
    closingEl.addEventListener('blur', () => validateTankInput(closingEl, 'closing'));

    openingEl.addEventListener('focus', () => openingEl.classList.remove('input-error'));
    closingEl.addEventListener('focus', () => closingEl.classList.remove('input-error'));
  }

  // Date input change handler
  dateInput.addEventListener('change', () => {
    if (dateInput.value > activeDate) {
      showToast(`Date ${formatDate(dateInput.value)} is locked. Please complete calculations for ${formatDate(activeDate)} first.`, 'error');
      dateInput.value = activeDate;
      const formattedDisplay = document.getElementById('formatted-date-display');
      if (formattedDisplay) {
        formattedDisplay.textContent = formatDate(activeDate);
      }
      isDayClosed = false;
      fetchOpeningReadings(activeDate);
      fetchOpeningTankStocks(activeDate);
      fetchOpeningRates(activeDate);
      fetchOpeningCash(activeDate);
      return;
    }

    isDayClosed = (dateInput.value !== activeDate);
    const formattedDisplay = document.getElementById('formatted-date-display');
    if (formattedDisplay) {
      formattedDisplay.textContent = formatDate(dateInput.value);
    }

    // Clear inputs if switching back to the active date (since it is editable), otherwise let loaders populate saved values
    if (!isDayClosed) {
      for (let id = 1; id <= 6; id++) {
        document.getElementById(`nozzle-${id}-closing`).value = '';
      }
      for (let id = 1; id <= 3; id++) {
        document.getElementById(`tank-${id}-dip`).value = '';
        document.getElementById(`tank-${id}-closing`).value = '';
      }
      clearCashInputs();
    }

    fetchOpeningReadings(dateInput.value);
    fetchOpeningTankStocks(dateInput.value);
    fetchOpeningRates(dateInput.value);
    fetchOpeningCash(dateInput.value);
  });

  // Decantation radio buttons toggle listener
  document.querySelectorAll('input[name="decantation-toggle"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const nextBtn = document.getElementById('btn-tank-next');
      if (e.target.value === 'yes') {
        if (nextBtn) nextBtn.innerHTML = 'Next Step: Decantation Details ➔';
      } else {
        if (nextBtn) nextBtn.innerHTML = 'Next Step: DSR Reconciliation ➔';
      }
    });
  });

  // Form submit handler (Triggers validation check, auto-save & transitions steps)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isDayClosed) {
      showView('testing');
      return;
    }

    const readings = [];
    let hasValidationError = false;

    for (let id = 1; id <= 6; id++) {
      const closingInputEl = document.getElementById(`nozzle-${id}-closing`);
      const openingInputEl = document.getElementById(`nozzle-${id}-opening`);
      const rowEl = closingInputEl.closest('.nozzle-form-row');
      const product = rowEl.getAttribute('data-product');
      
      const openingVal = parseFloat(openingInputEl.value);
      const closingVal = parseFloat(closingInputEl.value);

      // Validation check
      if (isNaN(closingVal) || isNaN(openingVal) || closingVal < openingVal) {
        hasValidationError = true;
        closingInputEl.classList.add('input-error');
        rowEl.classList.add('has-error');
      }

      const diff = closingVal - openingVal;
      const defaultTestQty = diff >= 5 ? 5 : Math.max(0, diff);

      readings.push({
        nozzle_id: id,
        product: product,
        opening_reading: isNaN(openingVal) ? 0 : openingVal,
        closing_reading: isNaN(closingVal) ? 0 : closingVal,
        testing_qty: defaultTestQty
      });
    }

    if (hasValidationError) {
      checkFormErrors();
      showToast('Validation failed: Closing readings cannot be less than opening readings.', 'error');
      return; // Stop form submission
    }

    const payload = {
      date: dateInput.value,
      readings: readings
    };

    try {
      const response = await fetch('/api/readings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save readings');
      }

      showToast(result.message || 'Readings saved successfully!', 'success');
      
      currentDuReadings = readings; // Cache readings

      // Populate and display the Step 2 Nozzle Testing quantities automatically
      readings.forEach(r => {
        const diff = r.closing_reading - r.opening_reading;
        // Update read-only diff value in Nozzle Testing table
        document.getElementById(`nozzle-${r.nozzle_id}-test-diff`).textContent = diff.toFixed(3);
        
        const defaultTestQty = diff >= 5 ? 5 : Math.max(0, diff);
        document.getElementById(`nozzle-${r.nozzle_id}-test-qty`).value = defaultTestQty.toFixed(3);
      });

      // Re-fetch opening readings (which will now lock today's values)
      await fetchOpeningReadings(dateInput.value);

      // Auto-transition directly to Step 2 (Nozzle Testing View)
      setTimeout(() => {
        showView('testing');
      }, 500);

    } catch (error) {
      console.error('Error saving readings:', error);
      showToast(error.message || 'An error occurred while saving readings.', 'error');
    }
  });

  // Form submit handler for Step 2: Nozzle Testing Form
  testingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isDayClosed) {
      showView('rates');
      return;
    }

    const readings = [];
    for (let id = 1; id <= 6; id++) {
      const closingInputEl = document.getElementById(`nozzle-${id}-closing`);
      const openingInputEl = document.getElementById(`nozzle-${id}-opening`);
      const rowEl = closingInputEl.closest('.nozzle-form-row');
      const product = rowEl.getAttribute('data-product');
      
      const openingVal = parseFloat(openingInputEl.value) || 0;
      const closingVal = parseFloat(closingInputEl.value) || 0;
      const testingVal = parseFloat(document.getElementById(`nozzle-${id}-test-qty`).value) || 0;

      readings.push({
        nozzle_id: id,
        product: product,
        opening_reading: openingVal,
        closing_reading: closingVal,
        testing_qty: testingVal
      });
    }

    const payload = {
      date: dateInput.value,
      readings: readings
    };

    try {
      const response = await fetch('/api/readings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save testing quantities');
      }

      showToast('Testing quantities saved successfully!', 'success');

      currentDuReadings = readings; // Cache readings with testing values

      // Transition directly to Step 3 (Rate Confirmation View)
      setTimeout(() => {
        showView('rates');
      }, 500);

    } catch (error) {
      console.error('Error saving testing quantities:', error);
      showToast(error.message || 'An error occurred while saving testing quantities.', 'error');
    }
  });

  // Form submit handler for Step 3: Rate Confirmation Form
  if (ratesForm) {
    ratesForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (isDayClosed) {
        showView('tank');
        return;
      }

      const powerVal = parseFloat(document.getElementById('rate-power').value) || 0;
      const petrolVal = parseFloat(document.getElementById('rate-petrol').value) || 0;
      const dieselVal = parseFloat(document.getElementById('rate-diesel').value) || 0;

      if (isNaN(powerVal) || isNaN(petrolVal) || isNaN(dieselVal) || powerVal < 0 || petrolVal < 0 || dieselVal < 0) {
        showToast('Rates must be valid positive numbers.', 'error');
        return;
      }

      const payload = {
        date: dateInput.value,
        rate_power: powerVal,
        rate_petrol: petrolVal,
        rate_diesel: dieselVal
      };

      try {
        const response = await fetch('/api/rates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to save daily selling rates');
        }

        showToast('Selling rates saved successfully!', 'success');

        currentRates.poWer = powerVal;
        currentRates.Petrol = petrolVal;
        currentRates.Diesel = dieselVal;

        // Auto-transition directly to Step 4 (Tank Stock View)
        setTimeout(() => {
          showView('tank');
        }, 500);

      } catch (error) {
        console.error('Error saving rates:', error);
        showToast(error.message || 'An error occurred while saving rates.', 'error');
      }
    });
  }

  // Helper to save tank stock data to database and transition views
  async function saveTankStockData(targetView) {
    const tanks = [];
    let hasValidationError = false;
    let focusElement = null;

    for (let id = 1; id <= 3; id++) {
      const rowEl = document.querySelector(`.tank-form-row[data-tank="${id}"]`);
      const tankName = rowEl.getAttribute('data-name');
      const product = rowEl.getAttribute('data-product');
      const capacity = parseFloat(rowEl.getAttribute('data-capacity'));
      
      const openingDipVal = parseFloat(document.getElementById(`tank-${id}-opening-dip`).value) || 0;
      const openingInput = document.getElementById(`tank-${id}-opening`);
      const openingVal = parseFloat(openingInput.value);
      const dipVal = parseFloat(document.getElementById(`tank-${id}-dip`).value) || 0;
      const closingInput = document.getElementById(`tank-${id}-closing`);
      const closingVal = parseFloat(closingInput.value);

      if (isNaN(openingVal) || openingVal < 0 || openingVal > capacity) {
        hasValidationError = true;
        openingInput.classList.add('input-error');
        showToast(`${tankName} (${product}) opening stock must be between 0 and ${capacity.toLocaleString()} L.`, 'error');
        if (!focusElement) focusElement = openingInput;
      }

      if (isNaN(closingVal) || closingVal < 0 || closingVal > capacity) {
        hasValidationError = true;
        closingInput.classList.add('input-error');
        showToast(`${tankName} (${product}) closing stock must be between 0 and ${capacity.toLocaleString()} L.`, 'error');
        if (!focusElement) focusElement = closingInput;
      }

      if (!hasValidationError) {
        tanks.push({
          tank_id: id,
          tank_name: tankName,
          product: product,
          capacity: capacity,
          opening_dip: openingDipVal,
          opening_stock: openingVal,
          closing_dip: dipVal,
          closing_stock: closingVal,
          decantation_qty: currentDecantation[product] || 0
        });
      }
    }

    if (hasValidationError) {
      if (focusElement) {
        focusElement.focus();
        if (typeof focusElement.select === 'function') {
          focusElement.select();
        }
      }
      return;
    }

    const payload = {
      date: dateInput.value,
      tanks: tanks
    };

    try {
      const response = await fetch('/api/tanks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save tank stocks');
      }

      showToast('Tank stocks saved successfully!', 'success');

      currentTankReadings = tanks; // Cache tank readings

      // Re-fetch opening tank stocks to lock them
      await fetchOpeningTankStocks(dateInput.value);

      // Populate Finish Page summary with both DU and Tank readings
      showFinishSummary(dateInput.value, currentDuReadings, currentTankReadings);
      updateDsrCalculations();

      // Transition to target view
      if (targetView) {
        setTimeout(() => {
          showView(targetView);
        }, 500);
      }

    } catch (error) {
      console.error('Error saving tank stocks:', error);
      showToast(error.message || 'An error occurred while saving tank stocks.', 'error');
    }
  }

  // Form submit handler for Step 3: Tank Stock Form
  tankForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isDayClosed) {
      const hasDecantation = document.querySelector('input[name="decantation-toggle"]:checked').value === 'yes';
      updateDsrCalculations();
      showView(hasDecantation ? 'decantation' : 'dsr');
      return;
    }

    const hasDecantation = document.querySelector('input[name="decantation-toggle"]:checked').value === 'yes';
    if (hasDecantation) {
      // Save current tank stock data and transition to step 4 (decantation details)
      await saveTankStockData('decantation');
    } else {
      // Clear decantation values
      currentDecantation.Petrol = 0;
      currentDecantation.Diesel = 0;
      currentDecantation.poWer = 0;

      document.getElementById('load-petrol').value = '0';
      document.getElementById('load-diesel').value = '0';
      document.getElementById('load-power').value = '0';

      // Save tank stock data and transition directly to DSR reconciliation page
      await saveTankStockData('dsr');
    }
  });

  // Event handlers for Step 4 Decantation Details page
  const decantationForm = document.getElementById('decantation-form');
  const btnBackToTank = document.getElementById('btn-back-to-tank');

  if (btnBackToTank) {
    btnBackToTank.addEventListener('click', () => {
      showView('tank');
    });
  }

  if (decantationForm) {
    decantationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (isDayClosed) {
        updateDsrCalculations();
        showView('dsr');
        return;
      }

      const petrolVal = parseFloat(document.getElementById('load-petrol').value) || 0;
      const dieselVal = parseFloat(document.getElementById('load-diesel').value) || 0;
      const powerVal = parseFloat(document.getElementById('load-power').value) || 0;

      // Validate individual inputs are multiples of 1000
      if (petrolVal % 1000 !== 0 || dieselVal % 1000 !== 0 || powerVal % 1000 !== 0) {
        showToast('Each fuel load must be in multiples of 1,000 liters.', 'error');
        return;
      }

      // Validate total load matches standard tanker capacities
      const totalDecantation = petrolVal + dieselVal + powerVal;
      const allowedTotals = [12000, 14000, 18000, 20000];
      if (!allowedTotals.includes(totalDecantation)) {
        showToast('Total decantation must be exactly 12,000, 14,000, 18,000, or 20,000 liters.', 'error');
        return;
      }

      currentDecantation.Petrol = petrolVal;
      currentDecantation.Diesel = dieselVal;
      currentDecantation.poWer = powerVal;

      // Save everything and transition to DSR reconciliation page
      await saveTankStockData('dsr');
    });
  }

  // Populate the Finish Page with the calculation summary (crust)
  function showFinishSummary(selectedDate, readings, tanks) {
    document.getElementById('summary-date').textContent = formatDate(selectedDate);

    // 1. Render DU Calculations
    let totalPetrol = 0;
    let totalDiesel = 0;
    let totalPower = 0;
    
    const tableBody = document.getElementById('summary-table-body');
    tableBody.innerHTML = ''; // Clear previous

    readings.forEach(r => {
      const diff = r.closing_reading - r.opening_reading;
      const testing = r.testing_qty !== undefined ? parseFloat(r.testing_qty) : 0;
      const net = diff - testing;

      if (r.product === 'Petrol') totalPetrol += net;
      else if (r.product === 'Diesel') totalDiesel += net;
      else if (r.product === 'poWer') totalPower += net;

      // Add row (7 columns)
      const row = document.createElement('div');
      row.className = `summary-table-row row-${r.product.toLowerCase()}`;
      row.innerHTML = `
        <div><span class="nozzle-badge">N${r.nozzle_id}</span></div>
        <div class="product-cell">${r.product}</div>
        <div class="text-right">${r.opening_reading.toFixed(3)}</div>
        <div class="text-right">${r.closing_reading.toFixed(3)}</div>
        <div class="text-right diff-cell">${diff.toFixed(3)}</div>
        <div class="text-right text-muted">${testing.toFixed(3)}</div>
        <div class="text-right bold diff-cell">${net.toFixed(3)}</div>
      `;
      tableBody.appendChild(row);
    });

    const grandTotalSales = totalPetrol + totalDiesel + totalPower;
    const petrolPct = grandTotalSales > 0 ? (totalPetrol / grandTotalSales) * 100 : 0;
    const dieselPct = grandTotalSales > 0 ? (totalDiesel / grandTotalSales) * 100 : 0;
    const powerPct = grandTotalSales > 0 ? (totalPower / grandTotalSales) * 100 : 0;

    document.getElementById('summary-total-petrol').textContent = `${totalPetrol.toFixed(3)} L`;
    document.getElementById('summary-total-diesel').textContent = `${totalDiesel.toFixed(3)} L`;
    document.getElementById('summary-total-power').textContent = `${totalPower.toFixed(3)} L`;

    document.getElementById('summary-pct-petrol').textContent = `${petrolPct.toFixed(2)}% Sale`;
    document.getElementById('summary-pct-diesel').textContent = `${dieselPct.toFixed(2)}% Sale`;
    document.getElementById('summary-pct-power').textContent = `${powerPct.toFixed(2)}% Sale`;

    // Populate confirmed daily rates on summary cards
    document.getElementById('summary-rate-petrol').textContent = `Rs. ${parseFloat(currentRates.Petrol || 0).toFixed(2)}/L`;
    document.getElementById('summary-rate-diesel').textContent = `Rs. ${parseFloat(currentRates.Diesel || 0).toFixed(2)}/L`;
    document.getElementById('summary-rate-power').textContent = `Rs. ${parseFloat(currentRates.poWer || 0).toFixed(2)}/L`;

    // 2. Render Tank Stocks
    const tankTableBody = document.getElementById('summary-tank-body');
    tankTableBody.innerHTML = ''; // Clear previous

    tanks.forEach(t => {
      const decantation = t.decantation_qty !== undefined ? parseFloat(t.decantation_qty) : 0;
      const row = document.createElement('div');
      row.className = `summary-tank-row row-${t.product.toLowerCase()}`;
      row.innerHTML = `
        <div><span class="nozzle-badge">T${t.tank_id}</span></div>
        <div class="product-cell">${t.tank_name} (${t.product})</div>
        <div class="text-right">${t.opening_dip.toFixed(1)}</div>
        <div class="text-right">${t.opening_stock.toFixed(2)}</div>
        <div class="text-right text-muted">${decantation.toFixed(0)}</div>
        <div class="text-right">${t.closing_dip.toFixed(1)}</div>
        <div class="text-right bold diff-cell">${t.closing_stock.toFixed(2)}</div>
      `;
      tankTableBody.appendChild(row);
    });

    // 3. Render Cash Reconciliation & Settlement Summary
    const totalSalesValue = calculateTotalSalesValue();
    document.getElementById('summary-calc-sales').textContent = `Rs. ${Math.round(totalSalesValue).toLocaleString()}`;

    const notes500 = parseInt(document.getElementById('notes-500').value, 10) || 0;
    const notes200 = parseInt(document.getElementById('notes-200').value, 10) || 0;
    const notes100 = parseInt(document.getElementById('notes-100').value, 10) || 0;
    const notes50 = parseInt(document.getElementById('notes-50').value, 10) || 0;
    const notes20 = parseInt(document.getElementById('notes-20').value, 10) || 0;
    const notes10 = parseInt(document.getElementById('notes-10').value, 10) || 0;
    
    const coins20 = parseInt(document.getElementById('coins-20').value, 10) || 0;
    const coins10 = parseInt(document.getElementById('coins-10').value, 10) || 0;
    const coins5 = parseInt(document.getElementById('coins-5').value, 10) || 0;
    const coins2 = parseInt(document.getElementById('coins-2').value, 10) || 0;
    const coins1 = parseInt(document.getElementById('coins-1').value, 10) || 0;
    
    const coins = (coins20 * 20) + (coins10 * 10) + (coins5 * 5) + (coins2 * 2) + (coins1 * 1);
    const totalCashReceived = (notes500 * 500) + (notes200 * 200) + (notes100 * 100) + (notes50 * 50) + (notes20 * 20) + (notes10 * 10) + coins;
    
    // Non-Cash Summary
    let totalNonCash = 0;
    const nonCashEntries = [];
    const rows = document.querySelectorAll('#other-payments-rows tr');
    rows.forEach(row => {
      const type = row.querySelector('.non-cash-type-input').value;
      const description = row.querySelector('.non-cash-desc-input').value;
      const amount = parseFloat(row.querySelector('.non-cash-amount-input').value) || 0;

      if (amount > 0 || description.trim() !== '') {
        nonCashEntries.push({ type, description, amount });
        totalNonCash += amount;
      }
    });

    const shortfall = totalSalesValue - (totalCashReceived + totalNonCash);

    document.getElementById('summary-cash-received').textContent = `Rs. ${Math.round(totalCashReceived).toLocaleString()}`;
    document.getElementById('summary-other-received').textContent = `Rs. ${Math.round(totalNonCash).toLocaleString()}`;
    
    const summaryShortfallEl = document.getElementById('summary-cash-shortfall');
    const summaryShortfallCard = document.getElementById('summary-shortfall-card');
    const summaryShortfallLabel = document.getElementById('summary-shortfall-lbl');
    
    if (shortfall > 0) {
      summaryShortfallEl.textContent = `Rs. ${Math.round(shortfall).toLocaleString()}`;
      summaryShortfallEl.style.color = 'var(--danger)';
      summaryShortfallLabel.textContent = 'SHORTFALL / DEFICIT';
      summaryShortfallLabel.style.color = 'var(--danger)';
      summaryShortfallCard.style.background = 'rgba(239, 68, 68, 0.05)';
      summaryShortfallCard.style.borderColor = 'rgba(239, 68, 68, 0.12)';
    } else if (shortfall < 0) {
      summaryShortfallEl.textContent = `Rs. ${Math.round(Math.abs(shortfall)).toLocaleString()}`;
      summaryShortfallEl.style.color = 'var(--success)';
      summaryShortfallLabel.textContent = 'SURPLUS / EXCESS';
      summaryShortfallLabel.style.color = 'var(--success)';
      summaryShortfallCard.style.background = 'rgba(16, 185, 129, 0.05)';
      summaryShortfallCard.style.borderColor = 'rgba(16, 185, 129, 0.12)';
    } else {
      summaryShortfallEl.textContent = `Rs. 0`;
      summaryShortfallEl.style.color = 'var(--text-muted)';
      summaryShortfallLabel.textContent = 'BALANCED';
      summaryShortfallLabel.style.color = 'var(--text-muted)';
      summaryShortfallCard.style.background = 'rgba(255, 255, 255, 0.01)';
      summaryShortfallCard.style.borderColor = 'rgba(255, 255, 255, 0.04)';
    }

    const denomArr = [];
    if (notes500 > 0) denomArr.push(`500 × ${notes500}`);
    if (notes200 > 0) denomArr.push(`200 × ${notes200}`);
    if (notes100 > 0) denomArr.push(`100 × ${notes100}`);
    if (notes50 > 0) denomArr.push(`50 × ${notes50}`);
    if (notes20 > 0) denomArr.push(`20 × ${notes20}`);
    if (notes10 > 0) denomArr.push(`10 × ${notes10}`);
    if (coins > 0) denomArr.push(`Coins: Rs. ${Math.round(coins)}`);

    const denomEl = document.getElementById('summary-denominations');
    if (denomArr.length > 0) {
      denomEl.innerHTML = `<strong>Denominations:</strong> ` + denomArr.join(' | ');
    } else {
      denomEl.innerHTML = `<strong>Denominations:</strong> None entered`;
    }

    const nonCashListEl = document.getElementById('summary-other-payments-list');
    if (nonCashEntries.length > 0) {
      const entryStrings = nonCashEntries.map(e => `[${e.type}] ${e.description}: Rs. ${e.amount.toLocaleString()}`);
      nonCashListEl.innerHTML = `<strong>Non-Cash Settlement Logs:</strong> ` + entryStrings.join(' | ');
    } else {
      nonCashListEl.innerHTML = `<strong>Non-Cash Settlement Logs:</strong> None recorded`;
    }

    const btnStartNewDay = document.getElementById('btn-start-new-day');
    if (btnStartNewDay) {
      if (selectedDate !== activeDate) {
        btnStartNewDay.innerHTML = `Go to Active Day (${formatDate(activeDate)}) ➔`;
      } else {
        btnStartNewDay.innerHTML = 'Start Next Day 🔄';
      }
    }
  }

  // Populate the Preview Page with the summary (same layout as Finish, no API call yet)
  function showPreviewSummary(selectedDate, readings, tanks) {
    const previewDateEl = document.getElementById('preview-date');
    if (previewDateEl) previewDateEl.textContent = formatDate(selectedDate);

    let totalPetrol = 0, totalDiesel = 0, totalPower = 0;
    const tableBody = document.getElementById('preview-table-body');
    if (tableBody) tableBody.innerHTML = '';

    readings.forEach(r => {
      const diff = r.closing_reading - r.opening_reading;
      const testing = r.testing_qty !== undefined ? parseFloat(r.testing_qty) : 0;
      const net = diff - testing;

      if (r.product === 'Petrol') totalPetrol += net;
      else if (r.product === 'Diesel') totalDiesel += net;
      else if (r.product === 'poWer') totalPower += net;

      if (tableBody) {
        const row = document.createElement('div');
        row.className = `summary-table-row row-${r.product.toLowerCase()}`;
        row.innerHTML = `
          <div><span class="nozzle-badge">N${r.nozzle_id}</span></div>
          <div class="product-cell">${r.product}</div>
          <div class="text-right">${r.opening_reading.toFixed(3)}</div>
          <div class="text-right">${r.closing_reading.toFixed(3)}</div>
          <div class="text-right diff-cell">${diff.toFixed(3)}</div>
          <div class="text-right text-muted">${testing.toFixed(3)}</div>
          <div class="text-right bold diff-cell">${net.toFixed(3)}</div>
        `;
        tableBody.appendChild(row);
      }
    });

    const grandTotalSales = totalPetrol + totalDiesel + totalPower;
    const petrolPct = grandTotalSales > 0 ? (totalPetrol / grandTotalSales) * 100 : 0;
    const dieselPct = grandTotalSales > 0 ? (totalDiesel / grandTotalSales) * 100 : 0;
    const powerPct  = grandTotalSales > 0 ? (totalPower  / grandTotalSales) * 100 : 0;

    const el = id => document.getElementById(id);
    if (el('preview-total-petrol')) el('preview-total-petrol').textContent = `${totalPetrol.toFixed(3)} L`;
    if (el('preview-total-diesel')) el('preview-total-diesel').textContent = `${totalDiesel.toFixed(3)} L`;
    if (el('preview-total-power'))  el('preview-total-power').textContent  = `${totalPower.toFixed(3)} L`;
    if (el('preview-pct-petrol'))   el('preview-pct-petrol').textContent   = `${petrolPct.toFixed(2)}% Sale`;
    if (el('preview-pct-diesel'))   el('preview-pct-diesel').textContent   = `${dieselPct.toFixed(2)}% Sale`;
    if (el('preview-pct-power'))    el('preview-pct-power').textContent    = `${powerPct.toFixed(2)}% Sale`;
    if (el('preview-rate-petrol'))  el('preview-rate-petrol').textContent  = `Rs. ${parseFloat(currentRates.Petrol  || 0).toFixed(2)}/L`;
    if (el('preview-rate-diesel'))  el('preview-rate-diesel').textContent  = `Rs. ${parseFloat(currentRates.Diesel  || 0).toFixed(2)}/L`;
    if (el('preview-rate-power'))   el('preview-rate-power').textContent   = `Rs. ${parseFloat(currentRates.poWer   || 0).toFixed(2)}/L`;

    // Tank stocks
    const tankBody = document.getElementById('preview-tank-body');
    if (tankBody) {
      tankBody.innerHTML = '';
      tanks.forEach(t => {
        const decantation = t.decantation_qty !== undefined ? parseFloat(t.decantation_qty) : 0;
        const row = document.createElement('div');
        row.className = `summary-tank-row row-${t.product.toLowerCase()}`;
        row.innerHTML = `
          <div><span class="nozzle-badge">T${t.tank_id}</span></div>
          <div class="product-cell">${t.tank_name} (${t.product})</div>
          <div class="text-right">${t.opening_dip.toFixed(1)}</div>
          <div class="text-right">${t.opening_stock.toFixed(2)}</div>
          <div class="text-right text-muted">${decantation.toFixed(0)}</div>
          <div class="text-right">${t.closing_dip.toFixed(1)}</div>
          <div class="text-right bold diff-cell">${t.closing_stock.toFixed(2)}</div>
        `;
        tankBody.appendChild(row);
      });
    }

    // Cash & Settlement
    const totalSalesValue = calculateTotalSalesValue();
    if (el('preview-calc-sales')) el('preview-calc-sales').textContent = `Rs. ${Math.round(totalSalesValue).toLocaleString()}`;

    const notes500 = parseInt(document.getElementById('notes-500').value, 10) || 0;
    const notes200 = parseInt(document.getElementById('notes-200').value, 10) || 0;
    const notes100 = parseInt(document.getElementById('notes-100').value, 10) || 0;
    const notes50  = parseInt(document.getElementById('notes-50').value,  10) || 0;
    const notes20  = parseInt(document.getElementById('notes-20').value,  10) || 0;
    const notes10  = parseInt(document.getElementById('notes-10').value,  10) || 0;
    const coins20  = parseInt(document.getElementById('coins-20').value,  10) || 0;
    const coins10  = parseInt(document.getElementById('coins-10').value,  10) || 0;
    const coins5   = parseInt(document.getElementById('coins-5').value,   10) || 0;
    const coins2   = parseInt(document.getElementById('coins-2').value,   10) || 0;
    const coins1   = parseInt(document.getElementById('coins-1').value,   10) || 0;
    const coins = (coins20*20)+(coins10*10)+(coins5*5)+(coins2*2)+(coins1*1);
    const totalCashReceived = (notes500*500)+(notes200*200)+(notes100*100)+(notes50*50)+(notes20*20)+(notes10*10)+coins;

    let totalNonCash = 0;
    const nonCashEntries = [];
    document.querySelectorAll('#other-payments-rows tr').forEach(row => {
      const type   = row.querySelector('.non-cash-type-input').value;
      const desc   = row.querySelector('.non-cash-desc-input').value;
      const amount = parseFloat(row.querySelector('.non-cash-amount-input').value) || 0;
      if (amount > 0 || desc.trim() !== '') { nonCashEntries.push({ type, desc, amount }); totalNonCash += amount; }
    });

    const shortfall = totalSalesValue - (totalCashReceived + totalNonCash);
    if (el('preview-cash-received'))  el('preview-cash-received').textContent  = `Rs. ${Math.round(totalCashReceived).toLocaleString()}`;
    if (el('preview-other-received')) el('preview-other-received').textContent = `Rs. ${Math.round(totalNonCash).toLocaleString()}`;

    const sfEl    = el('preview-cash-shortfall');
    const sfCard  = el('preview-shortfall-card');
    const sfLabel = el('preview-shortfall-lbl');
    if (sfEl && sfCard && sfLabel) {
      if (shortfall > 0) {
        sfEl.textContent = `Rs. ${Math.round(shortfall).toLocaleString()}`; sfEl.style.color = 'var(--danger)';
        sfLabel.textContent = 'SHORTFALL / DEFICIT'; sfLabel.style.color = 'var(--danger)';
        sfCard.style.background = 'rgba(239,68,68,0.05)'; sfCard.style.borderColor = 'rgba(239,68,68,0.12)';
      } else if (shortfall < 0) {
        sfEl.textContent = `Rs. ${Math.round(Math.abs(shortfall)).toLocaleString()}`; sfEl.style.color = 'var(--success)';
        sfLabel.textContent = 'SURPLUS / EXCESS'; sfLabel.style.color = 'var(--success)';
        sfCard.style.background = 'rgba(16,185,129,0.05)'; sfCard.style.borderColor = 'rgba(16,185,129,0.12)';
      } else {
        sfEl.textContent = 'Rs. 0'; sfEl.style.color = 'var(--text-muted)';
        sfLabel.textContent = 'BALANCED'; sfLabel.style.color = 'var(--text-muted)';
        sfCard.style.background = 'rgba(255,255,255,0.01)'; sfCard.style.borderColor = 'rgba(255,255,255,0.04)';
      }
    }

    const denomArr = [];
    if (notes500>0) denomArr.push(`500 × ${notes500}`);
    if (notes200>0) denomArr.push(`200 × ${notes200}`);
    if (notes100>0) denomArr.push(`100 × ${notes100}`);
    if (notes50 >0) denomArr.push(`50 × ${notes50}`);
    if (notes20 >0) denomArr.push(`20 × ${notes20}`);
    if (notes10 >0) denomArr.push(`10 × ${notes10}`);
    if (coins   >0) denomArr.push(`Coins: Rs. ${Math.round(coins)}`);
    const denomEl = el('preview-denominations');
    if (denomEl) denomEl.innerHTML = `<strong>Denominations:</strong> ` + (denomArr.length ? denomArr.join(' | ') : 'None entered');

    const ncListEl = el('preview-other-payments-list');
    if (ncListEl) {
      if (nonCashEntries.length > 0) {
        ncListEl.innerHTML = `<strong>Non-Cash Settlement Logs:</strong> ` + nonCashEntries.map(e => `[${e.type}] ${e.desc}: Rs. ${e.amount.toLocaleString()}`).join(' | ');
      } else {
        ncListEl.innerHTML = `<strong>Non-Cash Settlement Logs:</strong> None recorded`;
      }
    }
  }

  // Called when user clicks Confirm & Close Day on the preview page
  async function confirmAndCloseDay() {
    const btnConfirm = document.getElementById('btn-preview-confirm');
    if (btnConfirm) { btnConfirm.disabled = true; btnConfirm.textContent = 'Saving…'; }

    const notes500 = parseInt(document.getElementById('notes-500').value, 10) || 0;
    const notes200 = parseInt(document.getElementById('notes-200').value, 10) || 0;
    const notes100 = parseInt(document.getElementById('notes-100').value, 10) || 0;
    const notes50  = parseInt(document.getElementById('notes-50').value,  10) || 0;
    const notes20  = parseInt(document.getElementById('notes-20').value,  10) || 0;
    const notes10  = parseInt(document.getElementById('notes-10').value,  10) || 0;
    const coins20  = parseInt(document.getElementById('coins-20').value,  10) || 0;
    const coins10  = parseInt(document.getElementById('coins-10').value,  10) || 0;
    const coins5   = parseInt(document.getElementById('coins-5').value,   10) || 0;
    const coins2   = parseInt(document.getElementById('coins-2').value,   10) || 0;
    const coins1   = parseInt(document.getElementById('coins-1').value,   10) || 0;

    const totalCoins      = (coins20*20)+(coins10*10)+(coins5*5)+(coins2*2)+(coins1*1);
    const totalNotesFixed = (notes500*500)+(notes200*200)+(notes100*100)+(notes50*50)+(notes20*20)+(notes10*10);
    const totalCashReceived = totalNotesFixed + totalCoins;
    const totalSalesValue   = calculateTotalSalesValue();

    const nonCashPayments = [];
    document.querySelectorAll('#other-payments-rows tr').forEach(row => {
      const type   = row.querySelector('.non-cash-type-input').value;
      const description = row.querySelector('.non-cash-desc-input').value;
      const amount = parseFloat(row.querySelector('.non-cash-amount-input').value) || 0;
      if (amount > 0 || description.trim() !== '') nonCashPayments.push({ type, description, amount });
    });

    const totalNonCash = nonCashPayments.reduce((sum, p) => sum + p.amount, 0);
    const shortfall    = totalSalesValue - (totalCashReceived + totalNonCash);

    const payload = {
      date: dateInput.value,
      total_sales_value: totalSalesValue,
      total_cash_received: totalCashReceived,
      shortfall,
      notes_500: notes500, notes_200: notes200, notes_100: notes100,
      notes_50: notes50,   notes_20: notes20,   notes_10: notes10,
      coins: totalCoins,
      coins_20: coins20, coins_10: coins10, coins_5: coins5, coins_2: coins2, coins_1: coins1,
      non_cash_payments: nonCashPayments
    };

    try {
      const response = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to finalize day closing');

      showToast(result.message || 'Day closed successfully!', 'success');
      isDayClosed = true;
      showFinishSummary(dateInput.value, currentDuReadings, currentTankReadings);
      showView('finish');
    } catch (error) {
      console.error('Error saving closing summary:', error);
      showToast(error.message || 'An error occurred while finalizing day closing.', 'error');
    } finally {
      if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.innerHTML = '✓ Confirm &amp; Close Day'; }
    }
  }

  // ----------------------------------------------------
  // CASH RECONCILIATION PAGE FUNCTIONS
  // ----------------------------------------------------

  let currentCashData = null;

  async function fetchOpeningCash(selectedDate) {
    try {
      const response = await fetch(`/api/cash/opening?date=${selectedDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch cash reconciliation');
      }
      const data = await response.json();
      
      const cash = data.cash;
      if (cash) {
        currentCashData = cash;
        document.getElementById('notes-500').value = cash.notes_500;
        document.getElementById('notes-200').value = cash.notes_200;
        document.getElementById('notes-100').value = cash.notes_100;
        document.getElementById('notes-50').value = cash.notes_50;
        document.getElementById('notes-20').value = cash.notes_20;
        document.getElementById('notes-10').value = cash.notes_10;
        
        // Populate coin inputs
        document.getElementById('coins-20').value = cash.coins_20 || 0;
        document.getElementById('coins-10').value = cash.coins_10 || 0;
        document.getElementById('coins-5').value = cash.coins_5 || 0;
        document.getElementById('coins-2').value = cash.coins_2 || 0;
        document.getElementById('coins-1').value = cash.coins_1 || 0;
        document.getElementById('coins-amount').value = Math.round(cash.coins);

        // Populate non-cash payments if saved
        const nonCashPayments = data.nonCashPayments || [];
        
        // Dynamically adjust rows to match either current input value or saved records count (whichever is larger)
        const rowCountInput = document.getElementById('non-cash-row-count');
        let targetCount = 20;
        if (rowCountInput) {
          const currentSetVal = parseInt(rowCountInput.value, 10) || 20;
          targetCount = Math.min(100, Math.max(5, Math.max(currentSetVal, nonCashPayments.length)));
          rowCountInput.value = targetCount;
        }
        adjustNonCashRows(targetCount);

        const descInputs = document.querySelectorAll('.non-cash-desc-input');
        const typeInputs = document.querySelectorAll('.non-cash-type-input');
        const amountInputs = document.querySelectorAll('.non-cash-amount-input');

        descInputs.forEach(input => input.value = '');
        typeInputs.forEach(input => input.value = 'UPI');
        amountInputs.forEach(input => input.value = '');

        nonCashPayments.forEach((p, idx) => {
          if (idx < targetCount) {
            if (typeInputs[idx]) typeInputs[idx].value = p.type;
            if (descInputs[idx]) descInputs[idx].value = p.description;
            if (amountInputs[idx]) amountInputs[idx].value = parseFloat(p.amount) || '';
          }
        });
      } else {
        currentCashData = null;
        clearCashInputs();
      }
      isDayClosed = (selectedDate !== activeDate);
      updateCashCalculations();
      enforceFreezeState();
    } catch (error) {
      console.error('Error fetching opening cash:', error);
      showToast('Error loading cash reconciliation.', 'error');
    }
  }

  function enforceFreezeState() {
    const otherPaymentsForm = document.getElementById('other-payments-form');
    const forms = [form, testingForm, ratesForm, tankForm, decantationForm, cashForm, otherPaymentsForm];
    forms.forEach(f => {
      if (!f) return;
      const inputs = f.querySelectorAll('input, select');
      inputs.forEach(input => {
        if (input.id === 'reading-date') {
          input.disabled = false;
          return;
        }
        
        if (isDayClosed) {
          input.disabled = true;
        } else {
          // If open, restore default enabled status for normally editable fields:
          if (
            input.classList.contains('closing-input') ||
            input.id.includes('test-qty') ||
            input.id.includes('rate-') ||
            input.classList.contains('tank-dip-input') ||
            input.classList.contains('tank-closing-input') ||
            input.id.startsWith('load-') ||
            input.classList.contains('note-count-input') ||
            input.classList.contains('coin-count-input') ||
            input.classList.contains('non-cash-type-input') ||
            input.classList.contains('non-cash-desc-input') ||
            input.classList.contains('non-cash-amount-input') ||
            input.id === 'coins-amount' ||
            input.name === 'decantation-toggle'
          ) {
            input.disabled = false;
          }
        }
      });

      // Explicitly enable all buttons to allow navigation through frozen days
      const buttons = f.querySelectorAll('button');
      buttons.forEach(btn => {
        btn.disabled = false;
      });
    });

    const btnEditReadings = document.getElementById('btn-edit-readings');
    if (btnEditReadings) {
      btnEditReadings.innerHTML = isDayClosed ? '🔍 Review Steps' : '✍ Edit readings';
    }
  }

  function clearCashInputs() {
    document.getElementById('notes-500').value = '0';
    document.getElementById('notes-200').value = '0';
    document.getElementById('notes-100').value = '0';
    document.getElementById('notes-50').value = '0';
    document.getElementById('notes-20').value = '0';
    document.getElementById('notes-10').value = '0';

    document.getElementById('coins-20').value = '0';
    document.getElementById('coins-10').value = '0';
    document.getElementById('coins-5').value = '0';
    document.getElementById('coins-2').value = '0';
    document.getElementById('coins-1').value = '0';
    document.getElementById('coins-amount').value = '0';

    // Clear individual row amount displays
    document.getElementById('notes-500-amount').textContent = '0';
    document.getElementById('notes-200-amount').textContent = '0';
    document.getElementById('notes-100-amount').textContent = '0';
    document.getElementById('notes-50-amount').textContent = '0';
    document.getElementById('notes-20-amount').textContent = '0';
    document.getElementById('notes-10-amount').textContent = '0';
    document.getElementById('coins-20-amount').textContent = '0';
    document.getElementById('coins-10-amount').textContent = '0';
    document.getElementById('coins-5-amount').textContent = '0';
    document.getElementById('coins-2-amount').textContent = '0';
    document.getElementById('coins-1-amount').textContent = '0';

    const selectInputs = document.querySelectorAll('.non-cash-type-input');
    const descInputs = document.querySelectorAll('.non-cash-desc-input');
    const amountInputs = document.querySelectorAll('.non-cash-amount-input');

    selectInputs.forEach(input => input.value = 'UPI');
    descInputs.forEach(input => input.value = '');
    amountInputs.forEach(input => input.value = '');
  }

  function calculateTotalSalesValue() {
    let totalPetrol = 0;
    let totalDiesel = 0;
    let totalPower = 0;
    
    currentDuReadings.forEach(r => {
      const diff = r.closing_reading - r.opening_reading;
      const testing = r.testing_qty !== undefined ? parseFloat(r.testing_qty) : 0;
      const net = diff - testing;

      if (r.product === 'Petrol') totalPetrol += net;
      else if (r.product === 'Diesel') totalDiesel += net;
      else if (r.product === 'poWer') totalPower += net;
    });

    const petrolSalesVal = totalPetrol * (currentRates.Petrol || 0);
    const dieselSalesVal = totalDiesel * (currentRates.Diesel || 0);
    const powerSalesVal = totalPower * (currentRates.poWer || 0);

    return petrolSalesVal + dieselSalesVal + powerSalesVal;
  }

  function updateDsrCalculations() {
    const tableBody = document.getElementById('dsr-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const productsList = [
      { name: 'poWer', tankName: 'Tank 1', class: 'power' },
      { name: 'Petrol', tankName: 'Tank 2', class: 'petrol' },
      { name: 'Diesel', tankName: 'Tank 3', class: 'diesel' }
    ];

    let overallLoss = 0;
    let overallGain = 0;

    productsList.forEach(prod => {
      // 1. Calculate Nozzle Sales
      let grossNozzleSales = 0;
      let totalTesting = 0;
      let actualSale = 0;
      
      currentDuReadings.forEach(r => {
        if (r.product === prod.name) {
          const diff = r.closing_reading - r.opening_reading;
          const testing = r.testing_qty !== undefined ? parseFloat(r.testing_qty) : 0;
          grossNozzleSales += diff;
          totalTesting += testing;
        }
      });
      actualSale = grossNozzleSales - totalTesting;

      // 2. Get Tank details
      let openingStock = 0;
      let actualStock = 0;
      let decantation = currentDecantation[prod.name] || 0;

      const tank = currentTankReadings.find(t => t.product === prod.name);
      if (tank) {
        openingStock = tank.opening_stock;
        actualStock = tank.closing_stock;
      }

      const tankWiseSale = openingStock + decantation - actualStock;
      const variation = tankWiseSale - actualSale;

      if (variation > 0) {
        overallLoss += variation;
      } else {
        overallGain += Math.abs(variation);
      }

      // Variation cell text, class, and inline color styling
      let varText = variation.toFixed(2);
      let varColor = 'var(--text-muted)';
      if (variation > 0.01) {
        varText = `${variation.toFixed(2)}`; // Positive -> Shortfall -> Red
        varColor = 'var(--danger)';
      } else if (variation < -0.01) {
        varText = `${variation.toFixed(2)}`; // Negative -> Excess -> Green
        varColor = 'var(--success)';
      } else {
        varText = '0.00';
      }

      const row = document.createElement('div');
      row.className = `dsr-table-row product-${prod.class}`;
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1.2fr 1.1fr 1fr 1.1fr 1.1fr 1.1fr';
      row.style.padding = '0.6rem 0.85rem';
      row.style.alignItems = 'center';
      row.style.borderRadius = '0.5rem';

      row.innerHTML = `
        <div style="font-weight: 600; color: var(--${prod.class}-color);">${prod.tankName} (${prod.name})</div>
        <div class="text-right" style="color: var(--text-main);">${grossNozzleSales.toFixed(2)}</div>
        <div class="text-right" style="color: var(--warning);">${totalTesting.toFixed(2)}</div>
        <div class="text-right" style="color: var(--accent); font-weight: 600;">${actualSale.toFixed(2)}</div>
        <div class="text-right" style="color: var(--text-main);">${tankWiseSale.toFixed(2)}</div>
        <div class="text-right bold" style="font-size: 1.05rem; color: ${varColor};">${varText} L</div>
      `;

      tableBody.appendChild(row);
    });

    const insightsEl = document.getElementById('dsr-insights');
    if (insightsEl) {
      if (overallLoss > 0.1 && overallGain > 0.1) {
        insightsEl.innerHTML = `⚠️ <strong>DSR Stock Reconciliation Alert:</strong> There is a net physical shortfall of <strong>${overallLoss.toFixed(2)} L</strong> and a net surplus of <strong>${overallGain.toFixed(2)} L</strong> detected across products. Please check DIP readings if this is unexpected.`;
        insightsEl.style.borderColor = 'rgba(245, 158, 11, 0.2)';
        insightsEl.style.background = 'rgba(245, 158, 11, 0.03)';
        insightsEl.style.color = 'var(--warning)';
      } else if (overallLoss > 0.1) {
        insightsEl.innerHTML = `⚠️ <strong>DSR Stock Reconciliation Alert:</strong> A physical stock shortfall of <strong>${overallLoss.toFixed(2)} L</strong> was detected. This represents evaporation loss or transit/measurement variance.`;
        insightsEl.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        insightsEl.style.background = 'rgba(239, 68, 68, 0.03)';
        insightsEl.style.color = 'var(--danger)';
      } else if (overallGain > 0.1) {
        insightsEl.innerHTML = `✅ <strong>DSR Stock Reconciliation:</strong> A physical stock surplus of <strong>${overallGain.toFixed(2)} L</strong> was recorded. Stock levels are healthy.`;
        insightsEl.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        insightsEl.style.background = 'rgba(16, 185, 129, 0.03)';
        insightsEl.style.color = 'var(--success)';
      } else {
        insightsEl.innerHTML = `✅ <strong>DSR Stock Reconciliation:</strong> Stock levels reconcile perfectly with nozzle sales (variance is within acceptable limits).`;
        insightsEl.style.borderColor = 'rgba(255, 255, 255, 0.05)';
        insightsEl.style.background = 'rgba(255, 255, 255, 0.01)';
        insightsEl.style.color = 'var(--text-muted)';
      }
    }
  }

  // DSR Navigation Listeners
  if (btnDsrNext) {
    btnDsrNext.addEventListener('click', () => {
      updateCashCalculations();
      showView('cash');
    });
  }

  if (btnBackToDecantationOrTankFromDsr) {
    btnBackToDecantationOrTankFromDsr.addEventListener('click', () => {
      const hasDecantation = document.querySelector('input[name="decantation-toggle"]:checked').value === 'yes';
      if (hasDecantation) {
        showView('decantation');
      } else {
        showView('tank');
      }
    });
  }

  function updateCashCalculations() {
    const notes500 = parseInt(document.getElementById('notes-500').value, 10) || 0;
    const notes200 = parseInt(document.getElementById('notes-200').value, 10) || 0;
    const notes100 = parseInt(document.getElementById('notes-100').value, 10) || 0;
    const notes50 = parseInt(document.getElementById('notes-50').value, 10) || 0;
    const notes20 = parseInt(document.getElementById('notes-20').value, 10) || 0;
    const notes10 = parseInt(document.getElementById('notes-10').value, 10) || 0;
    
    const coins20 = parseInt(document.getElementById('coins-20').value, 10) || 0;
    const coins10 = parseInt(document.getElementById('coins-10').value, 10) || 0;
    const coins5 = parseInt(document.getElementById('coins-5').value, 10) || 0;
    const coins2 = parseInt(document.getElementById('coins-2').value, 10) || 0;
    const coins1 = parseInt(document.getElementById('coins-1').value, 10) || 0;

    // Calculate individual note amounts
    const amt500 = notes500 * 500;
    const amt200 = notes200 * 200;
    const amt100 = notes100 * 100;
    const amt50 = notes50 * 50;
    const amt20 = notes20 * 20;
    const amt10 = notes10 * 10;

    // Calculate individual coin amounts
    const amtCoins20 = coins20 * 20;
    const amtCoins10 = coins10 * 10;
    const amtCoins5 = coins5 * 5;
    const amtCoins2 = coins2 * 2;
    const amtCoins1 = coins1 * 1;

    // Update note amount displays
    document.getElementById('notes-500-amount').textContent = amt500;
    document.getElementById('notes-200-amount').textContent = amt200;
    document.getElementById('notes-100-amount').textContent = amt100;
    document.getElementById('notes-50-amount').textContent = amt50;
    document.getElementById('notes-20-amount').textContent = amt20;
    document.getElementById('notes-10-amount').textContent = amt10;

    // Update coin amount displays
    document.getElementById('coins-20-amount').textContent = amtCoins20;
    document.getElementById('coins-10-amount').textContent = amtCoins10;
    document.getElementById('coins-5-amount').textContent = amtCoins5;
    document.getElementById('coins-2-amount').textContent = amtCoins2;
    document.getElementById('coins-1-amount').textContent = amtCoins1;

    const totalCoins = amtCoins20 + amtCoins10 + amtCoins5 + amtCoins2 + amtCoins1;
    document.getElementById('coins-amount').value = totalCoins;

    const totalNotes = amt500 + amt200 + amt100 + amt50 + amt20 + amt10;
    const totalCashReceived = totalNotes + totalCoins;
    const totalSalesValue = calculateTotalSalesValue();

    document.getElementById('sales-value-display').textContent = `Rs. ${Math.round(totalSalesValue).toLocaleString()}`;
    document.getElementById('coins-value-display-summary').textContent = `Rs. ${Math.round(totalCoins).toLocaleString()}`;
    document.getElementById('cash-received-display').textContent = `Rs. ${Math.round(totalCashReceived).toLocaleString()}`;
  }

  // Bind input listeners for live cash calculations
  const cashInputs = [
    'notes-500', 'notes-200', 'notes-100', 'notes-50', 'notes-20', 'notes-10',
    'coins-20', 'coins-10', 'coins-5', 'coins-2', 'coins-1'
  ];
  cashInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateCashCalculations);
    }
  });

  // Back button from Cash page logic
  if (btnBackToDecantationOrTank) {
    btnBackToDecantationOrTank.addEventListener('click', () => {
      showView('dsr');
    });
  }

  // Cash reconciliation form submit handler (transitions to new Other Payments page)
  if (cashForm) {
    cashForm.addEventListener('submit', (e) => {
      e.preventDefault();
      showView('other');
    });
  }

  function updateOtherPaymentsCalculations() {
    const totalSalesValue = calculateTotalSalesValue();
    
    // Notes and coins received
    const notes500 = parseInt(document.getElementById('notes-500').value, 10) || 0;
    const notes200 = parseInt(document.getElementById('notes-200').value, 10) || 0;
    const notes100 = parseInt(document.getElementById('notes-100').value, 10) || 0;
    const notes50 = parseInt(document.getElementById('notes-50').value, 10) || 0;
    const notes20 = parseInt(document.getElementById('notes-20').value, 10) || 0;
    const notes10 = parseInt(document.getElementById('notes-10').value, 10) || 0;
    const coins20 = parseInt(document.getElementById('coins-20').value, 10) || 0;
    const coins10 = parseInt(document.getElementById('coins-10').value, 10) || 0;
    const coins5 = parseInt(document.getElementById('coins-5').value, 10) || 0;
    const coins2 = parseInt(document.getElementById('coins-2').value, 10) || 0;
    const coins1 = parseInt(document.getElementById('coins-1').value, 10) || 0;
    
    const totalCoins = (coins20 * 20) + (coins10 * 10) + (coins5 * 5) + (coins2 * 2) + (coins1 * 1);
    const totalNotes = (notes500 * 500) + (notes200 * 200) + (notes100 * 100) + (notes50 * 50) + (notes20 * 20) + (notes10 * 10);
    const totalCashReceived = totalNotes + totalCoins;

    // Sum of non-cash payments from table rows
    let totalNonCash = 0;
    const amountInputs = document.querySelectorAll('.non-cash-amount-input');
    amountInputs.forEach(input => {
      const val = parseFloat(input.value) || 0;
      totalNonCash += val;
    });

    const totalSettled = totalCashReceived + totalNonCash;
    const shortfall = totalSalesValue - totalSettled;

    // Update displays
    document.getElementById('other-sales-display').textContent = `Rs. ${Math.round(totalSalesValue).toLocaleString()}`;
    document.getElementById('other-cash-display').textContent = `Rs. ${Math.round(totalCashReceived).toLocaleString()}`;
    document.getElementById('other-noncash-display').textContent = `Rs. ${Math.round(totalNonCash).toLocaleString()}`;
    document.getElementById('other-total-settled-display').textContent = `Rs. ${Math.round(totalSettled).toLocaleString()}`;

    const shortfallValEl = document.getElementById('net-shortfall-display-val');
    const shortfallLblEl = document.getElementById('net-shortfall-lbl');
    const shortfallContainer = document.querySelector('.net-shortfall-container');

    shortfallValEl.textContent = `Rs. ${Math.round(Math.abs(shortfall)).toLocaleString()}`;

    if (shortfall > 0) {
      shortfallLblEl.textContent = 'Shortfall / Deficit';
      shortfallValEl.style.color = 'var(--danger)';
      shortfallContainer.style.background = 'rgba(239, 68, 68, 0.05)';
      shortfallContainer.style.borderColor = 'rgba(239, 68, 68, 0.15)';
    } else if (shortfall < 0) {
      shortfallLblEl.textContent = 'Surplus / Excess';
      shortfallValEl.style.color = 'var(--success)';
      shortfallContainer.style.background = 'rgba(16, 185, 129, 0.05)';
      shortfallContainer.style.borderColor = 'rgba(16, 185, 129, 0.15)';
    } else {
      shortfallLblEl.textContent = 'Balanced';
      shortfallValEl.style.color = 'var(--text-muted)';
      shortfallContainer.style.background = 'rgba(255, 255, 255, 0.02)';
      shortfallContainer.style.borderColor = 'rgba(255, 255, 255, 0.05)';
    }
  }

  // Bind live calculations on non-cash inputs
  document.addEventListener('input', (e) => {
    if (e.target && e.target.classList.contains('non-cash-amount-input')) {
      updateOtherPaymentsCalculations();
    }
  });

  const btnBackToCash = document.getElementById('btn-back-to-cash');
  if (btnBackToCash) {
    btnBackToCash.addEventListener('click', () => {
      showView('cash');
    });
  }

  const otherPaymentsForm = document.getElementById('other-payments-form');
  if (otherPaymentsForm) {
    otherPaymentsForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (isDayClosed) {
        // Already closed: show the existing summary (read-only review)
        showFinishSummary(dateInput.value, currentDuReadings, currentTankReadings);
        showView('finish');
        return;
      }

      // Show preview — no API call yet, user must confirm
      showPreviewSummary(dateInput.value, currentDuReadings, currentTankReadings);
      showView('preview');
    });
  }

  // Preview: Back to Edit — returns to Step 7 (UPI & Credit) with data intact
  const btnPreviewBack = document.getElementById('btn-preview-back');
  if (btnPreviewBack) {
    btnPreviewBack.addEventListener('click', () => {
      showView('other');
    });
  }

  // Preview: Confirm & Close Day — actual API call
  const btnPreviewConfirm = document.getElementById('btn-preview-confirm');
  if (btnPreviewConfirm) {
    btnPreviewConfirm.addEventListener('click', async () => {
      await confirmAndCloseDay();
    });
  }

  // Simple custom toast function
  function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.alert-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `alert-toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : '✗'}</span>
      <span class="toast-message">${message}</span>
    `;

    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }

  // Set default date logic based on latest saved entry in database
  async function initializeDefaultDate() {
    await fetchActiveDate();
    
    // Enforce minimum date as May 1, 2026
    if (activeDate < '2026-05-01') {
      activeDate = '2026-05-01';
    }
    
    dateInput.value = activeDate;
    dateInput.max = activeDate;
    dateInput.min = '2026-05-01';

    const formattedDisplay = document.getElementById('formatted-date-display');
    if (formattedDisplay) {
      formattedDisplay.textContent = formatDate(activeDate);
    }

    isDayClosed = false;
    // Now load opening readings/stocks/rates/cash for the selected date
    await fetchOpeningReadings(dateInput.value);
    await fetchOpeningTankStocks(dateInput.value);
    await fetchOpeningRates(dateInput.value);
    await fetchOpeningCash(dateInput.value);

    if (typeof window.updateTankerCalculator === 'function') {
      window.updateTankerCalculator(true);
    }
  }

  // --- Cash Calculator Logic ---
  const cashCalcForm = document.getElementById('cash-calc-form');
  if (cashCalcForm) {
    const calcInputs = cashCalcForm.querySelectorAll('.calc-input');
    const grandTotalEl = document.getElementById('calc-grand-total');
    const wordsEngEl = document.getElementById('calc-words-eng');
    const wordsMarEl = document.getElementById('calc-words-mar');

    const marathi1to99 = [
      '', 'एक', 'दोन', 'तीन', 'चार', 'पाच', 'सहा', 'सात', 'आठ', 'नऊ', 'दहा',
      'अकरा', 'बारा', 'तेरा', 'चौदा', 'पंधरा', 'सोळा', 'सतरा', 'अठरा', 'एकोणीस', 'वीस',
      'एकवीस', 'बावीस', 'तेवीस', 'चोवीस', 'पंचवीस', 'सव्वीस', 'सत्तावीस', 'अठ्ठावीस', 'एकोणतीस', 'तीस',
      'एकतीस', 'बत्तीस', 'तेहतीस', 'चौतीस', 'पस्तीस', 'छत्तीस', 'सदतीस', 'अडतीस', 'एकोणचाळीस', 'चाळीस',
      'एकेचाळीस', 'बेचाळीस', 'त्रेचाळीस', 'चव्वेचाळीस', 'पंचेचाळीस', 'शेहेचाळीस', 'सत्तेचाळीस', 'अठ्ठेचाळीस', 'एकोणपन्नास', 'पन्नास',
      'एकावन्न', 'बावन्न', 'त्रेपन्न', 'चोपन्न', 'पंचावन्न', 'छप्पन्न', 'सत्तावन्न', 'अठ्ठावन्न', 'एकोणसाठ', 'साठ',
      'एकसष्ट', 'बासष्ट', 'त्रेसष्ट', 'चौसष्ट', 'पासष्ट', 'सहासष्ट', 'सदुसष्ट', 'अडुसष्ट', 'एकोणसत्तर', 'सत्तर',
      'एकाहत्तर', 'बाहत्तर', 'त्र्याहत्तर', 'चौहत्तर', 'पंच्याहत्तर', 'शहात्तर', 'सत्त्याहत्तर', 'अठ्ठ्याहत्तर', 'एकोणऐंशी', 'ऐंशी',
      'एक्क्याऐंशी', 'ब्याऐंशी', 'त्र्याऐंशी', 'चौऱ्याऐंशी', 'पंच्याऐंशी', 'शहाऐंशी', 'सत्त्याऐंशी', 'अठ्ठ्याऐंशी', 'एकोणनव्वद', 'नव्वद',
      'एक्क्याण्णव', 'ब्याण्णव', 'त्र्याण्णव', 'चौऱ्याण्णव', 'पंच्याण्णव', 'शहाण्णव', 'सत्त्याण्णव', 'अठ्ठ्याण्णव', 'नव्व्याण्णव'
    ];

    function numberToWordsEnglish(num) {
      if (num === 0) return 'Zero Rupees Only';
      const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
      const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      function inWords(n) {
          if ((n = n.toString()).length > 9) return 'Amount too large';
          n = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
          if (!n) return ''; var str = '';
          str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
          str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
          str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
          str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
          str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
          return str.trim() + ' Rupees Only';
      }
      return inWords(num);
    }

    function numberToWordsMarathi(num) {
      if (num === 0) return 'शून्य रुपये फक्त';
      function inWords(n) {
          if ((n = n.toString()).length > 9) return 'रक्कम खूप मोठी आहे';
          n = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
          if (!n) return ''; var str = '';
          str += (n[1] != 0) ? marathi1to99[Number(n[1])] + ' कोटी ' : '';
          str += (n[2] != 0) ? marathi1to99[Number(n[2])] + ' लाख ' : '';
          str += (n[3] != 0) ? marathi1to99[Number(n[3])] + ' हजार ' : '';
          str += (n[4] != 0) ? marathi1to99[Number(n[4])] + 'शे ' : '';
          if (n[4] == 1) str = str.replace('एकशे ', 'शंभर ');
          str += (n[5] != 0) ? marathi1to99[Number(n[5])] + ' ' : '';
          return str.trim() + ' रुपये फक्त';
      }
      return inWords(num);
    }

    function updateCashCalculator() {
      let grandTotal = 0;
      calcInputs.forEach(input => {
        const val = parseInt(input.getAttribute('data-val'), 10);
        const count = parseInt(input.value, 10) || 0;
        const total = val === 1 ? count : val * count;
        grandTotal += total;
        
        if (val !== 1) {
          const totalEl = document.getElementById(`calc-total-${val}`);
          if (totalEl) totalEl.textContent = `₹ ${total}`;
        }
      });

      grandTotalEl.textContent = `₹ ${grandTotal}`;
      wordsEngEl.textContent = numberToWordsEnglish(grandTotal);
      wordsMarEl.textContent = numberToWordsMarathi(grandTotal);
    }

    calcInputs.forEach(input => {
      input.addEventListener('input', updateCashCalculator);
    });

    // --- Pre-fill from last closed day when navigating to Cash Calculator ---
    const navCashCalc = document.getElementById('nav-cash-calc');
    if (navCashCalc) {
      navCashCalc.addEventListener('click', async () => {
        try {
          const resp = await fetch('/api/cash/last');
          const data = await resp.json();
          if (data.cash) {
            const c = data.cash;
            // Pre-fill note counts from last closed day
            const set = (id, val) => {
              const el = document.getElementById(id);
              if (el) el.value = val !== undefined && val !== null ? val : 0;
            };
            set('calc-count-500', c.notes_500);
            set('calc-count-200', c.notes_200);
            set('calc-count-100', c.notes_100);
            set('calc-count-50',  c.notes_50);
            set('calc-count-20',  c.notes_20);
            // ₹10 notes are NOT deposited to the bank — always zero
            set('calc-count-10', 0);
          } else {
            // No data — ensure inputs explicitly show 0
            ['calc-count-500','calc-count-200','calc-count-100','calc-count-50','calc-count-20','calc-count-10'].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.value = 0;
            });
          }
          // Recalculate totals after prefill (fixes the "zeros shown but amounts don't match" bug)
          updateCashCalculator();
        } catch (err) {
          console.warn('Could not prefill cash calculator:', err);
          updateCashCalculator();
        }
        // Set deposit date to today
        const bankDateEl = document.getElementById('bank-detail-date');
        if (bankDateEl && !bankDateEl.value) {
          bankDateEl.value = new Date().toISOString().split('T')[0];
        }
      });
    }

    // --- Reset Button ---
    const btnReset = document.getElementById('btn-cash-calc-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        ['calc-count-500','calc-count-200','calc-count-100','calc-count-50','calc-count-20','calc-count-10'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = 0;
        });
        updateCashCalculator();
        // Focus ₹500 input
        const firstInput = document.getElementById('calc-count-500');
        if (firstInput) { firstInput.focus(); firstInput.select(); }
        showToast('All denomination counts reset to zero.', 'success');
      });
    }

    // --- Bank Details: Load from localStorage ---
    const bankFields = ['bank-detail-name','bank-detail-branch','bank-detail-account','bank-detail-ifsc','bank-detail-holder'];
    bankFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const saved = localStorage.getItem('erp-' + id);
        if (saved) el.value = saved;
        el.addEventListener('input', () => {
          localStorage.setItem('erp-' + id, el.value);
        });
      }
    });

    // Set deposit date to today on first load
    const bankDateElInit = document.getElementById('bank-detail-date');
    if (bankDateElInit && !bankDateElInit.value) {
      bankDateElInit.value = new Date().toISOString().split('T')[0];
    }

    // Run initial calculation to ensure totals match inputs on page load
    updateCashCalculator();
  }
  // --- End Cash Calculator Logic ---

  // --- Tanker Calculator Logic ---
  const tankerCalcForm = document.getElementById('tanker-calc-form');
  if (tankerCalcForm) {
    const tankerInputs = tankerCalcForm.querySelectorAll('.calc-input-tanker');
    const tankerRspInputs = tankerCalcForm.querySelectorAll('.calc-input-tanker-rsp');

    window.updateTankerCalculator = function(initRates = false) {
      const commissions = { poWer: 3.30, Petrol: 3.30, Diesel: 2.00 };
      let grandTotal = 0;

      ['poWer', 'Petrol', 'Diesel'].forEach(prod => {
        const idSuffix = prod.toLowerCase();
        const reqInput = document.getElementById(`tanker-req-${idSuffix}`);
        const rspInput = document.getElementById(`tanker-rsp-${idSuffix}`);
        const billSpan = document.getElementById(`tanker-bill-${idSuffix}`);
        const amtDiv = document.getElementById(`tanker-amt-${idSuffix}`);

        if (reqInput && rspInput && billSpan && amtDiv) {
          if (initRates && currentRates[prod] !== undefined) {
            rspInput.value = currentRates[prod].toFixed(2);
          }
          
          const rsp = parseFloat(rspInput.value) || 0;
          const comm = commissions[prod];
          const billRate = Math.max(0, rsp - comm);
          
          billSpan.textContent = billRate.toFixed(2);

          const reqQty = parseFloat(reqInput.value) || 0;
          const amount = reqQty * billRate;
          amtDiv.textContent = `₹ ${amount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

          grandTotal += amount;
        }
      });

      const hpclInput = document.getElementById('tanker-hpcl-balance');
      const hpclBalance = hpclInput ? (parseFloat(hpclInput.value) || 0) : 0;
      grandTotal = Math.max(0, grandTotal - hpclBalance);

      const grandTotalDiv = document.getElementById('tanker-grand-total');
      if (grandTotalDiv) {
        grandTotalDiv.textContent = `₹ ${grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      }
    };

    tankerInputs.forEach(input => {
      input.addEventListener('input', () => window.updateTankerCalculator(false));
    });

    tankerRspInputs.forEach(input => {
      input.addEventListener('input', () => window.updateTankerCalculator(false));
    });

    const navTankerCalc = document.getElementById('nav-tanker-calc');
    if (navTankerCalc) {
      navTankerCalc.addEventListener('click', () => {
        // If they are empty, initialize them
        const firstRsp = document.getElementById('tanker-rsp-power');
        if (firstRsp && !firstRsp.value) {
          window.updateTankerCalculator(true);
        } else {
          window.updateTankerCalculator(false);
        }
      });
    }
  }
  // --- End Tanker Calculator Logic ---

  // Global Enter key navigation for textboxes
  document.addEventListener('keydown', (e) => {
    // If we are on the Nozzle Testing view, allow Enter key to submit and move to the next page immediately
    const testingView = document.getElementById('view-nozzle-testing');
    if (testingView && testingView.style.display === 'block') {
      if (e.key === 'Enter') {
        // Respect standard button clicks or link clicks if they are focused
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') {
          return;
        }
        e.preventDefault();
        const nextBtn = document.getElementById('btn-testing-next');
        if (nextBtn) {
          nextBtn.click();
        }
        return;
      }
    }

    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'button' && e.target.type !== 'submit') {
      const input = e.target;
      const form = input.form;
      if (!form) return;

      // Find all inputs in the current form that are editable, visible, and not buttons or radio groups
      const inputs = Array.from(form.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="radio"]):not(.calc-input-tanker-rsp)'))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return el.disabled === false && style.display !== 'none' && style.visibility !== 'hidden';
        });

      const index = inputs.indexOf(input);
      if (index > -1) {
        if (index < inputs.length - 1) {
          // Prevent default form submission
          e.preventDefault();
          // Move focus to next input field and select its content for easy overwrite
          inputs[index + 1].focus();
          if (typeof inputs[index + 1].select === 'function') {
            inputs[index + 1].select();
          }
        } else {
          // Allow default form submission on the last field
        }
      }
    }
  });

  // ----------------------------------------------------
  // GST R1 & 3B DATA REPORT PAGE
  // ----------------------------------------------------
  const navGst = document.getElementById('nav-gst');
  const gstMonthSelect = document.getElementById('gst-month-select');
  const gstTableBody = document.getElementById('gst-table-body');
  const gstTableFooter = document.getElementById('gst-table-footer');
  
  let currentGstReportData = [];

  if (navGst) {
    navGst.addEventListener('click', (e) => {
      e.preventDefault();
      showView('gst');
      initializeGstMonthSelector();
      if (gstMonthSelect) {
        loadGstReport(gstMonthSelect.value);
      }
    });
  }

  function initializeGstMonthSelector() {
    if (!gstMonthSelect) return;
    
    // Check if selector is already populated
    if (gstMonthSelect.children.length > 0) return;

    // We will generate the months starting from May 2026 (project start) up to 6 months in the future from the active date
    const startYear = 2026;
    const startMonth = 4; // May (0-indexed is April)
    
    const activeDateObj = new Date(activeDate + 'T00:00:00');
    const endYear = activeDateObj.getFullYear();
    const endMonth = activeDateObj.getMonth();

    gstMonthSelect.innerHTML = '';

    let curYear = endYear;
    let curMonth = endMonth;

    while (curYear > startYear || (curYear === startYear && curMonth >= startMonth)) {
      const monthVal = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const label = `${months[curMonth]} ${curYear}`;
      
      const opt = document.createElement('option');
      opt.value = monthVal;
      opt.textContent = label;
      gstMonthSelect.appendChild(opt);

      curMonth--;
      if (curMonth < 0) {
        curMonth = 11;
        curYear--;
      }
    }
  }

  if (gstMonthSelect) {
    gstMonthSelect.addEventListener('change', () => {
      loadGstReport(gstMonthSelect.value);
    });
  }

  async function loadGstReport(month) {
    if (!gstTableBody) return;
    
    gstTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading monthly report...</td></tr>`;
    if (gstTableFooter) gstTableFooter.innerHTML = '';

    try {
      const response = await fetch(`/api/gst-report?month=${month}`);
      if (!response.ok) {
        throw new Error('Failed to load GST report');
      }
      
      const data = await response.json();
      currentGstReportData = data;
      renderGstTable(data);
    } catch (err) {
      console.error('Error loading GST report:', err);
      showToast('Error loading GST report.', 'error');
      gstTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load data.</td></tr>`;
    }
  }

  function renderGstTable(data) {
    if (!gstTableBody) return;
    gstTableBody.innerHTML = '';

    if (data.length === 0) {
      gstTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted); font-size: 1rem;">No sales data available for this month.</td></tr>`;
      return;
    }

    let totalPetrolQty = 0;
    let totalDieselQty = 0;
    let totalPowerQty = 0;
    let totalLineSales = 0;

    data.forEach(row => {
      totalPetrolQty += row.petrol_qty;
      totalDieselQty += row.diesel_qty;
      totalPowerQty += row.power_qty;

      const lineTotal = (row.power_qty * row.rate_power) + (row.petrol_qty * row.rate_petrol) + (row.diesel_qty * row.rate_diesel);
      totalLineSales += lineTotal;

      // Create row element
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
      tr.className = 'gst-row-hover';
      
      tr.innerHTML = `
        <td style="padding: 0.25rem 0.6rem; font-weight: 600;">${formatDate(row.date)}</td>
        
        <!-- poWer first -->
        <td style="padding: 0.25rem 0.35rem; text-align: right; border-left: 1px solid rgba(255,255,255,0.03); font-weight: 600; color: var(--power-color);">${row.power_qty > 0 ? row.power_qty.toFixed(2) : '-'}</td>
        <td style="padding: 0.25rem 0.35rem; text-align: right; color: var(--text-muted);">${row.power_qty > 0 ? '\u20b9' + row.rate_power.toFixed(2) : '-'}</td>
        
        <!-- Petrol -->
        <td style="padding: 0.25rem 0.35rem; text-align: right; border-left: 1px solid rgba(255,255,255,0.03); font-weight: 600; color: var(--success);">${row.petrol_qty > 0 ? row.petrol_qty.toFixed(2) : '-'}</td>
        <td style="padding: 0.25rem 0.35rem; text-align: right; color: var(--text-muted);">${row.petrol_qty > 0 ? '\u20b9' + row.rate_petrol.toFixed(2) : '-'}</td>
        
        <!-- Diesel -->
        <td style="padding: 0.25rem 0.35rem; text-align: right; border-left: 1px solid rgba(255,255,255,0.03); font-weight: 600; color: var(--diesel-color);">${row.diesel_qty > 0 ? row.diesel_qty.toFixed(2) : '-'}</td>
        <td style="padding: 0.25rem 0.35rem; text-align: right; color: var(--text-muted);">${row.diesel_qty > 0 ? '\u20b9' + row.rate_diesel.toFixed(2) : '-'}</td>
        
        <!-- Line Total -->
        <td style="padding: 0.25rem 0.5rem; text-align: right; border-left: 2px solid rgba(255,255,255,0.07); font-weight: 700; color: var(--accent); font-family: monospace;">\u20b9${lineTotal.toFixed(2)}</td>
      `;

      gstTableBody.appendChild(tr);
    });

    // Render footer totals row
    if (gstTableFooter) {
      gstTableFooter.innerHTML = `
        <td style="padding: 0.35rem 0.6rem;">TOTAL</td>
        
        <!-- poWer totals first -->
        <td style="padding: 0.35rem 0.35rem; text-align: right; border-left: 1px solid rgba(255,255,255,0.05); color: var(--power-color); font-weight: 700;">${totalPowerQty.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.35rem; text-align: right;"></td>
        
        <!-- Petrol totals -->
        <td style="padding: 0.35rem 0.35rem; text-align: right; border-left: 1px solid rgba(255,255,255,0.05); color: var(--petrol-color); font-weight: 700;">${totalPetrolQty.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.35rem; text-align: right;"></td>
        
        <!-- Diesel totals -->
        <td style="padding: 0.35rem 0.35rem; text-align: right; border-left: 1px solid rgba(255,255,255,0.05); color: var(--diesel-color); font-weight: 700;">${totalDieselQty.toFixed(2)}</td>
        <td style="padding: 0.35rem 0.35rem; text-align: right;"></td>
        
        <!-- Grand Line Total -->
        <td style="padding: 0.35rem 0.5rem; text-align: right; border-left: 2px solid rgba(255,255,255,0.1); color: var(--accent); font-weight: 800; font-family: monospace; font-size: 0.85rem;">\u20b9${totalLineSales.toFixed(2)}</td>
      `;
    }
  }

  // Helper to generate and download CSV file from UI data
  const btnDownloadCSV = document.getElementById('btn-gst-download-csv');
  if (btnDownloadCSV) {
    btnDownloadCSV.addEventListener('click', () => {
      if (currentGstReportData.length === 0) {
        showToast('No data available to download.', 'warning');
        return;
      }

      let csv = 'Date,poWer Qty (L),poWer Rate (Rs/L),Petrol Qty (L),Petrol Rate (Rs/L),Diesel Qty (L),Diesel Rate (Rs/L),Line Total (Rs)\n';
      
      let totalPetrolQty = 0;
      let totalDieselQty = 0;
      let totalPowerQty = 0;
      let totalLineSales = 0;

      currentGstReportData.forEach(row => {
        const lineTotal = (row.power_qty * row.rate_power) + (row.petrol_qty * row.rate_petrol) + (row.diesel_qty * row.rate_diesel);
        totalLineSales += lineTotal;
        csv += `"${row.date}","${row.power_qty.toFixed(2)}","${row.rate_power.toFixed(2)}","${row.petrol_qty.toFixed(2)}","${row.rate_petrol.toFixed(2)}","${row.diesel_qty.toFixed(2)}","${row.rate_diesel.toFixed(2)}","${lineTotal.toFixed(2)}"\n`;
        totalPetrolQty += row.petrol_qty;
        totalDieselQty += row.diesel_qty;
        totalPowerQty += row.power_qty;
      });

      csv += `"TOTAL","${totalPowerQty.toFixed(2)}","","${totalPetrolQty.toFixed(2)}","","${totalDieselQty.toFixed(2)}","","${totalLineSales.toFixed(2)}"\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `GST_Report_${gstMonthSelect.value}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('CSV downloaded successfully!', 'success');
    });
  }

  // Helper to trigger browser print dialog
  const btnPrint = document.getElementById('btn-gst-print');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // Helper to trigger manual WhatsApp report send
  const btnWhatsApp = document.getElementById('btn-gst-whatsapp');
  if (btnWhatsApp) {
    btnWhatsApp.addEventListener('click', async () => {
      if (currentGstReportData.length === 0) {
        showToast('No data available to send.', 'warning');
        return;
      }

      const selectedMonth = gstMonthSelect.value;
      
      // Calculate totals for the message summary
      let totalPetrolQty = 0, totalPetrolAmt = 0;
      let totalDieselQty = 0, totalDieselAmt = 0;
      let totalPowerQty = 0, totalPowerAmt = 0;
      let grandTotalSales = 0;
      currentGstReportData.forEach(row => {
        totalPetrolQty += row.petrol_qty;
        totalPetrolAmt += row.petrol_amt;
        totalDieselQty += row.diesel_qty;
        totalDieselAmt += row.diesel_amt;
        totalPowerQty += row.power_qty;
        totalPowerAmt += row.power_amt;
        grandTotalSales += row.total_sales;
      });

      showToast('Generating and sending WhatsApp report...', 'success');

      try {
        // Trigger server-side WhatsApp send
        const response = await fetch('/api/send-gst-whatsapp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ month: selectedMonth }),
        });

        const result = await response.json();
        
        if (response.ok) {
          showToast('WhatsApp report sent successfully!', 'success');
        } else {
          throw new Error(result.error || 'Backend failed to send WhatsApp');
        }
      } catch (err) {
        console.error('Server WhatsApp send error:', err);
        showToast('WhatsApp backend request failed. Launching manual fallback...', 'warning');
      }

      // Open client-side WhatsApp fallback link in a new tab
      const summaryMsg = `*PumpERP GST R1 %26 3B Report - ${selectedMonth}*\n\n` + 
        `⛽ *Petrol:* ${totalPetrolQty.toFixed(2)} L\n` +
        `⛽ *Diesel:* ${totalDieselQty.toFixed(2)} L\n` +
        `⛽ *poWer:* ${totalPowerQty.toFixed(2)} L`;

      const whatsappURL = `https://wa.me/919970889360?text=${encodeURIComponent(summaryMsg)}`;
      window.open(whatsappURL, '_blank');
    });
  }

  // HPCL Portal Balance Tracker UI Logic
  const hpclCurrentBalanceEl = document.getElementById('hpcl-current-balance');
  const hpclOpeningBalanceEl = document.getElementById('hpcl-opening-balance');
  const hpclTotalCreditsEl = document.getElementById('hpcl-total-credits');
  const hpclTotalDebitsEl = document.getElementById('hpcl-total-debits');
  const hpclTableBody = document.getElementById('hpcl-table-body');
  
  const hpclCreditForm = document.getElementById('hpcl-credit-form');
  const hpclDebitForm = document.getElementById('hpcl-debit-form');
  
  const hpclModal = document.getElementById('hpcl-modal');
  const btnHpclEditOpening = document.getElementById('btn-hpcl-edit-opening');
  const btnHpclModalCancel = document.getElementById('btn-hpcl-modal-cancel');
  const btnHpclModalSave = document.getElementById('btn-hpcl-modal-save');
  const hpclNewOpeningBalanceInput = document.getElementById('hpcl-new-opening-balance');
  
  const navHpclTracker = document.getElementById('nav-hpcl-tracker');
  if (navHpclTracker) {
    navHpclTracker.addEventListener('click', (e) => {
      e.preventDefault();
      showView('hpcl');
      loadHpclData();
    });
  }
  
  async function loadHpclData() {
    // Set default dates to the current system active date
    const creditDateInput = document.getElementById('hpcl-credit-date');
    const debitDateInput = document.getElementById('hpcl-debit-date');
    if (creditDateInput) creditDateInput.value = activeDate;
    if (debitDateInput) debitDateInput.value = activeDate;
    
    await Promise.all([
      fetchHpclSummary(),
      fetchHpclTransactions()
    ]);
  }
  
  async function fetchHpclSummary() {
    try {
      const response = await fetch('/api/hpcl/summary');
      if (!response.ok) throw new Error('Failed to load HPCL summary');
      const data = await response.json();
      
      if (hpclCurrentBalanceEl) hpclCurrentBalanceEl.textContent = `₹ ${data.current_balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (hpclOpeningBalanceEl) hpclOpeningBalanceEl.textContent = `₹ ${data.opening_balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (hpclTotalCreditsEl) hpclTotalCreditsEl.textContent = `₹ ${data.total_credits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (hpclTotalDebitsEl) hpclTotalDebitsEl.textContent = `₹ ${data.total_debits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      
      if (hpclNewOpeningBalanceInput) hpclNewOpeningBalanceInput.value = data.opening_balance.toFixed(2);
    } catch (err) {
      console.error('Error fetching HPCL summary:', err);
      showToast('Error loading HPCL summary.', 'error');
    }
  }
  
  async function fetchHpclTransactions() {
    if (!hpclTableBody) return;
    hpclTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading transactions...</td></tr>`;
    
    try {
      const response = await fetch('/api/hpcl/transactions?limit=15');
      if (!response.ok) throw new Error('Failed to load HPCL transactions');
      const data = await response.json();
      
      hpclTableBody.innerHTML = '';
      if (data.length === 0) {
        hpclTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">No transactions recorded yet.</td></tr>`;
        return;
      }
      
      data.forEach(tx => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        tr.className = 'gst-row-hover'; // Reuse hover effect class
        
        const isCredit = tx.type === 'CREDIT';
        const typeBadge = `<span style="padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.7rem; font-weight: 700; background: ${isCredit ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${isCredit ? 'var(--success)' : 'var(--danger)'}; border: 1px solid ${isCredit ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'};">${tx.type}</span>`;
        const amountText = `<span style="font-weight: 700; color: ${isCredit ? 'var(--success)' : 'var(--danger)'};">${isCredit ? '+' : '-'} ₹ ${tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
        
        tr.innerHTML = `
          <td style="padding: 0.4rem 0.75rem; font-weight: 600;">${formatDate(tx.date)}</td>
          <td style="padding: 0.4rem 0.5rem;">${tx.description}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${typeBadge}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: right;">${amountText}</td>
          <td style="padding: 0.4rem 0.75rem; text-align: right; font-weight: 700;">₹ ${tx.running_balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">
            <button class="btn btn-secondary btn-delete-hpcl" data-id="${tx.id}" style="padding: 0.15rem 0.4rem; font-size: 0.65rem; min-height: auto; width: auto; color: var(--danger); border-color: rgba(239, 68, 68, 0.2); margin: 0; line-height: 1;">
              Void 🗑️
            </button>
          </td>
        `;
        hpclTableBody.appendChild(tr);
      });
      
      // Bind delete events
      document.querySelectorAll('.btn-delete-hpcl').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = btn.getAttribute('data-id');
          try {
            const res = await fetch(`/api/hpcl/transaction/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete transaction');
            showToast('Transaction voided successfully.', 'success');
            loadHpclData();
          } catch (err) {
            console.error('Error deleting transaction:', err);
            showToast('Error voiding transaction.', 'error');
          }
        });
      });
      
    } catch (err) {
      console.error('Error fetching HPCL transactions:', err);
      hpclTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load transactions.</td></tr>`;
    }
  }
  
  // Submit handlers for credit and debit forms
  if (hpclCreditForm) {
    hpclCreditForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('hpcl-credit-date').value;
      const description = document.getElementById('hpcl-credit-desc').value;
      const amount = parseFloat(document.getElementById('hpcl-credit-amount').value);
      
      try {
        const response = await fetch('/api/hpcl/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, description, type: 'CREDIT', amount })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to record credit');
        }
        
        showToast('Credit recorded successfully!', 'success');
        hpclCreditForm.reset();
        loadHpclData();
      } catch (err) {
        console.error('Error saving credit:', err);
        showToast(err.message, 'error');
      }
    });
  }
  
  if (hpclDebitForm) {
    hpclDebitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('hpcl-debit-date').value;
      const description = document.getElementById('hpcl-debit-desc').value;
      const amount = parseFloat(document.getElementById('hpcl-debit-amount').value);
      
      try {
        const response = await fetch('/api/hpcl/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, description, type: 'DEBIT', amount })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to record debit');
        }
        
        showToast('Debit recorded successfully!', 'success');
        hpclDebitForm.reset();
        loadHpclData();
      } catch (err) {
        console.error('Error saving debit:', err);
        showToast(err.message, 'error');
      }
    });
  }
  
  // Opening Balance Modal handlers
  if (btnHpclEditOpening) {
    btnHpclEditOpening.addEventListener('click', () => {
      if (hpclModal) {
        hpclModal.style.display = 'flex';
        // Prefill modal input
        fetch('/api/hpcl/summary')
          .then(res => res.json())
          .then(data => {
            if (hpclNewOpeningBalanceInput) hpclNewOpeningBalanceInput.value = data.opening_balance;
          });
      }
    });
  }
  
  if (btnHpclModalCancel) {
    btnHpclModalCancel.addEventListener('click', () => {
      if (hpclModal) hpclModal.style.display = 'none';
    });
  }
  
  if (btnHpclModalSave) {
    btnHpclModalSave.addEventListener('click', async () => {
      const opening_balance = parseFloat(hpclNewOpeningBalanceInput.value);
      if (isNaN(opening_balance)) {
        showToast('Please enter a valid amount.', 'warning');
        return;
      }
      
      try {
        const response = await fetch('/api/hpcl/opening-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opening_balance })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to save opening balance');
        }
        
        showToast('Opening balance updated successfully!', 'success');
        if (hpclModal) hpclModal.style.display = 'none';
        loadHpclData();
      } catch (err) {
        console.error('Error updating opening balance:', err);
        showToast(err.message, 'error');
      }
    });
  }

  // Initial load
  initializeDefaultDate();
});
