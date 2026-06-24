document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('readings-form');
  const dateInput = document.getElementById('reading-date');

  // If page is loaded with #finish hash, clean it up so we start fresh
  if (window.location.hash === '#finish') {
    window.history.replaceState(null, '', window.location.pathname);
  }

  // Detect browser back/forward buttons when on the finish step and trigger reload
  window.addEventListener('popstate', (event) => {
    if (document.body.getAttribute('data-active-view') === 'finish') {
      window.location.reload();
    }
  });

  // Global active date and closed state
  let activeDate = '2026-06-01';
  let isDayClosed = false;

  let globalDebtorsList = [];
  async function fetchGlobalDebtorsList() {
    try {
      const res = await fetch('/api/debtors');
      if (res.ok) {
        globalDebtorsList = await res.json();
      }
    } catch (err) {
      console.error('Failed to fetch global debtors:', err);
    }
  }

  function populateRowDebtorSelect(select) {
    const currentVal = select.value;
    select.innerHTML = '<option value="">— Select Debtor —</option>';
    globalDebtorsList.forEach(d => {
      if (d.is_active === 1) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.debtor_name;
        select.appendChild(opt);
      }
    });
    select.value = currentVal;
  }

  let globalEmployeesList = [];
  async function fetchGlobalEmployeesList() {
    try {
      const res = await fetch('/api/employees');
      if (res.ok) {
        const data = await res.json();
        globalEmployeesList = data.employees || [];
      }
    } catch (err) {
      console.error('Failed to fetch global employees:', err);
    }
  }

  function populateRowEmployeeSelect(select) {
    const currentVal = select.value;
    select.innerHTML = '<option value="">— Select Employee —</option>';
    globalEmployeesList.forEach(e => {
      if (e.is_active === 1) {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name;
        select.appendChild(opt);
      }
    });
    select.value = currentVal;
  }

  // Dynamic row generation for non-cash payments
  function adjustNonCashRows(targetCount) {
    const container = document.getElementById('other-payments-rows');
    if (!container) return;
    
    const currentRows = container.querySelectorAll('tr');
    const currentCount = currentRows.length;
    
    if (currentCount < targetCount) {
      for (let i = currentCount; i < targetCount; i++) {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--panel-border)';
        row.innerHTML = `
          <td style="padding: 0.5rem; text-align: center; color: var(--text-muted); font-weight: 600; font-size: 0.95rem;">${i + 1}</td>
          <td style="padding: 0.5rem;">
            <select class="non-cash-type-input" style="width: 100%; padding: 0.4rem; font-size: 0.95rem; height: 38px; border-radius: 0.35rem;">
              ${i !== 0 ? '<option value="" disabled selected>— Type —</option>' : ''}
              <option value="UPI" ${i === 0 ? 'selected' : ''}>UPI</option>
              <option value="Old Credit">Old Credit</option>
              <option value="Fresh Credit">Fresh Credit</option>
              <option value="Employee">Employee</option>
              <option value="MH-19-CY-5682">MH-19-CY-5682</option>
              <option value="Alto 800">Alto 800</option>
              <option value="Other">Other</option>
            </select>
          </td>
          <td style="padding: 0.5rem; position: relative;">
            <input type="text" class="non-cash-desc-input" placeholder="e.g. UPI Ref / Customer Name" style="width: 100%; padding: 0.4rem 0.6rem; font-size: 0.95rem; height: 38px; border-radius: 0.35rem;">
            <select class="non-cash-debtor-select" style="display: none; width: 100%; padding: 0.4rem; font-size: 0.95rem; height: 38px; border-radius: 0.35rem; appearance: auto;">
              <option value="">— Select Debtor —</option>
            </select>
            <select class="non-cash-employee-select" style="display: none; width: 100%; padding: 0.4rem; font-size: 0.95rem; height: 38px; border-radius: 0.35rem; appearance: auto;">
              <option value="">— Select Employee —</option>
            </select>
          </td>
          <td style="padding: 0.5rem;">
            <input type="number" class="non-cash-amount-input" placeholder="0.00" min="0" step="0.01" style="width: 100%; padding: 0.4rem 0.6rem; text-align: right; font-size: 0.95rem; height: 38px; font-weight: 600; border-radius: 0.35rem;">
          </td>
        `;
        
        // Wire type select change to toggle dropdown/text-box
        const typeSelect = row.querySelector('.non-cash-type-input');
        const descInput = row.querySelector('.non-cash-desc-input');
        const debtorSelect = row.querySelector('.non-cash-debtor-select');
        const employeeSelect = row.querySelector('.non-cash-employee-select');
        
        typeSelect.addEventListener('change', () => {
          if (typeSelect.value === 'Old Credit') {
            descInput.style.display = 'none';
            debtorSelect.style.display = 'block';
            employeeSelect.style.display = 'none';
            populateRowDebtorSelect(debtorSelect);
          } else if (typeSelect.value === 'Employee') {
            descInput.style.display = 'none';
            debtorSelect.style.display = 'none';
            employeeSelect.style.display = 'block';
            populateRowEmployeeSelect(employeeSelect);
          } else {
            descInput.style.display = 'block';
            debtorSelect.style.display = 'none';
            employeeSelect.style.display = 'none';
            if (typeSelect.value === 'Fresh Credit') {
              descInput.placeholder = "Enter new customer name (mandatory)";
            } else {
              descInput.placeholder = "e.g. UPI Ref / Customer Name";
            }
          }
        });

        // Wire amount input to recalculate live
        row.querySelector('.non-cash-amount-input').addEventListener('input', updateOtherPaymentsCalculations);
        
        if (isDayClosed) {
          row.querySelectorAll('input, select').forEach(el => el.disabled = true);
        }
        
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

  // + Add Row button — appends 3 rows at a time
  const btnAddNonCashRow = document.getElementById('btn-add-noncash-row');
  if (btnAddNonCashRow) {
    btnAddNonCashRow.addEventListener('click', () => {
      const container = document.getElementById('other-payments-rows');
      if (!container) return;
      const newIndex = container.querySelectorAll('tr').length;
      adjustNonCashRows(newIndex + 3);
      updateOtherPaymentsCalculations();
      // Scroll the new row into view and focus the description
      const scrollEl = document.getElementById('other-payments-scroll');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      const lastDesc = container.querySelectorAll('.non-cash-desc-input');
      if (lastDesc.length) lastDesc[lastDesc.length - 3].focus();
    });
  }

  // − Remove Row button — deletes the last row (no minimum enforced)
  const btnRemoveNonCashRow = document.getElementById('btn-remove-noncash-row');
  if (btnRemoveNonCashRow) {
    btnRemoveNonCashRow.addEventListener('click', () => {
      const container = document.getElementById('other-payments-rows');
      if (!container) return;
      const rows = container.querySelectorAll('tr');
      if (rows.length === 0) {
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

  // Set default starting date to 2026-06-01 for hard testing setup
  dateInput.value = '2026-06-01';

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
      if (!window.lastClosedCashData) {
        showToast('No recent cash data found. Please use the sidebar.', 'warning');
        return;
      }
      
      const bankDateEl = document.getElementById('bank-detail-date');
      if (bankDateEl) {
        bankDateEl.value = window.lastClosedDate || new Date().toISOString().split('T')[0];
      }
      
      const set = (calcId, val) => {
        const el = document.getElementById(calcId);
        if (el) {
           el.value = val !== undefined && val !== null ? val : 0;
           // Dispatch input event to trigger auto-save (localStorage) and update grand totals
           el.dispatchEvent(new Event('input'));
        }
      };
      
      set('calc-count-500', window.lastClosedCashData.notes500);
      set('calc-count-200', window.lastClosedCashData.notes200);
      set('calc-count-100', window.lastClosedCashData.notes100);
      set('calc-count-50',  window.lastClosedCashData.notes50);
      set('calc-count-20',  window.lastClosedCashData.notes20);
      set('calc-count-10',  0);

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

  window.showView = showView;
  function showView(viewName) {
    if (viewName === 'tanker-receipts') {
      openLabelWizard(null, true);
      return;
    }
    document.body.setAttribute('data-active-view', viewName);
    const decantValObj = document.querySelector('input[name="decantation-toggle"]:checked');
    const hasDecantation = decantValObj ? decantValObj.value === 'yes' : false;

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
    if (viewName === 'finish') {
      window.history.pushState({ view: 'finish' }, '', '#finish');
    }
    if (viewGstData) viewGstData.style.display = viewName === 'gst' ? 'block' : 'none';
    const viewEmployeeManagement = document.getElementById('view-employee-management');
    if (viewEmployeeManagement) viewEmployeeManagement.style.display = viewName === 'employee-management' ? 'block' : 'none';
    const viewEmployeeLedger = document.getElementById('view-employee-ledger');
    if (viewEmployeeLedger) viewEmployeeLedger.style.display = viewName === 'employee-ledger' ? 'block' : 'none';
    
    const viewHpclTracker = document.getElementById('view-hpcl-tracker');
    if (viewHpclTracker) viewHpclTracker.style.display = viewName === 'hpcl' ? 'block' : 'none';

    const viewTtLedger = document.getElementById('view-tt-ledger');
    if (viewTtLedger) viewTtLedger.style.display = viewName === 'tt-ledger' ? 'block' : 'none';
    
    const viewTankerCalculation = document.getElementById('view-tanker-calculation');
    const viewCashCalculator = document.getElementById('view-cash-calculator');
    if (viewTankerCalculation) viewTankerCalculation.style.display = viewName === 'tanker' ? 'block' : 'none';
    if (viewCashCalculator) viewCashCalculator.style.display = viewName === 'cash-calc' ? 'block' : 'none';

    const viewTankerLabelWizard = document.getElementById('view-tanker-label-wizard');
    if (viewTankerLabelWizard) viewTankerLabelWizard.style.display = viewName === 'tanker-label-wizard' ? 'block' : 'none';

    const viewChillarRecord = document.getElementById('view-chillar-record');
    if (viewChillarRecord) viewChillarRecord.style.display = viewName === 'chillar-record' ? 'block' : 'none';

    const viewPoranchaHishob = document.getElementById('view-porancha-hishob');
    if (viewPoranchaHishob) viewPoranchaHishob.style.display = viewName === 'porancha-hishob' ? 'block' : 'none';

    // Udhari view panes
    const viewUdhariMaster = document.getElementById('view-udhari-master');
    const viewUdhariActive = document.getElementById('view-udhari-active');
    const viewUdhariCreditSale = document.getElementById('view-udhari-credit-sale');
    const viewUdhariReceivePayment = document.getElementById('view-udhari-receive-payment');
    const viewUdhariDateReport = document.getElementById('view-udhari-date-report');
    const viewUdhariLedger = document.getElementById('view-udhari-ledger');
    const viewUdhariSummary = document.getElementById('view-udhari-summary');

    if (viewUdhariMaster) viewUdhariMaster.style.display = viewName === 'udhari-master' ? 'block' : 'none';
    if (viewUdhariActive) viewUdhariActive.style.display = viewName === 'udhari-active' ? 'block' : 'none';
    if (viewUdhariCreditSale) viewUdhariCreditSale.style.display = viewName === 'udhari-credit-sale' ? 'block' : 'none';
    if (viewUdhariReceivePayment) viewUdhariReceivePayment.style.display = viewName === 'udhari-receive-payment' ? 'block' : 'none';
    if (viewUdhariDateReport) viewUdhariDateReport.style.display = viewName === 'udhari-date-report' ? 'block' : 'none';
    if (viewUdhariLedger) viewUdhariLedger.style.display = viewName === 'udhari-ledger' ? 'block' : 'none';
    if (viewUdhariSummary) viewUdhariSummary.style.display = viewName === 'udhari-summary' ? 'block' : 'none';

    // Auto-load data for udhari views
    if (viewName === 'udhari-master') {
      loadDebtorMaster();
    } else if (viewName === 'udhari-active') {
      loadActiveOrInactiveDebtors(showingActiveDebtorsTab);
    } else if (viewName === 'udhari-credit-sale') {
      initCreditSaleEntry();
    } else if (viewName === 'udhari-receive-payment') {
      initReceivePaymentEntry();
    } else if (viewName === 'udhari-date-report') {
      loadDateWiseReport();
    } else if (viewName === 'udhari-ledger') {
      loadLedgerDebtorSelect();
    } else if (viewName === 'udhari-summary') {
      loadDebtorSummary();
    } else if (viewName === 'tt-ledger') {
      loadTtLedger();
    } else if (viewName === 'other') {
      const decantValObj = document.querySelector('input[name="decantation-toggle"]:checked');
      const ownValObj = document.querySelector('input[name="tt-decantation-toggle"]:checked');
      const decantYes = decantValObj ? decantValObj.value === 'yes' : false;
      const ownYes = ownValObj ? ownValObj.value === 'yes' : false;

      if (decantYes && ownYes) {
        const typeInputs = document.querySelectorAll('.non-cash-type-input');
        const descInputs = document.querySelectorAll('.non-cash-desc-input');
        if (typeInputs.length > 1) {
          const typeSelect = typeInputs[1];
          const descInput = descInputs[1];
          if (typeSelect) {
            typeSelect.value = 'MH-19-CY-5682';
            typeSelect.dispatchEvent(new Event('change'));
            if (descInput && (!descInput.value || descInput.value.trim() === '')) {
              descInput.value = 'MH-19-CY-5682';
            }
          }
        }
      }

      Promise.all([fetchGlobalDebtorsList(), fetchGlobalEmployeesList()]).then(() => {
        document.querySelectorAll('#other-payments-rows tr').forEach(row => {
          const typeSelect = row.querySelector('.non-cash-type-input');
          const debtorSelect = row.querySelector('.non-cash-debtor-select');
          const employeeSelect = row.querySelector('.non-cash-employee-select');
          const descInput = row.querySelector('.non-cash-desc-input');
          if (typeSelect) {
            if (typeSelect.value === 'Old Credit') {
              if (descInput) descInput.style.display = 'none';
              if (debtorSelect) {
                debtorSelect.style.display = 'block';
                populateRowDebtorSelect(debtorSelect);
              }
              if (employeeSelect) employeeSelect.style.display = 'none';
            } else if (typeSelect.value === 'Employee') {
              if (descInput) descInput.style.display = 'none';
              if (debtorSelect) debtorSelect.style.display = 'none';
              if (employeeSelect) {
                employeeSelect.style.display = 'block';
                populateRowEmployeeSelect(employeeSelect);
              }
            } else {
              if (descInput) descInput.style.display = 'block';
              if (debtorSelect) debtorSelect.style.display = 'none';
              if (employeeSelect) employeeSelect.style.display = 'none';
            }
          }
        });
        enforceFreezeState();
      });
      updateOtherPaymentsCalculations();
    }

    // Submenu management
    const secondarySidebar = document.getElementById('secondary-sidebar');
    const udhariContainer = document.getElementById('udhari-submenu-container');
    const otherContainer = document.getElementById('other-submenu-container');
    const udhariToggle = document.getElementById('nav-udhari-toggle');
    const otherToggle = document.getElementById('nav-other-toggle');

    if (viewName.startsWith('udhari-') || viewName === 'udhari') {
      if (udhariToggle) udhariToggle.classList.add('active');
      if (otherToggle) otherToggle.classList.remove('active');
    } else if (viewName === 'reminders' || viewName === 'gst' || viewName === 'employee-management' || viewName === 'tanker-receipts' || viewName === 'tanker-label-wizard') {
      if (otherToggle) otherToggle.classList.add('active');
      if (udhariToggle) udhariToggle.classList.remove('active');
    } else {
      if (udhariToggle) udhariToggle.classList.remove('active');
      if (otherToggle) otherToggle.classList.remove('active');
    }

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const navTankerCalc = document.getElementById('nav-tanker-calc');
    const navCashCalc = document.getElementById('nav-cash-calc');
    const navGst = document.getElementById('nav-gst');
    const navEmployeeManagement = document.getElementById('nav-employee-management');
    const navHpclTracker = document.getElementById('nav-hpcl-tracker');
    const navTtLedger = document.getElementById('nav-tt-ledger');
    const navTankerReceipts = document.getElementById('nav-tanker-receipts');
    const navChillarRecord = document.getElementById('nav-chillar-record');
    const navPoranchaHishob = document.getElementById('nav-porancha-hishob');
    
    const navUdhariMaster = document.getElementById('nav-udhari-master');
    const navUdhariActive = document.getElementById('nav-udhari-active');
    const navUdhariCreditSale = document.getElementById('nav-udhari-credit-sale');
    const navUdhariReceivePayment = document.getElementById('nav-udhari-receive-payment');
    const navUdhariDateReport = document.getElementById('nav-udhari-date-report');
    const navUdhariLedger = document.getElementById('nav-udhari-ledger');
    const navUdhariSummary = document.getElementById('nav-udhari-summary');

    if (viewName === 'udhari-master' && navUdhariMaster) navUdhariMaster.classList.add('active');
    else if (viewName === 'udhari-active' && navUdhariActive) navUdhariActive.classList.add('active');
    else if (viewName === 'udhari-credit-sale' && navUdhariCreditSale) navUdhariCreditSale.classList.add('active');
    else if (viewName === 'udhari-receive-payment' && navUdhariReceivePayment) navUdhariReceivePayment.classList.add('active');
    else if (viewName === 'udhari-date-report' && navUdhariDateReport) navUdhariDateReport.classList.add('active');
    else if (viewName === 'udhari-ledger' && navUdhariLedger) navUdhariLedger.classList.add('active');
    else if (viewName === 'udhari-summary' && navUdhariSummary) navUdhariSummary.classList.add('active');
    else if (viewName === 'tanker' && navTankerCalc) navTankerCalc.classList.add('active');
    else if (viewName === 'cash-calc' && navCashCalc) navCashCalc.classList.add('active');
    else if (viewName === 'gst' && navGst) navGst.classList.add('active');
    else if (viewName === 'employee-management' && navEmployeeManagement) navEmployeeManagement.classList.add('active');
    else if (viewName === 'hpcl' && navHpclTracker) navHpclTracker.classList.add('active');
    else if (viewName === 'tt-ledger' && navTtLedger) navTtLedger.classList.add('active');
    else if (viewName === 'chillar-record' && navChillarRecord) navChillarRecord.classList.add('active');
    else if (viewName === 'porancha-hishob' && navPoranchaHishob) navPoranchaHishob.classList.add('active');
    else if ((viewName === 'tanker-receipts' || viewName === 'tanker-label-wizard') && navTankerReceipts) navTankerReceipts.classList.add('active');
    else if (navDayClosing && !['udhari', 'other', 'tt-ledger', 'tanker-receipts', 'tanker-label-wizard', 'chillar-record', 'porancha-hishob'].some(pre => viewName.startsWith(pre))) navDayClosing.classList.add('active');

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

  const navCashCalcSide = document.getElementById('nav-cash-calc');
  if (navCashCalcSide) {
    navCashCalcSide.addEventListener('click', (e) => {
      e.preventDefault();
      showView('cash-calc');
    });
  }

  const navTankerReceiptsSide = document.getElementById('nav-tanker-receipts');
  if (navTankerReceiptsSide) {
    navTankerReceiptsSide.addEventListener('click', (e) => {
      e.preventDefault();
      openLabelWizard(null, true);
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

  async function prepareNextDay() {
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
  }

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
        updateTestingTotals();
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
          decantation_qty: t.decantation_qty || 0,
          tt_decantation: t.tt_decantation || 0
        }));

        let hasDecantation = false;
        let ownDecantVal = 0;
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
          if (t.tt_decantation) {
            ownDecantVal = t.tt_decantation;
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

        // Restore own decantation question (MH-19-CY-5682)
        const ownTankerToggleVal = ownDecantVal === 1 ? 'yes' : (ownDecantVal === 0 && savedTanks && savedTanks.length > 0 ? 'no' : 'yes');
        const ownTankerKmVal = localStorage.getItem('own_tanker_km_' + selectedDate) || '';
        
        const ttYesRadio = document.querySelector('input[name="tt-decantation-toggle"][value="yes"]');
        const ttNoRadio = document.querySelector('input[name="tt-decantation-toggle"][value="no"]');
        if (ownTankerToggleVal === 'yes') {
          if (ttYesRadio) ttYesRadio.checked = true;
        } else {
          if (ttNoRadio) ttNoRadio.checked = true;
        }
        
        const container = document.getElementById('own-tanker-km-container');
        const kmInput = document.getElementById('own-tanker-km');
        if (container && kmInput) {
          if (ownTankerToggleVal === 'yes') {
            container.style.display = 'flex';
            kmInput.value = ownTankerKmVal;
            kmInput.setAttribute('required', 'true');
          } else {
            container.style.display = 'none';
            kmInput.value = '';
            kmInput.removeAttribute('required');
          }
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

        // Reset own decantation question to YES by default
        const ttYesRadio = document.querySelector('input[name="tt-decantation-toggle"][value="yes"]');
        if (ttYesRadio) ttYesRadio.checked = true;

        // Reset Own Tanker KM container (shown by default since YES is checked)
        const container = document.getElementById('own-tanker-km-container');
        const kmInput = document.getElementById('own-tanker-km');
        if (container && kmInput) {
          container.style.display = 'flex';
          kmInput.value = '';
          kmInput.setAttribute('required', 'true');
        }
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
      updateHelperNoteVisibility();
      updateDecantationGatingState();
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

  // Core detection: returns true if any tank's closing stock exceeds its opening by more than 0 L
  function detectDecantationRequired() {
    for (let id = 1; id <= 3; id++) {
      const openingEl = document.getElementById(`tank-${id}-opening`);
      const closingEl = document.getElementById(`tank-${id}-closing`);
      if (openingEl && closingEl && closingEl.value !== '') {
        const openingVal = parseFloat(openingEl.value) || 0;
        const closingVal = parseFloat(closingEl.value) || 0;
        if (closingVal - openingVal > 0) {
          return true;
        }
      }
    }
    return false;
  }

  // Update helper note visibility (shows when decantation is detected)
  function updateHelperNoteVisibility() {
    const required = detectDecantationRequired();
    const helperNote = document.getElementById('decantation-helper-note');
    if (helperNote) {
      helperNote.style.display = required ? 'inline-block' : 'none';
    }
  }

  // Sync second question's visibility based on first question state
  function updateSecondQuestionVisibility() {
    // Moved to Step 5: no longer synced on Step 4
  }

  // Update the Next Step button label/style based on whether decantation is required or user-selected.
  // The button is NEVER disabled — it always navigates forward. Only its label and destination change.
  function updateDecantationGatingState() {
    const required = detectDecantationRequired();
    const yesRadio = document.querySelector('input[name="decantation-toggle"][value="yes"]');
    const noRadio  = document.querySelector('input[name="decantation-toggle"][value="no"]');
    const nextBtn  = document.getElementById('btn-tank-next');

    if (required) {
      // FORCE Yes and lock both radios — decantation physically happened
      if (yesRadio) { yesRadio.checked = true;  yesRadio.disabled = true; }
      if (noRadio)  { noRadio.checked  = false; noRadio.disabled  = true; }
    } else {
      // No forced decantation — unlock radios so user can freely choose
      if (yesRadio) yesRadio.disabled = false;
      if (noRadio)  noRadio.disabled  = false;
    }

    // Button label reflects destination
    const isYes = yesRadio?.checked;
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.style.opacity = '';
      nextBtn.style.cursor = '';
      if (isYes) {
        nextBtn.innerHTML = '🚚 Next Step: Record Tanker Entry ➔';
      } else {
        nextBtn.innerHTML = 'Next Step: DSR Reconciliation ➔';
      }
      nextBtn.style.background = '';
    }

    updateSecondQuestionVisibility();
  }

  // Trigger auto-select: called live as closing stock values are typed
  function triggerDecantationAutoSelect() {
    // updateDecantationGatingState already handles all the logic
    updateDecantationGatingState();
    updateHelperNoteVisibility();
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
        openingEl.addEventListener('input', () => {
          updateTankVisuals();
          updateHelperNoteVisibility();
        });
        closingEl.addEventListener('input', () => {
          updateTankVisuals();
          updateHelperNoteVisibility();
          triggerDecantationAutoSelect();
        });
      }
    }
    updateTankVisuals();
    triggerDecantationAutoSelect();
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

  // Helper to calculate and show product wise testing totals
  function updateTestingTotals() {
    let petrolTotal = 0;
    let dieselTotal = 0;
    let powerTotal = 0;

    // Nozzles N1, N2, N3 are Petrol
    for (let id = 1; id <= 3; id++) {
      const el = document.getElementById(`nozzle-${id}-test-qty`);
      const val = el ? (parseFloat(el.value) || 0) : 0;
      petrolTotal += val;
    }

    // Nozzles N4, N5 are Diesel
    for (let id = 4; id <= 5; id++) {
      const el = document.getElementById(`nozzle-${id}-test-qty`);
      const val = el ? (parseFloat(el.value) || 0) : 0;
      dieselTotal += val;
    }

    // Nozzle N6 is poWer
    const powerEl = document.getElementById(`nozzle-6-test-qty`);
    powerTotal = powerEl ? (parseFloat(powerEl.value) || 0) : 0;

    // Update the labels in the summary cards
    const petrolDisplay = document.getElementById('test-total-petrol');
    const dieselDisplay = document.getElementById('test-total-diesel');
    const powerDisplay = document.getElementById('test-total-power');

    if (petrolDisplay) petrolDisplay.textContent = `${petrolTotal.toFixed(3)} L`;
    if (dieselDisplay) dieselDisplay.textContent = `${dieselTotal.toFixed(3)} L`;
    if (powerDisplay) powerDisplay.textContent = `${powerTotal.toFixed(3)} L`;
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

  // Listeners for live nozzle testing totals updates
  for (let id = 1; id <= 6; id++) {
    const testInput = document.getElementById(`nozzle-${id}-test-qty`);
    if (testInput) {
      testInput.addEventListener('input', updateTestingTotals);
    }
  }
  updateTestingTotals();

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

  // Decantation radio buttons toggle listener — update button label/destination on every change
  document.querySelectorAll('input[name="decantation-toggle"]').forEach(radio => {
    radio.addEventListener('change', () => {
      updateDecantationGatingState();
    });
  });

  // Second decantation question (TT / Own Tanker) toggle listener
  document.querySelectorAll('input[name="tt-decantation-toggle"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      enforceFreezeState();
      const container = document.getElementById('own-tanker-km-container');
      const kmInput = document.getElementById('own-tanker-km');
      if (!container || !kmInput) return;
      if (e.target.value === 'yes') {
        container.style.display = 'flex';
        kmInput.setAttribute('required', 'true');
        if (!isDayClosed) {
          kmInput.focus();
        }
      } else {
        container.style.display = 'none';
        kmInput.removeAttribute('required');
        kmInput.value = '';
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
      updateTestingTotals();

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
        const ttDecantRadio = document.querySelector('input[name="tt-decantation-toggle"]:checked');
        const ttDecantVal = ttDecantRadio ? (ttDecantRadio.value === 'yes' ? 1 : 0) : 0;

        tanks.push({
          tank_id: id,
          tank_name: tankName,
          product: product,
          capacity: capacity,
          opening_dip: openingDipVal,
          opening_stock: openingVal,
          closing_dip: dipVal,
          closing_stock: closingVal,
          decantation_qty: currentDecantation[product] || 0,
          tt_decantation: ttDecantVal
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
        if (targetView === 'decantation') {
          // Sync own-tanker-km-container visibility based on tt-decantation-toggle radio button
          const ownRadioVal = document.querySelector('input[name="tt-decantation-toggle"]:checked');
          const isOwn = ownRadioVal ? ownRadioVal.value === 'yes' : false;
          const container = document.getElementById('own-tanker-km-container');
          const kmInput = document.getElementById('own-tanker-km');
          if (container && kmInput) {
            container.style.display = isOwn ? 'flex' : 'none';
            if (isOwn) {
              kmInput.setAttribute('required', 'true');
            } else {
              kmInput.removeAttribute('required');
            }
          }
        }
        setTimeout(() => {
          showView(targetView);
        }, 500);
      }

    } catch (error) {
      console.error('Error saving tank stocks:', error);
      showToast(error.message || 'An error occurred while saving tank stocks.', 'error');
    }
  }

  // Form submit handler for Step 4: Tank Stock Form
  // The Next Step button label tells the user where they are going:
  //   — Yes selected: "🚚 Next Step: Record Tanker Entry ➔" → saves tank stock → goes to decantation page
  //   — No selected:  "Next Step: DSR Reconciliation ➔"  → saves tank stock → goes to DSR directly
  tankForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isDayClosed) {
      const hasDecantation = document.querySelector('input[name="decantation-toggle"]:checked').value === 'yes';
      updateDsrCalculations();
      showView(hasDecantation ? 'decantation' : 'dsr');
      return;
    }

    const required = detectDecantationRequired();
    const hasDecantation = required || (document.querySelector('input[name="decantation-toggle"]:checked').value === 'yes');
    if (hasDecantation) {
      // Route through decantation page (user selected or auto-detected)
      await saveTankStockData('decantation');
    } else {
      // No decantation — clear any leftover values and go directly to DSR
      currentDecantation.Petrol = 0;
      currentDecantation.Diesel = 0;
      currentDecantation.poWer = 0;

      document.getElementById('load-petrol').value = '0';
      document.getElementById('load-diesel').value = '0';
      document.getElementById('load-power').value = '0';

      await saveTankStockData('dsr');
    }
  });

  // Event handlers for Decantation Details page
  const decantationForm = document.getElementById('decantation-form');
  const btnBackToTank = document.getElementById('btn-back-to-tank');

  if (btnBackToTank) {
    btnBackToTank.addEventListener('click', () => {
      // Clear the forced-flow flag when user manually goes back
      sessionStorage.removeItem('decantation_from_day_closing');
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

      // Check for each product if stock has increased and verify corresponding load is recorded (> 0)
      const productsToCheck = [
        { name: 'poWer', id: 1, val: powerVal, label: 'poWer' },
        { name: 'Petrol', id: 2, val: petrolVal, label: 'Petrol' },
        { name: 'Diesel', id: 3, val: dieselVal, label: 'Diesel' }
      ];

      for (const prod of productsToCheck) {
        const openingEl = document.getElementById(`tank-${prod.id}-opening`);
        const closingEl = document.getElementById(`tank-${prod.id}-closing`);
        if (openingEl && closingEl) {
          const openingVal = parseFloat(openingEl.value) || 0;
          const closingVal = parseFloat(closingEl.value) || 0;
          if (closingVal > openingVal && prod.val <= 0) {
            showToast(`Stock increase detected for ${prod.label}. Please record a received load for this product.`, 'error');
            return;
          }
        }
      }

      const totalDecantation = petrolVal + dieselVal + powerVal;
      const ownRadioVal = document.querySelector('input[name="tt-decantation-toggle"]:checked');
      const isOwnTanker = ownRadioVal ? ownRadioVal.value === 'yes' : false;

      if (isOwnTanker) {
        // Validation check for own tanker
        if (totalDecantation !== 14000) {
          showToast('घरचे टँकर (Own Tanker) साठी एकूण भार नक्कीच १४,००० लिटर असावा.', 'error');
          return;
        }
        
        const kmReadingStr = document.getElementById('own-tanker-km').value.trim();
        const kmReading = parseInt(kmReadingStr, 10);
        if (kmReadingStr === '' || isNaN(kmReading) || kmReading < 0) {
          showToast('किलोमीटर रीडिंग आवश्यक आहे आणि ती वैध असावी.', 'error');
          const kmInput = document.getElementById('own-tanker-km');
          if (kmInput) kmInput.focus();
          return;
        }

        // Save state
        localStorage.setItem('own_tanker_toggle_' + dateInput.value, 'yes');
        localStorage.setItem('own_tanker_km_' + dateInput.value, kmReadingStr);

        // Auto-log tanker trip
        try {
          const res = await fetch('/api/tt/trips/decant-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: dateInput.value,
              km_reading: kmReading
            })
          });
          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to auto-log decantation trip.');
          }
        } catch (tripErr) {
          console.error('Error auto-logging TT trip:', tripErr);
          showToast('Error logging decantation trip: ' + tripErr.message, 'error');
          return;
        }
      } else {
        // Standard tanker validation
        const allowedTotals = [12000, 14000, 18000, 20000];
        if (!allowedTotals.includes(totalDecantation)) {
          showToast('Total decantation must be exactly 12,000, 14,000, 18,000, or 20,000 liters.', 'error');
          return;
        }

        // Save state
        localStorage.setItem('own_tanker_toggle_' + dateInput.value, 'no');
        localStorage.removeItem('own_tanker_km_' + dateInput.value);
      }

      currentDecantation.Petrol = petrolVal;
      currentDecantation.Diesel = dieselVal;
      currentDecantation.poWer = powerVal;

      // Check if we arrived here from the forced Day Closing flow
      const fromDayClosing = sessionStorage.getItem('decantation_from_day_closing') === 'yes';
      // Clear the flag before advancing
      sessionStorage.removeItem('decantation_from_day_closing');

      // Save tank stocks + decantation and always go to DSR
      // (whether triggered from the forced flow or navigated manually within Day Closing)
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
    document.getElementById('summary-rate-petrol').textContent = `₹ ${parseFloat(currentRates.Petrol || 0).toFixed(2)}/L`;
    document.getElementById('summary-rate-diesel').textContent = `₹ ${parseFloat(currentRates.Diesel || 0).toFixed(2)}/L`;
    document.getElementById('summary-rate-power').textContent = `₹ ${parseFloat(currentRates.poWer || 0).toFixed(2)}/L`;

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
    document.getElementById('summary-calc-sales').textContent = `₹ ${Number(totalSalesValue).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

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
      let description = row.querySelector('.non-cash-desc-input').value;
      if (type === 'Credit') {
        const debtorSelect = row.querySelector('.non-cash-debtor-select');
        if (debtorSelect && debtorSelect.value) {
          const debtorId = parseInt(debtorSelect.value, 10);
          const found = globalDebtorsList.find(d => d.id === debtorId);
          description = found ? found.debtor_name : 'Selected Debtor';
        } else {
          description = 'Unspecified Debtor';
        }
      }
      const amount = parseFloat(row.querySelector('.non-cash-amount-input').value) || 0;

      if (amount > 0 || description.trim() !== '') {
        nonCashEntries.push({ type, description, amount });
        totalNonCash += amount;
      }
    });

    const shortfall = totalSalesValue - (totalCashReceived + totalNonCash);

    document.getElementById('summary-cash-received').textContent = `₹ ${Number(totalCashReceived).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('summary-other-received').textContent = `₹ ${Number(totalNonCash).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const summaryShortfallEl = document.getElementById('summary-cash-shortfall');
    const summaryShortfallCard = document.getElementById('summary-shortfall-card');
    const summaryShortfallLabel = document.getElementById('summary-shortfall-lbl');
    
    if (shortfall > 0) {
      summaryShortfallEl.textContent = `₹ ${Number(shortfall).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      summaryShortfallEl.style.color = 'var(--danger)';
      summaryShortfallLabel.textContent = 'SHORTFALL / DEFICIT';
      summaryShortfallLabel.style.color = 'var(--danger)';
      summaryShortfallCard.style.background = 'rgba(239, 68, 68, 0.05)';
      summaryShortfallCard.style.borderColor = 'rgba(239, 68, 68, 0.12)';
    } else if (shortfall < 0) {
      summaryShortfallEl.textContent = `₹ ${Number(Math.abs(shortfall)).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
      summaryShortfallEl.style.color = 'var(--success)';
      summaryShortfallLabel.textContent = 'SURPLUS / EXCESS';
      summaryShortfallLabel.style.color = 'var(--success)';
      summaryShortfallCard.style.background = 'rgba(16, 185, 129, 0.05)';
      summaryShortfallCard.style.borderColor = 'rgba(16, 185, 129, 0.12)';
    } else {
      summaryShortfallEl.textContent = `₹ 0.00`;
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
    if (coins > 0) denomArr.push(`Coins: ₹ ${Math.round(coins)}`);

    const denomEl = document.getElementById('summary-denominations');
    if (denomArr.length > 0) {
      denomEl.innerHTML = `<strong>Denominations:</strong> ` + denomArr.join(' | ');
    } else {
      denomEl.innerHTML = `<strong>Denominations:</strong> None entered`;
    }

    const nonCashListEl = document.getElementById('summary-other-payments-list');
    if (nonCashEntries.length > 0) {
      const entryStrings = nonCashEntries.map(e => `[${e.type}] ${e.description}: ₹ ${Number(e.amount).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
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
    if (el('preview-rate-petrol'))  el('preview-rate-petrol').textContent  = `₹ ${parseFloat(currentRates.Petrol  || 0).toFixed(2)}/L`;
    if (el('preview-rate-diesel'))  el('preview-rate-diesel').textContent  = `₹ ${parseFloat(currentRates.Diesel  || 0).toFixed(2)}/L`;
    if (el('preview-rate-power'))   el('preview-rate-power').textContent   = `₹ ${parseFloat(currentRates.poWer   || 0).toFixed(2)}/L`;

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
    if (el('preview-calc-sales')) el('preview-calc-sales').textContent = `₹ ${Number(totalSalesValue).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

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
      let desc   = row.querySelector('.non-cash-desc-input').value;
      if (type === 'Credit') {
        const debtorSelect = row.querySelector('.non-cash-debtor-select');
        if (debtorSelect && debtorSelect.value) {
          const debtorId = parseInt(debtorSelect.value, 10);
          const found = globalDebtorsList.find(d => d.id === debtorId);
          desc = found ? found.debtor_name : 'Selected Debtor';
        } else {
          desc = 'Unspecified Debtor';
        }
      }
      const amount = parseFloat(row.querySelector('.non-cash-amount-input').value) || 0;
      if (amount > 0 || desc.trim() !== '') { nonCashEntries.push({ type, desc, amount }); totalNonCash += amount; }
    });

    const shortfall = totalSalesValue - (totalCashReceived + totalNonCash);
    if (el('preview-cash-received'))  el('preview-cash-received').textContent  = `₹ ${Number(totalCashReceived).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (el('preview-other-received')) el('preview-other-received').textContent = `₹ ${Number(totalNonCash).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    const sfEl    = el('preview-cash-shortfall');
    const sfCard  = el('preview-shortfall-card');
    const sfLabel = el('preview-shortfall-lbl');
    if (sfEl && sfCard && sfLabel) {
      if (shortfall > 0) {
        sfEl.textContent = `₹ ${Number(shortfall).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`; sfEl.style.color = 'var(--danger)';
        sfLabel.textContent = 'SHORTFALL / DEFICIT'; sfLabel.style.color = 'var(--danger)';
        sfCard.style.background = 'rgba(239,68,68,0.05)'; sfCard.style.borderColor = 'rgba(239,68,68,0.12)';
      } else if (shortfall < 0) {
        sfEl.textContent = `₹ ${Number(Math.abs(shortfall)).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`; sfEl.style.color = 'var(--success)';
        sfLabel.textContent = 'SURPLUS / EXCESS'; sfLabel.style.color = 'var(--success)';
        sfCard.style.background = 'rgba(16,185,129,0.05)'; sfCard.style.borderColor = 'rgba(16,185,129,0.12)';
      } else {
        sfEl.textContent = '₹ 0.00'; sfEl.style.color = 'var(--text-muted)';
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
    if (coins   >0) denomArr.push(`Coins: ₹ ${Math.round(coins)}`);
    const denomEl = el('preview-denominations');
    if (denomEl) denomEl.innerHTML = `<strong>Denominations:</strong> ` + (denomArr.length ? denomArr.join(' | ') : 'None entered');

    const ncListEl = el('preview-other-payments-list');
    if (ncListEl) {
      if (nonCashEntries.length > 0) {
        ncListEl.innerHTML = `<strong>Non-Cash Settlement Logs:</strong> ` + nonCashEntries.map(e => `[${e.type}] ${e.desc}: ₹ ${Number(e.amount).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`).join(' | ');
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

    // Cache the just-entered values to pass them to the Cash Calculator without getting cleared by prepareNextDay()
    window.lastClosedCashData = { notes500, notes200, notes100, notes50, notes20, notes10 };
    window.lastClosedDate = document.getElementById('reading-date').value;

    const nonCashPayments = [];
    let hasValidationError = false;
    const rows = Array.from(document.querySelectorAll('#other-payments-rows tr'));
    
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const type   = row.querySelector('.non-cash-type-input').value;
      let description = row.querySelector('.non-cash-desc-input').value;
      const amount = parseFloat(row.querySelector('.non-cash-amount-input').value) || 0;
      
      if (!type) continue;
      
      if (type === 'Old Credit' && amount > 0) {
        const debtorSelect = row.querySelector('.non-cash-debtor-select');
        if (!debtorSelect || !debtorSelect.value) {
          hasValidationError = true;
          showToast(`Row ${idx + 1}: Please select a debtor for the Old Credit transaction.`, 'error');
        } else {
          description = `debtor_id:${debtorSelect.value}`;
        }
      } else if (type === 'Employee' && amount > 0) {
        const employeeSelect = row.querySelector('.non-cash-employee-select');
        if (!employeeSelect || !employeeSelect.value) {
          hasValidationError = true;
          showToast(`Row ${idx + 1}: Please select an employee for the Employee transaction.`, 'error');
        } else {
          description = `employee_id:${employeeSelect.value}`;
        }
      } else if (type === 'Fresh Credit' && amount > 0) {
        const customerName = description.trim();
        if (!customerName) {
          hasValidationError = true;
          showToast(`Row ${idx + 1}: Please enter a customer name for Fresh Credit.`, 'error');
        } else {
          try {
            // Check for existing debtor (case-insensitive)
            let existingDebtor = globalDebtorsList.find(d => d.debtor_name.toLowerCase() === customerName.toLowerCase());
            let debtorId;
            
            if (existingDebtor) {
              debtorId = existingDebtor.id;
            } else {
              // Auto-create new debtor
              const createResp = await fetch('/api/debtors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  debtor_name: customerName,
                  mobile_number: '',
                  credit_limit: 0,
                  opening_balance: 0,
                  opening_balance_date: dateInput.value
                })
              });
              const createData = await createResp.json();
              if (!createResp.ok) throw new Error(createData.error);
              debtorId = createData.debtor.id;
              
              // Push to global array so next row in this loop doesn't recreate it
              globalDebtorsList.push({ id: debtorId, debtor_name: customerName, is_active: 1 });
            }
            
            description = `debtor_id:${debtorId}`;
          } catch (err) {
            hasValidationError = true;
            showToast(`Row ${idx + 1}: Failed to create new debtor - ${err.message}`, 'error');
          }
        }
      }
      
      if (amount > 0 || description.trim() !== '') {
        nonCashPayments.push({ type, description, amount });
      }
    }

    if (hasValidationError) {
      if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.innerHTML = '✓ Confirm &amp; Close Day'; }
      return;
    }

    const totalNonCash = nonCashPayments.reduce((sum, p) => sum + p.amount, 0);
    const shortfall    = totalSalesValue - (totalCashReceived + totalNonCash);

    const decantValObj = document.querySelector('input[name="decantation-toggle"]:checked');
    const ownValObj = document.querySelector('input[name="tt-decantation-toggle"]:checked');
    const decantYes = decantValObj ? decantValObj.value === 'yes' : false;
    const ownYes = ownValObj ? ownValObj.value === 'yes' : false;

    let ownTankerAmount = 0;
    if (rows.length > 1) {
      const row2Type = rows[1].querySelector('.non-cash-type-input').value;
      if (row2Type === 'MH-19-CY-5682') {
        ownTankerAmount = parseFloat(rows[1].querySelector('.non-cash-amount-input').value) || 0;
      }
    }

    const payload = {
      date: dateInput.value,
      total_sales_value: totalSalesValue,
      total_cash_received: totalCashReceived,
      shortfall,
      notes_500: notes500, notes_200: notes200, notes_100: notes100,
      notes_50: notes50,   notes_20: notes20,   notes_10: notes10,
      coins: totalCoins,
      coins_20: coins20, coins_10: coins10, coins_5: coins5, coins_2: coins2, coins_1: coins1,
      non_cash_payments: nonCashPayments,
      decantation_yes: decantYes,
      own_tanker_yes: ownYes,
      own_tanker_amount: ownTankerAmount
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

      // Automatically prepare next day in background so it's ready when the user leaves the finish page
      await prepareNextDay();
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
        
        // Dynamically adjust rows:
        // — For frozen/past days: show exactly as many rows as saved records (no empty padding).
        // — For the active/current day: use the user's preferred row count setting.
        const rowCountInput = document.getElementById('non-cash-row-count');
        const isFrozenDay = (selectedDate !== activeDate);
        let targetCount;

        if (isFrozenDay) {
          // Past day: only show rows that actually have data (minimum 1 to avoid empty table)
          targetCount = Math.max(1, nonCashPayments.length);
        } else {
          // Active day: respect the user-set row count preference (default 5)
          const currentSetVal = rowCountInput ? (parseInt(rowCountInput.value, 10) || 5) : 5;
          targetCount = Math.min(100, Math.max(5, Math.max(currentSetVal, nonCashPayments.length)));
        }

        if (rowCountInput) rowCountInput.value = targetCount;
        adjustNonCashRows(targetCount);

        const descInputs = document.querySelectorAll('.non-cash-desc-input');
        const typeInputs = document.querySelectorAll('.non-cash-type-input');
        const amountInputs = document.querySelectorAll('.non-cash-amount-input');
        const debtorSelects = document.querySelectorAll('.non-cash-debtor-select');
        const employeeSelects = document.querySelectorAll('.non-cash-employee-select');

        descInputs.forEach(input => input.value = '');
        typeInputs.forEach((input, idx) => {
          input.value = idx === 0 ? 'UPI' : '';
        });
        amountInputs.forEach(input => input.value = '');
        debtorSelects.forEach(sel => {
          sel.value = '';
          sel.style.display = 'none';
        });
        employeeSelects.forEach(sel => {
          sel.value = '';
          sel.style.display = 'none';
        });

        nonCashPayments.forEach((p, idx) => {
          if (idx < targetCount) {
            const typeSelect = typeInputs[idx];
            const descInput = descInputs[idx];
            const row = typeSelect ? typeSelect.closest('tr') : null;
            const debtorSelect = row ? row.querySelector('.non-cash-debtor-select') : null;
            const employeeSelect = row ? row.querySelector('.non-cash-employee-select') : null;

            if (typeSelect) typeSelect.value = p.type;
            if (amountInputs[idx]) amountInputs[idx].value = parseFloat(p.amount) || '';

            if ((p.type === 'Credit' || p.type === 'Old Credit') && p.description && p.description.startsWith('debtor_id:')) {
              const debtorId = p.description.split(':')[1];
              if (descInput) {
                descInput.value = p.description;
                descInput.style.display = 'none';
              }
              if (debtorSelect) {
                debtorSelect.style.display = 'block';
                populateRowDebtorSelect(debtorSelect);
                debtorSelect.value = debtorId;
              }
              if (employeeSelect) {
                employeeSelect.style.display = 'none';
              }
            } else if (p.type === 'Employee' && p.description && p.description.startsWith('employee_id:')) {
              const employeeId = p.description.split(':')[1];
              if (descInput) {
                descInput.value = p.description;
                descInput.style.display = 'none';
              }
              if (debtorSelect) {
                debtorSelect.style.display = 'none';
              }
              if (employeeSelect) {
                employeeSelect.style.display = 'block';
                populateRowEmployeeSelect(employeeSelect);
                employeeSelect.value = employeeId;
              }
            } else {
              if (descInput) {
                descInput.value = p.description || '';
                descInput.style.display = 'block';
              }
              if (debtorSelect) {
                debtorSelect.style.display = 'none';
              }
              if (employeeSelect) {
                employeeSelect.style.display = 'none';
              }
            }
          }
        });
      } else {
        currentCashData = null;
        clearCashInputs();
      }

      // Prefill second row (index 1) with MH-19-CY-5682 if Question 1 & 2 are both yes and it's not already set
      const decantValObj = document.querySelector('input[name="decantation-toggle"]:checked');
      const ownValObj = document.querySelector('input[name="tt-decantation-toggle"]:checked');
      const decantYes = decantValObj ? decantValObj.value === 'yes' : false;
      const ownYes = ownValObj ? ownValObj.value === 'yes' : false;

      if (decantYes && ownYes) {
        const typeInputs = document.querySelectorAll('.non-cash-type-input');
        const descInputs = document.querySelectorAll('.non-cash-desc-input');
        if (typeInputs.length > 1) {
          const typeSelect = typeInputs[1];
          const descInput = descInputs[1];
          if (typeSelect) {
            typeSelect.value = 'MH-19-CY-5682';
            typeSelect.dispatchEvent(new Event('change'));
            if (descInput && (!descInput.value || descInput.value.trim() === '')) {
              descInput.value = 'MH-19-CY-5682';
              descInput.style.display = 'block';
            }
          }
        }
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
            input.name === 'decantation-toggle' ||
            input.name === 'tt-decantation-toggle' ||
            input.id === 'own-tanker-km'
          ) {
            input.disabled = false;
          }
        }
      });

      // Explicitly enable all buttons to allow navigation through frozen days
      const buttons = f.querySelectorAll('button');
      buttons.forEach(btn => {
        if (isDayClosed && btn.classList.contains('panel-table-btn')) {
          btn.disabled = true;
        } else {
          btn.disabled = false;
        }
      });
    });

    const btnEditReadings = document.getElementById('btn-edit-readings');
    if (btnEditReadings) {
      btnEditReadings.innerHTML = isDayClosed ? '🔍 Review Steps' : '✍ Edit readings';
    }

    if (!isDayClosed) {
      const decantValObj = document.querySelector('input[name="decantation-toggle"]:checked');
      const ownValObj = document.querySelector('input[name="tt-decantation-toggle"]:checked');
      const decantYes = decantValObj ? decantValObj.value === 'yes' : false;
      const ownYes = ownValObj ? ownValObj.value === 'yes' : false;
      if (decantYes && ownYes) {
        const typeInputs = document.querySelectorAll('.non-cash-type-input');
        if (typeInputs.length > 1) {
          typeInputs[1].disabled = true;
        }
      }
    }

    // Freeze TT actions on closed days - Category B remains editable
    const btnTtManualEntry = document.getElementById('btn-tt-manual-entry');
    const btnTtRecordSettlement = document.getElementById('btn-tt-record-settlement');
    const btnTtAddTrip = document.getElementById('btn-tt-add-trip');
    if (btnTtManualEntry) btnTtManualEntry.disabled = false;
    if (btnTtRecordSettlement) btnTtRecordSettlement.disabled = false;
    if (btnTtAddTrip) btnTtAddTrip.disabled = false;
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
    const debtorSelects = document.querySelectorAll('.non-cash-debtor-select');
    const employeeSelects = document.querySelectorAll('.non-cash-employee-select');

    selectInputs.forEach((input, idx) => {
      input.value = idx === 0 ? 'UPI' : '';
    });
    descInputs.forEach(input => input.value = '');
    amountInputs.forEach(input => input.value = '');
    debtorSelects.forEach(sel => {
      sel.value = '';
      sel.style.display = 'none';
    });
    employeeSelects.forEach(sel => {
      sel.value = '';
      sel.style.display = 'none';
    });
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
      const roundedGrossNozzleSales = Math.round(grossNozzleSales);
      const roundedTotalTesting = Math.round(totalTesting);
      const roundedActualSale = Math.round(actualSale);
      const roundedTankWiseSale = Math.round(tankWiseSale);
      const roundedVariation = Math.round(variation);

      let varText = '0';
      let varColor = 'var(--text-muted)';
      if (roundedVariation > 0) {
        // Tank sold MORE than nozzle → shortfall → Red → display as NEGATIVE
        varText = `-${roundedVariation}`;
        varColor = 'var(--danger)';
      } else if (roundedVariation < 0) {
        // Tank sold LESS than nozzle → surplus → Green → display as POSITIVE
        varText = `+${Math.abs(roundedVariation)}`;
        varColor = 'var(--success)';
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
        <div class="text-right" style="color: var(--text-main);">${roundedGrossNozzleSales}</div>
        <div class="text-right" style="color: var(--warning);">${roundedTotalTesting}</div>
        <div class="text-right" style="color: var(--accent); font-weight: 600;">${roundedActualSale}</div>
        <div class="text-right" style="color: var(--text-main);">${roundedTankWiseSale}</div>
        <div class="text-right bold" style="font-size: 1.05rem; color: ${varColor};">${varText} L</div>
      `;

      tableBody.appendChild(row);
    });

    const insightsEl = document.getElementById('dsr-insights');
    if (insightsEl) {
      const roundedOverallLoss = Math.round(overallLoss);
      const roundedOverallGain = Math.round(overallGain);

      if (roundedOverallLoss > 0 && roundedOverallGain > 0) {
        insightsEl.innerHTML = `⚠️ <strong>DSR Stock Reconciliation Alert:</strong> There is a net physical shortfall of <strong>${roundedOverallLoss} L</strong> and a net surplus of <strong>${roundedOverallGain} L</strong> detected across products. Please check DIP readings if this is unexpected.`;
        insightsEl.style.borderColor = 'rgba(245, 158, 11, 0.2)';
        insightsEl.style.background = 'rgba(245, 158, 11, 0.03)';
        insightsEl.style.color = 'var(--warning)';
      } else if (roundedOverallLoss > 0) {
        insightsEl.innerHTML = `⚠️ <strong>DSR Stock Reconciliation Alert:</strong> A physical stock shortfall of <strong>${roundedOverallLoss} L</strong> was detected. This represents evaporation loss or transit/measurement variance.`;
        insightsEl.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        insightsEl.style.background = 'rgba(239, 68, 68, 0.03)';
        insightsEl.style.color = 'var(--danger)';
      } else if (roundedOverallGain > 0) {
        insightsEl.innerHTML = `✅ <strong>DSR Stock Reconciliation:</strong> A physical stock surplus of <strong>${roundedOverallGain} L</strong> was recorded. Stock levels are healthy.`;
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

    document.getElementById('sales-value-display').textContent = `₹ ${Number(totalSalesValue).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('coins-value-display-summary').textContent = `₹ ${Number(totalCoins).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('cash-received-display').textContent = `₹ ${Number(totalCashReceived).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    const shortfall = totalSalesValue - totalCashReceived;
    const shortfallValEl = document.getElementById('cash-shortfall-display-val');
    const shortfallLblEl = document.getElementById('cash-shortfall-lbl');
    const shortfallContainer = document.querySelector('.shortfall-container');

    if (shortfallValEl && shortfallLblEl && shortfallContainer) {
      shortfallValEl.textContent = `₹ ${Number(Math.abs(shortfall)).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
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
    document.getElementById('other-sales-display').textContent = `₹ ${Number(totalSalesValue).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('other-cash-display').textContent = `₹ ${Number(totalCashReceived).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('other-noncash-display').textContent = `₹ ${Number(totalNonCash).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('other-total-settled-display').textContent = `₹ ${Number(totalSettled).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    const shortfallValEl = document.getElementById('net-shortfall-display-val');
    const shortfallLblEl = document.getElementById('net-shortfall-lbl');
    const shortfallContainer = document.querySelector('.net-shortfall-container');

    shortfallValEl.textContent = `₹ ${Number(Math.abs(shortfall)).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

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

  // Finish: Back to Preview — reloads the page to refresh data state
  const btnFinishBack = document.getElementById('btn-finish-back');
  if (btnFinishBack) {
    btnFinishBack.addEventListener('click', () => {
      if (window.location.hash === '#finish') {
        window.history.replaceState(null, '', window.location.pathname);
      }
      window.location.reload();
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
    
    // Enforce minimum date as June 1, 2026
    if (activeDate < '2026-06-01') {
      activeDate = '2026-06-01';
    }
    
    dateInput.value = activeDate;
    dateInput.max = activeDate;
    dateInput.min = '2026-06-01';

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
        
        // Exclude Rs 10 from grand total calculation (as they are not deposited)
        if (val !== 10) {
            grandTotal += total;
        }
        
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
            set('calc-count-10',  0);
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
    const bankFields = ['bank-detail-name','bank-detail-description'];
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

    const bankDetailNameSelect = document.getElementById('bank-detail-name');
    const bankDetailReadonlyInput = document.getElementById('bank-detail-readonly');

    const bankAccounts = {
      "Central Bank CC": "3213073487",
      "Central Bank Current": "3645185168",
      "Central Bank Extortion": "3465617138",
      "Central Bank Rent": "3125126590",
      "Central Bank-Dipak Patil (3297760743)": "3297760743",
      "Central Bank-Dipak Patil (3311034209)": "3311034209",
      "ICICI Bank CC": "010205050800",
      "ICICI Bank Current": "177705014013"
    };

    function updateBankAccountNo() {
      if (bankDetailNameSelect && bankDetailReadonlyInput) {
        const selectedBank = bankDetailNameSelect.value;
        bankDetailReadonlyInput.value = bankAccounts[selectedBank] || '';
      }
    }

    if (bankDetailNameSelect) {
      bankDetailNameSelect.addEventListener('change', updateBankAccountNo);
      bankDetailNameSelect.addEventListener('input', updateBankAccountNo);
      updateBankAccountNo();
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
            <button class="btn btn-secondary btn-delete-hpcl" data-id="${tx.id}" data-date="${tx.date}" style="padding: 0.15rem 0.4rem; font-size: 0.65rem; min-height: auto; width: auto; color: var(--danger); border-color: rgba(239, 68, 68, 0.2); margin: 0; line-height: 1;">
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
      
      // Date freezing does not apply to HPCL Portal Balance page transactions
      
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
      
      // Date freezing does not apply to HPCL Portal Balance page transactions
      
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

  // ── Debtor Management (Udhari) Module Logic ───────────────────────────────

  // Elements
  const udhariToggle = document.getElementById('nav-udhari-toggle');
  const udhariSubmenu = document.getElementById('udhari-submenu');
  
  const udhariAddDebtorForm = document.getElementById('udhari-add-debtor-form');
  const udhariDebtorName = document.getElementById('udhari-debtor-name');
  const udhariDebtorMobile = document.getElementById('udhari-debtor-mobile');
  const udhariDebtorAddress = document.getElementById('udhari-debtor-address');
  const udhariDebtorCount = document.getElementById('udhari-debtor-count');
  const udhariMasterTableBody = document.getElementById('udhari-master-table-body');
  
  const tabActiveDebtors = document.getElementById('tab-active-debtors');
  const tabInactiveDebtors = document.getElementById('tab-inactive-debtors');
  const btnExportActiveDebtors = document.getElementById('btn-export-active-debtors');
  const udhariActiveTableBody = document.getElementById('udhari-active-table-body');
  
  const udhariCreditSaleForm = document.getElementById('udhari-credit-sale-form');
  const udhariCsDate = document.getElementById('udhari-cs-date');
  const udhariCsDebtor = document.getElementById('udhari-cs-debtor');
  const udhariCsProduct = document.getElementById('udhari-cs-product');
  const udhariCsQty = document.getElementById('udhari-cs-qty');
  const udhariCsRate = document.getElementById('udhari-cs-rate');
  const udhariCsAmount = document.getElementById('udhari-cs-amount');
  const udhariCsRemarks = document.getElementById('udhari-cs-remarks');
  
  const udhariReceivePaymentForm = document.getElementById('udhari-receive-payment-form');
  const udhariRpDate = document.getElementById('udhari-rp-date');
  const udhariRpDebtor = document.getElementById('udhari-rp-debtor');
  const udhariRpAmount = document.getElementById('udhari-rp-amount');
  const udhariRpRemarks = document.getElementById('udhari-rp-remarks');
  
  const udhariReportDate = document.getElementById('udhari-report-date');
  const btnExportDateReport = document.getElementById('btn-export-date-report');
  const udhariDateTotalDebit = document.getElementById('udhari-date-total-debit');
  const udhariDateTotalCredit = document.getElementById('udhari-date-total-credit');
  const udhariDateNetChange = document.getElementById('udhari-date-net-change');
  const udhariDateReportBody = document.getElementById('udhari-date-report-body');
  
  const udhariLedgerDebtor = document.getElementById('udhari-ledger-debtor');
  const btnExportDebtorLedger = document.getElementById('btn-export-debtor-ledger');
  const udhariLedgerBody = document.getElementById('udhari-ledger-body');
  
  const udhariSummaryTotalOutstanding = document.getElementById('udhari-summary-total-outstanding');
  const btnExportDebtorSummary = document.getElementById('btn-export-debtor-summary');
  const udhariSummaryBody = document.getElementById('udhari-summary-body');

  // --- Generic Flyout Submenu Overlay Logic ---
  function toggleSubmenu(panelId, triggerElement) {
    document.querySelectorAll('.submenu-sidebar').forEach(el => {
      if (el.id !== panelId) el.classList.remove('open');
    });
    
    const panel = document.getElementById(panelId);
    if (panel) {
      if (!panel.classList.contains('open') && triggerElement) {
        const rect = triggerElement.getBoundingClientRect();
        const triggerCenterY = rect.top + (rect.height / 2);
        const panelHeight = panel.offsetHeight;
        
        let newTop = triggerCenterY - (panelHeight / 2);
        
        // Clamp to viewport bounds
        if (newTop < 10) newTop = 10;
        if (newTop + panelHeight > window.innerHeight - 10) {
          newTop = window.innerHeight - panelHeight - 10;
        }
        
        panel.style.top = `${newTop}px`;
      }
      panel.classList.toggle('open');
    }
  }

  function closeAllSubmenus() {
    document.querySelectorAll('.submenu-sidebar').forEach(el => el.classList.remove('open'));
  }

  // Wire main sidebar toggles
  if (udhariToggle) {
    udhariToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSubmenu('udhari-submenu-panel', udhariToggle);
    });
  }

  const otherToggle = document.getElementById('nav-other-toggle');
  if (otherToggle) {
    otherToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSubmenu('other-submenu-panel', otherToggle);
    });
  }

  const navExit = document.getElementById('nav-exit');
  if (navExit) {
    navExit.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        window.close();
        setTimeout(() => {
          showToast('You can now close this tab', 'success');
        }, 100);
      } catch (err) {
        showToast('You can now close this tab', 'success');
      }
    });
  }

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (e.target.closest('.submenu-sidebar')) {
      if (e.target.closest('.nav-item')) {
        setTimeout(closeAllSubmenus, 50);
      }
      return;
    }
    if (e.target.closest('#nav-udhari-toggle') || e.target.closest('#nav-other-toggle')) {
      return;
    }
    closeAllSubmenus();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllSubmenus();
    }
  });

  // Wire sidebar sub-nav clicks
  const udhariNavIds = [
    'nav-udhari-master',
    'nav-udhari-active',
    'nav-udhari-credit-sale',
    'nav-udhari-receive-payment',
    'nav-udhari-date-report',
    'nav-udhari-ledger',
    'nav-udhari-summary'
  ];

  udhariNavIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const viewName = id.replace('nav-', '');
        showView(viewName);
      });
    }
  });

  // Keep track of active/inactive tab state
  let showingActiveDebtorsTab = true;

  // Global Outstanding Card Updater
  async function updateGlobalOutstandingCard() {
    try {
      const res = await fetch('/api/debtors/total-outstanding');
      if (res.ok) {
        const data = await res.json();
        const el = document.getElementById('udhari-dashboard-outstanding');
        const formatted = `₹ ${data.total_outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (el) el.textContent = formatted;
        
        // Also update summary total outstanding if element exists
        if (udhariSummaryTotalOutstanding) {
          udhariSummaryTotalOutstanding.textContent = formatted;
        }
      }
    } catch (err) {
      console.error('Error updating total outstanding:', err);
    }
  }

  // Helper to load debtors into selects
  async function populateDebtorDropdowns() {
    try {
      const res = await fetch('/api/debtors');
      if (!res.ok) throw new Error('Failed to fetch debtors');
      const debtors = await res.json();
      
      const selects = [udhariCsDebtor, udhariRpDebtor, udhariLedgerDebtor];
      selects.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">— Select Debtor —</option>';
        debtors.forEach(d => {
          if (d.is_active === 1) {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.debtor_name;
            select.appendChild(opt);
          }
        });
        select.value = currentVal;
      });
    } catch (err) {
      console.error('Error populating debtor dropdowns:', err);
    }
  }

  // 1. Debtor Master CRUD
  async function loadDebtorMaster() {
    try {
      const res = await fetch('/api/debtors');
      if (!res.ok) throw new Error('Failed to fetch debtors');
      const debtors = await res.json();
      
      if (udhariDebtorCount) udhariDebtorCount.textContent = debtors.length;
      if (!udhariMasterTableBody) return;
      
      udhariMasterTableBody.innerHTML = '';
      if (debtors.length === 0) {
        udhariMasterTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">No debtors added yet.</td></tr>`;
        return;
      }
      
      debtors.forEach(d => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        
        const outstandingVal = parseFloat(d.outstanding || 0);
        const outstandingFormatted = `₹ ${outstandingVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const outstandingStyle = outstandingVal > 0 ? 'color: var(--danger); font-weight: 700;' : 'color: var(--text-muted);';
        
        tr.innerHTML = `
          <td style="padding: 0.45rem 0.75rem;">
            <span class="debtor-ledger-link" 
                  data-id="${d.id}" 
                  style="font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: none; transition: all 0.2s;"
                  onmouseover="this.style.textDecoration='underline'; this.style.opacity='0.85';"
                  onmouseout="this.style.textDecoration='none'; this.style.opacity='1';">${d.debtor_name}</span>
          </td>
          <td style="padding: 0.45rem 0.75rem;">${d.mobile || '—'}</td>
          <td style="padding: 0.45rem 0.75rem;">${d.address || '—'}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: right; ${outstandingStyle}">${outstandingFormatted}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: center;">
            <button type="button" class="btn-edit-debtor" data-id="${d.id}" data-name="${d.debtor_name}" data-mobile="${d.mobile || ''}" data-address="${d.address || ''}" style="margin-right: 0.5rem;">
              Edit ✏️
            </button>
            <button type="button" class="btn-delete-debtor" data-id="${d.id}" data-name="${d.debtor_name}">
              Delete 🗑️
            </button>
          </td>
        `;
        udhariMasterTableBody.appendChild(tr);
      });
      
      // Wire debtor ledger links
      udhariMasterTableBody.querySelectorAll('.debtor-ledger-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const debtorId = link.getAttribute('data-id');
          if (udhariLedgerDebtor) {
            udhariLedgerDebtor.value = debtorId;
            showView('udhari-ledger');
            loadIndividualLedger();
          }
        });
      });
      
      // Wire edit buttons
      udhariMasterTableBody.querySelectorAll('.btn-edit-debtor').forEach(btn => {
        btn.addEventListener('click', () => {
          const tr = btn.closest('tr');
          const id = btn.getAttribute('data-id');
          const name = btn.getAttribute('data-name');
          const mobile = btn.getAttribute('data-mobile');
          const address = btn.getAttribute('data-address');
          
          const tdName = tr.children[0];
          const tdMobile = tr.children[1];
          const tdAddress = tr.children[2];
          const tdActions = tr.children[4];

          tdName.innerHTML = `<input type="text" class="edit-name" value="${name.replace(/"/g, '&quot;')}" style="width:100%; padding: 0.2rem;" />`;
          tdMobile.innerHTML = `<input type="text" class="edit-mobile" value="${mobile.replace(/"/g, '&quot;')}" style="width:100%; padding: 0.2rem;" />`;
          tdAddress.innerHTML = `<input type="text" class="edit-address" value="${address.replace(/"/g, '&quot;')}" style="width:100%; padding: 0.2rem;" />`;
          tdActions.innerHTML = `
            <button type="button" class="btn-save-debtor" style="margin-right: 0.5rem; color: var(--success); font-weight: 600;">Save ✔️</button>
            <button type="button" class="btn-cancel-debtor" style="color: var(--text-muted);">Cancel ❌</button>
          `;

          tr.querySelector('.btn-cancel-debtor').addEventListener('click', () => loadDebtorMaster());
          
          tr.querySelector('.btn-save-debtor').addEventListener('click', async () => {
            const newName = tr.querySelector('.edit-name').value;
            const newMobile = tr.querySelector('.edit-mobile').value;
            const newAddress = tr.querySelector('.edit-address').value;
            
            try {
              const updateRes = await fetch('/api/debtors/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ debtor_name: newName, mobile: newMobile, address: newAddress })
              });
              if (!updateRes.ok) {
                const errData = await updateRes.json();
                throw new Error(errData.error || 'Failed to update debtor');
              }
              showToast('Debtor updated successfully.', 'success');
              loadDebtorMaster();
              populateDebtorDropdowns();
              loadActiveOrInactiveDebtors(showingActiveDebtorsTab);
            } catch (err) {
              console.error(err);
              showToast(err.message, 'error');
            }
          });
        });
      });

      // Wire delete buttons
      udhariMasterTableBody.querySelectorAll('.btn-delete-debtor').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const name = btn.getAttribute('data-name');
          if (confirm(`Are you sure you want to delete debtor "${name}"?`)) {
            try {
              const delRes = await fetch(`/api/debtors/${id}`, { method: 'DELETE' });
              if (!delRes.ok) {
                const errData = await delRes.json();
                throw new Error(errData.error || 'Failed to delete debtor');
              }
              showToast('Debtor deleted successfully.', 'success');
              loadDebtorMaster();
              updateGlobalOutstandingCard();
            } catch (err) {
              console.error(err);
              showToast(err.message, 'error');
            }
          }
        });
      });
    } catch (err) {
      console.error('Error loading debtor master:', err);
      showToast('Error loading debtor master list.', 'error');
    }
  }

  if (udhariAddDebtorForm) {
    udhariAddDebtorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = udhariDebtorName.value.trim();
      const mobile = udhariDebtorMobile.value.trim();
      const address = udhariDebtorAddress.value.trim();
      
      if (!name) {
        showToast('Debtor name is required.', 'warning');
        return;
      }
      
      try {
        const res = await fetch('/api/debtors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ debtor_name: name, mobile, address })
        });
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to add debtor');
        }
        
        showToast('Debtor added successfully.', 'success');
        udhariAddDebtorForm.reset();
        loadDebtorMaster();
        updateGlobalOutstandingCard();
      } catch (err) {
        console.error(err);
        showToast(err.message, 'error');
      }
    });
  }

  // 2. Active / Inactive Debtors Tab View
  async function loadActiveOrInactiveDebtors(isActive) {
    showingActiveDebtorsTab = isActive;
    if (tabActiveDebtors) tabActiveDebtors.classList.toggle('active', isActive);
    if (tabInactiveDebtors) tabInactiveDebtors.classList.toggle('active', !isActive);
    
    try {
      const res = await fetch('/api/debtors');
      if (!res.ok) throw new Error('Failed to fetch debtors');
      const debtors = await res.json();
      
      const filtered = debtors.filter(d => isActive ? parseFloat(d.outstanding || 0) > 0.005 : parseFloat(d.outstanding || 0) <= 0.005);
      
      if (!udhariActiveTableBody) return;
      udhariActiveTableBody.innerHTML = '';
      
      if (filtered.length === 0) {
        udhariActiveTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 3rem; color: var(--text-muted);">No ${isActive ? 'active' : 'inactive'} debtors found.</td></tr>`;
        return;
      }
      
      filtered.forEach(d => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        
        const outstandingVal = parseFloat(d.outstanding || 0);
        const outstandingFormatted = `₹ ${outstandingVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const outstandingStyle = outstandingVal > 0 ? 'color: var(--danger); font-weight: 700;' : 'color: var(--text-muted);';
        
        tr.innerHTML = `
          <td style="padding: 0.45rem 0.75rem;">
            <span class="debtor-ledger-link" 
                  data-id="${d.id}" 
                  style="font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: none; transition: all 0.2s;"
                  onmouseover="this.style.textDecoration='underline'; this.style.opacity='0.85';"
                  onmouseout="this.style.textDecoration='none'; this.style.opacity='1';">${d.debtor_name}</span>
          </td>
          <td style="padding: 0.45rem 0.75rem;">${d.mobile || '—'}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: right; ${outstandingStyle}">${outstandingFormatted}</td>
        `;
        udhariActiveTableBody.appendChild(tr);
      });

      // Wire debtor ledger links for active/inactive debtors
      udhariActiveTableBody.querySelectorAll('.debtor-ledger-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const debtorId = link.getAttribute('data-id');
          if (udhariLedgerDebtor) {
            udhariLedgerDebtor.value = debtorId;
            showView('udhari-ledger');
            loadIndividualLedger();
          }
        });
      });
    } catch (err) {
      console.error(err);
      showToast('Error loading active/inactive debtors.', 'error');
    }
  }

  if (tabActiveDebtors) {
    tabActiveDebtors.addEventListener('click', () => loadActiveOrInactiveDebtors(true));
  }
  if (tabInactiveDebtors) {
    tabInactiveDebtors.addEventListener('click', () => loadActiveOrInactiveDebtors(false));
  }

  // 3. Add Credit Sale (DEBIT)
  async function initCreditSaleEntry() {
    if (udhariCsDate && !udhariCsDate.value) {
      udhariCsDate.value = dateInput.value;
    }
    await populateDebtorDropdowns();
    updateCreditSaleRate();
  }

  function updateCreditSaleRate() {
    if (!udhariCsProduct || !udhariCsRate) return;
    const prod = udhariCsProduct.value;
    
    if (prod === 'Petrol') {
      udhariCsRate.value = currentRates.Petrol.toFixed(2);
    } else if (prod === 'Diesel') {
      udhariCsRate.value = currentRates.Diesel.toFixed(2);
    } else if (prod === 'poWer') {
      udhariCsRate.value = currentRates.poWer.toFixed(2);
    } else {
      udhariCsRate.value = '';
    }
    updateCreditSaleAmount();
  }

  function updateCreditSaleAmount() {
    if (!udhariCsQty || !udhariCsRate || !udhariCsAmount) return;
    const qty = parseFloat(udhariCsQty.value) || 0;
    const rate = parseFloat(udhariCsRate.value) || 0;
    if (qty > 0 && rate > 0) {
      udhariCsAmount.value = (qty * rate).toFixed(2);
    }
  }

  if (udhariCsProduct) udhariCsProduct.addEventListener('change', updateCreditSaleRate);
  if (udhariCsQty) udhariCsQty.addEventListener('input', updateCreditSaleAmount);
  if (udhariCsRate) udhariCsRate.addEventListener('input', updateCreditSaleAmount);

  if (udhariCreditSaleForm) {
    udhariCreditSaleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const debtorId = udhariCsDebtor.value;
      const date = udhariCsDate.value;
      const product = udhariCsProduct.value;
      const qty = parseFloat(udhariCsQty.value) || 0;
      const rate = parseFloat(udhariCsRate.value) || 0;
      const amount = parseFloat(udhariCsAmount.value) || 0;
      const remarks = udhariCsRemarks.value.trim();
      
      if (!debtorId || !date || amount <= 0) {
        showToast('Debtor, date, and positive amount are required.', 'warning');
        return;
      }
      
      // Bypassed lock validation for Category B debtor transactions
      
      // Auto-construct description
      let desc = product;
      if (qty > 0 && rate > 0) {
        desc += ` - ${qty.toFixed(2)} L @ ₹ ${rate.toFixed(2)}/L`;
      }
      if (remarks) {
        desc += ` (${remarks})`;
      }
      
      try {
        const res = await fetch('/api/debtor-transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            debtor_id: debtorId,
            transaction_date: date,
            transaction_type: 'DEBIT',
            description: desc,
            debit_amount: amount,
            credit_amount: 0
          })
        });
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to record credit sale');
        }
        
        showToast('Credit sale recorded successfully.', 'success');
        udhariCreditSaleForm.reset();
        initCreditSaleEntry();
        updateGlobalOutstandingCard();
        
        // Redirect to ledger for this debtor
        if (udhariLedgerDebtor) {
          udhariLedgerDebtor.value = debtorId;
          showView('udhari-ledger');
        }
      } catch (err) {
        console.error(err);
        showToast(err.message, 'error');
      }
    });
  }

  // 4. Receive Payment (CREDIT)
  async function initReceivePaymentEntry() {
    if (udhariRpDate && !udhariRpDate.value) {
      udhariRpDate.value = dateInput.value;
    }
    await populateDebtorDropdowns();
  }

  if (udhariReceivePaymentForm) {
    udhariReceivePaymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const debtorId = udhariRpDebtor.value;
      const date = udhariRpDate.value;
      const amount = parseFloat(udhariRpAmount.value) || 0;
      const remarks = udhariRpRemarks.value.trim();
      
      if (!debtorId || !date || amount <= 0) {
        showToast('Debtor, date, and positive amount are required.', 'warning');
        return;
      }
      
      // Bypassed lock validation for Category B debtor transactions
      
      const desc = remarks || 'Cash Received';
      
      try {
        const res = await fetch('/api/debtor-transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            debtor_id: debtorId,
            transaction_date: date,
            transaction_type: 'CREDIT',
            description: desc,
            debit_amount: 0,
            credit_amount: amount
          })
        });
        
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to record payment');
        }
        
        showToast('Payment recorded successfully.', 'success');
        udhariReceivePaymentForm.reset();
        initReceivePaymentEntry();
        updateGlobalOutstandingCard();
        
        // Redirect to ledger for this debtor
        if (udhariLedgerDebtor) {
          udhariLedgerDebtor.value = debtorId;
          showView('udhari-ledger');
        }
      } catch (err) {
        console.error(err);
        showToast(err.message, 'error');
      }
    });
  }

  // 5. Date Wise Report
  async function loadDateWiseReport() {
    if (udhariReportDate && !udhariReportDate.value) {
      udhariReportDate.value = dateInput.value;
    }
    const date = udhariReportDate.value;
    if (!date) return;
    
    try {
      const res = await fetch(`/api/debtor-transactions/date?date=${date}`);
      if (!res.ok) throw new Error('Failed to fetch date report');
      const data = await res.json();
      
      if (udhariDateTotalDebit) {
        udhariDateTotalDebit.textContent = `₹ ${data.total_debit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      if (udhariDateTotalCredit) {
        udhariDateTotalCredit.textContent = `₹ ${data.total_credit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      if (udhariDateNetChange) {
        const netStyle = data.net_change >= 0 ? 'color: var(--danger);' : 'color: var(--success);';
        udhariDateNetChange.setAttribute('style', netStyle);
        udhariDateNetChange.textContent = `${data.net_change >= 0 ? '+' : ''} ₹ ${data.net_change.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      
      if (!udhariDateReportBody) return;
      udhariDateReportBody.innerHTML = '';
      
      if (data.transactions.length === 0) {
        udhariDateReportBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">No credit transactions recorded for this date.</td></tr>`;
        return;
      }
      
      data.transactions.forEach(tx => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        
        const isDebit = tx.transaction_type === 'DEBIT';
        const typeBadge = `<span class="type-badge ${isDebit ? 'debit' : 'credit'}">${tx.transaction_type}</span>`;
        const debitText = tx.debit_amount > 0 ? `₹ ${tx.debit_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
        const creditText = tx.credit_amount > 0 ? `₹ ${tx.credit_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
        
        tr.innerHTML = `
          <td style="padding: 0.45rem 0.75rem; font-weight: 600; color: var(--text-main);">${tx.debtor_name}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: center;">${typeBadge}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: right; color: var(--danger);">${debitText}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: right; color: var(--success);">${creditText}</td>
          <td style="padding: 0.45rem 0.75rem;">${tx.description || '—'}</td>
        `;
        udhariDateReportBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      showToast('Error loading date wise report.', 'error');
    }
  }

  if (udhariReportDate) {
    udhariReportDate.addEventListener('change', loadDateWiseReport);
  }

  // 6. Debtor Ledger
  async function loadLedgerDebtorSelect() {
    await populateDebtorDropdowns();
    loadIndividualLedger();
  }

  function parseInputDate(str) {
    if (!str) return null;
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }

  async function saveLedgerRow(tr) {
    const txnId = tr.dataset.id;
    if (!txnId) return;

    const dateEl = tr.querySelector('.cell-date');
    const partEl = tr.querySelector('.cell-particulars');
    const debitEl = tr.querySelector('.cell-debit');
    const creditEl = tr.querySelector('.cell-credit');
    const remarksEl = tr.querySelector('.cell-remarks');

    const dateVal = parseInputDate(dateEl.textContent.trim());
    const description = partEl.textContent.trim();
    const debit = parseFloat(debitEl.textContent.replace(/[^\d.-]/g, '')) || 0;
    const credit = parseFloat(creditEl.textContent.replace(/[^\d.-]/g, '')) || 0;
    const remarks = remarksEl.textContent.trim();

    if (!dateVal) {
      showToast('Please enter a valid date.', 'error');
      loadIndividualLedger();
      return;
    }

    // Check if anything actually changed
    const originalDate = tr.dataset.date;
    const originalDesc = tr.dataset.description;
    const originalDebit = parseFloat(tr.dataset.debit) || 0;
    const originalCredit = parseFloat(tr.dataset.credit) || 0;
    const originalRemarks = tr.dataset.remarks || '';

    if (
      dateVal === originalDate &&
      description === originalDesc &&
      Math.abs(debit - originalDebit) < 0.005 &&
      Math.abs(credit - originalCredit) < 0.005 &&
      remarks === originalRemarks
    ) {
      return; // No change
    }

    const payload = {
      transaction_date: dateVal,
      description: description,
      debit_amount: debit,
      credit_amount: credit,
      remarks: remarks
    };

    try {
      const res = await fetch(`/api/debtor-transactions/${txnId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to update transaction');
      }

      showToast('Transaction updated successfully!', 'success');
      loadIndividualLedger();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error updating transaction.', 'error');
      loadIndividualLedger();
    }
  }

  async function loadIndividualLedger() {
    if (!udhariLedgerDebtor || !udhariLedgerBody) return;
    const id = udhariLedgerDebtor.value;
    if (!id) {
      udhariLedgerBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">Select a debtor to view their ledger.</td></tr>`;
      return;
    }
    
    try {
      const res = await fetch(`/api/debtors/${id}/transactions`);
      if (!res.ok) throw new Error('Failed to fetch ledger');
      const data = await res.json();
      
      udhariLedgerBody.innerHTML = '';
      if (data.transactions.length === 0) {
        udhariLedgerBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">No transactions recorded for this debtor yet.</td></tr>`;
        return;
      }
      
      data.transactions.forEach(tx => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        tr.dataset.id = tx.id;
        tr.dataset.date = tx.transaction_date;
        tr.dataset.description = tx.description || '';
        tr.dataset.debit = tx.debit_amount || 0;
        tr.dataset.credit = tx.credit_amount || 0;
        tr.dataset.balance = tx.running_balance || 0;
        tr.dataset.remarks = tx.remarks || '';
        
        const balVal = parseFloat(tx.running_balance || 0);
        const balStyle = balVal > 0 ? 'color: var(--danger); font-weight: 700;' : 'color: var(--text-muted);';
        
        const isEditable = true; // Category B debtor transactions are always editable
        tr.innerHTML = `
          <td class="${isEditable ? 'editable-cell' : ''} cell-date" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.45rem 0.75rem; font-weight: 600; white-space: nowrap;">${formatDate(tx.transaction_date)}</td>
          <td class="${isEditable ? 'editable-cell' : ''} cell-particulars" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.45rem 0.75rem; white-space: nowrap;">${tx.description || ''}</td>
          <td class="${isEditable ? 'editable-cell' : ''} cell-debit" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.45rem 0.75rem; text-align: right; color: var(--danger); white-space: nowrap;">${tx.debit_amount > 0 ? tx.debit_amount.toFixed(2) : ''}</td>
          <td class="${isEditable ? 'editable-cell' : ''} cell-credit" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.45rem 0.75rem; text-align: right; color: var(--success); white-space: nowrap;">${tx.credit_amount > 0 ? tx.credit_amount.toFixed(2) : ''}</td>
          <td class="cell-balance" style="padding: 0.45rem 0.75rem; text-align: right; white-space: nowrap; ${balStyle}">${balVal.toFixed(2)}</td>
          <td class="${isEditable ? 'editable-cell' : ''} cell-remarks" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.45rem 0.75rem;">${tx.remarks || ''}</td>
        `;

        tr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.target.blur();
          }
        });

        tr.querySelectorAll('.editable-cell').forEach(cell => {
          cell.addEventListener('blur', () => saveLedgerRow(tr));
        });

        udhariLedgerBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      showToast('Error loading individual ledger.', 'error');
    }
  }

  if (udhariLedgerDebtor) {
    udhariLedgerDebtor.addEventListener('change', loadIndividualLedger);
  }

  // 7. Debtor Summary
  async function loadDebtorSummary() {
    try {
      const res = await fetch('/api/debtors/summary');
      if (!res.ok) throw new Error('Failed to fetch summary');
      const summary = await res.json();
      
      if (!udhariSummaryBody) return;
      udhariSummaryBody.innerHTML = '';
      
      if (summary.length === 0) {
        udhariSummaryBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-muted);">No debtors found.</td></tr>`;
        return;
      }
      
      let totalOut = 0;
      summary.forEach(s => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        
        const debitVal = parseFloat(s.total_debit || 0);
        const creditVal = parseFloat(s.total_credit || 0);
        const outVal = parseFloat(s.outstanding || 0);
        totalOut += outVal;
        
        const outStyle = outVal > 0 ? 'color: var(--danger); font-weight: 700;' : 'color: var(--text-muted);';
        
        tr.innerHTML = `
          <td style="padding: 0.45rem 0.75rem; font-weight: 600; color: var(--text-main);">${s.debtor_name}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: right;">₹ ${debitVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: right;">₹ ${creditVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="padding: 0.45rem 0.75rem; text-align: right; ${outStyle}">₹ ${outVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        udhariSummaryBody.appendChild(tr);
      });
      
      if (udhariSummaryTotalOutstanding) {
        udhariSummaryTotalOutstanding.textContent = `₹ ${totalOut.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading debtor summary.', 'error');
    }
  }

  // 8. CSV Exports
  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // A. Export Active/Inactive Debtors
  if (btnExportActiveDebtors) {
    btnExportActiveDebtors.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/debtors');
        if (!res.ok) throw new Error('Failed to fetch debtors');
        const debtors = await res.json();
        
        const isActive = showingActiveDebtorsTab;
        const filtered = debtors.filter(d => isActive ? parseFloat(d.outstanding || 0) > 0.005 : parseFloat(d.outstanding || 0) <= 0.005);
        
        let csv = `${isActive ? 'Active' : 'Inactive'} Debtors List (${new Date().toLocaleDateString()})\n\n`;
        csv += 'Debtor Name,Mobile,Outstanding Balance (₹)\n';
        
        let total = 0;
        filtered.forEach(d => {
          const bal = parseFloat(d.outstanding || 0);
          total += bal;
          csv += `"${d.debtor_name}","${d.mobile || ''}",${bal.toFixed(2)}\n`;
        });
        csv += `TOTAL,,${total.toFixed(2)}\n`;
        
        downloadCSV(csv, `${isActive ? 'Active' : 'Inactive'}_Debtors_${new Date().toISOString().split('T')[0]}.csv`);
      } catch (err) {
        console.error(err);
        showToast('CSV export failed.', 'error');
      }
    });
  }

  // B. Export Date Wise Report
  if (btnExportDateReport) {
    btnExportDateReport.addEventListener('click', async () => {
      const date = udhariReportDate.value;
      if (!date) {
        showToast('Please select a date first.', 'warning');
        return;
      }
      try {
        const res = await fetch(`/api/debtor-transactions/date?date=${date}`);
        if (!res.ok) throw new Error('Failed to fetch date report');
        const data = await res.json();
        
        let csv = `Date Wise Udhari Report for ${formatDate(date)}\n\n`;
        csv += 'Debtor,Type,Debit (₹),Credit (₹),Remarks\n';
        
        data.transactions.forEach(tx => {
          csv += `"${tx.debtor_name}","${tx.transaction_type}",${(tx.debit_amount || 0).toFixed(2)},${(tx.credit_amount || 0).toFixed(2)},"${tx.description || ''}"\n`;
        });
        csv += `TOTAL,Deibts/Credits,${data.total_debit.toFixed(2)},${data.total_credit.toFixed(2)}\n`;
        csv += `NET CHANGE,,${data.net_change.toFixed(2)}\n`;
        
        downloadCSV(csv, `Udhari_Date_Report_${date}.csv`);
      } catch (err) {
        console.error(err);
        showToast('CSV export failed.', 'error');
      }
    });
  }

  // C. Export Debtor Ledger
  if (btnExportDebtorLedger) {
    btnExportDebtorLedger.addEventListener('click', async () => {
      const id = udhariLedgerDebtor.value;
      if (!id) {
        showToast('Please select a debtor first.', 'warning');
        return;
      }
      try {
        const res = await fetch(`/api/debtors/${id}/transactions`);
        if (!res.ok) throw new Error('Failed to fetch ledger');
        const data = await res.json();
        
        let csv = `Debtor Ledger: ${data.debtor_name}\n\n`;
        csv += 'Date,Particulars,Debit (₹),Credit (₹),Running Balance (₹),Remarks\n';
        
        data.transactions.forEach(tx => {
          csv += `"${formatDate(tx.transaction_date)}","${tx.description || ''}",${(tx.debit_amount || 0).toFixed(2)},${(tx.credit_amount || 0).toFixed(2)},${tx.running_balance.toFixed(2)},"${tx.remarks || ''}"\n`;
        });
        
        downloadCSV(csv, `Debtor_Ledger_${data.debtor_name.replace(/\s+/g, '_')}.csv`);
      } catch (err) {
        console.error(err);
        showToast('CSV export failed.', 'error');
      }
    });
  }

  // D. Export Debtor Summary
  if (btnExportDebtorSummary) {
    btnExportDebtorSummary.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/debtors/summary');
        if (!res.ok) throw new Error('Failed to fetch summary');
        const summary = await res.json();
        
        let csv = `Debtor Summary Report (Generated on ${new Date().toLocaleDateString()})\n\n`;
        csv += 'Debtor,Total Debit (₹),Total Credit (₹),Outstanding Balance (₹)\n';
        
        let totalDebit = 0;
        let totalCredit = 0;
        let totalOut = 0;
        
        summary.forEach(s => {
          const deb = parseFloat(s.total_debit || 0);
          const cred = parseFloat(s.total_credit || 0);
          const out = parseFloat(s.outstanding || 0);
          
          totalDebit += deb;
          totalCredit += cred;
          totalOut += out;
          
          csv += `"${s.debtor_name}",${deb.toFixed(2)},${cred.toFixed(2)},${out.toFixed(2)}\n`;
        });
        
        csv += `TOTAL,${totalDebit.toFixed(2)},${totalCredit.toFixed(2)},${totalOut.toFixed(2)}\n`;
        
        downloadCSV(csv, `Debtor_Summary_${new Date().toISOString().split('T')[0]}.csv`);
      } catch (err) {
        console.error(err);
        showToast('CSV export failed.', 'error');
      }
    });
  }

  // Initial load
  initializeDefaultDate();
  updateGlobalOutstandingCard();
  fetchGlobalDebtorsList();
  fetchGlobalEmployeesList();

  // ── EMPLOYEE MANAGEMENT ──────────────────────────────────────────────────────

  const navEmployeeManagement = document.getElementById('nav-employee-management');
  const viewEmployeeManagement = document.getElementById('view-employee-management');

  // Modals
  const modalAddEmployee = document.getElementById('modal-add-employee');
  const modalEditEmployee = document.getElementById('modal-edit-employee');
  const modalEmployeeTxn = document.getElementById('modal-employee-txn');
  const modalEmployeeLedger = document.getElementById('modal-employee-ledger');
  const modalEmployeeEditTxn = document.getElementById('modal-employee-edit-txn');

  // Forms
  const formAddEmployee = document.getElementById('form-add-employee');
  const formEditEmployee = document.getElementById('form-edit-employee');
  const formEmployeeTxn = document.getElementById('form-employee-txn');
  const formEmployeeEditTxn = document.getElementById('form-employee-edit-txn');

  // Month state — each month is a fresh ledger; default to current month
  const _empNow = new Date();
  const _empCurrMonth = `${_empNow.getFullYear()}-${String(_empNow.getMonth() + 1).padStart(2, '0')}`;
  const _empPrevD = new Date(_empNow.getFullYear(), _empNow.getMonth() - 1, 1);
  const _empPrevMonth = `${_empPrevD.getFullYear()}-${String(_empPrevD.getMonth() + 1).padStart(2, '0')}`;
  let empActiveMonth = _empCurrMonth;

  function empMonthLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, 1)
      .toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  // Navigation
  if (navEmployeeManagement) {
    navEmployeeManagement.addEventListener('click', (e) => {
      e.preventDefault();
      showView('employee-management');
      renderEmpMonthTabs();
      fetchEmployees();
    });
  }

  const btnBackToEmployees = document.getElementById('btn-back-to-employees');
  if (btnBackToEmployees) {
    btnBackToEmployees.addEventListener('click', () => {
      showView('employee-management');
      fetchEmployees();
    });
  }

  // Render month tabs (Prev Month | Current Month)
  function renderEmpMonthTabs() {
    const tabContainer = document.getElementById('emp-month-tabs');
    if (!tabContainer) return;
    tabContainer.innerHTML = '';
    [_empPrevMonth, _empCurrMonth].forEach(ym => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (ym === empActiveMonth ? 'btn-primary' : 'btn-secondary');
      btn.style.cssText = 'padding:0.4rem 1.2rem; font-size:0.85rem; border-radius:2rem; margin-right:0.5rem;';
      btn.textContent = empMonthLabel(ym);
      btn.addEventListener('click', () => {
        empActiveMonth = ym;
        renderEmpMonthTabs();
        fetchEmployees();
      });
      tabContainer.appendChild(btn);
    });
    const title = document.getElementById('emp-month-title');
    if (title) title.textContent = empMonthLabel(empActiveMonth) + ' — Advance Register';
  }

  // Add Employee Button
  const btnAddEmployee = document.getElementById('btn-add-employee');
  if (btnAddEmployee) {
    btnAddEmployee.addEventListener('click', () => {
      document.getElementById('new-emp-name').value = '';
      document.getElementById('new-emp-mobile').value = '';
      if (modalAddEmployee) modalAddEmployee.style.display = 'flex';
    });
  }

  // Add Employee Form Submit
  if (formAddEmployee) {
    formAddEmployee.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-emp-name').value.trim();
      const mobile = document.getElementById('new-emp-mobile').value.trim();
      if (!name) { showToast('Employee name is required.', 'warning'); return; }
      try {
        const res = await fetch('/api/employees', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mobile })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add employee');
        showToast('Employee added successfully', 'success');
        if (modalAddEmployee) modalAddEmployee.style.display = 'none';
        fetchEmployees();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  // Edit Employee — open modal
  window.openEditEmployee = function(id, name, mobile) {
    document.getElementById('edit-emp-id').value = id;
    document.getElementById('edit-emp-name').value = name;
    document.getElementById('edit-emp-mobile').value = mobile || '';
    if (modalEditEmployee) modalEditEmployee.style.display = 'flex';
  };

  // Edit Employee Form Submit
  if (formEditEmployee) {
    formEditEmployee.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-emp-id').value;
      const name = document.getElementById('edit-emp-name').value.trim();
      const mobile = document.getElementById('edit-emp-mobile').value.trim();
      if (!name) { showToast('Employee name is required.', 'warning'); return; }
      try {
        const res = await fetch(`/api/employees/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mobile })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update employee');
        showToast('Employee updated successfully', 'success');
        if (modalEditEmployee) modalEditEmployee.style.display = 'none';
        fetchEmployees();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  // Add Transaction Form Submit
  if (formEmployeeTxn) {
    formEmployeeTxn.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('txn-emp-id').value;
      const date = document.getElementById('txn-emp-date').value;
      const type = document.getElementById('txn-emp-type').value;
      const amount = document.getElementById('txn-emp-amount').value;
      const desc = document.getElementById('txn-emp-desc').value;
      if (!date || !amount || parseFloat(amount) <= 0) {
        showToast('Date and a positive amount are required.', 'warning'); return;
      }
      if (!date.startsWith(empActiveMonth)) {
        showToast(`Date must be within ${empMonthLabel(empActiveMonth)}.`, 'warning'); return;
      }
      try {
        const res = await fetch(`/api/employees/${id}/transactions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, type, amount, description: desc })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add transaction');
        showToast('Transaction added.', 'success');
        if (modalEmployeeTxn) modalEmployeeTxn.style.display = 'none';
        fetchEmployees();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  // Fetch & Render Employees for Active Month
  async function fetchEmployees() {
    const tbody = document.getElementById('employee-list-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading...</td></tr>';
    try {
      const res = await fetch(`/api/employees?month=${empActiveMonth}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load employees');

      // Month totals summary bar (includes opening balance, given, settled, and closing balance)
      const totalOpening = data.employees.reduce((s, e) => s + Number(e.opening_balance || 0), 0);
      const totalGiven = data.employees.reduce((s, e) => s + Number(e.month_given || 0), 0);
      const totalSettled = data.employees.reduce((s, e) => s + Number(e.month_settled || 0), 0);
      const totalClosing = totalOpening + totalGiven - totalSettled;
      const summaryEl = document.getElementById('emp-month-summary');
      if (summaryEl) {
        summaryEl.innerHTML = `
          <span style="margin-right:1.5rem;">Total Opening Bal: <strong style="color:var(--danger);">&#8377; ${totalOpening.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></span>
          <span style="margin-right:1.5rem;">Total Given: <strong style="color:var(--accent);">&#8377; ${totalGiven.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></span>
          <span style="margin-right:1.5rem;">Total Settled: <strong style="color:var(--success);">&#8377; ${totalSettled.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></span>
          <span>Net Outstanding (Closing): <strong style="color:${totalClosing > 0.01 ? 'var(--danger)' : 'var(--text-muted)'};">&#8377; ${totalClosing.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></span>
        `;
      }

      tbody.innerHTML = '';
      if (data.employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted);">No employees found.</td></tr>';
        return;
      }

      const fmt = (n) => '&#8377; ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      data.employees.forEach(emp => {
        const opening = Number(emp.opening_balance || 0);
        const given = Number(emp.month_given || 0);
        const settled = Number(emp.month_settled || 0);
        const closing = opening + given - settled;
        const closingStyle = closing > 0.01 ? 'color:var(--danger); font-weight:700;' : closing < -0.01 ? 'color:var(--success); font-weight:700;' : 'color:var(--text-muted);';
        const safeName = emp.name.replace(/'/g, "\\'");
        const safeMobile = (emp.mobile || '').replace(/'/g, "\\'");

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
        tr.innerHTML = `
          <td style="padding:0.5rem 0.75rem; font-weight:600;">${emp.name}</td>
          <td style="padding:0.5rem 0.75rem; color:var(--text-muted);">${emp.mobile || '&#8212;'}</td>
          <td style="padding:0.5rem 0.75rem; text-align:right; color:var(--danger);">${opening > 0.01 ? fmt(opening) : '&#8212;'}</td>
          <td style="padding:0.5rem 0.75rem; text-align:right; color:var(--accent);">${given > 0.01 ? fmt(given) : '&#8212;'}</td>
          <td style="padding:0.5rem 0.75rem; text-align:right; color:var(--success);">${settled > 0.01 ? fmt(settled) : '&#8212;'}</td>
          <td style="padding:0.5rem 0.75rem; text-align:right; ${closingStyle}">${fmt(closing)}</td>
          <td style="padding:0.5rem 0.75rem; text-align:center;">
            <button class="btn btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.75rem; margin-right:0.25rem;" onclick="openEditEmployee(${emp.id}, '${safeName}', '${safeMobile}')">Edit</button>
            <button class="btn btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.75rem; margin-right:0.25rem;" onclick="openEmployeeTxn(${emp.id}, '${safeName}')">+ Txn</button>
            <button class="btn btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.75rem; margin-right:0.25rem;" onclick="openEmployeeLedger(${emp.id}, '${safeName}')">Ledger</button>
            <button style="padding:0.2rem 0.6rem; font-size:0.75rem; background:var(--danger); color:#fff; border:none; border-radius:0.4rem; cursor:pointer;" onclick="deleteEmployee(${emp.id}, ${closing})">Del</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      showToast(err.message, 'error');
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger);">${err.message}</td></tr>`;
    }
  }

  // Delete Employee
  window.deleteEmployee = async function(id, closingBalance) {
    if (Math.abs(closingBalance) > 0.01) {
      showToast('Cannot delete employee with outstanding advance.', 'error'); return;
    }
    if (!confirm('Delete this employee?')) return;
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      showToast('Employee deleted.', 'success');
      fetchEmployees();
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Open Transaction Modal
  window.openEmployeeTxn = function(id, name) {
    document.getElementById('txn-emp-id').value = id;
    document.getElementById('txn-emp-name').textContent = name;
    const globalDateEl = document.getElementById('reading-date');
    const globalVal = globalDateEl ? globalDateEl.value : '';
    const defaultDate = (globalVal && globalVal.startsWith(empActiveMonth)) ? globalVal : `${empActiveMonth}-01`;
    document.getElementById('txn-emp-date').value = defaultDate;
    document.getElementById('txn-emp-date').min = `${empActiveMonth}-01`;
    document.getElementById('txn-emp-date').max = `${empActiveMonth}-31`;
    document.getElementById('txn-emp-amount').value = '';
    document.getElementById('txn-emp-desc').value = '';
    if (modalEmployeeTxn) modalEmployeeTxn.style.display = 'flex';
  };

  // Open Edit Transaction Modal
  window.openEditEmployeeTxn = function(txnId, empId, empName, date, type, amount, desc) {
    document.getElementById('edit-txn-id').value = txnId;
    document.getElementById('edit-txn-emp-id').value = empId;
    document.getElementById('edit-txn-emp-name').textContent = empName;
    document.getElementById('edit-txn-date').value = date;
    document.getElementById('edit-txn-date').min = `${empActiveMonth}-01`;
    document.getElementById('edit-txn-date').max = `${empActiveMonth}-31`;
    document.getElementById('edit-txn-type').value = type;
    document.getElementById('edit-txn-amount').value = amount;
    document.getElementById('edit-txn-desc').value = desc || '';
    if (modalEmployeeEditTxn) modalEmployeeEditTxn.style.display = 'flex';
  };

  // Edit Transaction Submit
  if (formEmployeeEditTxn) {
    formEmployeeEditTxn.addEventListener('submit', async (e) => {
      e.preventDefault();
      const txnId = document.getElementById('edit-txn-id').value;
      const empId = document.getElementById('edit-txn-emp-id').value;
      const empName = document.getElementById('edit-txn-emp-name').textContent;
      const date = document.getElementById('edit-txn-date').value;
      const type = document.getElementById('edit-txn-type').value;
      const amount = document.getElementById('edit-txn-amount').value;
      const desc = document.getElementById('edit-txn-desc').value;

      if (!date || !amount || parseFloat(amount) <= 0) {
        showToast('Date and a positive amount are required.', 'warning'); return;
      }
      if (!date.startsWith(empActiveMonth)) {
        showToast(`Date must be within ${empMonthLabel(empActiveMonth)}.`, 'warning'); return;
      }

      try {
        const res = await fetch(`/api/employees/transactions/${txnId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, type, amount, description: desc })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update transaction');
        showToast('Transaction updated successfully.', 'success');
        if (modalEmployeeEditTxn) modalEmployeeEditTxn.style.display = 'none';
        openEmployeeLedger(empId, empName);
        fetchEmployees();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  // Delete Transaction
  window.deleteEmployeeTxn = async function(txnId, empId, empName) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      const res = await fetch(`/api/employees/transactions/${txnId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete transaction');
      showToast('Transaction deleted successfully.', 'success');
      openEmployeeLedger(empId, empName);
      fetchEmployees();
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Open Ledger Modal — filtered to active month only, with opening balance carried forward
  window.openEmployeeLedger = async function(id, name) {
    const nameEl = document.getElementById('view-ledger-emp-name') || document.getElementById('ledger-emp-name');
    const monthEl = document.getElementById('view-ledger-emp-month') || document.getElementById('ledger-emp-month');
    const tbody = document.getElementById('view-employee-ledger-tbody') || document.getElementById('employee-ledger-tbody');
    if (nameEl) nameEl.textContent = name;
    if (monthEl) monthEl.textContent = empMonthLabel(empActiveMonth);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem;">Loading...</td></tr>';
    
    const viewLedger = document.getElementById('view-employee-ledger');
    if (viewLedger) {
      showView('employee-ledger');
    } else if (modalEmployeeLedger) {
      modalEmployeeLedger.style.display = 'flex';
    }

    try {
      const res = await fetch(`/api/employees/${id}/transactions?month=${empActiveMonth}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch ledger');

      if (!tbody) return;
      tbody.innerHTML = '';

      const openingBalance = Number(data.openingBalance || 0);

      // Render Opening Balance carried-forward row first
      const openingTr = document.createElement('tr');
      openingTr.style.background = 'rgba(255,255,255,0.01)';
      openingTr.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
      const opBalStyle = openingBalance > 0.01 ? 'color:var(--danger); font-weight:700;' : openingBalance < -0.01 ? 'color:var(--success); font-weight:700;' : 'color:var(--text-muted);';
      const opGiven = openingBalance > 0.01 ? '&#8377; ' + openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '&#8212;';
      const opSettled = openingBalance < -0.01 ? '&#8377; ' + Math.abs(openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '&#8212;';
      
      openingTr.innerHTML = `
        <td style="padding:0.45rem 0.75rem; font-style:italic; font-weight:600;">Opening Balance</td>
        <td style="padding:0.45rem 0.75rem; font-style:italic; color:var(--text-muted);">Carried forward</td>
        <td style="padding:0.45rem 0.75rem; text-align:right; color:var(--danger);">${opGiven}</td>
        <td style="padding:0.45rem 0.75rem; text-align:right; color:var(--success);">${opSettled}</td>
        <td style="padding:0.45rem 0.75rem; text-align:right; ${opBalStyle}">&#8377; ${openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding:0.45rem 0.75rem;"></td>
      `;
      tbody.appendChild(openingTr);

      if (data.transactions.length === 0) {
        return; // Only Opening Balance is shown (which is correct)
      }

      data.transactions.forEach(tx => {
        const given = tx.advance_given > 0 ? '&#8377; ' + Number(tx.advance_given).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '&#8212;';
        const settled = tx.amount_settled > 0 ? '&#8377; ' + Number(tx.amount_settled).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '&#8212;';
        const bal = Number(tx.running_balance);
        const balStyle = bal > 0.01 ? 'color:var(--danger); font-weight:700;' : bal < -0.01 ? 'color:var(--success); font-weight:700;' : 'color:var(--text-muted);';
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
        
        const safeName = name.replace(/'/g, "\\'");
        const safeDesc = (tx.description || '').replace(/'/g, "\\'");
        const amt = tx.advance_given > 0 ? tx.advance_given : tx.amount_settled;

        tr.innerHTML = `
          <td style="padding:0.45rem 0.75rem;">${formatDate(tx.transaction_date)}</td>
          <td style="padding:0.45rem 0.75rem;">${tx.transaction_type}${tx.description ? '<br><small style="color:var(--text-muted);">' + tx.description + '</small>' : ''}</td>
          <td style="padding:0.45rem 0.75rem; text-align:right; color:var(--danger);">${given}</td>
          <td style="padding:0.45rem 0.75rem; text-align:right; color:var(--success);">${settled}</td>
          <td style="padding:0.45rem 0.75rem; text-align:right; ${balStyle}">&#8377; ${bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="padding:0.45rem 0.75rem; text-align:center;">
            <button class="btn btn-secondary" style="padding:0.15rem 0.45rem; font-size:0.75rem; margin-right:0.25rem;" onclick="openEditEmployeeTxn(${tx.id}, ${id}, '${safeName}', '${tx.transaction_date}', '${tx.transaction_type}', ${amt}, '${safeDesc}')">Edit</button>
            <button style="padding:0.15rem 0.45rem; font-size:0.75rem; background:var(--danger); color:#fff; border:none; border-radius:0.4rem; cursor:pointer;" onclick="deleteEmployeeTxn(${tx.id}, ${id}, '${safeName}')">Del</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      showToast(err.message, 'error');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger);">${err.message}</td></tr>`;
    }
  };

  // ── END EMPLOYEE MANAGEMENT ───────────────────────────────────────────────────







  // ── TT (MH-19-CY-5682) LEDGER & TRIPS ──────────────────────────────────────────

  const navTtLedger = document.getElementById('nav-tt-ledger');
  const btnTtManualEntry = document.getElementById('btn-tt-manual-entry');
  const btnTtRecordSettlement = document.getElementById('btn-tt-record-settlement');
  
  const ttStatementBody = document.getElementById('tt-statement-body');
  const ttStatOpening = document.getElementById('tt-stat-opening');
  const ttStatDebits = document.getElementById('tt-stat-debits');
  const ttStatCredits = document.getElementById('tt-stat-credits');
  const ttStatClosing = document.getElementById('tt-stat-closing');

  // ── Load TT Ledger (Expenses) ────────────────────────────────────────────
  async function loadTtLedger() {
    if (!ttStatementBody) return;
    const selectors = document.querySelectorAll('.tt-month-select-shared');
    const month = selectors.length > 0 ? selectors[0].value : '';
    if (!month) {
      ttStatementBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">Select a month to view TT ledger.</td></tr>';
      return;
    }
    try {
      const res = await fetch(`/api/tt/transactions?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      const txns = data.transactions || [];
      if (txns.length === 0) {
        ttStatementBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">No transactions for this month.</td></tr>';
        return;
      }
      let html = '';
      txns.forEach(tx => {
        const d = tx.date || '';
        const p1 = tx.particular1 || '';
        const p2 = tx.description || '';
        const debit = tx.type === 'DEBIT' ? `₹ ${parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '';
        const credit = tx.type === 'CREDIT' ? `₹ ${parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '';
        const bal = parseFloat(tx.running_balance);
        const balColor = bal >= 0 ? 'var(--success)' : 'var(--danger)';
        const balStr = `₹ ${Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:0.6rem 0.85rem;font-size:0.85rem;">${d}</td>
          <td style="padding:0.6rem 0.85rem;font-size:0.85rem;">${p1}</td>
          <td style="padding:0.6rem 0.85rem;font-size:0.85rem;">${p2}</td>
          <td style="padding:0.6rem 0.85rem;text-align:right;font-size:0.85rem;color:var(--danger);font-weight:600;">${debit}</td>
          <td style="padding:0.6rem 0.85rem;text-align:right;font-size:0.85rem;color:var(--success);font-weight:600;">${credit}</td>
          <td style="padding:0.6rem 0.85rem;text-align:right;font-size:0.85rem;color:${balColor};font-weight:600;">${balStr}</td>
          <td style="padding:0.6rem 0.85rem;text-align:center;">
            <button class="btn-icon" title="Delete" onclick="deleteTtTransaction(${tx.id})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.9rem;">🗑️</button>
          </td>
        </tr>`;
      });
      ttStatementBody.innerHTML = html;
    } catch (err) {
      console.error('Error loading TT ledger:', err);
      ttStatementBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--danger);">Error loading ledger data.</td></tr>';
    }
  }

  // Global function for inline onclick delete buttons
  window.deleteTtTransaction = async function(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      const res = await fetch(`/api/tt/transactions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Transaction deleted.', 'success');
        loadTtLedger();
      } else {
        showToast(data.error || 'Failed to delete.', 'error');
      }
    } catch (err) {
      console.error('Error deleting TT transaction:', err);
      showToast('Network error deleting transaction.', 'error');
    }
  };

  const modalTtManual = document.getElementById('modal-tt-manual');
  const modalTtSettlement = document.getElementById('modal-tt-settlement');
  const formTtManual = document.getElementById('form-tt-manual');
  const formTtSettlement = document.getElementById('form-tt-settlement');


  // TT Nav Click
  if (navTtLedger) {
    navTtLedger.addEventListener('click', (e) => {
      e.preventDefault();
      showView('tt-ledger');
      initializeAllTtMonthSelectors();
      
      // Default to selected month
      const activeDateVal = dateInput.value || activeDate;
      const defaultMonth = activeDateVal.substring(0, 7);
      document.querySelectorAll('.tt-month-select-shared').forEach(sel => {
        if (!sel.value) sel.value = defaultMonth;
      });

      // Switch to default sub-tab
      switchTtTab('tab-tt-expenses');
    });
  }

  // TT Tabs Switch Controller
  function switchTtTab(tabId) {
    const tabs = ['tab-tt-expenses', 'tab-tt-average', 'tab-tt-trips', 'tab-tt-toll'];
    const panes = {
      'tab-tt-expenses': 'tt-pane-expenses',
      'tab-tt-average': 'tt-pane-average',
      'tab-tt-trips': 'tt-pane-trips',
      'tab-tt-toll': 'tt-pane-toll'
    };

    tabs.forEach(tId => {
      const btn = document.getElementById(tId);
      const pane = document.getElementById(panes[tId]);
      if (tId === tabId) {
        if (btn) {
          btn.classList.add('active');
          btn.style.borderBottom = '2px solid var(--accent)';
          btn.style.color = 'var(--text-main)';
          btn.style.fontWeight = '700';
        }
        if (pane) pane.style.display = 'flex';
      } else {
        if (btn) {
          btn.classList.remove('active');
          btn.style.borderBottom = '2px solid transparent';
          btn.style.color = 'var(--text-muted)';
          btn.style.fontWeight = '600';
        }
        if (pane) pane.style.display = 'none';
      }
    });

    if (tabId === 'tab-tt-trips') {
      loadTtTrips();
    } else if (tabId === 'tab-tt-average') {
      loadTtAverage();
    } else if (tabId === 'tab-tt-expenses') {
      loadTtLedger();
    }
  }

  // Register Tab Click Listeners
  ['tab-tt-expenses', 'tab-tt-average', 'tab-tt-trips', 'tab-tt-toll'].forEach(tabId => {
    const btn = document.getElementById(tabId);
    if (btn) {
      btn.addEventListener('click', () => switchTtTab(tabId));
    }
  });

  // Initialize all shared TT month selectors
  function initializeAllTtMonthSelectors() {
    const selectors = document.querySelectorAll('.tt-month-select-shared');
    if (selectors.length === 0) return;
    if (selectors[0].children.length > 0) return; // Already initialized

    const startYear = 2026;
    const startMonth = 4; // May (0-indexed is 4)
    
    const activeDateObj = new Date((dateInput.value || activeDate) + 'T00:00:00');
    const endYear = activeDateObj.getFullYear();
    const endMonth = activeDateObj.getMonth();

    const optionsHtml = [];
    let curYear = endYear;
    let curMonth = endMonth;

    while (curYear > startYear || (curYear === startYear && curMonth >= startMonth)) {
      const monthVal = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const label = `${months[curMonth]} ${curYear}`;
      optionsHtml.push(`<option value="${monthVal}">${label}</option>`);

      curMonth--;
      if (curMonth < 0) {
        curMonth = 11;
        curYear--;
      }
    }

    selectors.forEach(sel => {
      sel.innerHTML = optionsHtml.join('');
    });
  }

  // Synchronize month selectors across panes
  document.querySelectorAll('.tt-month-select-shared').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const val = e.target.value;
      document.querySelectorAll('.tt-month-select-shared').forEach(otherSel => {
        if (otherSel.value !== val) {
          otherSel.value = val;
        }
      });
      // Refresh current pane data
      const activeTabBtn = document.querySelector('.tab-btn.active');
      const activeTabId = activeTabBtn ? activeTabBtn.id : 'tab-tt-expenses';
      if (activeTabId === 'tab-tt-trips') {
        loadTtTrips();
      } else {
        loadTtLedger();
      }
    });
  });

  // Add Manual Entry button click
  if (btnTtManualEntry) {
    btnTtManualEntry.addEventListener('click', () => {
      document.getElementById('tt-manual-date').value = dateInput.value || new Date().toISOString().split('T')[0];
      document.getElementById('tt-manual-amount').value = '';
      document.getElementById('tt-manual-notes').value = '';
      document.getElementById('tt-manual-type').value = 'DEBIT';
      if (modalTtManual) modalTtManual.style.display = 'flex';
    });
  }

  // Add Record Settlement button click
  if (btnTtRecordSettlement) {
    btnTtRecordSettlement.addEventListener('click', () => {
      const selectors = document.querySelectorAll('.tt-month-select-shared');
      const monthVal = selectors.length > 0 ? selectors[0].value : '';
      if (!monthVal) {
        showToast('Please select a month first.', 'warning');
        return;
      }
      const [year, month] = monthVal.split('-');
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthName = monthNames[parseInt(month, 10) - 1];
      document.getElementById('tt-settlement-target-month').textContent = `Recording settlement for ${monthName} ${year}`;
      document.getElementById('tt-settlement-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('tt-settlement-amount').value = '';
      if (modalTtSettlement) modalTtSettlement.style.display = 'flex';
    });
  }

  // Submit Manual Entry Form
  if (formTtManual) {
    formTtManual.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('tt-manual-date').value;
      const type = document.getElementById('tt-manual-type').value;
      const amount = parseFloat(document.getElementById('tt-manual-amount').value);
      const notes = document.getElementById('tt-manual-notes').value;

      if (!date || !type || isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid date and positive amount.', 'error');
        return;
      }

      // Bypassed lock validation for Category B TT transactions

      try {
        const res = await fetch('/api/tt/transactions/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, type, amount, notes })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'Manual entry saved.', 'success');
          if (modalTtManual) modalTtManual.style.display = 'none';
          loadTtLedger();
        } else {
          showToast(data.error || 'Failed to save entry.', 'error');
        }
      } catch (err) {
        console.error('Error saving manual entry:', err);
        showToast('Network error saving entry.', 'error');
      }
    });
  }

  // Submit Settlement Form
  if (formTtSettlement) {
    formTtSettlement.addEventListener('submit', async (e) => {
      e.preventDefault();
      const selectors = document.querySelectorAll('.tt-month-select-shared');
      const settlement_month = selectors.length > 0 ? selectors[0].value : '';
      const date = document.getElementById('tt-settlement-date').value;
      const amount = parseFloat(document.getElementById('tt-settlement-amount').value);

      if (!settlement_month || !date || isNaN(amount) || amount <= 0) {
        showToast('Please fill all required fields.', 'error');
        return;
      }

      // Bypassed lock validation for Category B TT settlements

      async function sendSettlement(overwrite = false) {
        try {
          const res = await fetch('/api/tt/transactions/settlement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settlement_month, date, amount, overwrite })
          });
          
          if (res.status === 409) {
            const data = await res.json();
            const confirmOverwrite = confirm(`${data.message}\nDo you want to edit and replace the existing settlement?`);
            if (confirmOverwrite) {
              await sendSettlement(true);
            }
            return;
          }

          const data = await res.json();
          if (res.ok) {
            showToast(data.message || 'Settlement recorded.', 'success');
            if (modalTtSettlement) modalTtSettlement.style.display = 'none';
            loadTtLedger();
          } else {
            showToast(data.error || 'Failed to save settlement.', 'error');
          }
        } catch (err) {
          console.error('Error saving settlement:', err);
          showToast('Network error saving settlement.', 'error');
        }
      }

      await sendSettlement(false);
    });
  }

  // ── TRIPS LOGIC ──────────────────────────────────────────────────────────────

  const btnTtAddTrip = document.getElementById('btn-tt-add-trip');
  const modalTtAddTrip = document.getElementById('modal-tt-add-trip');
  const formTtAddTrip = document.getElementById('form-tt-add-trip');
  const btnCancelTtTrip = document.getElementById('btn-cancel-tt-trip');

  if (btnTtAddTrip) {
    btnTtAddTrip.addEventListener('click', () => {
      document.getElementById('tt-trip-date').value = dateInput.value || new Date().toISOString().split('T')[0];
      document.getElementById('tt-trip-for').value = 'Pimpalgaon';
      document.getElementById('tt-entry-given').value = 'Yes';
      document.getElementById('tt-trip-remark1').value = '';
      document.getElementById('tt-trip-remark2').value = '';

      if (modalTtAddTrip) modalTtAddTrip.style.display = 'flex';
    });
  }

  if (btnCancelTtTrip) {
    btnCancelTtTrip.addEventListener('click', () => {
      if (modalTtAddTrip) modalTtAddTrip.style.display = 'none';
    });
  }

  if (formTtAddTrip) {
    formTtAddTrip.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('tt-trip-date').value;
      const trip_for = document.getElementById('tt-trip-for').value;
      const entry_given = document.getElementById('tt-entry-given').value;
      const remark1 = document.getElementById('tt-trip-remark1').value.trim();
      const remark2 = document.getElementById('tt-trip-remark2').value.trim();

      if (!date || !trip_for || !entry_given) {
        showToast('Please fill in Date, Trip For, and Entry Given.', 'error');
        return;
      }

      // Bypassed lock validation for Category B TT entries

      try {
        const res = await fetch('/api/tt/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            trip_for,
            entry_given,
            remark1,
            remark2
          })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || 'Entry added successfully.', 'success');
          if (modalTtAddTrip) modalTtAddTrip.style.display = 'none';
          loadTtTrips();
        } else {
          showToast(data.error || 'Failed to add entry.', 'error');
        }
      } catch (err) {
        console.error('Error adding entry:', err);
        showToast('Network error adding entry.', 'error');
      }
    });
  }

  // Load Trips / Entries data
  async function loadTtTrips() {
    initializeAllTtMonthSelectors();
    const selectors = document.querySelectorAll('.tt-month-select-shared');
    const selectedMonth = selectors.length > 0 ? selectors[0].value : (dateInput.value || activeDate).substring(0, 7);
    
    const tbody = document.getElementById('tt-trips-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Loading...</td></tr>';
    }

    try {
      const res = await fetch(`/api/tt/entries?month=${selectedMonth}`);
      if (!res.ok) throw new Error('Failed to fetch entries.');
      const data = await res.json();

      if (tbody) {
        if (!data.entries || data.entries.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted); font-style:italic;">No entries recorded for this month.</td></tr>';
          return;
        }

        let html = '';
        data.entries.forEach(tr => {
          const isEditable = true; // Category B TT entries are always editable
          const tripForHtml = `
            <select class="cell-trip-for-select" ${isEditable ? '' : 'disabled'} style="font-size: 0.85rem; padding: 0.2rem 0.4rem; border-radius: 0.25rem; cursor: pointer; width: 100%;">
              <option value="Pimpalgaon" ${tr.trip_for === 'Pimpalgaon' ? 'selected' : ''}>Pimpalgaon</option>
              <option value="Wakod" ${tr.trip_for === 'Wakod' ? 'selected' : ''}>Wakod</option>
              <option value="Other" ${tr.trip_for === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          `;
          const entryGivenHtml = `
            <select class="cell-entry-given-select" ${isEditable ? '' : 'disabled'} style="font-size: 0.85rem; padding: 0.2rem 0.4rem; border-radius: 0.25rem; cursor: pointer; width: 100%;">
              <option value="Yes" ${tr.entry_given === 'Yes' ? 'selected' : ''}>Yes</option>
              <option value="No" ${tr.entry_given === 'No' ? 'selected' : ''}>No</option>
            </select>
          `;
          const deleteButton = isEditable ? `<button style="padding:0.15rem 0.45rem; font-size:0.75rem; background:var(--danger); color:#fff; border:none; border-radius:0.4rem; cursor:pointer;" onclick="deleteTtEntry(${tr.id})">Del</button>` : '';

          html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.03);" 
                data-id="${tr.id}"
                data-date="${tr.date}"
                data-trip-for="${tr.trip_for}"
                data-entry-given="${tr.entry_given}"
                data-remark1="${tr.remark1 || ''}"
                data-remark2="${tr.remark2 || ''}">
              <td class="${isEditable ? 'editable-cell' : ''} cell-trip-date" ${isEditable ? 'contenteditable="true"' : ''} style="padding:0.65rem 0.85rem; font-weight:600; white-space:nowrap;">${formatDate(tr.date)}</td>
              <td style="padding:0.65rem 0.85rem;">${tripForHtml}</td>
              <td style="padding:0.65rem 0.85rem;">${entryGivenHtml}</td>
              <td class="${isEditable ? 'editable-cell' : ''} cell-trip-remark1" ${isEditable ? 'contenteditable="true"' : ''} style="padding:0.65rem 0.85rem;">${escapeHtml(tr.remark1 || '')}</td>
              <td class="${isEditable ? 'editable-cell' : ''} cell-trip-remark2" ${isEditable ? 'contenteditable="true"' : ''} style="padding:0.65rem 0.85rem;">${escapeHtml(tr.remark2 || '')}</td>
              <td style="padding:0.65rem 0.85rem; text-align:center;">
                ${deleteButton}
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;

        // Register event listeners
        tbody.querySelectorAll('tr').forEach(trRow => {
          trRow.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('keydown', (evt) => {
              if (evt.key === 'Enter') {
                evt.preventDefault();
                evt.target.blur();
              }
            });
            cell.addEventListener('blur', () => handleEntryCellEdit(trRow, cell));
          });
          trRow.querySelectorAll('select').forEach(sel => {
            sel.addEventListener('change', () => handleEntryCellEdit(trRow, sel));
          });
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading entries: ' + err.message, 'error');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger);">${err.message}</td></tr>`;
    }
  }

  // Handle inline entries editing
  async function handleEntryCellEdit(trRow, triggeredElement) {
    const entryId = trRow.dataset.id;
    if (!entryId) return;

    const dateEl = trRow.querySelector('.cell-trip-date');
    const tripForSel = trRow.querySelector('.cell-trip-for-select');
    const entryGivenSel = trRow.querySelector('.cell-entry-given-select');
    const remark1El = trRow.querySelector('.cell-trip-remark1');
    const remark2El = trRow.querySelector('.cell-trip-remark2');

    const dateVal = parseInputDate(dateEl.textContent.trim());
    const tripForVal = tripForSel.value;
    const entryGivenVal = entryGivenSel.value;
    const remark1Val = remark1El.textContent.trim();
    const remark2Val = remark2El.textContent.trim();

    if (!dateVal) {
      showToast('Please enter a valid date.', 'error');
      loadTtTrips();
      return;
    }

    // Check if anything actually changed
    const oldDate = trRow.dataset.date;
    const oldTripFor = trRow.dataset.tripFor;
    const oldEntryGiven = trRow.dataset.entryGiven;
    const oldRemark1 = trRow.dataset.remark1 || '';
    const oldRemark2 = trRow.dataset.remark2 || '';

    if (
      dateVal === oldDate &&
      tripForVal === oldTripFor &&
      entryGivenVal === oldEntryGiven &&
      remark1Val === oldRemark1 &&
      remark2Val === oldRemark2
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/tt/entries/${entryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateVal,
          trip_for: tripForVal,
          entry_given: entryGivenVal,
          remark1: remark1Val,
          remark2: remark2Val
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update entry.');
      
      // Sync attributes
      trRow.dataset.date = dateVal;
      trRow.dataset.tripFor = tripForVal;
      trRow.dataset.entryGiven = entryGivenVal;
      trRow.dataset.remark1 = remark1Val;
      trRow.dataset.remark2 = remark2Val;

      showToast('Entry updated successfully.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
      loadTtTrips();
    }
  }

  // Delete Entry
  window.deleteTtEntry = async function(id) {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    try {
      const res = await fetch(`/api/tt/entries/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Entry deleted.', 'success');
        loadTtTrips();
      } else {
        showToast(data.error || 'Failed to delete entry.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error deleting entry.', 'error');
    }
  };

  // ── AVERAGE LOGIC ─────────────────────────────────────────────────────────────

  async function loadTtAverage() {
    const tbody = document.getElementById('tt-average-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Loading...</td></tr>';
    }

    try {
      const res = await fetch('/api/tt/average');
      if (!res.ok) throw new Error('Failed to fetch averages.');
      const data = await res.json();

      const last10Avg = data.last10Average || 0;
      const lifetimeAvgCard = document.getElementById('tt-avg-lifetime');
      if (lifetimeAvgCard) {
        lifetimeAvgCard.innerHTML = `${last10Avg.toFixed(2)} <span style="font-size: 1rem; font-weight: 600; color: var(--text-muted);">KM/L</span>`;
      }

      if (tbody) {
        if (!data.trips || data.trips.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted); font-style:italic;">No trip data available yet.</td></tr>';
          return;
        }

        let html = '';
        data.trips.forEach(t => {
          const fuelAvg = t.fuel_filled > 0 ? (t.run_km / t.fuel_filled).toFixed(2) : '0.00';
          const isEditable = true; // Category B TT trips are always editable
          html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"
                data-id="${t.id}"
                data-date="${t.date}"
                data-start-km="${t.start_km}"
                data-end-km="${t.end_km}"
                data-fuel-filled="${t.fuel_filled || 0}"
                data-load-qty="${t.load_qty || 0}"
                data-driver-name="${t.driver_name || ''}"
                data-notes="${t.notes || ''}">
              <td style="padding:0.65rem 0.85rem; font-weight:600; color:var(--text-main);">${formatDate(t.date)}</td>
              <td style="padding:0.65rem 0.85rem; text-align:right;">${t.start_km}</td>
              <td style="padding:0.65rem 0.85rem; text-align:right;">${t.end_km}</td>
              <td style="padding:0.65rem 0.85rem; text-align:right; font-weight:700; color:var(--accent);">${t.run_km.toLocaleString('en-IN')} KM</td>
              <td style="padding:0.65rem 0.85rem; text-align:right; font-weight:700; color:var(--accent);">${t.fuel_filled || '0'}</td>
              <td style="padding:0.65rem 0.85rem; text-align:right; font-weight:700; color:var(--success);">${fuelAvg} KM/L</td>
              <td style="padding:0.65rem 0.85rem; text-align:center;">
                ${isEditable ? `<button class="btn btn-secondary btn-icon" title="Edit" onclick="openEditTripModal(${t.id}, '${t.date}', ${t.start_km}, ${t.end_km}, ${t.fuel_filled || 0})" style="padding: 0.15rem 0.45rem; font-size: 0.75rem; border: none; border-radius: 0.4rem; cursor: pointer; background: var(--accent); color: var(--bg-main);">Edit</button>` : ''}
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading average data: ' + err.message, 'error');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger);">${err.message}</td></tr>`;
    }
  }

  async function handleAverageFuelEdit(trRow, cell) {
    const tripId = trRow.dataset.id;
    if (!tripId) return;

    const fuelVal = parseFloat(cell.textContent.trim()) || 0;
    const oldFuel = parseFloat(trRow.dataset.fuelFilled) || 0;

    if (fuelVal === oldFuel) return;

    // Recalculate average online in the row
    const runKm = parseFloat(trRow.dataset.startKm) ? (parseFloat(trRow.dataset.endKm) - parseFloat(trRow.dataset.startKm)) : 0;
    const fuelAvg = fuelVal > 0 ? (runKm / fuelVal).toFixed(2) : '0.00';
    const avgCell = trRow.querySelector('td:nth-child(6)');
    if (avgCell) {
      avgCell.innerHTML = `<span style="font-weight:700; color:var(--success);">${fuelAvg} KM/L</span>`;
    }

    try {
      const res = await fetch(`/api/tt/trips/${tripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: trRow.dataset.date,
          start_km: parseFloat(trRow.dataset.startKm),
          end_km: parseFloat(trRow.dataset.endKm),
          fuel_filled: fuelVal,
          load_qty: parseFloat(trRow.dataset.loadQty),
          driver_name: trRow.dataset.driverName,
          notes: trRow.dataset.notes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update average fuel.');

      trRow.dataset.fuelFilled = fuelVal;
      showToast('Fuel filled updated successfully.', 'success');
      
      // Reload overall average stat card
      loadTtAverageCardOnly();
    } catch (err) {
      showToast(err.message, 'error');
      loadTtAverage();
    }
  }

  async function loadTtAverageCardOnly() {
    try {
      const res = await fetch('/api/tt/average');
      if (res.ok) {
        const data = await res.json();
        const last10Avg = data.last10Average || 0;
        const lifetimeAvgCard = document.getElementById('tt-avg-lifetime');
        if (lifetimeAvgCard) {
          lifetimeAvgCard.innerHTML = `${last10Avg.toFixed(2)} <span style="font-size: 1rem; font-weight: 600; color: var(--text-muted);">KM/L</span>`;
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadTtAverage() {
    const tbody = document.getElementById('tt-average-table-body');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Loading...</td></tr>';
    }

    try {
      const res = await fetch('/api/tt/average');
      if (!res.ok) throw new Error('Failed to fetch averages.');
      const data = await res.json();

      const last10Avg = data.last10Average || 0;
      const lifetimeAvgCard = document.getElementById('tt-avg-lifetime');
      if (lifetimeAvgCard) {
        lifetimeAvgCard.innerHTML = `${last10Avg.toFixed(2)} <span style="font-size: 1rem; font-weight: 600; color: var(--text-muted);">KM/L</span>`;
      }

      if (tbody) {
        if (!data.trips || data.trips.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted); font-style:italic;">No trip data available yet.</td></tr>';
          return;
        }

        let html = '';
        data.trips.forEach(t => {
          const fuelAvg = t.fuel_filled > 0 ? (t.run_km / t.fuel_filled).toFixed(2) : '0.00';
          const isEditable = true; // Category B TT trips are always editable
          html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);"
                data-id="${t.id}"
                data-date="${t.date}"
                data-start-km="${t.start_km}"
                data-end-km="${t.end_km}"
                data-fuel-filled="${t.fuel_filled || 0}"
                data-load-qty="${t.load_qty || 0}"
                data-driver-name="${t.driver_name || ''}"
                data-notes="${t.notes || ''}">
              <td style="padding:0.65rem 0.85rem; font-weight:600; color:var(--text-main);">${formatDate(t.date)}</td>
              <td style="padding:0.65rem 0.85rem; text-align:right;">${t.start_km}</td>
              <td style="padding:0.65rem 0.85rem; text-align:right;">${t.end_km}</td>
              <td style="padding:0.65rem 0.85rem; text-align:right; font-weight:700; color:var(--accent);">${t.run_km.toLocaleString('en-IN')} KM</td>
              <td style="padding:0.65rem 0.85rem; text-align:right; font-weight:700; color:var(--accent);">${t.fuel_filled || '0'}</td>
              <td style="padding:0.65rem 0.85rem; text-align:right; font-weight:700; color:var(--success);">${fuelAvg} KM/L</td>
              <td style="padding:0.65rem 0.85rem; text-align:center;">
                ${isEditable ? `<button class="btn btn-secondary btn-icon" title="Edit" onclick="openEditTripModal(${t.id}, '${t.date}', ${t.start_km}, ${t.end_km}, ${t.fuel_filled || 0})" style="padding: 0.15rem 0.45rem; font-size: 0.75rem; border: none; border-radius: 0.4rem; cursor: pointer; background: var(--accent); color: var(--bg-main);">Edit</button>` : ''}
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading average data: ' + err.message, 'error');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger);">${err.message}</td></tr>`;
    }
  }

  // ── EXPENSES (LEDGER) LOGIC ───────────────────────────────────────────────────

  async function loadTtLedger() {
    initializeAllTtMonthSelectors();
    const selectors = document.querySelectorAll('.tt-month-select-shared');
    const selectedMonth = selectors.length > 0 ? selectors[0].value : (dateInput.value || activeDate).substring(0, 7);
    
    if (ttStatementBody) {
      ttStatementBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Loading...</td></tr>';
    }

    try {
      const res = await fetch(`/api/tt/transactions?month=${selectedMonth}`);
      if (!res.ok) throw new Error('Failed to fetch ledger transactions.');
      const data = await res.json();
      const transactions = data.transactions || [];
      const openingBalance = parseFloat(data.openingBalance || 0);

      if (ttStatementBody) {
        ttStatementBody.dataset.openingBalance = openingBalance;
      }

      let totalDebits = 0;
      let totalCredits = 0;
      transactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'DEBIT') {
          totalDebits += amt;
        } else {
          totalCredits += amt;
        }
      });

      const closingBalance = openingBalance + totalCredits - totalDebits;

      if (ttStatOpening) ttStatOpening.textContent = `₹ ${Math.round(openingBalance).toLocaleString('en-IN')}`;
      if (ttStatDebits) ttStatDebits.textContent = `₹ ${Math.round(totalDebits).toLocaleString('en-IN')}`;
      if (ttStatCredits) ttStatCredits.textContent = `₹ ${Math.round(totalCredits).toLocaleString('en-IN')}`;
      if (ttStatClosing) ttStatClosing.textContent = `₹ ${Math.round(closingBalance).toLocaleString('en-IN')}`;

      if (ttStatementBody) {
        if (transactions.length === 0) {
          ttStatementBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1.5rem; color:var(--text-muted); font-style:italic;">No transactions recorded for this month.</td></tr>`;
          return;
        }

        let currentBal = openingBalance;
        let html = '';
        transactions.forEach(t => {
          const amt = parseFloat(t.amount) || 0;
          let debitVal = '';
          let creditVal = '';
          if (t.type === 'DEBIT') {
            currentBal -= amt;
            debitVal = amt > 0 ? amt.toFixed(2) : '';
          } else {
            currentBal += amt;
            creditVal = amt > 0 ? amt.toFixed(2) : '';
          }

          let desc = t.description || '';
          let notesStr = t.notes || '';
          const isEditable = true; // Category B TT transactions are always editable
          const deleteButton = isEditable ? `<button style="padding:0.15rem 0.45rem; font-size:0.75rem; background:var(--danger); color:#fff; border:none; border-radius:0.4rem; cursor:pointer;" onclick="deleteTtTxn(${t.id})">Del</button>` : '';

          html += `
            <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.03);"
                data-id="${t.id}"
                data-date="${t.date}"
                data-description="${desc}"
                data-notes="${notesStr}"
                data-type="${t.type}"
                data-amount="${amt}">
              <td class="${isEditable ? 'editable-cell' : ''} cell-txn-date" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.65rem 0.85rem; font-weight:600; white-space:nowrap;">${formatDate(t.date)}</td>
              <td class="${isEditable ? 'editable-cell' : ''} cell-txn-particulars" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.65rem 0.85rem;">
                ${desc}
                ${notesStr ? `<div style="font-size:0.75rem; color:var(--text-muted); font-style:italic; margin-top:0.15rem;">Note: ${escapeHtml(notesStr)}</div>` : ''}
              </td>
              <td style="padding: 0.65rem 0.85rem; color: var(--text-muted);"></td>
              <td class="${isEditable ? 'editable-cell' : ''} cell-txn-debit text-right" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.65rem 0.85rem; text-align:right; color:var(--danger); font-weight:600;">${debitVal}</td>
              <td class="${isEditable ? 'editable-cell' : ''} cell-txn-credit text-right" ${isEditable ? 'contenteditable="true"' : ''} style="padding: 0.65rem 0.85rem; text-align:right; color:var(--success); font-weight:600;">${creditVal}</td>
              <td class="cell-txn-balance text-right" style="padding: 0.65rem 0.85rem; text-align:right; font-weight:700; color:var(--text-main);">₹ ${Math.round(currentBal).toLocaleString('en-IN')}</td>
              <td style="padding: 0.65rem 0.85rem; text-align:center;">
                ${deleteButton}
              </td>
            </tr>
          `;
        });
        ttStatementBody.innerHTML = html;

        // Register edit handlers
        ttStatementBody.querySelectorAll('tr').forEach(trRow => {
          trRow.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('keydown', (evt) => {
              if (evt.key === 'Enter') {
                evt.preventDefault();
                evt.target.blur();
              }
            });
            cell.addEventListener('blur', () => handleLedgerCellEdit(trRow, cell));
          });
        });
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading ledger: ' + err.message, 'error');
      if (ttStatementBody) {
        ttStatementBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--danger);">${err.message}</td></tr>`;
      }
    }
  }

  // Handle inline ledger cell editing
  async function handleLedgerCellEdit(trRow, cell) {
    const txnId = trRow.dataset.id;
    if (!txnId) return;

    const dateEl = trRow.querySelector('.cell-txn-date');
    const partEl = trRow.querySelector('.cell-txn-particulars');
    const debitEl = trRow.querySelector('.cell-txn-debit');
    const creditEl = trRow.querySelector('.cell-txn-credit');

    const dateVal = parseInputDate(dateEl.textContent.trim());
    
    // Extract particulars description without notes preview div
    const partClone = partEl.cloneNode(true);
    const notesDiv = partClone.querySelector('div');
    if (notesDiv) notesDiv.remove();
    const description = partClone.textContent.trim();

    let debitVal = parseFloat(debitEl.textContent.replace(/[^\d.-]/g, '')) || 0;
    let creditVal = parseFloat(creditEl.textContent.replace(/[^\d.-]/g, '')) || 0;

    const oldType = trRow.dataset.type;
    const oldAmount = parseFloat(trRow.dataset.amount) || 0;

    let type = oldType;
    let amount = oldAmount;

    if (cell.classList.contains('cell-txn-debit')) {
      if (debitVal > 0) {
        type = 'DEBIT';
        amount = debitVal;
        creditEl.textContent = ''; 
      } else if (creditVal > 0) {
        type = 'CREDIT';
        amount = creditVal;
      } else {
        showToast('Amount must be positive.', 'error');
        loadTtLedger();
        return;
      }
    } else if (cell.classList.contains('cell-txn-credit')) {
      if (creditVal > 0) {
        type = 'CREDIT';
        amount = creditVal;
        debitEl.textContent = ''; 
      } else if (debitVal > 0) {
        type = 'DEBIT';
        amount = debitVal;
      } else {
        showToast('Amount must be positive.', 'error');
        loadTtLedger();
        return;
      }
    } else {
      // Date or Particulars was edited
      if (debitVal > 0 && creditVal === 0) {
        type = 'DEBIT';
        amount = debitVal;
      } else if (creditVal > 0 && debitVal === 0) {
        type = 'CREDIT';
        amount = creditVal;
      } else if (debitVal > 0 && creditVal > 0) {
        if (type === 'DEBIT') {
          amount = debitVal;
          creditEl.textContent = '';
        } else {
          amount = creditVal;
          debitEl.textContent = '';
        }
      }
    }

    if (!dateVal) {
      showToast('Please enter a valid date.', 'error');
      loadTtLedger();
      return;
    }

    // Recalculate balances dynamically in UI
    recalculateLedgerBalancesOnline();

    // Check if changed
    const oldDate = trRow.dataset.date;
    const oldDesc = trRow.dataset.description;
    const oldNotes = trRow.dataset.notes || '';

    if (
      dateVal === oldDate &&
      description === oldDesc &&
      type === oldType &&
      amount === oldAmount
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/tt/transactions/${txnId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateVal,
          description: description,
          type: type,
          amount: amount,
          notes: oldNotes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update transaction.');
      
      // Update data attributes
      trRow.dataset.date = dateVal;
      trRow.dataset.description = description;
      trRow.dataset.type = type;
      trRow.dataset.amount = amount;

      showToast('Transaction updated successfully.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
      loadTtLedger();
    }
  }

  // Recalculate Ledger Running Balances locally
  function recalculateLedgerBalancesOnline() {
    const tbody = document.getElementById('tt-statement-body');
    if (!tbody) return;
    const openingBalance = parseFloat(tbody.dataset.openingBalance || 0);

    const rows = tbody.querySelectorAll('tr[data-id]');
    let currentBal = openingBalance;
    let totalDebits = 0;
    let totalCredits = 0;

    rows.forEach(trRow => {
      const debitEl = trRow.querySelector('.cell-txn-debit');
      const creditEl = trRow.querySelector('.cell-txn-credit');
      const balEl = trRow.querySelector('.cell-txn-balance');

      const debit = parseFloat(debitEl.textContent.replace(/[^\d.-]/g, '')) || 0;
      const credit = parseFloat(creditEl.textContent.replace(/[^\d.-]/g, '')) || 0;

      if (debit > 0) {
        currentBal -= debit;
        totalDebits += debit;
        trRow.dataset.type = 'DEBIT';
        trRow.dataset.amount = debit;
      } else if (credit > 0) {
        currentBal += credit;
        totalCredits += credit;
        trRow.dataset.type = 'CREDIT';
        trRow.dataset.amount = credit;
      }

      if (balEl) {
        balEl.textContent = `₹ ${Math.round(currentBal).toLocaleString('en-IN')}`;
      }
    });

    const closingBalance = openingBalance + totalCredits - totalDebits;

    if (ttStatOpening) ttStatOpening.textContent = `₹ ${Math.round(openingBalance).toLocaleString('en-IN')}`;
    if (ttStatDebits) ttStatDebits.textContent = `₹ ${Math.round(totalDebits).toLocaleString('en-IN')}`;
    if (ttStatCredits) ttStatCredits.textContent = `₹ ${Math.round(totalCredits).toLocaleString('en-IN')}`;
    if (ttStatClosing) ttStatClosing.textContent = `₹ ${Math.round(closingBalance).toLocaleString('en-IN')}`;
  }

  // Delete ledger entry
  window.deleteTtTxn = async function(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
      const res = await fetch(`/api/tt/transactions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Transaction deleted.', 'success');
        loadTtLedger();
      } else {
        showToast(data.error || 'Failed to delete transaction.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error deleting transaction.', 'error');
    }
  };

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Edit trip modal handler
  window.openEditTripModal = function(id, date, startKm, endKm, fuelFilled) {
    const trRow = document.querySelector(`tr[data-id="${id}"]`);
    document.getElementById('edit-trip-id').value = id;
    document.getElementById('edit-trip-date').value = formatDate(date);
    document.getElementById('edit-trip-date').dataset.rawDate = date;
    document.getElementById('edit-trip-start-km').value = startKm;
    document.getElementById('edit-trip-end-km').value = endKm;
    document.getElementById('edit-trip-fuel').value = fuelFilled;
    
    if (trRow) {
      document.getElementById('edit-trip-id').dataset.loadQty = trRow.dataset.loadQty || '0';
      document.getElementById('edit-trip-id').dataset.driverName = trRow.dataset.driverName || '';
      document.getElementById('edit-trip-id').dataset.notes = trRow.dataset.notes || '';
    } else {
      document.getElementById('edit-trip-id').dataset.loadQty = '0';
      document.getElementById('edit-trip-id').dataset.driverName = '';
      document.getElementById('edit-trip-id').dataset.notes = '';
    }

    const modal = document.getElementById('modal-tt-edit-trip');
    if (modal) modal.style.display = 'flex';
  };

  const formTtEditTrip = document.getElementById('form-tt-edit-trip');
  if (formTtEditTrip) {
    formTtEditTrip.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-trip-id').value;
      const date = document.getElementById('edit-trip-date').dataset.rawDate;
      const startKm = parseFloat(document.getElementById('edit-trip-start-km').value);
      const endKm = parseFloat(document.getElementById('edit-trip-end-km').value);
      const fuelFilled = parseFloat(document.getElementById('edit-trip-fuel').value);

      const loadQty = parseFloat(document.getElementById('edit-trip-id').dataset.loadQty) || 0;
      const driverName = document.getElementById('edit-trip-id').dataset.driverName || '';
      const notes = document.getElementById('edit-trip-id').dataset.notes || '';

      if (isNaN(startKm) || isNaN(endKm) || isNaN(fuelFilled)) {
        showToast('Valid readings and fuel filled are required.', 'error');
        return;
      }
      if (endKm < startKm) {
        showToast('Closing Reading must be greater than or equal to Opening Reading.', 'error');
        return;
      }
      if (fuelFilled < 0) {
        showToast('Fuel Filled cannot be negative.', 'error');
        return;
      }

      try {
        const res = await fetch(`/api/tt/trips/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            start_km: startKm,
            end_km: endKm,
            fuel_filled: fuelFilled,
            load_qty: loadQty,
            driver_name: driverName,
            notes: notes
          })
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Trip updated successfully.', 'success');
          document.getElementById('modal-tt-edit-trip').style.display = 'none';
          loadTtAverage();
        } else {
          showToast(data.error || 'Failed to update trip.', 'error');
        }
      } catch (err) {
        console.error('Error updating trip:', err);
        showToast('Network error updating trip.', 'error');
      }
    });
  }

  // Manual Trip creation handler
  const btnTtAddNewTrip = document.getElementById('btn-tt-add-new-trip');
  const btnTtAverageManualEntry = document.getElementById('btn-tt-average-manual-entry');
  const modalTtAddNewTrip = document.getElementById('modal-tt-add-new-trip');
  const formTtAddNewTrip = document.getElementById('form-tt-add-new-trip');

  async function openManualTripModal() {
    document.getElementById('new-trip-date').value = dateInput.value || new Date().toISOString().split('T')[0];
    document.getElementById('new-trip-fuel').value = '0';
    document.getElementById('new-trip-remarks').value = '';
    document.getElementById('new-trip-end-km').value = '';

    try {
      const res = await fetch('/api/tt/average');
      if (res.ok) {
        const data = await res.json();
        const trips = data.trips || [];
        if (trips.length > 0) {
          document.getElementById('new-trip-start-km').value = trips[0].end_km;
        } else {
          document.getElementById('new-trip-start-km').value = '0';
        }
      } else {
        document.getElementById('new-trip-start-km').value = '0';
      }
    } catch (err) {
      console.error('Error fetching latest trip for opening reading auto-fill:', err);
      document.getElementById('new-trip-start-km').value = '0';
    }

    if (modalTtAddNewTrip) modalTtAddNewTrip.style.display = 'flex';
  }

  if (btnTtAddNewTrip) {
    btnTtAddNewTrip.addEventListener('click', openManualTripModal);
  }
  if (btnTtAverageManualEntry) {
    btnTtAverageManualEntry.addEventListener('click', openManualTripModal);
  }

  if (formTtAddNewTrip) {
    formTtAddNewTrip.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('new-trip-date').value;
      const startKm = parseFloat(document.getElementById('new-trip-start-km').value);
      const endKm = parseFloat(document.getElementById('new-trip-end-km').value);
      const fuelFilled = parseFloat(document.getElementById('new-trip-fuel').value);
      const remarks = document.getElementById('new-trip-remarks').value.trim();

      if (!date || isNaN(startKm) || isNaN(endKm) || isNaN(fuelFilled)) {
        showToast('Please fill in Date, Readings, and Fuel Filled.', 'error');
        return;
      }
      if (endKm < startKm) {
        showToast('Closing Reading must be greater than or equal to Opening Reading.', 'error');
        return;
      }
      if (fuelFilled < 0) {
        showToast('Fuel Filled cannot be negative.', 'error');
        return;
      }

      // Bypassed lock validation for Category B TT trips

      try {
        const res = await fetch('/api/tt/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            start_km: startKm,
            end_km: endKm,
            fuel_filled: fuelFilled,
            load_qty: 0,
            driver_name: '',
            notes: remarks
          })
        });
        const data = await res.json();
        if (res.ok) {
          showToast('Trip added successfully.', 'success');
          if (modalTtAddNewTrip) modalTtAddNewTrip.style.display = 'none';
          loadTtAverage();
        } else {
          showToast(data.error || 'Failed to add trip.', 'error');
        }
      } catch (err) {
        console.error('Error adding trip:', err);
        showToast('Network error adding trip.', 'error');
      }
    });
  }

  // ── TANKER LABEL WIZARD (टँकर लेबल्स विझार्ड) LOGIC ────────────────────────────
  let currentWizardData = null;

  // Open Wizard & Pre-fill
  function openLabelWizard(receipt, isBlank = true) {
    // Reset view steps
    const step1El = document.getElementById('label-wizard-step-1');
    const step2El = document.getElementById('label-wizard-step-2');
    if (step1El) step1El.style.display = 'block';
    if (step2El) step2El.style.display = 'none';

    // Retrieve DOM fields
    const productSelect = document.getElementById('wizard-product');
    const tankerInput = document.getElementById('wizard-tanker-no');
    const invoiceInput = document.getElementById('wizard-invoice-no');
    const dateInput = document.getElementById('wizard-date');
    const timeInput = document.getElementById('wizard-time');
    const challanDensityInput = document.getElementById('wizard-challan-density');
    const lorryDensityInput = document.getElementById('wizard-lorry-density');
    const roTankInput = document.getElementById('wizard-ro-tank');
    const containerSealInput = document.getElementById('wizard-container-seal');
    const woodenSealInput = document.getElementById('wizard-wooden-seal');
    const driverInput = document.getElementById('wizard-driver');
    const transporterInput = document.getElementById('wizard-transporter');
    const dealerRepInput = document.getElementById('wizard-dealer-rep');
    const copiesInput = document.getElementById('wizard-copies');

    if (productSelect) productSelect.value = 'Petrol';
    if (tankerInput) tankerInput.value = '';
    if (invoiceInput) invoiceInput.value = '';
    if (dateInput) dateInput.value = activeDate || new Date().toISOString().split('T')[0];
    if (timeInput) timeInput.value = '';
    if (challanDensityInput) challanDensityInput.value = '';
    if (lorryDensityInput) lorryDensityInput.value = '';
    if (roTankInput) roTankInput.value = '';
    if (containerSealInput) containerSealInput.value = '';
    if (woodenSealInput) woodenSealInput.value = '';
    if (driverInput) driverInput.value = '';
    if (transporterInput) transporterInput.value = '';
    if (dealerRepInput) dealerRepInput.value = 'Ashish Service Center';
    if (copiesInput) copiesInput.value = '8'; // Default to 8 because Petrol is default

    showView('tanker-label-wizard');
  }

  // Register loadTankerReceipts globally (no-op now)
  async function loadTankerReceipts() {
    // Standalone Label Wizard questionnaire is now the default view.
  }
  window.loadTankerReceipts = loadTankerReceipts;
  window.openLabelWizard = openLabelWizard;

  // Change listener on product selection to default copies
  const wizardProductSelect = document.getElementById('wizard-product');
  if (wizardProductSelect) {
    wizardProductSelect.addEventListener('change', () => {
      const product = wizardProductSelect.value;
      const copiesInput = document.getElementById('wizard-copies');
      if (copiesInput) {
        if (product === 'Petrol' || product === 'poWer') {
          copiesInput.value = '8';
        } else {
          copiesInput.value = '4';
        }
      }
    });
  }

  const btnWizardClose = document.getElementById('btn-wizard-close');
  if (btnWizardClose) {
    btnWizardClose.addEventListener('click', () => {
      showView('du');
    });
  }

  const btnWizardBack = document.getElementById('btn-wizard-back');
  if (btnWizardBack) {
    btnWizardBack.addEventListener('click', () => {
      document.getElementById('label-wizard-step-1').style.display = 'block';
      document.getElementById('label-wizard-step-2').style.display = 'none';
    });
  }

  const btnWizardPrint = document.getElementById('btn-wizard-print');
  if (btnWizardPrint) {
    btnWizardPrint.addEventListener('click', () => {
      printRetentionLabels();
    });
  }

  // Step 1: Submit Form to transition to Step 2
  const formLabelWizard = document.getElementById('form-label-wizard');
  if (formLabelWizard) {
    formLabelWizard.addEventListener('submit', (e) => {
      e.preventDefault();

      currentWizardData = {
        product: document.getElementById('wizard-product').value,
        tanker_no: document.getElementById('wizard-tanker-no').value.trim(),
        invoice_no: document.getElementById('wizard-invoice-no').value.trim(),
        date: document.getElementById('wizard-date').value,
        time: document.getElementById('wizard-time').value.trim(),
        challanDensity: document.getElementById('wizard-challan-density').value.trim(),
        lorryDensity: document.getElementById('wizard-lorry-density').value.trim(),
        roTank: document.getElementById('wizard-ro-tank').value.trim(),
        containerSeal: document.getElementById('wizard-container-seal').value.trim(),
        woodenSeal: document.getElementById('wizard-wooden-seal').value.trim(),
        driver: document.getElementById('wizard-driver').value.trim(),
        transporter: document.getElementById('wizard-transporter').value.trim(),
        dealerRep: document.getElementById('wizard-dealer-rep').value.trim(),
        copies: parseInt(document.getElementById('wizard-copies').value) || 4
      };

      // Show step 2, hide step 1
      document.getElementById('label-wizard-step-1').style.display = 'none';
      document.getElementById('label-wizard-step-2').style.display = 'block';

      // Render mini screen preview
      renderWizardPreview();
    });
  }

  function formatUnderlineValue(val) {
    return val ? `<u><b>${val}</b></u>` : '______________________';
  }

  function renderSingleLabelHTML(data) {
    const isBlankProduct = (data.product === 'BLANK' || !data.product);
    let displayProduct = '';
    if (!isBlankProduct) {
      let pShort = data.product;
      if (data.product === 'Petrol') pShort = 'POWER MS (Petrol)';
      if (data.product === 'Diesel') pShort = 'HSD (Diesel)';
      if (data.product === 'poWer') pShort = 'POWER (poWer)';
      displayProduct = 'POWER MS/HSD: <u><b>' + pShort + '</b></u>';
    } else {
      displayProduct = 'POWER MS/HSD: ____________________';
    }

    let formattedDate = '';
    if (data.date) {
      const parts = data.date.split('-');
      if (parts.length === 3) {
        formattedDate = parts[2] + '-' + parts[1] + '-' + parts[0];
      } else {
        formattedDate = data.date;
      }
    }

    let transporterVal = data.transporter ? '<u><b>' + data.transporter + '</b></u>' : '______________________';
    const drawnStr = formattedDate ? '<u><b>' + formattedDate + ' at ' + (data.time ? data.time : '____') + ' Hours</b></u>' : '________________________';
    const challanDensityStr = data.challanDensity ? '<u><b>' + data.challanDensity + ' kg/m³</b></u>' : '______________________';
    const driverNameStr = data.driver ? '<u><b>' + data.driver + '</b></u>' : '';

    return `
      <div class="print-label" style="border: 2px solid #800000; border-radius: 4px; padding: 6px; box-sizing: border-box; color: #800000; background: #fff; display: flex; flex-direction: column; justify-content: space-between; height: 100%; width: 100%;">
        <div class="label-header" style="display: flex; border-bottom: 2px solid #800000; padding-bottom: 4px; align-items: center; margin-bottom: 4px;">
          <div class="hp-logo-box" style="border: 2px solid #800000; width: 44px; height: 44px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; margin-right: 6px; flex-shrink: 0; box-sizing: border-box;">
            <div style="font-size: 5.5px; line-height: 1.1; font-weight: bold;">Hindustan<br>Petroleum</div>
            <div style="font-size: 13px; font-weight: 800; border-top: 1.5px solid #800000; width: 100%; margin-top: 2px; padding-top: 1px; letter-spacing: 0.5px;">HP</div>
          </div>
          <div class="header-text" style="flex-grow: 1; text-align: center; line-height: 1.1;">
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase;">Sample Label, Tank Lorry Retention</div>
            <div style="font-size: 7.5px; font-weight: 700; margin: 1px 0;">Sample Drawn At Retail Outlets</div>
            <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1px;">Hindustan Petroleum Corporation Limited</div>
          </div>
        </div>
        
        <div class="label-body" style="flex-grow: 1; font-size: 8px; line-height: 1.25; display: flex; flex-direction: column; justify-content: flex-start; gap: 1.5px;">
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">1.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Supply Location:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">Panewadi (Manmad IRD)</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">2.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Division/Territory/Region Offce:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">Nashik RO (HPCL)</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">3.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Name of the Retail Outlet:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">Ashish Service Center (41052317)</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">4.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Name of the Oil Company:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">HPCL</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">5.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">${displayProduct}</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">6.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Source of Sample:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">T/T</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">7.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Tank/ Lorry No:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">${formatUnderlineValue(data.tanker_no)}</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">8.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Invoice No.</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">${formatUnderlineValue(data.invoice_no)}</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">9.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Samples drawn on at Pimpalgaon, Hours.</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">${drawnStr}</span>
          </div>
          
          <div class="field-row" style="margin-bottom: 1px; display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">10.</span> <span class="label-txt" style="font-weight: 700; margin-right: 4px; flex-shrink: 0;">Density at 15°c</span>
          </div>
          <div class="field-row sub-field" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 22px; padding-left: 8px; flex-shrink: 0;">10.1.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">As Recorded in the Challan:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">${challanDensityStr}</span>
          </div>
          <div class="field-row sub-field" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 22px; padding-left: 8px; flex-shrink: 0;">10.2.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Of Sample Collected From Lorry:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">${formatUnderlineValue(data.lorryDensity)}</span>
          </div>
          
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">11.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">RO tank no. of product decanted.</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">${formatUnderlineValue(data.roTank)}</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">12.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Plastic Seal No. of Aluminum Container:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">${formatUnderlineValue(data.containerSeal)}</span>
          </div>
          <div class="field-row" style="display: flex; align-items: baseline;">
            <span class="num" style="font-weight: bold; margin-right: 3px; width: 14px; flex-shrink: 0;">13.</span> <span class="label-txt" style="margin-right: 4px; flex-shrink: 0;">Plastic Seals No, of Wooden Box:</span>
            <span class="value-txt" style="border-bottom: 1px dotted #800000; flex-grow: 1; font-weight: 700; font-size: 8.5px; color: #000; padding-left: 2px; min-height: 10px;">${formatUnderlineValue(data.woodenSeal)}</span>
          </div>
        </div>
        
        <div class="certification-text" style="font-size: 6.8px; font-style: italic; line-height: 1.1; text-align: justify; margin: 2px 0; border-top: 1.5px solid #800000; border-bottom: 1.5px solid #800000; padding: 1px 0; font-weight: 500;">
          We certified that the empty container had been rinsed with the product before drawing samples in my presence and that the sample is re-tained after proper labelling and sealing
        </div>
        
        <div class="label-footer" style="display: flex; flex-direction: column; gap: 2.5px;">
          <div class="footer-row" style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 2px;">
            <div style="display: flex; flex-direction: column;">
              <div style="border-bottom: 1px dotted #800000; height: 10px; width: 120px;"></div>
              <div style="font-size: 6.5px; font-weight: bold; transform: scale(0.95);">Signature of the Dealer/Dealer's Representative:</div>
            </div>
            <div style="display: flex; flex-direction: column;">
              <div style="font-weight: 700; font-size: 7.5px; border-bottom: 1px dotted #800000; width: 120px; text-align: center; height: 10px; line-height: 10px; color: #000;">${data.dealerRep || 'Ashish Service Center'}</div>
              <div style="font-size: 6.5px; font-weight: bold; text-align: center; transform: scale(0.95);">Name of the Dealer/Dealer's Representative:</div>
            </div>
          </div>
          
          <div class="footer-row" style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <div style="font-size: 7.5px; font-weight: bold;">Seal Rubber Stamp:</div>
            <div style="display: flex; flex-direction: column;">
              <div style="font-weight: 700; font-size: 7.5px; border-bottom: 1px dotted #800000; width: 150px; text-align: center; color: #000;">Place: Pimpalgaon Retail Outlet, Date: ${formattedDate ? '<u><b>' + formattedDate + '</b></u>' : '______'}</div>
            </div>
          </div>

          <div class="footer-row" style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <div style="display: flex; flex-direction: column;">
              <div style="border-bottom: 1px dotted #800000; height: 10px; width: 120px;"></div>
              <div style="font-size: 6.5px; font-weight: bold; transform: scale(0.95);">Signature of T/T Driver:</div>
            </div>
            <div style="display: flex; flex-direction: column;">
              <div style="font-weight: 700; font-size: 7.5px; border-bottom: 1px dotted #800000; width: 120px; height: 10px; color: #000;">${driverNameStr}</div>
              <div style="font-size: 6.5px; font-weight: bold; text-align: center; transform: scale(0.95);">Name of T/T Driver:</div>
            </div>
          </div>

          <div class="footer-row" style="margin-top: 1px; display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <div style="width: 100%; display: flex; flex-direction: column;">
              <div style="font-size: 7.5px; border-bottom: 1px dotted #800000; width: 100%; color: #000; min-height: 10px;">${transporterVal}</div>
              <div style="font-size: 6.5px; font-weight: bold;">Transporter's Name:</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderWizardPreview() {
    const sheet = document.getElementById('mini-a4-sheet');
    if (!sheet) return;
    sheet.innerHTML = '';
    // Draw 4 cards for screen A4 preview
    for (let i = 0; i < 4; i++) {
      sheet.innerHTML += renderSingleLabelHTML(currentWizardData);
    }
  }

  function printRetentionLabels() {
    if (!currentWizardData) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print/save labels.');
      return;
    }

    const totalCopies = currentWizardData.copies || 4;
    let pagesHtml = '';

    for (let i = 0; i < totalCopies; i += 4) {
      let label1 = renderSingleLabelHTML(currentWizardData);
      let label2 = (i + 1 < totalCopies) ? renderSingleLabelHTML(currentWizardData) : '<div class="empty-label-cell"></div>';
      let label3 = (i + 2 < totalCopies) ? renderSingleLabelHTML(currentWizardData) : '<div class="empty-label-cell"></div>';
      let label4 = (i + 3 < totalCopies) ? renderSingleLabelHTML(currentWizardData) : '<div class="empty-label-cell"></div>';

      pagesHtml += `
        <div class="print-page">
          ${label1}
          ${label2}
          ${label3}
          ${label4}
        </div>
      `;
    }

    let docTitle = 'Retention Labels';
    if (currentWizardData.invoice_no) {
      docTitle = `Retention Labels - Invoice ${currentWizardData.invoice_no}`;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${docTitle}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 6mm 4mm;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            background: #fff;
            color: #000;
          }
          .print-page {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 4mm 3mm;
            width: 202mm;
            height: 285mm;
            page-break-after: always;
            box-sizing: border-box;
          }
          .print-page:last-child {
            page-break-after: avoid;
          }
          .print-label {
            border: 2px solid #800000;
            border-radius: 4px;
            padding: 6px;
            box-sizing: border-box;
            color: #800000;
            background: #fff;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            height: 140mm;
            width: 99mm;
            position: relative;
          }
          .empty-label-cell {
            height: 140mm;
            width: 99mm;
            box-sizing: border-box;
          }
          .label-header {
            display: flex;
            border-bottom: 2px solid #800000;
            padding-bottom: 4px;
            align-items: center;
            margin-bottom: 4px;
          }
          .hp-logo-box {
            border: 2px solid #800000;
            width: 44px;
            height: 44px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            margin-right: 6px;
            flex-shrink: 0;
            box-sizing: border-box;
          }
          .header-text {
            flex-grow: 1;
            text-align: center;
            line-height: 1.1;
          }
          .label-body {
            flex-grow: 1;
            font-size: 8px;
            line-height: 1.25;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            gap: 1.5px;
          }
          .field-row {
            display: flex;
            align-items: baseline;
          }
          .num {
            font-weight: bold;
            margin-right: 3px;
            width: 14px;
            flex-shrink: 0;
          }
          .sub-field .num {
            width: 22px;
            padding-left: 8px;
          }
          .label-txt {
            margin-right: 4px;
            flex-shrink: 0;
          }
          .value-txt {
            border-bottom: 1px dotted #800000;
            flex-grow: 1;
            font-weight: 700;
            font-size: 8.5px;
            color: #000;
            padding-left: 2px;
            min-height: 10px;
          }
          .certification-text {
            font-size: 6.8px;
            font-style: italic;
            line-height: 1.1;
            text-align: justify;
            margin: 2px 0;
            border-top: 1.5px solid #800000;
            border-bottom: 1.5px solid #800000;
            padding: 1px 0;
            font-weight: 500;
          }
          .label-footer {
            display: flex;
            flex-direction: column;
            gap: 2.5px;
          }
          .footer-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
          }
          .footer-row > div {
            display: flex;
            flex-direction: column;
          }
          .print-btn-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #800000;
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 30px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .print-btn-container:hover {
            background: #600000;
          }
          @media print {
            .print-btn-container {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <button class="print-btn-container" onclick="window.print()">
          <span>🖨️</span> Print Labels / Save as PDF
        </button>
        ${pagesHtml}
        <script>
          window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
              window.print();
            }, 500);
          });
        </script>
      </body>
      </html>
    `);

    printWindow.document.close();
  }


  // ── CHILLAR RECORD & PORANCHA HISHOB FEATURES ─────────────────────────────────

  const navChillarRecord = document.getElementById('nav-chillar-record');
  const navPoranchaHishob = document.getElementById('nav-porancha-hishob');

  if (navChillarRecord) {
    navChillarRecord.addEventListener('click', (e) => {
      e.preventDefault();
      showView('chillar-record');
      loadChillarData();
    });
  }

  if (navPoranchaHishob) {
    navPoranchaHishob.addEventListener('click', (e) => {
      e.preventDefault();
      showView('porancha-hishob');
      loadPoranchaHishob();
    });
  }

  // ── Chillar Record Logic ──────────────────────────────────────────────────
  async function loadChillarData() {
    try {
      // 1. Fetch current status
      const statusRes = await fetch('/api/chillar/status');
      if (!statusRes.ok) throw new Error('Failed to load Chillar status.');
      const status = await statusRes.json();

      const totalBalanceEl = document.getElementById('chillar-total-balance');
      if (totalBalanceEl) {
        totalBalanceEl.textContent = `₹ ${status.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }

      const statusMap = {
        'status-notes-10': status.notes_10,
        'status-coins-20': status.coins_20,
        'status-coins-10': status.coins_10,
        'status-coins-5': status.coins_5,
        'status-coins-2': status.coins_2,
        'status-coins-1': status.coins_1
      };

      for (const [id, count] of Object.entries(statusMap)) {
        const el = document.getElementById(id);
        if (el) el.textContent = count;
      }

      // 2. Fetch transactions history
      const txRes = await fetch('/api/chillar/transactions');
      if (!txRes.ok) throw new Error('Failed to load Chillar transactions.');
      const txData = await txRes.json();
      const txList = txData.transactions || [];

      const tbody = document.querySelector('#chillar-ledger-table tbody');
      if (tbody) {
        tbody.innerHTML = '';
        if (txList.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">No transactions recorded yet.</td></tr>';
        } else {
          // Sort descending: newest date first, then newest ID first
          const sortedList = txList.sort((a, b) => {
            const dateComp = b.date.localeCompare(a.date);
            if (dateComp !== 0) return dateComp;
            return b.id - a.id;
          });

          sortedList.forEach(tx => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            // Format denomination log
            const logParts = [];
            if (tx.notes_10) logParts.push(`₹10 x ${tx.notes_10}`);
            if (tx.coins_20) logParts.push(`₹20 x ${tx.coins_20}`);
            if (tx.coins_10) logParts.push(`₹10 x ${tx.coins_10}`);
            if (tx.coins_5) logParts.push(`₹5 x ${tx.coins_5}`);
            if (tx.coins_2) logParts.push(`₹2 x ${tx.coins_2}`);
            if (tx.coins_1) logParts.push(`₹1 x ${tx.coins_1}`);
            const denomLog = logParts.join(', ') || '—';

            // Amount formatting
            let amountText = `₹ ${tx.total_amount.toFixed(2)}`;
            let amountStyle = '';
            if (tx.type === 'OPENING' || tx.type === 'MANUAL_CREDIT' || tx.type === 'DAY_CLOSE') {
              amountText = `+ ${amountText}`;
              amountStyle = 'color: var(--success); font-weight: 700;';
            } else if (tx.type === 'MANUAL_DEBIT') {
              amountText = `- ${amountText}`;
              amountStyle = 'color: var(--danger); font-weight: 700;';
            }

            // Type Badge
            let typeBadge = `<span class="badge" style="padding: 0.15rem 0.4rem; font-size: 0.7rem; border-radius: 0.25rem; font-weight: 600; text-transform: uppercase; `;
            if (tx.type === 'OPENING') {
              typeBadge += `background: rgba(168, 85, 247, 0.15); color: #c084fc;">Opening</span>`;
            } else if (tx.type === 'DAY_CLOSE') {
              typeBadge += `background: rgba(59, 130, 246, 0.15); color: #60a5fa;">Day Close</span>`;
            } else if (tx.type === 'MANUAL_CREDIT') {
              typeBadge += `background: rgba(16, 185, 129, 0.15); color: #34d399;">Adjustment (+)</span>`;
            } else if (tx.type === 'MANUAL_DEBIT') {
              typeBadge += `background: rgba(239, 68, 68, 0.15); color: #f87171;">Adjustment (-)</span>`;
            }

            // Action
            const showDelete = tx.type !== 'OPENING' && tx.type !== 'DAY_CLOSE';
            const actionTd = showDelete 
              ? `<button type="button" class="btn btn-secondary btn-delete-chillar-tx" data-id="${tx.id}" style="padding: 0.15rem 0.4rem; font-size: 0.7rem; min-height: auto; border-radius: 0.25rem;">🗑 Delete</button>`
              : '—';

            tr.innerHTML = `
              <td style="padding: 0.5rem; white-space: nowrap;">${tx.date}</td>
              <td style="padding: 0.5rem;">${typeBadge}</td>
              <td style="padding: 0.5rem;">${tx.description || ''}</td>
              <td style="padding: 0.5rem; font-family: monospace; font-size: 0.75rem; color: var(--text-muted);">${denomLog}</td>
              <td style="padding: 0.5rem; text-align: right; ${amountStyle}">${amountText}</td>
              <td style="padding: 0.5rem; text-align: right; font-weight: 600;">₹ ${tx.running_balance.toFixed(2)}</td>
              <td style="padding: 0.5rem; text-align: center;">${actionTd}</td>
            `;

            tbody.appendChild(tr);
          });

          // Bind delete events
          document.querySelectorAll('.btn-delete-chillar-tx').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const txId = e.currentTarget.getAttribute('data-id');
              if (confirm('Are you sure you want to delete this manual chillar transaction?')) {
                try {
                  const deleteRes = await fetch(`/api/chillar/transaction/${txId}`, { method: 'DELETE' });
                  if (!deleteRes.ok) throw new Error('Failed to delete transaction.');
                  showToast('Transaction deleted successfully', 'success');
                  loadChillarData();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              }
            });
          });
        }
      }
    } catch (err) {
      console.error('Error loading Chillar data:', err);
      showToast(err.message, 'error');
    }
  }

  // Real-time calculations for chillar adjustments
  function calcChillarAdjustmentTotal() {
    const n10 = parseInt(document.getElementById('adj-notes-10').value) || 0;
    const c20 = parseInt(document.getElementById('adj-coins-20').value) || 0;
    const c10 = parseInt(document.getElementById('adj-coins-10').value) || 0;
    const c5 = parseInt(document.getElementById('adj-coins-5').value) || 0;
    const c2 = parseInt(document.getElementById('adj-coins-2').value) || 0;
    const c1 = parseInt(document.getElementById('adj-coins-1').value) || 0;
    const total = (n10 * 10) + (c20 * 20) + (c10 * 10) + (c5 * 5) + (c2 * 2) + (c1 * 1);
    
    const adjTotalValEl = document.getElementById('chillar-adj-total-val');
    if (adjTotalValEl) adjTotalValEl.textContent = `₹ ${total.toFixed(2)}`;
  }

  document.querySelectorAll('.chillar-calc-input').forEach(input => {
    input.addEventListener('input', calcChillarAdjustmentTotal);
  });

  const formChillarAdjustment = document.getElementById('form-chillar-adjustment');
  if (formChillarAdjustment) {
    formChillarAdjustment.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('chillar-adj-date').value;
      const type = document.getElementById('chillar-adj-type').value;
      const description = document.getElementById('chillar-adj-desc').value.trim();
      const notes_10 = parseInt(document.getElementById('adj-notes-10').value) || 0;
      const coins_20 = parseInt(document.getElementById('adj-coins-20').value) || 0;
      const coins_10 = parseInt(document.getElementById('adj-coins-10').value) || 0;
      const coins_5 = parseInt(document.getElementById('adj-coins-5').value) || 0;
      const coins_2 = parseInt(document.getElementById('adj-coins-2').value) || 0;
      const coins_1 = parseInt(document.getElementById('adj-coins-1').value) || 0;

      if (!date || !type || !description) {
        showToast('Please fill all required fields.', 'warning');
        return;
      }

      try {
        const res = await fetch('/api/chillar/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, type, description, notes_10, coins_20, coins_10, coins_5, coins_2, coins_1 })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save transaction.');
        showToast('Chillar adjustment saved successfully.', 'success');
        
        // Reset form
        formChillarAdjustment.reset();
        document.getElementById('chillar-adj-date').value = activeDate;
        calcChillarAdjustmentTotal();
        
        loadChillarData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Chillar Edit Opening balance
  const btnChillarEditOpening = document.getElementById('btn-chillar-edit-opening');
  if (btnChillarEditOpening) {
    btnChillarEditOpening.addEventListener('click', async () => {
      document.getElementById('modal-chillar-opening').style.display = 'flex';
      try {
        const txRes = await fetch('/api/chillar/transactions');
        if (!txRes.ok) throw new Error('Failed to load transactions.');
        const txData = await txRes.json();
        const txList = txData.transactions || [];
        const openingTx = txList.find(tx => tx.type === 'OPENING') || {
          notes_10: 0, coins_20: 0, coins_10: 0, coins_5: 0, coins_2: 0, coins_1: 0
        };

        document.getElementById('opening-notes-10').value = openingTx.notes_10;
        document.getElementById('opening-coins-20').value = openingTx.coins_20;
        document.getElementById('opening-coins-10').value = openingTx.coins_10;
        document.getElementById('opening-coins-5').value = openingTx.coins_5;
        document.getElementById('opening-coins-2').value = openingTx.coins_2;
        document.getElementById('opening-coins-1').value = openingTx.coins_1;

        calcChillarOpeningTotal();
      } catch (err) {
        showToast('Failed to load opening balance: ' + err.message, 'error');
      }
    });
  }

  function calcChillarOpeningTotal() {
    const n10 = parseInt(document.getElementById('opening-notes-10').value) || 0;
    const c20 = parseInt(document.getElementById('opening-coins-20').value) || 0;
    const c10 = parseInt(document.getElementById('opening-coins-10').value) || 0;
    const c5 = parseInt(document.getElementById('opening-coins-5').value) || 0;
    const c2 = parseInt(document.getElementById('opening-coins-2').value) || 0;
    const c1 = parseInt(document.getElementById('opening-coins-1').value) || 0;
    const total = (n10 * 10) + (c20 * 20) + (c10 * 10) + (c5 * 5) + (c2 * 2) + (c1 * 1);

    const openingTotalValEl = document.getElementById('opening-total-val');
    if (openingTotalValEl) openingTotalValEl.textContent = `₹ ${total.toFixed(2)}`;
  }

  document.querySelectorAll('.opening-calc-input').forEach(input => {
    input.addEventListener('input', calcChillarOpeningTotal);
  });

  const formChillarOpening = document.getElementById('form-chillar-opening');
  if (formChillarOpening) {
    formChillarOpening.addEventListener('submit', async (e) => {
      e.preventDefault();
      const notes_10 = parseInt(document.getElementById('opening-notes-10').value) || 0;
      const coins_20 = parseInt(document.getElementById('opening-coins-20').value) || 0;
      const coins_10 = parseInt(document.getElementById('opening-coins-10').value) || 0;
      const coins_5 = parseInt(document.getElementById('opening-coins-5').value) || 0;
      const coins_2 = parseInt(document.getElementById('opening-coins-2').value) || 0;
      const coins_1 = parseInt(document.getElementById('opening-coins-1').value) || 0;

      try {
        const res = await fetch('/api/chillar/opening', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes_10, coins_20, coins_10, coins_5, coins_2, coins_1 })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update opening balance.');
        showToast('Opening balance updated successfully.', 'success');
        document.getElementById('modal-chillar-opening').style.display = 'none';
        loadChillarData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }


  // ── Porancha Hishob (Shift Sales Duty Log) Logic ──────────────────────────────
  const poranchaHishobDateInput = document.getElementById('porancha-hishob-date');
  let currentDayReadingsMap = {};
  if (poranchaHishobDateInput) {
    poranchaHishobDateInput.addEventListener('change', () => {
      loadPoranchaHishob();
    });
  }

  async function loadPoranchaHishob() {
    try {
      if (!poranchaHishobDateInput.value) {
        poranchaHishobDateInput.value = activeDate;
      }
      const selDate = poranchaHishobDateInput.value;

      // 1. Verify if the date is finalized/closed
      const readingsCheckRes = await fetch(`/api/readings/opening?date=${selDate}`);
      if (!readingsCheckRes.ok) throw new Error('Failed to verify date status.');
      const checkData = await readingsCheckRes.json();

      const overlay = document.getElementById('porancha-hishob-blocked-overlay');
      if (!checkData.isClosed) {
        if (overlay) {
          overlay.style.display = 'flex';
          document.getElementById('porancha-hishob-blocked-title').textContent = 'DAY NOT FINALIZED';
          document.getElementById('porancha-hishob-blocked-message').textContent = 
            `Day Closing must be completed and closed first for ${selDate} before shift sales can be accessed.`;
        }
        return;
      } else {
        if (overlay) overlay.style.display = 'none';
      }

      // 2. Fetch shift data, employees, and rates
      const [hishobRes, empRes, ratesRes] = await Promise.all([
        fetch(`/api/porancha-hishob?date=${selDate}`),
        fetch('/api/employees'),
        fetch(`/api/rates/opening?date=${selDate}`)
      ]);

      if (!hishobRes.ok) throw new Error('Failed to fetch shift details.');
      if (!empRes.ok) throw new Error('Failed to fetch employees.');
      if (!ratesRes.ok) throw new Error('Failed to fetch rates.');

      const hishobData = await hishobRes.json();
      const employeesData = await empRes.json();
      const ratesData = await ratesRes.json();

      const employeesList = employeesData.employees || [];
      const currentRates = ratesData.rates || { rate_petrol: 100, rate_diesel: 90, rate_power: 110 };

      // Helper to generate options for employee select
      const generateEmployeeOptionsHTML = (selectedId) => {
        let html = '<option value="">— On Duty —</option>';
        employeesList.forEach(emp => {
          if (emp.is_active === 1 || emp.id === selectedId) {
            html += `<option value="${emp.id}" ${emp.id === selectedId ? 'selected' : ''}>${emp.name}</option>`;
          }
        });
        return html;
      };

      // Configuration of the 6 nozzles
      const nozzles = [
        { id: 1, product: 'Petrol', rate: currentRates.rate_petrol },
        { id: 2, product: 'Petrol', rate: currentRates.rate_petrol },
        { id: 3, product: 'Petrol', rate: currentRates.rate_petrol },
        { id: 4, product: 'Diesel', rate: currentRates.rate_diesel },
        { id: 5, product: 'Diesel', rate: currentRates.rate_diesel },
        { id: 6, product: 'poWer', rate: currentRates.rate_power }
      ];

      // Map day readings for quick lookup
      currentDayReadingsMap = {};
      checkData.savedReadings.forEach(r => {
        currentDayReadingsMap[r.nozzle_id] = r;
      });

      function validateReadingInput(input, nozzleId) {
        const val = parseFloat(input.value);
        if (isNaN(val)) return true;
        const dayReading = currentDayReadingsMap[nozzleId];
        if (!dayReading) return true;
        
        if (val < dayReading.opening_reading) {
          showToast(`Nozzle N${nozzleId} reading cannot be less than Day's opening reading (${dayReading.opening_reading.toFixed(2)}).`, 'warning');
          input.value = dayReading.opening_reading.toFixed(2);
          input.dispatchEvent(new Event('input'));
          return false;
        }
        if (val > dayReading.closing_reading) {
          showToast(`Nozzle N${nozzleId} reading cannot be greater than Day's closing reading (${dayReading.closing_reading.toFixed(2)}).`, 'warning');
          input.value = dayReading.closing_reading.toFixed(2);
          input.dispatchEvent(new Event('input'));
          return false;
        }
        return true;
      }

      // Render Shifts 1, 2, 3
      [1, 2, 3].forEach(shiftNum => {
        const tbody = document.querySelector(`#porancha-hishob-table-shift-${shiftNum} .shift-tbody`);
        if (!tbody) return;
        tbody.innerHTML = '';

        nozzles.forEach(noz => {
          // Find if there is a saved entry for this shift and nozzle
          const savedEntry = hishobData.entries.find(e => e.shift === shiftNum && e.nozzle_index === noz.id);
          const activeEmployeeId = savedEntry ? savedEntry.employee_id : '';
          
          let openingVal = '';
          let closingVal = '';
          let phonepeVal = savedEntry ? savedEntry.phonepe_amount : 0;

          if (savedEntry) {
            openingVal = savedEntry.opening_reading;
            closingVal = savedEntry.closing_reading;
          } else {
            // Default heuristics:
            // Shift 1 opening matches Day's opening reading
            if (shiftNum === 1) {
              const dayReading = currentDayReadingsMap[noz.id];
              if (dayReading) openingVal = dayReading.opening_reading;
            }
            // Shift 2 opening matches Shift 1 closing reading (saved or in the DOM)
            if (shiftNum === 2) {
              const shift1Row = document.querySelector(`#porancha-hishob-table-shift-1 tr td[data-nozzle="${noz.id}"]`)?.closest('tr');
              const shift1ClosingInput = shift1Row?.querySelector('.row-closing-input');
              if (shift1ClosingInput) openingVal = shift1ClosingInput.value;
            }
            // Shift 3 opening matches Shift 2 closing reading (saved or in the DOM)
            if (shiftNum === 3) {
              const shift2Row = document.querySelector(`#porancha-hishob-table-shift-2 tr td[data-nozzle="${noz.id}"]`)?.closest('tr');
              const shift2ClosingInput = shift2Row?.querySelector('.row-closing-input');
              if (shift2ClosingInput) openingVal = shift2ClosingInput.value;
            }
            // Shift 3 closing matches Day's closing reading
            if (shiftNum === 3) {
              const dayReading = currentDayReadingsMap[noz.id];
              if (dayReading) closingVal = dayReading.closing_reading;
            }
          }

          const isOpReadonly = 'readonly tabindex="-1" style="width: 100%; text-align: right; padding: 0.1rem; font-size: 0.7rem; height: 22px; border-radius: 0.2rem; background: rgba(255,255,255,0.02); color: var(--text-muted); border: 1px solid var(--panel-border); cursor: not-allowed;"';
          const isClReadonly = (shiftNum === 3)
            ? 'readonly tabindex="-1" style="width: 100%; text-align: right; padding: 0.1rem; font-size: 0.7rem; height: 22px; border-radius: 0.2rem; background: rgba(255,255,255,0.02); color: var(--text-muted); border: 1px solid var(--panel-border); cursor: not-allowed;"'
            : 'style="width: 100%; text-align: right; padding: 0.1rem; font-size: 0.7rem; height: 22px; border-radius: 0.2rem; background: var(--panel-bg); border: 1px solid var(--panel-border);"';

          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
          tr.innerHTML = `
            <td style="padding: 0.2rem 0.05rem; font-weight: 700; font-size: 0.72rem; color: var(--text-main);" data-nozzle="${noz.id}" data-product="${noz.product}" data-rate="${noz.rate}">N${noz.id}</td>
            <td style="padding: 0.2rem 0.05rem;">
              <select class="row-employee-select" style="width: 100%; padding: 0.1rem; font-size: 0.7rem; height: 22px; border-radius: 0.2rem; background: var(--panel-bg); border: 1px solid var(--panel-border);">
                ${generateEmployeeOptionsHTML(activeEmployeeId)}
              </select>
            </td>
            <td style="padding: 0.2rem 0.05rem;">
              <input type="number" step="0.01" class="row-opening-input" value="${openingVal}" ${isOpReadonly}>
            </td>
            <td style="padding: 0.2rem 0.05rem;">
              <input type="number" step="0.01" class="row-closing-input" value="${closingVal}" ${isClReadonly}>
            </td>
            <td style="padding: 0.2rem 0.05rem; text-align: right; font-weight: 600; font-size: 0.72rem;"><span class="row-sale-val">0.00</span></td>
            <td style="padding: 0.2rem 0.05rem; text-align: right; font-size: 0.72rem; color: var(--text-muted); font-family: monospace;">${noz.rate.toFixed(2)}</td>
            <td style="padding: 0.2rem 0.05rem; text-align: right; font-weight: 700; font-size: 0.72rem; color: var(--success);"><span class="row-amount-val">₹ 0.00</span></td>
            <td style="padding: 0.2rem 0.05rem;">
              <input type="number" step="0.01" class="row-phonepe-input" value="${phonepeVal}" style="width: 100%; text-align: right; padding: 0.1rem; font-size: 0.7rem; height: 22px; border-radius: 0.2rem; background: var(--panel-bg); border: 1px solid var(--panel-border);">
            </td>
          `;

          tbody.appendChild(tr);

          // Setup cascading change listeners and validations
          // Shift 1 Closing -> Shift 2 Opening
          if (shiftNum === 1) {
            const closingInput = tr.querySelector('.row-closing-input');
            closingInput.addEventListener('input', () => {
              const val = closingInput.value;
              const shift2Row = document.querySelector(`#porancha-hishob-table-shift-2 tr td[data-nozzle="${noz.id}"]`)?.closest('tr');
              if (shift2Row) {
                const shift2OpeningInput = shift2Row.querySelector('.row-opening-input');
                shift2OpeningInput.value = val;
                recalcShiftRow(shift2Row);
              }
            });
            closingInput.addEventListener('change', () => {
              validateReadingInput(closingInput, noz.id);
            });
          }
          // Shift 2 Closing -> Shift 3 Opening
          else if (shiftNum === 2) {
            const closingInput = tr.querySelector('.row-closing-input');
            closingInput.addEventListener('input', () => {
              const val = closingInput.value;
              const shift3Row = document.querySelector(`#porancha-hishob-table-shift-3 tr td[data-nozzle="${noz.id}"]`)?.closest('tr');
              if (shift3Row) {
                const shift3OpeningInput = shift3Row.querySelector('.row-opening-input');
                shift3OpeningInput.value = val;
                recalcShiftRow(shift3Row);
              }
            });
            closingInput.addEventListener('change', () => {
              validateReadingInput(closingInput, noz.id);
            });
          }
        });

        // Set up real-time calculations for this shift table
        const inputs = tbody.querySelectorAll('.row-opening-input, .row-closing-input');
        inputs.forEach(inp => {
          inp.addEventListener('input', () => recalcShiftRow(inp.closest('tr')));
        });
        
        // Trigger initial calculations
        tbody.querySelectorAll('tr').forEach(tr => recalcShiftRow(tr));
        
        // Listen for PhonePe changes to also update totals
        tbody.querySelectorAll('.row-phonepe-input').forEach(inp => {
          inp.addEventListener('input', () => updateShiftTotal(shiftNum));
        });
      });


      // Render Nozzle Testing Table
      const testTbody = document.querySelector('#porancha-hishob-table-testing .testing-tbody');
      if (testTbody) {
        testTbody.innerHTML = '';

        nozzles.forEach(noz => {
          const savedTest = hishobData.testing.find(t => t.nozzle_index === noz.id);
          const activeEmployeeId = savedTest ? savedTest.employee_id : '';
          const testingQty = savedTest ? savedTest.testing_qty : (dayReadingsMap[noz.id] ? dayReadingsMap[noz.id].testing_qty : 5.0);
          const phonepeVal = savedTest ? savedTest.phonepe_amount : 0;

          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
          tr.innerHTML = `
            <td style="padding: 0.2rem 0.05rem; font-weight: 700; font-size: 0.72rem; color: var(--text-main);" data-nozzle="${noz.id}" data-product="${noz.product}" data-rate="${noz.rate}">N${noz.id}</td>
            <td style="padding: 0.2rem 0.05rem;">
              <select class="row-employee-select" style="width: 100%; padding: 0.1rem; font-size: 0.7rem; height: 22px; border-radius: 0.2rem; background: var(--panel-bg); border: 1px solid var(--panel-border);">
                ${generateEmployeeOptionsHTML(activeEmployeeId)}
              </select>
            </td>
            <td style="padding: 0.2rem 0.05rem;">
              <input type="number" step="0.01" class="row-testing-qty-input" value="${testingQty}" style="width: 100%; text-align: right; padding: 0.1rem; font-size: 0.7rem; height: 22px; border-radius: 0.2rem; background: var(--panel-bg); border: 1px solid var(--panel-border);">
            </td>
            <td style="padding: 0.2rem 0.05rem; text-align: center; color: var(--text-muted); font-size: 0.7rem;">—</td>
            <td style="padding: 0.2rem 0.05rem; text-align: right; font-weight: 600; font-size: 0.72rem;"><span class="row-testing-sale-val">${testingQty.toFixed(2)}</span></td>
            <td style="padding: 0.2rem 0.05rem; text-align: right; font-size: 0.72rem; color: var(--text-muted); font-family: monospace;">${noz.rate.toFixed(2)}</td>
            <td style="padding: 0.2rem 0.05rem; text-align: right; font-weight: 700; font-size: 0.72rem; color: var(--success);"><span class="row-testing-amount-val">₹ 0.00</span></td>
            <td style="padding: 0.2rem 0.05rem;">
              <input type="number" step="0.01" class="row-testing-phonepe-input" value="${phonepeVal}" style="width: 100%; text-align: right; padding: 0.1rem; font-size: 0.7rem; height: 22px; border-radius: 0.2rem; background: var(--panel-bg); border: 1px solid var(--panel-border);">
            </td>
          `;
          testTbody.appendChild(tr);

          const qtyInput = tr.querySelector('.row-testing-qty-input');
          qtyInput.addEventListener('input', () => {
            const val = parseFloat(qtyInput.value) || 0;
            tr.querySelector('.row-testing-sale-val').textContent = val.toFixed(2);
            recalcTestingRow(tr);
          });

          const phonepeInput = tr.querySelector('.row-testing-phonepe-input');
          phonepeInput.addEventListener('input', recalcTestingTotal);

          recalcTestingRow(tr);
        });
      }

    } catch (err) {
      console.error('Error loading Porancha Hishob details:', err);
      showToast(err.message, 'error');
    }
  }

  // Row calculation for shifts
  function recalcShiftRow(tr) {
    const opening = parseFloat(tr.querySelector('.row-opening-input').value) || 0;
    const closing = parseFloat(tr.querySelector('.row-closing-input').value) || 0;
    const rate = parseFloat(tr.querySelector('td[data-rate]').getAttribute('data-rate')) || 0;

    let sale = closing - opening;
    if (sale < 0) sale = 0;

    const amount = sale * rate;

    tr.querySelector('.row-sale-val').textContent = sale.toFixed(2);
    tr.querySelector('.row-amount-val').textContent = `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    tr.setAttribute('data-computed-amount', amount);

    // Update parent shift total
    const shiftTableId = tr.closest('table').id;
    const shiftNum = parseInt(shiftTableId.replace('porancha-hishob-table-shift-', '')) || 1;
    updateShiftTotal(shiftNum);
  }

  // Shift total updates
  function updateShiftTotal(shiftNum) {
    const tbody = document.querySelector(`#porancha-hishob-table-shift-${shiftNum} .shift-tbody`);
    if (!tbody) return;
    
    let total = 0;
    tbody.querySelectorAll('tr').forEach(tr => {
      total += parseFloat(tr.getAttribute('data-computed-amount')) || 0;
    });

    const shiftTotalEl = document.getElementById(`shift-${shiftNum}-total-val`);
    if (shiftTotalEl) {
      shiftTotalEl.textContent = `₹ ${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  // Row calculation for testing
  function recalcTestingRow(tr) {
    const qty = parseFloat(tr.querySelector('.row-testing-qty-input').value) || 0;
    const rate = parseFloat(tr.querySelector('td[data-rate]').getAttribute('data-rate')) || 0;
    const amount = qty * rate;

    tr.querySelector('.row-testing-amount-val').textContent = `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    tr.setAttribute('data-computed-amount', amount);

    recalcTestingTotal();
  }

  // Testing total calculation
  function recalcTestingTotal() {
    const tbody = document.querySelector('#porancha-hishob-table-testing .testing-tbody');
    if (!tbody) return;

    let total = 0;
    tbody.querySelectorAll('tr').forEach(tr => {
      total += parseFloat(tr.getAttribute('data-computed-amount')) || 0;
    });

    const testingTotalEl = document.getElementById('testing-total-val');
    if (testingTotalEl) {
      testingTotalEl.textContent = `₹ ${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  // Save Shifts Data
  const btnPoranchaHishobSave = document.getElementById('btn-porancha-hishob-save');
  if (btnPoranchaHishobSave) {
    btnPoranchaHishobSave.addEventListener('click', async () => {
      try {
        const date = poranchaHishobDateInput.value;
        if (!date) {
          showToast('Select Date is required.', 'warning');
          return;
        }

        // Validate all readings are within day boundaries
        let isValid = true;
        for (let shiftNum = 1; shiftNum <= 3; shiftNum++) {
          const rows = document.querySelectorAll(`#porancha-hishob-table-shift-${shiftNum} .shift-tbody tr`);
          rows.forEach(tr => {
            const nozzleId = parseInt(tr.querySelector('td[data-nozzle]').getAttribute('data-nozzle')) || 0;
            const opening = parseFloat(tr.querySelector('.row-opening-input').value) || 0;
            const closing = parseFloat(tr.querySelector('.row-closing-input').value) || 0;
            
            const dayReading = currentDayReadingsMap[nozzleId];
            if (dayReading) {
              if (opening < dayReading.opening_reading || opening > dayReading.closing_reading) {
                showToast(`Nozzle N${nozzleId} Shift ${shiftNum} opening reading (${opening}) is out of day boundaries [${dayReading.opening_reading}, ${dayReading.closing_reading}].`, 'error');
                isValid = false;
              }
              if (closing < dayReading.opening_reading || closing > dayReading.closing_reading) {
                showToast(`Nozzle N${nozzleId} Shift ${shiftNum} closing reading (${closing}) is out of day boundaries [${dayReading.opening_reading}, ${dayReading.closing_reading}].`, 'error');
                isValid = false;
              }
            }
          });
        }
        if (!isValid) return;

        const entries = [];
        const testing = [];

        // Collect Shift 1, 2, 3 entries
        for (let shiftNum = 1; shiftNum <= 3; shiftNum++) {
          const rows = document.querySelectorAll(`#porancha-hishob-table-shift-${shiftNum} .shift-tbody tr`);
          rows.forEach(tr => {
            const nozzleId = parseInt(tr.querySelector('td[data-nozzle]').getAttribute('data-nozzle')) || 0;
            const product = tr.querySelector('td[data-product]').getAttribute('data-product');
            const rate = parseFloat(tr.querySelector('td[data-rate]').getAttribute('data-rate')) || 0;
            const employeeId = parseInt(tr.querySelector('.row-employee-select').value) || null;
            const opening = parseFloat(tr.querySelector('.row-opening-input').value) || 0;
            const closing = parseFloat(tr.querySelector('.row-closing-input').value) || 0;
            const phonepe = parseFloat(tr.querySelector('.row-phonepe-input').value) || 0;

            let sale = closing - opening;
            if (sale < 0) sale = 0;
            const amount = sale * rate;

            entries.push({
              shift: shiftNum,
              nozzle_index: nozzleId,
              product: product,
              employee_id: employeeId,
              opening_reading: opening,
              closing_reading: closing,
              difference_sale: sale,
              rate: rate,
              final_amount: amount,
              phonepe_amount: phonepe
            });
          });
        }

        // Collect testing entries
        const testRows = document.querySelectorAll('#porancha-hishob-table-testing .testing-tbody tr');
        testRows.forEach(tr => {
          const nozzleId = parseInt(tr.querySelector('td[data-nozzle]').getAttribute('data-nozzle')) || 0;
          const employeeId = parseInt(tr.querySelector('.row-employee-select').value) || null;
          const qty = parseFloat(tr.querySelector('.row-testing-qty-input').value) || 0;
          const phonepe = parseFloat(tr.querySelector('.row-testing-phonepe-input').value) || 0;

          testing.push({
            nozzle_index: nozzleId,
            employee_id: employeeId,
            testing_qty: qty,
            phonepe_amount: phonepe
          });
        });

        // Send payload
        const saveRes = await fetch('/api/porancha-hishob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, entries, testing })
        });
        const data = await saveRes.json();
        if (!saveRes.ok) throw new Error(data.error || 'Failed to save shift details.');

        showToast('Shift sales and duty records saved successfully.', 'success');
        loadPoranchaHishob();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

});
