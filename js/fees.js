/**
 * VAVA Sports Academy - Fees & Collections Frontend Module
 * 
 * Dynamic production implementation connected to MySQL database via server/fees.php.
 * All mock/dummy data has been completely removed.
 */

(function () {
  'use strict';

  // ============================================================================
  // 1. LOCALHOST DEVELOPMENT ENDPOINT (Commented out for Hostinger deployment)
  // Uncomment the block below and comment out the Hostinger line when working on localhost:
  // ============================================================================
  /*
  const FEES_API_URL = (typeof FEES_API !== 'undefined' && FEES_API)
    ? FEES_API
    : (typeof window !== 'undefined' && window.location.port === '5500'
        ? 'http://localhost/VAVA_sports/server/fees.php'
        : (window.location.origin && window.location.origin.startsWith('http')
            ? `${window.location.origin}/VAVA_sports/server/fees.php`
            : 'http://localhost/VAVA_sports/server/fees.php'));
  */

  // ============================================================================
  // 2. HOSTINGER PRODUCTION ENDPOINT
  // ============================================================================
  const FEES_API_URL = (typeof FEES_API !== 'undefined' && FEES_API) ? FEES_API : 'server/fees.php';

  // ==========================================================================
  // 1. COMPONENT STATE (Real API Data Store)
  // ==========================================================================
  const state = {
    paidStudentsDisplayState: 'paid', // 'paid' | 'unpaid'
    percentageDisplayState: 'paid',   // 'paid' | 'unpaid'
    selectedBatch: 'all',
    selectedMonth: '',                // ISO date e.g. '2026-09-01' or empty for current
    selectedMonthLabel: '',           // e.g. 'September 2026'
    searchQuery: '',
    statusFilter: 'all',              // 'all' | 'paid' | 'unpaid'
    sortBy: 'name',                   // 'name' | 'dueDate' | 'feeAmount' | 'status'
    summaryData: {
      total: 0,
      paid: 0,
      unpaid: 0,
      paid_percentage: 0,
      unpaid_percentage: 0,
      selected_month: '',
      scheduled_notifications: 0
    },
    studentsData: [],
    batchesData: [],
    monthsData: [],
    contextTargetMonth: null,         // { date: '2026-09-01', label: 'September 2026' }
    pendingSchedules: [],             // [{ date: 'YYYY-MM-DD', time: 'HH:MM' }]
    tempSchedules: [],                // Working copy for modal
    isDeletingCycle: false,
    isLoading: false,
    initialized: false,
    searchDebounceTimer: null
  };

  // ==========================================================================
  // 2. UTILITY FUNCTIONS
  // ==========================================================================
  function safeEscape(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getStudentInitials(fullName) {
    if (typeof getInitials === 'function') return getInitials(fullName);
    if (!fullName) return '--';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '₹0';
    return '₹' + Number(amount || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });
  }

  function getAuthHeaders() {
    const role = localStorage.getItem('vava_role') || 'admin';
    const email = localStorage.getItem('vava_email') || '';
    return {
      'Content-Type': 'application/json',
      'X-VAVA-Role': role,
      'X-VAVA-Email': email
    };
  }

  // ==========================================================================
  // 3. API FETCH & DATA FLOW
  // ==========================================================================
  async function fetchFeesData() {
    if (state.isLoading) return;
    state.isLoading = true;

    const container = document.getElementById('feesStudentsCardsContainer');
    const emptyState = document.getElementById('feesStudentsEmptyState');
    const countPill = document.getElementById('feesStudentsCountText');

    if (container && state.studentsData.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 2.5rem 1rem; color: var(--text-secondary); font-size: 0.84rem;">Loading fee records...</div>';
    }

    try {
      const params = new URLSearchParams({
        action: 'get_fees',
        month: state.selectedMonth || '',
        batch_id: state.selectedBatch || 'all',
        status: state.statusFilter || 'all',
        search: state.searchQuery || '',
        sort: state.sortBy || 'name'
      });

      const response = await fetch(`${FEES_API_URL}?${params.toString()}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 403) {
          let errData = null;
          try { errData = await response.json(); } catch(e) {}
          throw new Error(errData?.error || 'Access Denied: Fees & Collections is restricted to Super Admin only.');
        }
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch fee records.');
      }

      // Update state with genuine database response
      state.summaryData = data.summary || {
        total: 0,
        paid: 0,
        unpaid: 0,
        paid_percentage: 0,
        unpaid_percentage: 0,
        selected_month: ''
      };
      state.studentsData = data.students || [];
      state.batchesData = data.batches || [];
      state.monthsData = data.available_months || [];

      if (data.summary && data.summary.fee_month_date) {
        state.selectedMonth = data.summary.fee_month_date;
        state.selectedMonthLabel = data.summary.selected_month;
      }

      // Render updated UI
      renderSummaryDashboard();
      renderBatchDropdownOptions();
      renderMonthDropdownOptions();
      renderStudentCards();

    } catch (err) {
      console.error('Error loading Fees & Collections data:', err);
      if (container) {
        container.innerHTML = `
          <div style="text-align:center; padding: 2rem 1rem; color: var(--color-danger); font-size: 0.82rem;">
            Failed to load fee records: ${safeEscape(err.message)}
          </div>
        `;
      }
      if (countPill) countPill.textContent = '0 STUDENTS';
    } finally {
      state.isLoading = false;
    }
  }

  // ==========================================================================
  // 4. RENDER FUNCTIONS
  // ==========================================================================
  function renderSummaryDashboard() {
    const summary = state.summaryData;

    // 1. Total Students
    const totalEl = document.getElementById('feesTotalStudentsValue');
    if (totalEl) totalEl.textContent = summary.total;

    // 2. Paid Students Section (Interactive Toggle)
    const paidCol = document.getElementById('feesPaidCol');
    const paidIconEl = document.getElementById('feesPaidIcon');
    const paidValueEl = document.getElementById('feesPaidStudentsValue');
    const paidLabelEl = document.getElementById('feesPaidStudentsLabel');

    if (paidCol && paidValueEl && paidLabelEl && paidIconEl) {
      if (state.paidStudentsDisplayState === 'paid') {
        paidCol.classList.remove('state-unpaid');
        paidCol.classList.add('state-paid');
        paidValueEl.textContent = summary.paid;
        paidLabelEl.textContent = 'Paid Students';
        paidIconEl.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <polyline points="16 11 18 13 22 9"></polyline>
          </svg>
        `;
      } else {
        paidCol.classList.remove('state-paid');
        paidCol.classList.add('state-unpaid');
        paidValueEl.textContent = summary.unpaid;
        paidLabelEl.textContent = 'Unpaid Students';
        paidIconEl.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <line x1="17" y1="9" x2="21" y2="13"></line>
            <line x1="21" y1="9" x2="17" y2="13"></line>
          </svg>
        `;
      }
    }

    // 3. Paid Percentage Section (Interactive Toggle with Circular Ring)
    const pctCol = document.getElementById('feesPctCol');
    const pctValueEl = document.getElementById('feesPctValue');
    const pctLabelEl = document.getElementById('feesPctLabel');
    const pctRingFg = document.getElementById('feesPctRingFg');

    if (pctCol && pctValueEl && pctLabelEl && pctRingFg) {
      if (state.percentageDisplayState === 'paid') {
        pctCol.classList.remove('state-unpaid');
        pctCol.classList.add('state-paid');
        pctValueEl.textContent = `${summary.paid_percentage}%`;
        pctLabelEl.textContent = 'Paid Percentage';
        pctRingFg.setAttribute('stroke-dasharray', `${summary.paid_percentage}, 100`);
      } else {
        pctCol.classList.remove('state-paid');
        pctCol.classList.add('state-unpaid');
        pctValueEl.textContent = `${summary.unpaid_percentage}%`;
        pctLabelEl.textContent = 'Unpaid Percentage';
        pctRingFg.setAttribute('stroke-dasharray', `${summary.unpaid_percentage}, 100`);
      }
    }

    // 4. Scheduled Reminders Pill in Action Bar
    const schedPill = document.getElementById('feesSchedulePill');
    const schedPillText = document.getElementById('feesSchedulePillText');
    if (schedPill && schedPillText) {
      const count = parseInt(summary.scheduled_notifications || 0, 10);
      if (count > 0) {
        schedPillText.textContent = `${count} Scheduled`;
        schedPill.style.display = 'inline-flex';
      } else {
        schedPill.style.display = 'none';
      }
    }
  }

  function renderBatchDropdownOptions() {
    const batchDropdown = document.getElementById('feesBatchDropdown');
    const batchLabel = document.getElementById('feesBatchFilterLabel');
    if (!batchDropdown) return;

    let optionsHtml = `
      <button type="button" class="fees-dropdown-item ${state.selectedBatch === 'all' ? 'active' : ''}" data-batch="all">
        All Batches
      </button>
    `;

    state.batchesData.forEach(b => {
      const bId = String(b.batch_id);
      const bName = safeEscape(b.batch_name);
      const isActive = (state.selectedBatch === bId || state.selectedBatch === b.batch_name);
      optionsHtml += `
        <button type="button" class="fees-dropdown-item ${isActive ? 'active' : ''}" data-batch="${bId}" data-batch-name="${bName}">
          ${bName}
        </button>
      `;
    });

    batchDropdown.innerHTML = optionsHtml;

    // Update label text
    if (batchLabel) {
      if (state.selectedBatch === 'all') {
        batchLabel.textContent = 'All Batches';
      } else {
        const found = state.batchesData.find(b => String(b.batch_id) === String(state.selectedBatch) || b.batch_name === state.selectedBatch);
        batchLabel.textContent = found ? found.batch_name : 'All Batches';
      }
    }

    // Attach click listeners to batch items
    batchDropdown.querySelectorAll('.fees-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedBatch = item.dataset.batch;
        batchDropdown.style.display = 'none';
        const batchBtn = document.getElementById('btnFeesBatchFilter');
        if (batchBtn) batchBtn.setAttribute('aria-expanded', 'false');
        fetchFeesData();
      });
    });
  }

  function renderMonthDropdownOptions() {
    const monthDropdown = document.getElementById('feesMonthDropdown');
    const monthLabel = document.getElementById('feesMonthFilterLabel');
    if (!monthDropdown) return;

    if (!state.monthsData || state.monthsData.length === 0) {
      monthDropdown.innerHTML = `
        <div class="fees-dropdown-item" style="color: var(--text-secondary); opacity: 0.65; cursor: default; user-select: none;">
          No payment cycles found
        </div>
      `;
      if (monthLabel) {
        monthLabel.textContent = 'No payment cycles';
      }
      return;
    }

    monthDropdown.innerHTML = state.monthsData.map(m => `
      <button type="button" class="fees-dropdown-item ${m.date === state.selectedMonth ? 'active' : ''}" data-month-date="${m.date}" data-month-label="${safeEscape(m.label)}">
        ${safeEscape(m.label)}
      </button>
    `).join('');

    // Update label text
    if (monthLabel) {
      const match = state.monthsData.find(m => m.date === state.selectedMonth);
      monthLabel.textContent = match ? match.label : (state.selectedMonthLabel || (state.monthsData[0] ? state.monthsData[0].label : 'Select Month'));
    }

    // Attach click and right-click (contextmenu) listeners to month items
    monthDropdown.querySelectorAll('.fees-dropdown-item').forEach(item => {
      // Normal Left-Click: Select Month
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMonthActionPopup();
        state.selectedMonth = item.dataset.monthDate;
        state.selectedMonthLabel = item.dataset.monthLabel;
        monthDropdown.style.display = 'none';
        const monthBtn = document.getElementById('btnFeesMonthFilter');
        if (monthBtn) monthBtn.setAttribute('aria-expanded', 'false');
        fetchFeesData();
      });

      // Desktop Right-Click: Context Action Popup
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const monthDate = item.dataset.monthDate;
        const monthLabelText = item.dataset.monthLabel;
        openMonthActionPopup(e.clientX, e.clientY, { date: monthDate, label: monthLabelText });
      });

      // Mobile Touch Long-Press Support (500ms)
      let touchTimer = null;
      let startX = 0;
      let startY = 0;

      item.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          touchTimer = setTimeout(() => {
            touchTimer = null;
            openMonthActionPopup(startX, startY, { date: item.dataset.monthDate, label: item.dataset.monthLabel });
          }, 500);
        }
      }, { passive: true });

      item.addEventListener('touchmove', (e) => {
        if (touchTimer && e.touches && e.touches.length === 1) {
          const moveX = Math.abs(e.touches[0].clientX - startX);
          const moveY = Math.abs(e.touches[0].clientY - startY);
          if (moveX > 10 || moveY > 10) {
            clearTimeout(touchTimer);
            touchTimer = null;
          }
        }
      }, { passive: true });

      item.addEventListener('touchend', () => {
        if (touchTimer) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
      });
    });
  }

  // ==========================================================================
  // 4.1 MONTH CONTEXT MENU & DELETION CONTROLLER
  // ==========================================================================
  function openMonthActionPopup(x, y, monthObj) {
    const popup = document.getElementById('feesMonthActionPopup');
    if (!popup) return;

    state.contextTargetMonth = monthObj;
    popup.style.display = 'flex';

    // Position carefully within viewport bounds
    const popupWidth = 135;
    const popupHeight = 85;
    const pad = 12;

    let left = x;
    let top = y;

    if (left + popupWidth > window.innerWidth - pad) {
      left = window.innerWidth - popupWidth - pad;
    }
    if (top + popupHeight > window.innerHeight - pad) {
      top = window.innerHeight - popupHeight - pad;
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function closeMonthActionPopup() {
    const popup = document.getElementById('feesMonthActionPopup');
    if (!popup) return;
    popup.style.display = 'none';
  }

  function openDeleteCycleConfirmationModal() {
    closeMonthActionPopup();
    if (!state.contextTargetMonth) return;

    const modal = document.getElementById('feesDeleteCycleModal');
    const title = document.getElementById('feesDeleteCycleTitle');
    const warningText = document.getElementById('feesDeleteCycleWarningText');
    const confirmBtn = document.getElementById('btnConfirmDeleteCycle');
    const spinner = document.getElementById('btnDeleteCycleSpinner');
    const btnText = document.getElementById('btnDeleteCycleText');

    if (!modal) return;

    if (title) {
      title.textContent = `Delete ${state.contextTargetMonth.label}?`;
    }
    if (warningText) {
      warningText.innerHTML = `Are you sure you want to delete this payment cycle?<br><br><strong>This will delete all payment data for this payment cycle.</strong>`;
    }

    if (confirmBtn) confirmBtn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = 'Delete';

    openModal('feesDeleteCycleModal');
  }

  function closeDeleteCycleConfirmationModal() {
    closeModal('feesDeleteCycleModal');
  }

  async function handleDeletePaymentCycle() {
    if (state.isDeletingCycle || !state.contextTargetMonth) return;
    state.isDeletingCycle = true;

    const confirmBtn = document.getElementById('btnConfirmDeleteCycle');
    const cancelBtn = document.getElementById('btnCancelDeleteCycle');
    const spinner = document.getElementById('btnDeleteCycleSpinner');
    const btnText = document.getElementById('btnDeleteCycleText');

    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Deleting...';

    const targetMonth = state.contextTargetMonth;

    try {
      const response = await fetch(FEES_API_URL, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'delete_cycle',
          fee_month: targetMonth.date
        })
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied: Only Super Admin can delete payment cycles.');
        }
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete payment cycle.');
      }

      closeDeleteCycleConfirmationModal();

      // If the deleted month was currently selected, reset selectedMonth so next available or empty state loads
      if (state.selectedMonth === targetMonth.date) {
        state.selectedMonth = '';
        state.selectedMonthLabel = '';
      }

      // Close dropdown if open
      const monthDropdown = document.getElementById('feesMonthDropdown');
      if (monthDropdown) monthDropdown.style.display = 'none';

      // Immediately refresh dashboard and dropdown dynamically from backend without page reload
      await fetchFeesData();

    } catch (err) {
      console.error('Error deleting payment cycle:', err);
      alert('Unable to delete payment cycle: ' + (err.message || 'Unknown error'));
    } finally {
      state.isDeletingCycle = false;
      if (confirmBtn) confirmBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Delete';
    }
  }

  function renderStudentCards() {
    const container = document.getElementById('feesStudentsCardsContainer');
    const emptyState = document.getElementById('feesStudentsEmptyState');
    const countPill = document.getElementById('feesStudentsCountText');
    const clearSearchBtn = document.getElementById('btnFeesClearSearch');

    if (!container) return;

    if (clearSearchBtn) {
      clearSearchBtn.style.display = state.searchQuery.trim().length > 0 ? 'inline-flex' : 'none';
    }

    const students = state.studentsData;

    // Update count pill
    if (countPill) {
      countPill.textContent = `${students.length} ${students.length === 1 ? 'STUDENT' : 'STUDENTS'}`;
    }

    if (students.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    container.innerHTML = students.map(st => {
      const safeName = safeEscape(st.student_name);
      const safeBatch = safeEscape(st.batch_name || 'Batch');
      const safeDue = safeEscape(st.due_date || '-');
      const formattedAmount = formatCurrency(st.fee_amount);
      const initials = getStudentInitials(st.student_name);
      const isPaid = (st.payment_status === 'Paid');
      const isOverdue = (st.payment_status === 'Overdue');
      
      const photoHtml = st.student_photo
        ? `<img src="${safeEscape(st.student_photo)}" alt="${safeName}" onerror="this.parentElement.textContent='${initials}'">`
        : `<span>${initials}</span>`;

      let badgeClass = 'badge-unpaid';
      let badgeText = 'UNPAID';
      if (isPaid) {
        badgeClass = 'badge-paid';
        badgeText = 'PAID';
      } else if (isOverdue) {
        badgeClass = 'badge-unpaid';
        badgeText = 'OVERDUE';
      }

      return `
        <div class="fees-student-card" data-fee-id="${st.fee_id}" data-student-id="${st.student_id}" role="button" tabindex="0" aria-label="View fee details for ${safeName}">
          <!-- Left: Avatar and Student Details -->
          <div class="fees-student-card-left">
            <div class="fees-student-avatar">
              ${photoHtml}
            </div>
            <div class="fees-student-info">
              <span class="fees-student-name" title="${safeName}">${safeName}</span>
              <span class="fees-student-batch">${safeBatch}</span>
              <div class="fees-student-due-row">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span>Due: ${safeDue}</span>
                <span class="fees-meta-separator">|</span>
                <span class="fees-student-amount">${formattedAmount}</span>
              </div>
            </div>
          </div>

          <!-- Right: Status Badge & Chevron Arrow -->
          <div class="fees-student-card-right">
            <span class="fees-status-pill ${badgeClass}">
              ${badgeText}
            </span>
            <button type="button" class="fees-card-arrow-btn" aria-label="Open ${safeName} fee details">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to cards
    container.querySelectorAll('.fees-student-card').forEach(cardEl => {
      const feeId = parseInt(cardEl.dataset.feeId, 10);
      const studentId = parseInt(cardEl.dataset.studentId, 10);

      const openModalHandler = (e) => {
        e.stopPropagation();
        openStudentPaymentDetailModal(feeId, studentId);
      };

      cardEl.addEventListener('click', openModalHandler);
      cardEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModalHandler(e);
        }
      });
    });
  }

  // ==========================================================================
  // 5. PAYMENT DETAIL MODAL (Dynamic Database Fetch)
  // ==========================================================================
  async function openStudentPaymentDetailModal(feeId, studentId) {
    const modal = document.getElementById('feesPaymentDetailModal');
    if (!modal) return;

    // Reset modal fields to loading state
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('feesModalName', 'Loading...');
    setVal('feesModalBatch', '-');
    setVal('feesModalPhone', '-');
    setVal('feesModalFieldMonth', '-');
    setVal('feesModalFieldDueDate', '-');
    setVal('feesModalFieldFeeAmount', '-');
    setVal('feesModalFieldPaidAmount', '-');
    setVal('feesModalFieldMethod', '-');
    setVal('feesModalFieldPaidDate', '-');
    setVal('feesModalFieldPaymentId', '-');

    openModal('feesPaymentDetailModal');

    try {
      const res = await fetch(`${FEES_API_URL}?action=get_student_fee_details&fee_id=${feeId}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success || !data.fee) throw new Error(data.error || 'Failed to load details');

      const fee = data.fee;
      const safeName = safeEscape(fee.student_name);
      const safeBatch = safeEscape(fee.batch_name || 'Batch');
      const initials = getStudentInitials(fee.student_name);
      const isPaid = (fee.payment_status === 'Paid');

      // Profile info
      const avatarEl = document.getElementById('feesModalAvatar');
      if (avatarEl) {
        if (fee.student_photo) {
          avatarEl.innerHTML = `<img src="${safeEscape(fee.student_photo)}" alt="${safeName}" onerror="this.parentElement.textContent='${initials}'">`;
        } else {
          avatarEl.textContent = initials;
        }
      }

      setVal('feesModalName', fee.student_name);
      setVal('feesModalBatch', safeBatch);
      setVal('feesModalPhone', fee.student_phone || 'Phone not registered');

      // Status Badge in Modal
      const statusPillEl = document.getElementById('feesModalStatusBadge');
      if (statusPillEl) {
        statusPillEl.className = `fees-status-pill ${isPaid ? 'badge-paid' : 'badge-unpaid'}`;
        statusPillEl.textContent = isPaid ? 'PAID' : (fee.payment_status === 'Overdue' ? 'OVERDUE' : 'UNPAID');
      }

      // Detail Grid Fields
      setVal('feesModalFieldMonth', fee.month_label || state.selectedMonthLabel || '-');
      setVal('feesModalFieldDueDate', fee.due_date_formatted || '-');
      setVal('feesModalFieldFeeAmount', formatCurrency(fee.fee_amount));
      setVal('feesModalFieldPaidAmount', isPaid ? formatCurrency(fee.paid_amount || fee.fee_amount) : '₹0');
      setVal('feesModalFieldMethod', isPaid ? (fee.payment_method || 'Razorpay') : '-');
      setVal('feesModalFieldPaidDate', isPaid ? (fee.paid_at_formatted || fee.paid_at || '-') : '-');
      setVal('feesModalFieldPaymentId', isPaid ? (fee.razorpay_payment_id || 'N/A') : 'N/A');

    } catch (err) {
      console.error('Error opening student fee details:', err);
      setVal('feesModalName', 'Error loading record');
    }
  }

  function closeStudentPaymentDetailModal() {
    closeModal('feesPaymentDetailModal');
  }

  // ==========================================================================
  // 6. EVENT LISTENERS
  // ==========================================================================
  function setupEventListeners() {
    // 1. Paid Students Toggle (Paid count <-> Unpaid count)
    const paidCol = document.getElementById('feesPaidCol');
    if (paidCol) {
      const togglePaidHandler = () => {
        state.paidStudentsDisplayState = (state.paidStudentsDisplayState === 'paid') ? 'unpaid' : 'paid';
        renderSummaryDashboard();
      };
      paidCol.addEventListener('click', togglePaidHandler);
      paidCol.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          togglePaidHandler();
        }
      });
    }

    // 2. Paid Percentage Toggle (Paid % <-> Unpaid %)
    const pctCol = document.getElementById('feesPctCol');
    if (pctCol) {
      const togglePctHandler = () => {
        state.percentageDisplayState = (state.percentageDisplayState === 'paid') ? 'unpaid' : 'paid';
        renderSummaryDashboard();
      };
      pctCol.addEventListener('click', togglePctHandler);
      pctCol.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          togglePctHandler();
        }
      });
    }

    // 3. Batch Dropdown Button
    const batchBtn = document.getElementById('btnFeesBatchFilter');
    const batchDropdown = document.getElementById('feesBatchDropdown');
    if (batchBtn && batchDropdown) {
      batchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = batchDropdown.style.display === 'block';
        closeAllDropdowns();
        batchDropdown.style.display = isOpen ? 'none' : 'block';
        batchBtn.setAttribute('aria-expanded', !isOpen);
      });
    }

    // 4. Month Dropdown Button
    const monthBtn = document.getElementById('btnFeesMonthFilter');
    const monthDropdown = document.getElementById('feesMonthDropdown');
    if (monthBtn && monthDropdown) {
      monthBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = monthDropdown.style.display === 'block';
        closeAllDropdowns();
        monthDropdown.style.display = isOpen ? 'none' : 'block';
        monthBtn.setAttribute('aria-expanded', !isOpen);
      });
    }

    // 5. Search Input with 300ms Debounce
    const searchInput = document.getElementById('feesStudentSearchInput');
    const clearSearchBtn = document.getElementById('btnFeesClearSearch');
    const emptyResetBtn = document.getElementById('btnFeesResetSearch');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer);
        state.searchDebounceTimer = setTimeout(() => {
          fetchFeesData();
        }, 250);
      });
    }

    if (clearSearchBtn && searchInput) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        searchInput.focus();
        fetchFeesData();
      });
    }

    if (emptyResetBtn && searchInput) {
      emptyResetBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        state.statusFilter = 'all';
        state.selectedBatch = 'all';
        updateStatusPillButtons();
        fetchFeesData();
      });
    }

    // 6. Payment Status Filter Tabs (All / Paid / Unpaid)
    const statusBtns = document.querySelectorAll('.fees-status-filter-btn');
    statusBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.statusFilter;
        state.statusFilter = filter;
        updateStatusPillButtons();
        fetchFeesData();
      });
    });

    // 7. Sort By Dropdown
    const sortBtn = document.getElementById('btnFeesSort');
    const sortMenu = document.getElementById('feesSortMenu');
    const sortLabel = document.getElementById('feesSortLabel');

    if (sortBtn && sortMenu) {
      sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = sortMenu.style.display === 'block';
        closeAllDropdowns();
        sortMenu.style.display = isOpen ? 'none' : 'block';
        sortBtn.setAttribute('aria-expanded', !isOpen);
      });

      sortMenu.querySelectorAll('.fees-sort-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          state.sortBy = item.dataset.sort;
          if (sortLabel) sortLabel.textContent = item.textContent.trim();
          sortMenu.querySelectorAll('.fees-sort-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          sortMenu.style.display = 'none';
          sortBtn.setAttribute('aria-expanded', 'false');
          fetchFeesData();
        });
      });
    }

    // Close all open dropdowns on outside document click
    document.addEventListener('click', () => {
      closeAllDropdowns();
      closeMonthActionPopup();
    });

    // Modal Close Triggers
    const modalCloseBtn = document.getElementById('closeFeesPaymentDetailModal');
    const modalFooterCloseBtn = document.getElementById('btnFeesModalCloseFooter');
    const modalOverlay = document.getElementById('feesPaymentDetailModal');

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeStudentPaymentDetailModal);
    if (modalFooterCloseBtn) modalFooterCloseBtn.addEventListener('click', closeStudentPaymentDetailModal);
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeStudentPaymentDetailModal();
      });
    }

    // New Payment Event Listeners
    setupNewPaymentEventListeners();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeStudentPaymentDetailModal();
        closeNewPaymentModal();
        closeDeleteCycleConfirmationModal();
        closeMonthActionPopup();
        closeAllDropdowns();
      }
    });
  }

  // ==========================================================================
  // 6.1 NEW PAYMENT MODAL CONTROLLER (FRONTEND ONLY)
  // ==========================================================================
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  let newPaymentSelectedMonth = '';
  let newPaymentSelectedYear = '';

  function populateNewPaymentDateSelectors() {
    const monthSelect = document.getElementById('feesNewPaymentMonthSelect');
    const yearInput = document.getElementById('feesNewPaymentYearInput');
    const yearError = document.getElementById('feesYearInputError');
    if (!monthSelect || !yearInput) return;

    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const currentYear = now.getFullYear();

    // Populate Months (January - December) with current month selected dynamically
    monthSelect.innerHTML = MONTH_NAMES.map((m, idx) => `
      <option value="${m}" ${idx === currentMonthIdx ? 'selected' : ''}>${m}</option>
    `).join('');

    // Pre-fill Year input with current year (e.g. 2026), allow user to type ANY valid 4-digit year
    yearInput.value = String(currentYear);
    if (yearError) yearError.style.display = 'none';

    newPaymentSelectedMonth = monthSelect.value || MONTH_NAMES[currentMonthIdx];
    newPaymentSelectedYear = String(currentYear);
  }

  function setModalBadge(type, labelText) {
    const badge = document.getElementById('feesNewPaymentBadge');
    const badgeText = document.getElementById('feesNewPaymentBadgeText');
    if (!badge || !badgeText) return;
    badgeText.textContent = labelText;

    if (type === 'danger') {
      badge.style.background = 'rgba(239, 68, 68, 0.12)';
      badge.style.color = 'var(--color-danger)';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    } else if (type === 'warning') {
      badge.style.background = 'rgba(245, 158, 11, 0.14)';
      badge.style.color = '#f59e0b';
      badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    } else {
      // default / success
      badge.style.background = 'rgba(0, 230, 118, 0.12)';
      badge.style.color = '#00e676';
      badge.style.borderColor = 'rgba(0, 230, 118, 0.28)';
    }
  }

  // ==========================================================================
  // SCHEDULED NOTIFICATIONS HELPERS & MODAL MANAGEMENT
  // ==========================================================================

  function getDefaultSchedule() {
    // Current IST date + 1 day at 09:00 AM
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    istNow.setDate(istNow.getDate() + 1);
    const yyyy = istNow.getFullYear();
    const mm = String(istNow.getMonth() + 1).padStart(2, '0');
    const dd = String(istNow.getDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, time: '09:00' };
  }

  function getMinScheduleDate() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    const yyyy = istNow.getFullYear();
    const mm = String(istNow.getMonth() + 1).padStart(2, '0');
    const dd = String(istNow.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDisplayDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return '';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const [h, min] = timeStr.split(':').map(Number);
      const dt = new Date(y, m - 1, d, h, min);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = months[dt.getMonth()] || '';
      const hour12 = (h % 12) || 12;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const minPadded = String(min).padStart(2, '0');
      return `${d} ${monthName} ${y} at ${hour12}:${minPadded} ${ampm}`;
    } catch(e) {
      return `${dateStr} ${timeStr}`;
    }
  }

  function updateScheduleBannerSummary() {
    const summaryText = document.getElementById('feesScheduleSummaryText');
    const valError = document.getElementById('feesScheduleValidationError');
    if (summaryText) {
      const count = state.pendingSchedules ? state.pendingSchedules.length : 0;
      if (count === 0) {
        summaryText.textContent = '0 Notifications Scheduled';
      } else if (count === 1) {
        summaryText.textContent = `1 Notification Scheduled (${formatDisplayDateTime(state.pendingSchedules[0].date, state.pendingSchedules[0].time)})`;
      } else {
        summaryText.textContent = `${count} Notifications Scheduled (Next: ${formatDisplayDateTime(state.pendingSchedules[0].date, state.pendingSchedules[0].time)})`;
      }
    }
    if (valError && state.pendingSchedules && state.pendingSchedules.length > 0) {
      valError.style.display = 'none';
    }
  }

  function openScheduleModal() {
    const modal = document.getElementById('feesScheduleModal');
    if (!modal) return;

    // Clone pendingSchedules to tempSchedules
    if (state.pendingSchedules && state.pendingSchedules.length > 0) {
      state.tempSchedules = state.pendingSchedules.map(s => ({ ...s }));
    } else {
      state.tempSchedules = [getDefaultSchedule()];
    }

    const errBox = document.getElementById('feesScheduleModalError');
    if (errBox) errBox.style.display = 'none';

    renderScheduleRows();
    openModal('feesScheduleModal');
  }

  function closeScheduleModal() {
    closeModal('feesScheduleModal');
  }

  function renderScheduleRows() {
    const container = document.getElementById('feesScheduleListContainer');
    if (!container) return;

    if (!state.tempSchedules || state.tempSchedules.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 1.5rem 1rem; color: var(--text-secondary); font-size: 0.8rem; background: rgba(0,0,0,0.2); border-radius: 6px;">
          No notification schedules configured. Click &quot;Add Notification&quot; below.
        </div>
      `;
      return;
    }

    const minDate = getMinScheduleDate();

    container.innerHTML = state.tempSchedules.map((sched, idx) => `
      <div class="fees-schedule-row" data-index="${idx}">
        <span class="fees-schedule-row-num">#${idx + 1}</span>
        <div class="fees-schedule-row-inputs">
          <input type="date" class="fees-schedule-input fees-schedule-date" value="${safeEscape(sched.date)}" min="${minDate}" data-index="${idx}" aria-label="Notification date">
          <input type="time" class="fees-schedule-input fees-schedule-time" value="${safeEscape(sched.time)}" data-index="${idx}" aria-label="Notification time">
        </div>
        <button type="button" class="btn-remove-schedule-row" data-index="${idx}" title="Remove schedule" aria-label="Remove schedule #${idx + 1}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `).join('');

    // Attach row events
    container.querySelectorAll('.fees-schedule-date').forEach(input => {
      input.addEventListener('change', (e) => {
        const i = parseInt(e.target.dataset.index, 10);
        if (state.tempSchedules[i]) {
          state.tempSchedules[i].date = e.target.value;
        }
      });
    });

    container.querySelectorAll('.fees-schedule-time').forEach(input => {
      input.addEventListener('change', (e) => {
        const i = parseInt(e.target.dataset.index, 10);
        if (state.tempSchedules[i]) {
          state.tempSchedules[i].time = e.target.value;
        }
      });
    });

    container.querySelectorAll('.btn-remove-schedule-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(btn.dataset.index, 10);
        state.tempSchedules.splice(i, 1);
        renderScheduleRows();
      });
    });
  }

  function addScheduleRow() {
    let nextDate = '';
    let nextTime = '09:00';

    if (state.tempSchedules && state.tempSchedules.length > 0) {
      const last = state.tempSchedules[state.tempSchedules.length - 1];
      if (last.date) {
        try {
          const [y, m, d] = last.date.split('-').map(Number);
          const dt = new Date(y, m - 1, d + 7);
          const yyyy = dt.getFullYear();
          const mm = String(dt.getMonth() + 1).padStart(2, '0');
          const dd = String(dt.getDate()).padStart(2, '0');
          nextDate = `${yyyy}-${mm}-${dd}`;
        } catch(e) {
          nextDate = getDefaultSchedule().date;
        }
      }
    } else {
      const def = getDefaultSchedule();
      nextDate = def.date;
      nextTime = def.time;
    }

    if (!nextDate) nextDate = getDefaultSchedule().date;

    state.tempSchedules.push({ date: nextDate, time: nextTime });
    renderScheduleRows();
  }

  function showScheduleError(msg) {
    const errBox = document.getElementById('feesScheduleModalError');
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
    }
  }

  function saveScheduleModal() {
    const errBox = document.getElementById('feesScheduleModalError');
    if (errBox) errBox.style.display = 'none';

    // Synchronize inputs from DOM to tempSchedules
    const container = document.getElementById('feesScheduleListContainer');
    if (container) {
      const dateInputs = container.querySelectorAll('.fees-schedule-date');
      const timeInputs = container.querySelectorAll('.fees-schedule-time');
      dateInputs.forEach((dInput, idx) => {
        if (state.tempSchedules[idx]) {
          state.tempSchedules[idx].date = dInput.value.trim();
        }
      });
      timeInputs.forEach((tInput, idx) => {
        if (state.tempSchedules[idx]) {
          state.tempSchedules[idx].time = tInput.value.trim();
        }
      });
    }

    // Validation 1: At least one schedule
    if (!state.tempSchedules || state.tempSchedules.length === 0) {
      showScheduleError('Please add at least one notification schedule.');
      return;
    }

    // Calculate current time in IST (Asia/Kolkata)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);

    const seen = new Set();

    for (let i = 0; i < state.tempSchedules.length; i++) {
      const item = state.tempSchedules[i];
      if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
        showScheduleError(`Schedule #${i + 1} has an invalid or missing date.`);
        return;
      }
      if (!item.time || !/^\d{2}:\d{2}(:\d{2})?$/.test(item.time)) {
        showScheduleError(`Schedule #${i + 1} has an invalid or missing time.`);
        return;
      }

      // Format time to HH:MM
      const timeClean = item.time.substring(0, 5);
      item.time = timeClean;

      // Duplicate check
      const key = `${item.date} ${timeClean}`;
      if (seen.has(key)) {
        showScheduleError(`Duplicate notification found for ${key}. Each schedule must be unique.`);
        return;
      }
      seen.add(key);

      // Future check in IST
      const [y, m, d] = item.date.split('-').map(Number);
      const [h, min] = timeClean.split(':').map(Number);
      const schedDt = new Date(y, m - 1, d, h, min);

      if (schedDt <= istNow) {
        showScheduleError(`Schedule #${i + 1} (${item.date} ${timeClean}) must be in the future (Asia/Kolkata IST).`);
        return;
      }
    }

    // Sort chronologically
    state.tempSchedules.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    // Commit to pendingSchedules
    state.pendingSchedules = state.tempSchedules.map(s => ({ ...s }));

    // Update banner summary text
    updateScheduleBannerSummary();

    closeScheduleModal();
  }

  function resetNewPaymentModal() {
    populateNewPaymentDateSelectors();

    // Reset pending schedules to 1 default future schedule
    state.pendingSchedules = [getDefaultSchedule()];
    updateScheduleBannerSummary();

    const schedValError = document.getElementById('feesScheduleValidationError');
    if (schedValError) schedValError.style.display = 'none';

    const title = document.getElementById('feesNewPaymentTitle');
    const subtitle = document.getElementById('feesNewPaymentSubtitle');
    if (title) title.textContent = 'New Payment';
    if (subtitle) subtitle.textContent = 'Select the month and year for which you want to start payments.';
    setModalBadge('default', 'Payment Cycle');

    // Show Step 1, hide all others
    const stepSelect = document.getElementById('feesNewPaymentStepSelect');
    const stepConfirm = document.getElementById('feesNewPaymentStepConfirm');
    const stepDuplicate = document.getElementById('feesNewPaymentStepDuplicate');
    const stepSuccess = document.getElementById('feesNewPaymentStepSuccess');
    const stepError = document.getElementById('feesNewPaymentStepError');

    if (stepSelect) stepSelect.style.display = 'block';
    if (stepConfirm) stepConfirm.style.display = 'none';
    if (stepDuplicate) stepDuplicate.style.display = 'none';
    if (stepSuccess) stepSuccess.style.display = 'none';
    if (stepError) stepError.style.display = 'none';

    // Reset Confirm/Start Payment button state
    const confirmBtn = document.getElementById('btnConfirmStartPayment');
    const spinner = document.getElementById('btnStartPaymentSpinner');
    const btnText = document.getElementById('btnStartPaymentText');
    if (confirmBtn) confirmBtn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = 'Create Payment';
  }

  function openNewPaymentModal() {
    const modal = document.getElementById('feesNewPaymentModal');
    if (!modal) return;
    resetNewPaymentModal();
    openModal('feesNewPaymentModal');

    // Focus month selector
    const monthSelect = document.getElementById('feesNewPaymentMonthSelect');
    if (monthSelect) setTimeout(() => monthSelect.focus(), 50);
  }

  function closeNewPaymentModal() {
    closeModal('feesNewPaymentModal');
  }

  /**
   * Duplicate Payment Cycle Checker (Connected to backend API)
   * GET /server/fees.php?action=check_cycle&month=...&year=...
   */
  async function checkPaymentCycleExists(monthName, year) {
    if (window.__TEST_DUPLICATE_PAYMENT_CYCLE__ === true) {
      return true;
    }
    if (window.__TEST_DUPLICATE_PAYMENT_CYCLE__ === false) {
      return false;
    }

    try {
      const params = new URLSearchParams({
        action: 'check_cycle',
        month: monthName,
        year: year
      });
      const res = await fetch(`${FEES_API_URL}?${params.toString()}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        return !!data.exists;
      }
    } catch (e) {
      console.warn('Network error checking payment cycle, falling back to local store check:', e);
    }

    // Fallback: check against available months already returned by API
    const targetLabel = `${monthName} ${year}`.trim().toLowerCase();
    if (state.monthsData && state.monthsData.length > 0) {
      return state.monthsData.some(m => (m.label || '').trim().toLowerCase() === targetLabel);
    }
    return false;
  }

  async function handleContinueToConfirmation() {
    const monthSelect = document.getElementById('feesNewPaymentMonthSelect');
    const yearInput = document.getElementById('feesNewPaymentYearInput');
    const yearError = document.getElementById('feesYearInputError');
    const scheduleValError = document.getElementById('feesScheduleValidationError');
    const btnContinue = document.getElementById('btnContinueNewPayment');

    newPaymentSelectedMonth = monthSelect ? monthSelect.value : '';
    const rawYear = yearInput ? yearInput.value.trim() : '';

    // Validate 4-digit year: must be exactly 4 digits, numeric, between 1900 and 2100
    if (!/^\d{4}$/.test(rawYear) || parseInt(rawYear, 10) < 1900 || parseInt(rawYear, 10) > 2100) {
      if (yearError) {
        yearError.textContent = 'Please enter a valid 4-digit year (e.g. 2026).';
        yearError.style.display = 'block';
      }
      if (yearInput) yearInput.focus();
      return;
    } else {
      if (yearError) yearError.style.display = 'none';
    }

    // Validate notification schedules: at least 1 schedule required
    if (!state.pendingSchedules || state.pendingSchedules.length === 0) {
      if (scheduleValError) {
        scheduleValError.textContent = 'Please add at least one valid notification schedule before continuing.';
        scheduleValError.style.display = 'block';
      }
      return;
    } else {
      if (scheduleValError) scheduleValError.style.display = 'none';
    }

    newPaymentSelectedYear = rawYear;

    if (btnContinue) {
      btnContinue.disabled = true;
      btnContinue.style.opacity = '0.7';
    }

    const title = document.getElementById('feesNewPaymentTitle');
    const subtitle = document.getElementById('feesNewPaymentSubtitle');
    const stepSelect = document.getElementById('feesNewPaymentStepSelect');
    const stepConfirm = document.getElementById('feesNewPaymentStepConfirm');
    const stepDuplicate = document.getElementById('feesNewPaymentStepDuplicate');
    const stepSuccess = document.getElementById('feesNewPaymentStepSuccess');
    const stepError = document.getElementById('feesNewPaymentStepError');

    try {
      const isDuplicate = await checkPaymentCycleExists(newPaymentSelectedMonth, newPaymentSelectedYear);

      if (isDuplicate) {
        // Show Duplicate Warning UI
        if (stepSelect) stepSelect.style.display = 'none';
        if (stepConfirm) stepConfirm.style.display = 'none';
        if (stepSuccess) stepSuccess.style.display = 'none';
        if (stepError) stepError.style.display = 'none';
        if (stepDuplicate) stepDuplicate.style.display = 'block';

        if (title) title.textContent = 'Payment Already Started';
        if (subtitle) subtitle.textContent = 'This payment cycle already exists in the system.';
        setModalBadge('danger', 'Existing Cycle');

        const dupWarningText = document.getElementById('feesDuplicateWarningText');
        if (dupWarningText) {
          dupWarningText.innerHTML = `Payment for <strong>${safeEscape(newPaymentSelectedMonth)} ${safeEscape(newPaymentSelectedYear)}</strong> has already been started. You cannot start the same payment cycle again.`;
        }
      } else {
        // Show Confirmation Warning (Step 2)
        if (stepSelect) stepSelect.style.display = 'none';
        if (stepDuplicate) stepDuplicate.style.display = 'none';
        if (stepSuccess) stepSuccess.style.display = 'none';
        if (stepError) stepError.style.display = 'none';
        if (stepConfirm) stepConfirm.style.display = 'block';

        if (title) title.textContent = `Create ${newPaymentSelectedMonth} ${newPaymentSelectedYear} Payment?`;
        if (subtitle) subtitle.textContent = 'Confirmation required before creating payment cycle.';
        setModalBadge('warning', 'Action Required');

        const confirmWarningText = document.getElementById('feesConfirmWarningText');
        if (confirmWarningText) {
          confirmWarningText.innerHTML = `Creating a new payment for <strong>${safeEscape(newPaymentSelectedMonth)} ${safeEscape(newPaymentSelectedYear)}</strong> will generate fee records for all active students. Reminders will be sent according to the schedule below.`;
        }

        // Render scheduled notifications list in Step 2
        const schedulesListEl = document.getElementById('feesConfirmSchedulesList');
        if (schedulesListEl) {
          schedulesListEl.innerHTML = state.pendingSchedules.map((s, idx) => `
            <div class="fees-confirm-schedule-item">
              <span class="fees-confirm-schedule-datetime">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${formatDisplayDateTime(s.date, s.time)}
              </span>
              <span class="fees-confirm-schedule-badge">Scheduled (IST)</span>
            </div>
          `).join('');
        }
      }
    } finally {
      if (btnContinue) {
        btnContinue.disabled = false;
        btnContinue.style.opacity = '1';
      }
    }
  }

  let isPaymentCycleProcessing = false;

  async function handleStartPayment() {
    if (isPaymentCycleProcessing) return;
    isPaymentCycleProcessing = true;

    const confirmBtn = document.getElementById('btnConfirmStartPayment');
    const spinner = document.getElementById('btnStartPaymentSpinner');
    const btnText = document.getElementById('btnStartPaymentText');
    const tryAgainBtn = document.getElementById('btnTryAgainPayment');

    // Loading state
    if (confirmBtn) confirmBtn.disabled = true;
    if (tryAgainBtn) tryAgainBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Creating Payment...';

    const stepConfirm = document.getElementById('feesNewPaymentStepConfirm');
    const stepSuccess = document.getElementById('feesNewPaymentStepSuccess');
    const stepError = document.getElementById('feesNewPaymentStepError');
    const stepDuplicate = document.getElementById('feesNewPaymentStepDuplicate');
    const title = document.getElementById('feesNewPaymentTitle');
    const subtitle = document.getElementById('feesNewPaymentSubtitle');

    try {
      const response = await fetch(FEES_API_URL, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'start_payment_cycle',
          month: newPaymentSelectedMonth,
          year: newPaymentSelectedYear,
          schedules: state.pendingSchedules
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409 || data.error === 'PAYMENT_ALREADY_STARTED') {
        // Payment cycle already started
        if (stepConfirm) stepConfirm.style.display = 'none';
        if (stepSuccess) stepSuccess.style.display = 'none';
        if (stepError) stepError.style.display = 'none';
        if (stepDuplicate) stepDuplicate.style.display = 'block';

        if (title) title.textContent = 'Payment Already Started';
        if (subtitle) subtitle.textContent = 'This payment cycle already exists in the system.';
        setModalBadge('danger', 'Existing Cycle');

        const dupWarningText = document.getElementById('feesDuplicateWarningText');
        if (dupWarningText) {
          dupWarningText.innerHTML = `Payment for <strong>${safeEscape(newPaymentSelectedMonth)} ${safeEscape(newPaymentSelectedYear)}</strong> has already been started. You cannot start the same payment cycle again.`;
        }
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Something went wrong while creating the payment cycle. Please try again.');
      }

      // Success State
      if (stepConfirm) stepConfirm.style.display = 'none';
      if (stepError) stepError.style.display = 'none';
      if (stepDuplicate) stepDuplicate.style.display = 'none';
      if (stepSuccess) stepSuccess.style.display = 'block';

      const monthLabel = data.month_label || `${newPaymentSelectedMonth} ${newPaymentSelectedYear}`;
      if (title) title.textContent = `${monthLabel} Payment Created`;
      if (subtitle) subtitle.textContent = 'Payment cycle created successfully with scheduled notifications.';
      setModalBadge('default', 'Cycle Initialized');

      const successTitle = document.getElementById('feesSuccessTitle');
      if (successTitle) {
        successTitle.textContent = `${monthLabel} Payment Created`;
      }

      const recordsCountEl = document.getElementById('feesSuccessRecordsCount');
      if (recordsCountEl) {
        recordsCountEl.textContent = `${data.payment_records_created || 0} students`;
      }

      const schedCountEl = document.getElementById('feesSuccessSchedulesCount');
      if (schedCountEl) {
        schedCountEl.textContent = `${data.schedules_count || (state.pendingSchedules ? state.pendingSchedules.length : 0)} scheduled`;
      }

      // Refresh dashboard with the newly created month
      state.selectedMonth = data.fee_month || '';
      fetchFeesData();

    } catch (err) {
      console.error('Error creating payment cycle:', err);
      if (stepConfirm) stepConfirm.style.display = 'none';
      if (stepSuccess) stepSuccess.style.display = 'none';
      if (stepDuplicate) stepDuplicate.style.display = 'none';
      if (stepError) stepError.style.display = 'block';

      if (title) title.textContent = 'Unable to create payment';
      if (subtitle) subtitle.textContent = 'Payment cycle initialization failed.';
      setModalBadge('danger', 'Error');

      const errorDesc = document.querySelector('#feesNewPaymentStepError .fees-error-desc');
      if (errorDesc) {
        errorDesc.textContent = err.message || 'Something went wrong while creating the payment cycle. Please try again.';
      }
    } finally {
      isPaymentCycleProcessing = false;
      if (confirmBtn) confirmBtn.disabled = false;
      if (tryAgainBtn) tryAgainBtn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (btnText) btnText.textContent = 'Create Payment';
    }
  }

  function setupNewPaymentEventListeners() {
    const btnNewPayment = document.getElementById('btnFeesNewPayment');
    if (btnNewPayment) {
      btnNewPayment.addEventListener('click', (e) => {
        e.stopPropagation();
        openNewPaymentModal();
      });
    }

    const btnContinue = document.getElementById('btnContinueNewPayment');
    if (btnContinue) {
      btnContinue.addEventListener('click', handleContinueToConfirmation);
    }

    // Numeric Year Input Event: restrict to 4 digits and clear error on type
    const yearInput = document.getElementById('feesNewPaymentYearInput');
    const yearError = document.getElementById('feesYearInputError');
    if (yearInput) {
      yearInput.addEventListener('input', (e) => {
        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (e.target.value !== cleaned) {
          e.target.value = cleaned;
        }
        if (yearError) yearError.style.display = 'none';
      });
    }

    const btnConfirmStart = document.getElementById('btnConfirmStartPayment');
    if (btnConfirmStart) {
      btnConfirmStart.addEventListener('click', handleStartPayment);
    }

    const btnCancelStep1 = document.getElementById('cancelNewPaymentStep1');
    if (btnCancelStep1) {
      btnCancelStep1.addEventListener('click', closeNewPaymentModal);
    }

    const btnCancelStep2 = document.getElementById('cancelNewPaymentStep2');
    if (btnCancelStep2) {
      btnCancelStep2.addEventListener('click', () => {
        // Return to Step 1 so user can review or change month/year
        resetNewPaymentModal();
      });
    }

    const modalCloseBtn = document.getElementById('closeFeesNewPaymentModal');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeNewPaymentModal);
    }

    const btnCloseDuplicate = document.getElementById('btnCloseDuplicateWarning');
    if (btnCloseDuplicate) {
      btnCloseDuplicate.addEventListener('click', closeNewPaymentModal);
    }

    const btnCloseSuccess = document.getElementById('btnCloseSuccessModal');
    if (btnCloseSuccess) {
      btnCloseSuccess.addEventListener('click', closeNewPaymentModal);
    }

    const btnCloseError = document.getElementById('btnCloseErrorModal');
    if (btnCloseError) {
      btnCloseError.addEventListener('click', closeNewPaymentModal);
    }

    const btnTryAgain = document.getElementById('btnTryAgainPayment');
    if (btnTryAgain) {
      btnTryAgain.addEventListener('click', handleStartPayment);
    }

    const modalOverlay = document.getElementById('feesNewPaymentModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeNewPaymentModal();
      });
    }

    // Context Action Popup triggers
    const btnContextDelete = document.getElementById('btnFeesContextDelete');
    if (btnContextDelete) {
      btnContextDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteCycleConfirmationModal();
      });
    }

    const btnContextClose = document.getElementById('btnFeesContextClose');
    if (btnContextClose) {
      btnContextClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMonthActionPopup();
      });
    }

    // Delete Payment Cycle Confirmation Modal triggers
    const btnCancelDelete = document.getElementById('btnCancelDeleteCycle');
    if (btnCancelDelete) {
      btnCancelDelete.addEventListener('click', closeDeleteCycleConfirmationModal);
    }

    const closeDeleteModalBtn = document.getElementById('closeFeesDeleteCycleModal');
    if (closeDeleteModalBtn) {
      closeDeleteModalBtn.addEventListener('click', closeDeleteCycleConfirmationModal);
    }

    const btnConfirmDelete = document.getElementById('btnConfirmDeleteCycle');
    if (btnConfirmDelete) {
      btnConfirmDelete.addEventListener('click', handleDeletePaymentCycle);
    }

    const deleteModalOverlay = document.getElementById('feesDeleteCycleModal');
    if (deleteModalOverlay) {
      deleteModalOverlay.addEventListener('click', (e) => {
        if (e.target === deleteModalOverlay) closeDeleteCycleConfirmationModal();
      });
    }

    // Schedule Notifications Configuration Modal triggers
    const btnOpenSchedule = document.getElementById('btnOpenScheduleModal');
    if (btnOpenSchedule) {
      btnOpenSchedule.addEventListener('click', (e) => {
        e.stopPropagation();
        openScheduleModal();
      });
    }

    const closeScheduleModalBtn = document.getElementById('closeFeesScheduleModal');
    if (closeScheduleModalBtn) {
      closeScheduleModalBtn.addEventListener('click', closeScheduleModal);
    }

    const btnCancelSchedule = document.getElementById('btnCancelScheduleModal');
    if (btnCancelSchedule) {
      btnCancelSchedule.addEventListener('click', closeScheduleModal);
    }

    const btnSaveSchedule = document.getElementById('btnSaveScheduleModal');
    if (btnSaveSchedule) {
      btnSaveSchedule.addEventListener('click', saveScheduleModal);
    }

    const btnAddSchedule = document.getElementById('btnAddNotificationSchedule');
    if (btnAddSchedule) {
      btnAddSchedule.addEventListener('click', addScheduleRow);
    }

    const scheduleModalOverlay = document.getElementById('feesScheduleModal');
    if (scheduleModalOverlay) {
      scheduleModalOverlay.addEventListener('click', (e) => {
        if (e.target === scheduleModalOverlay) closeScheduleModal();
      });
    }
  }

  function updateStatusPillButtons() {
    const statusBtns = document.querySelectorAll('.fees-status-filter-btn');
    statusBtns.forEach(btn => {
      if (btn.dataset.statusFilter === state.statusFilter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function closeAllDropdowns() {
    const batchDropdown = document.getElementById('feesBatchDropdown');
    const monthDropdown = document.getElementById('feesMonthDropdown');
    const sortMenu = document.getElementById('feesSortMenu');
    const batchBtn = document.getElementById('btnFeesBatchFilter');
    const monthBtn = document.getElementById('btnFeesMonthFilter');
    const sortBtn = document.getElementById('btnFeesSort');

    if (batchDropdown) batchDropdown.style.display = 'none';
    if (monthDropdown) monthDropdown.style.display = 'none';
    if (sortMenu) sortMenu.style.display = 'none';
    if (batchBtn) batchBtn.setAttribute('aria-expanded', 'false');
    if (monthBtn) monthBtn.setAttribute('aria-expanded', 'false');
    if (sortBtn) sortBtn.setAttribute('aria-expanded', 'false');
    closeMonthActionPopup();
  }

  // ==========================================================================
  // 7. PUBLIC INIT FUNCTION
  // ==========================================================================
  window.initFeesModule = function () {
    const role = (localStorage.getItem('vava_role') || '').toLowerCase();
    const isSuperAdmin = (role === 'admin' || role === 'superadmin');
    if (!isSuperAdmin) {
      console.warn('Access denied: Fees & Collections is accessible to Super Admin only.');
      return;
    }
    if (!state.initialized) {
      renderBatchDropdownOptions();
      renderMonthDropdownOptions();
      setupEventListeners();
      state.initialized = true;
    }
    // Always trigger dynamic fetch from the database when page loads/opens
    fetchFeesData();
  };

  // Expose live store for inspection
  window.__FEES_STORE__ = {
    state,
    fetchFeesData,
    openNewPaymentModal,
    closeNewPaymentModal,
    checkPaymentCycleExists,
    openMonthActionPopup,
    closeMonthActionPopup,
    openDeleteCycleConfirmationModal,
    closeDeleteCycleConfirmationModal,
    handleDeletePaymentCycle,
    openScheduleModal,
    closeScheduleModal,
    renderScheduleRows,
    addScheduleRow,
    saveScheduleModal,
    handleStartPayment
  };
})();
