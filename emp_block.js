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
