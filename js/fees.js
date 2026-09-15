/**
 * VAVA Sports Academy - Fees & Collections Frontend Module
 * 
 * Dynamic production implementation connected to MySQL database via server/fees.php.
 * All mock/dummy data has been completely removed.
 */

(function () {
  'use strict';

  const FEES_API_URL = (typeof FEES_API !== 'undefined' && FEES_API)
    ? FEES_API
    : (typeof window !== 'undefined' && window.location.port === '5500'
        ? 'http://localhost/VAVA_sports/server/fees.php'
        : (window.location.origin && window.location.origin.startsWith('http')
            ? `${window.location.origin}/VAVA_sports/server/fees.php`
            : 'http://localhost/VAVA_sports/server/fees.php'));

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
      selected_month: ''
    },
    studentsData: [],
    batchesData: [],
    monthsData: [],
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

    if (state.monthsData.length === 0) {
      const currentMonthDate = state.selectedMonth || new Date().toISOString().slice(0, 7) + '-01';
      state.monthsData = [{ date: currentMonthDate, label: state.selectedMonthLabel || 'Current Month' }];
    }

    monthDropdown.innerHTML = state.monthsData.map(m => `
      <button type="button" class="fees-dropdown-item ${m.date === state.selectedMonth ? 'active' : ''}" data-month-date="${m.date}" data-month-label="${safeEscape(m.label)}">
        ${safeEscape(m.label)}
      </button>
    `).join('');

    // Update label text
    if (monthLabel) {
      const match = state.monthsData.find(m => m.date === state.selectedMonth);
      monthLabel.textContent = match ? match.label : (state.selectedMonthLabel || 'Select Month');
    }

    // Attach click listeners to month items
    monthDropdown.querySelectorAll('.fees-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedMonth = item.dataset.monthDate;
        state.selectedMonthLabel = item.dataset.monthLabel;
        monthDropdown.style.display = 'none';
        const monthBtn = document.getElementById('btnFeesMonthFilter');
        if (monthBtn) monthBtn.setAttribute('aria-expanded', 'false');
        fetchFeesData();
      });
    });
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

    modal.style.display = 'flex';
    document.body.classList.add('modal-open');

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
    const modal = document.getElementById('feesPaymentDetailModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
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
    const yearSelect = document.getElementById('feesNewPaymentYearSelect');
    if (!monthSelect || !yearSelect) return;

    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const currentYear = now.getFullYear();

    // Populate Months (January - December) with current month selected dynamically
    monthSelect.innerHTML = MONTH_NAMES.map((m, idx) => `
      <option value="${m}" ${idx === currentMonthIdx ? 'selected' : ''}>${m}</option>
    `).join('');

    // Populate Years (Current Year - 1 to Current Year + 4)
    const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4];
    yearSelect.innerHTML = years.map(y => `
      <option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>
    `).join('');

    newPaymentSelectedMonth = monthSelect.value || MONTH_NAMES[currentMonthIdx];
    newPaymentSelectedYear = yearSelect.value || String(currentYear);
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

  function resetNewPaymentModal() {
    populateNewPaymentDateSelectors();

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
    if (btnText) btnText.textContent = 'Start Payment';
  }

  function openNewPaymentModal() {
    const modal = document.getElementById('feesNewPaymentModal');
    if (!modal) return;
    resetNewPaymentModal();
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');

    // Focus month selector
    const monthSelect = document.getElementById('feesNewPaymentMonthSelect');
    if (monthSelect) setTimeout(() => monthSelect.focus(), 50);
  }

  function closeNewPaymentModal() {
    const modal = document.getElementById('feesNewPaymentModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  /**
   * FRONTEND-ONLY DUPLICATE PAYMENT CHECK (MOCK/HOOK)
   * In future backend integration, replace this with a real API call:
   *   const res = await fetch(`${FEES_API_URL}?action=check_cycle&month=${encodeURIComponent(monthName)}&year=${encodeURIComponent(year)}`, { headers: getAuthHeaders() });
   *   const data = await res.json();
   *   return data.exists;
   */
  async function checkPaymentCycleExists(monthName, year) {
    // Isolated mock / demo switches for testing
    if (window.__TEST_DUPLICATE_PAYMENT_CYCLE__ === true) {
      return true;
    }
    if (window.__TEST_DUPLICATE_PAYMENT_CYCLE__ === false) {
      return false;
    }
    // Check against available months already returned by existing API
    const targetLabel = `${monthName} ${year}`.trim().toLowerCase();
    if (state.monthsData && state.monthsData.length > 0) {
      return state.monthsData.some(m => (m.label || '').trim().toLowerCase() === targetLabel);
    }
    return false;
  }

  async function handleContinueToConfirmation() {
    const monthSelect = document.getElementById('feesNewPaymentMonthSelect');
    const yearSelect = document.getElementById('feesNewPaymentYearSelect');
    newPaymentSelectedMonth = monthSelect ? monthSelect.value : '';
    newPaymentSelectedYear = yearSelect ? yearSelect.value : '';

    const title = document.getElementById('feesNewPaymentTitle');
    const subtitle = document.getElementById('feesNewPaymentSubtitle');
    const stepSelect = document.getElementById('feesNewPaymentStepSelect');
    const stepConfirm = document.getElementById('feesNewPaymentStepConfirm');
    const stepDuplicate = document.getElementById('feesNewPaymentStepDuplicate');
    const stepSuccess = document.getElementById('feesNewPaymentStepSuccess');
    const stepError = document.getElementById('feesNewPaymentStepError');

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

      if (title) title.textContent = `Start ${newPaymentSelectedMonth} ${newPaymentSelectedYear} Payment?`;
      if (subtitle) subtitle.textContent = 'Confirmation required before starting payment cycle.';
      setModalBadge('warning', 'Action Required');

      const confirmWarningText = document.getElementById('feesConfirmWarningText');
      if (confirmWarningText) {
        confirmWarningText.innerHTML = `Starting a new payment for <strong>${safeEscape(newPaymentSelectedMonth)} ${safeEscape(newPaymentSelectedYear)}</strong> will send notifications to all students. Do you still want to continue?`;
      }
    }
  }

  async function handleStartPayment() {
    const confirmBtn = document.getElementById('btnConfirmStartPayment');
    const spinner = document.getElementById('btnStartPaymentSpinner');
    const btnText = document.getElementById('btnStartPaymentText');
    const tryAgainBtn = document.getElementById('btnTryAgainPayment');

    // Loading state
    if (confirmBtn) confirmBtn.disabled = true;
    if (tryAgainBtn) tryAgainBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Starting Payment...';

    // Simulate async network request
    await new Promise(resolve => setTimeout(resolve, 750));

    const stepConfirm = document.getElementById('feesNewPaymentStepConfirm');
    const stepSuccess = document.getElementById('feesNewPaymentStepSuccess');
    const stepError = document.getElementById('feesNewPaymentStepError');
    const title = document.getElementById('feesNewPaymentTitle');
    const subtitle = document.getElementById('feesNewPaymentSubtitle');

    if (window.__TEST_ERROR_PAYMENT_CYCLE__ === true) {
      // Show Error State
      if (stepConfirm) stepConfirm.style.display = 'none';
      if (stepSuccess) stepSuccess.style.display = 'none';
      if (stepError) stepError.style.display = 'block';

      if (title) title.textContent = 'Unable to start payment';
      if (subtitle) subtitle.textContent = 'Payment cycle initialization failed.';
      setModalBadge('danger', 'Error');
    } else {
      // Show Success State
      if (stepConfirm) stepConfirm.style.display = 'none';
      if (stepError) stepError.style.display = 'none';
      if (stepSuccess) stepSuccess.style.display = 'block';

      if (title) title.textContent = `${newPaymentSelectedMonth} ${newPaymentSelectedYear} Payment Started`;
      if (subtitle) subtitle.textContent = 'Payment cycle created successfully.';
      setModalBadge('default', 'Cycle Initialized');

      const successTitle = document.getElementById('feesSuccessTitle');
      if (successTitle) {
        successTitle.textContent = `${newPaymentSelectedMonth} ${newPaymentSelectedYear} Payment Started`;
      }
    }

    if (confirmBtn) confirmBtn.disabled = false;
    if (tryAgainBtn) tryAgainBtn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = 'Start Payment';
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
    checkPaymentCycleExists
  };
})();
