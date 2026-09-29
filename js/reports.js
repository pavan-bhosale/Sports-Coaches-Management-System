/**
 * ==========================================================================
 * VAVA SPORTS ACADEMY - CONSOLIDATED REPORTS & ANALYTICS CLIENT MODULE
 * ==========================================================================
 * 
 * Simplified to 5 Core Reports:
 * 1. Student & Batch Report (student_batch)
 * 2. Attendance Report (attendance_report)
 * 3. Fees & Payments Report (fees_payments) - Super Admin Only
 * 4. Coach & Batch Activity Report (coach_activity) - Factual assignments
 * 5. Inventory Report (inventory_report) - Super Admin Only
 * 
 * Production Hardened Features:
 * - Centralized API resolution for local XAMPP, Live Server, and root/subdirectory deployments
 * - Strict JSON response inspection (blocks <!DOCTYPE HTML parse errors)
 * - Safe request token sequencing (prevents stale responses from overwriting newer user filters)
 * - 100% dynamic MySQL database integration (zero hardcoded / demo / fallback data)
 * - Complete empty-state handling without NaN / null or broken Chart.js instances
 * - Purely interactive modal popup preview (All PDF dependencies removed)
 * - Server-side & client-side role authorization
 */

(function () {
  'use strict';

  // Module State
  let filterOptions = null;
  let activeSearchTerm = '';
  let activeReportId = null;
  let activeFilters = {};
  let currentReportChart = null;
  let currentReportData = null;
  let activeRequestToken = 0;

  // Clean SVG Icons
  const ICONS = {
    students: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    attendance: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M9 16l2 2 4-4"></path></svg>`,
    fees: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line><circle cx="12" cy="15" r="2"></circle></svg>`,
    coaches: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle><line x1="18" y1="8" x2="22" y2="8"></line><line x1="20" y1="6" x2="20" y2="10"></line></svg>`,
    inventory: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CENTRALIZED API URL & AUTH RESOLVER
  // ──────────────────────────────────────────────────────────────────────────

  function resolveReportsApiUrl(action, queryParams = {}) {
    let base = '';
    if (typeof window !== 'undefined' && window.REPORTS_API) {
      base = window.REPORTS_API;
    } else if (typeof window !== 'undefined' && typeof window.getApiEndpoint === 'function') {
      base = window.getApiEndpoint('reports');
    } else {
      const hostname = window.location.hostname;
      const port = window.location.port;
      const isDevServer = port !== '' && port !== '80' && port !== '443';
      const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
      if (isLocalHost && isDevServer) {
        const targetHost = hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
        base = `http://${targetHost}/VAVA_sports/server/reports.php`;
      } else {
        const currentDir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        base = `${currentDir}server/reports.php`;
      }
    }

    const url = new URL(base, window.location.href);
    if (action) {
      url.searchParams.set('action', action);
    }
    Object.keys(queryParams).forEach(k => {
      const val = queryParams[k];
      if (val !== undefined && val !== null && val !== '') {
        url.searchParams.set(k, val);
      }
    });
    return url.toString();
  }

  function getAuthHeaders() {
    const role = localStorage.getItem('vava_role') || 'admin';
    const email = localStorage.getItem('vava_email') || localStorage.getItem('vava_user_email') || '';
    const coach_id = localStorage.getItem('vava_coach_id') || '0';
    return {
      'Content-Type': 'application/json',
      'X-VAVA-Role': role,
      'X-VAVA-Email': email,
      'X-VAVA-Coach-ID': String(coach_id)
    };
  }

  function isUserSuperAdmin() {
    const role = localStorage.getItem('vava_role') || 'admin';
    return role === 'admin' || role === 'superadmin';
  }

  /**
   * Safe Fetch that validates Content-Type and prevents <!DOCTYPE HTML parsing as JSON
   */
  async function fetchReportsJson(action, queryParams = {}, options = {}) {
    const url = resolveReportsApiUrl(action, queryParams);
    const headers = Object.assign({}, getAuthHeaders(), options.headers || {});
    const fetchOpts = Object.assign({}, options, { headers });

    const res = await fetch(url, fetchOpts);
    const contentType = res.headers.get('Content-Type') || '';
    const rawText = await res.text();

    // Guard: Server returned HTML error page instead of JSON
    if (contentType.includes('text/html') || rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
      throw new Error('Reports service returned an HTML response instead of JSON. Ensure the PHP backend is running on Apache.');
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      throw new Error(`Invalid JSON received from reports service: ${rawText.substring(0, 120)}...`);
    }

    if (!res.ok || (data && data.success === false)) {
      const errMsg = (data && (data.error || data.message)) ? (data.error || data.message) : `HTTP ${res.status}: Server request failed.`;
      throw new Error(errMsg);
    }

    return data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. THE 5 CORE REPORT REGISTRY
  // ──────────────────────────────────────────────────────────────────────────

  const REPORT_REGISTRY = [
    {
      id: 'student_batch',
      title: 'Student & Batch Report',
      category: 'Students & Batches',
      description: 'Combined overview of athlete enrollment, coach allocations, and real-time training batch distributions.',
      icon: ICONS.students,
      superadminOnly: false,
      filterFields: ['student_id', 'batch_id', 'coach_id', 'branch', 'gender', 'status']
    },
    {
      id: 'attendance_report',
      title: 'Attendance Report',
      category: 'Attendance',
      description: 'Centralized attendance auditing across training sessions, presence rates, and athlete attendance logs.',
      icon: ICONS.attendance,
      superadminOnly: false,
      filterFields: ['start_date', 'end_date', 'batch_id', 'coach_id', 'student_id', 'status']
    },
    {
      id: 'fees_payments',
      title: 'Fees & Payments Report',
      category: 'Fees & Payments',
      description: 'Comprehensive financial collection audit, realization rates, payment methods, and monthly trend breakdowns.',
      icon: ICONS.fees,
      superadminOnly: true,
      filterFields: ['month', 'start_date', 'end_date', 'student_id', 'batch_id', 'status', 'payment_method']
    },
    {
      id: 'coach_activity',
      title: 'Coach & Batch Activity Report',
      category: 'Coaches & Batches',
      description: 'Factual coaching roster records, assigned batch timings, enrolled athlete counts, and recorded session logs.',
      icon: ICONS.coaches,
      superadminOnly: false,
      filterFields: ['coach_id', 'batch_id', 'branch', 'start_date', 'end_date']
    },
    {
      id: 'inventory_report',
      title: 'Inventory Report',
      category: 'Inventory & Equipment',
      description: 'Complete equipment status, field allocations to batches, utilization rates, and stock movement audit trail.',
      icon: ICONS.inventory,
      superadminOnly: true,
      filterFields: ['item_id', 'batch_id', 'action_type', 'start_date', 'end_date']
    }
  ];

  // ──────────────────────────────────────────────────────────────────────────
  // 3. INITIALIZATION & DATA LOADING
  // ──────────────────────────────────────────────────────────────────────────

  window.initReportsModule = async function () {
    const reportsSection = document.getElementById('reportsSection');
    if (!reportsSection) return;

    if (!document.getElementById('reportsMainContent')) {
      renderReportsSkeleton(reportsSection);
      bindReportsEvents();
    }

    await loadFilterOptions();
    renderReportCatalog();
  };

  async function loadFilterOptions() {
    try {
      const res = await fetchReportsJson('filter_options');
      if (res && res.success) {
        filterOptions = res.data || res.options || {};
      }
    } catch (err) {
      console.error('Failed to load filter options:', err);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. UI RENDERING (CATALOG & MODAL SKELETON)
  // ──────────────────────────────────────────────────────────────────────────

  function renderReportsSkeleton(container) {
    container.innerHTML = `
      <div class="reports-container" id="reportsMainContent">
        <!-- Header -->
        <div class="reports-header">
          <div class="reports-header-text">
            <h1>
              <span class="reports-title-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
              </span>
              Reports & Analytics
            </h1>
            <p>
              Consolidated operational reports, attendance tracking, financial collections, and equipment audits.
            </p>
          </div>
        </div>

        <!-- Controls: Search Box -->
        <div class="reports-controls-bar">
          <div class="reports-search-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" id="reportSearchInput" class="reports-search-input" placeholder="Search reports by title or description...">
          </div>
          <div class="reports-count-pill" id="reportsCountBadge">
            5 Core Reports
          </div>
        </div>

        <!-- Reports Grid (Exactly 5 Cards) -->
        <div class="reports-grid" id="reportsGrid"></div>
      </div>

      <!-- ==========================================
           INTERACTIVE REPORT POPUP MODAL
           ========================================== -->
      <div class="report-modal-overlay" id="reportPreviewModal" style="display:none;">
        <div class="report-modal" role="dialog" aria-modal="true">
          <!-- Modal Header -->
          <div class="report-modal-header">
            <div class="report-modal-header-left">
              <div class="report-modal-header-icon" id="previewModalIcon">
                ${ICONS.students}
              </div>
              <div class="report-modal-title-group">
                <h2 id="previewModalTitle">Report Details</h2>
                <div class="report-modal-meta">
                  <span class="report-category-badge" id="previewModalCategory">Category</span>
                  <span class="report-modal-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span id="previewModalGenerated">Just now</span>
                  </span>
                  <span class="report-modal-meta-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                    </svg>
                    <span id="previewModalPeriod">All Records</span>
                  </span>
                </div>
              </div>
            </div>
            <div class="report-modal-header-actions">
              <button type="button" class="report-modal-close-btn" id="closeReportPreviewModal" aria-label="Close Report">&times;</button>
            </div>
          </div>

          <!-- Modal Body -->
          <div class="report-modal-body" id="previewModalBody">
            <!-- Filter Panel -->
            <div class="report-filter-panel" id="previewFilterPanel">
              <div class="report-filter-header">
                <span class="report-filter-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                  </svg>
                  Report Filters
                </span>
              </div>
              <form id="previewFilterForm" class="report-filter-grid">
                <!-- Dynamically populated filter controls -->
              </form>
            </div>

            <!-- Loading Spinner Container -->
            <div class="report-loading-overlay" id="previewLoadingState" style="display:none;">
              <div class="report-spinner"></div>
              <span>Querying database and compiling statistics...</span>
            </div>

            <!-- Content Area (Metrics, Charts, Table, Secondary Views) -->
            <div id="previewContentArea">
              <!-- Summary KPI Metrics Cards -->
              <div class="report-metrics-grid" id="previewMetricsGrid"></div>

              <!-- Visual Analytics / Chart -->
              <div class="report-chart-section" id="previewChartSection" style="margin-top: 1.5rem; display:none;">
                <div class="report-chart-header">
                  <span class="report-chart-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 20V10"></path>
                      <path d="M12 20V4"></path>
                      <path d="M6 20v-6"></path>
                    </svg>
                    Visual Analytics & Breakdown
                  </span>
                </div>
                <div class="report-chart-canvas-wrap">
                  <canvas id="reportChartCanvas"></canvas>
                </div>
              </div>

              <!-- Detailed Table Section -->
              <div class="report-table-section" id="previewTableSection" style="margin-top: 1.5rem;">
                <div class="report-table-header">
                  <span class="report-table-title" id="previewTableTitle">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="8" y1="6" x2="21" y2="6"></line>
                      <line x1="8" y1="12" x2="21" y2="12"></line>
                      <line x1="8" y1="18" x2="21" y2="18"></line>
                      <line x1="3" y1="6" x2="3.01" y2="6"></line>
                      <line x1="3" y1="12" x2="3.01" y2="12"></line>
                      <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                    Detailed Records
                  </span>
                  <span class="report-table-count" id="previewTableCount">0 records found</span>
                </div>
                <div class="report-table-wrapper" id="previewTableWrapper">
                  <table class="report-data-table" id="previewDataTable">
                    <thead id="previewTableHead"></thead>
                    <tbody id="previewTableBody"></tbody>
                  </table>
                </div>
              </div>

              <!-- Secondary Section (Batch Summary / Compact Breakdown / Movement History) -->
              <div id="previewSecondarySection" style="margin-top: 1.5rem; display: none;"></div>

              <!-- Notes & Definitions -->
              <div class="report-notes-box" id="previewNotesBox" style="margin-top: 1.5rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <div id="previewNotesContent">
                  Historical reporting is compiled directly from authoritative database records.
                </div>
              </div>
            </div>
          </div>

          <!-- Modal Footer (Close Button Only) -->
          <div class="report-modal-footer">
            <div class="report-modal-footer-left">
              <span>VAVA Sports Management System • Report Engine</span>
            </div>
            <div class="report-modal-footer-actions">
              <button type="button" class="btn-sb-ghost" id="btnClosePreviewFooter">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindReportsEvents() {
    const searchInput = document.getElementById('reportSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        activeSearchTerm = e.target.value.toLowerCase().trim();
        renderReportCatalog();
      });
    }

    const closeModal = () => {
      const modal = document.getElementById('reportPreviewModal');
      if (modal) modal.style.display = 'none';
      if (currentReportChart) {
        currentReportChart.destroy();
        currentReportChart = null;
      }
    };

    const closeBtn = document.getElementById('closeReportPreviewModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const closeFooterBtn = document.getElementById('btnClosePreviewFooter');
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeModal);

    const modalOverlay = document.getElementById('reportPreviewModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeModal();
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. REPORT CATALOG RENDERING (EXACTLY 5 CARDS)
  // ──────────────────────────────────────────────────────────────────────────

  function renderReportCatalog() {
    const grid = document.getElementById('reportsGrid');
    if (!grid) return;

    const isSuperAdmin = isUserSuperAdmin();

    let availableReports = REPORT_REGISTRY.filter(r => {
      if (r.superadminOnly && !isSuperAdmin) return false;
      if (!activeSearchTerm) return true;
      const matchTitle = r.title.toLowerCase().includes(activeSearchTerm);
      const matchDesc = r.description.toLowerCase().includes(activeSearchTerm);
      const matchCat = r.category.toLowerCase().includes(activeSearchTerm);
      return matchTitle || matchDesc || matchCat;
    });

    const badge = document.getElementById('reportsCountBadge');
    if (badge) {
      badge.textContent = `${availableReports.length} Core Report${availableReports.length === 1 ? '' : 's'}`;
    }

    if (availableReports.length === 0) {
      grid.innerHTML = `
        <div class="report-empty-state" style="grid-column: 1 / -1; padding: 3rem 1rem;">
          <div class="report-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <div class="report-empty-text">No reports match "${escapeHtml(activeSearchTerm)}"</div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">
            Try a different search term or clear the search box.
          </p>
        </div>
      `;
      return;
    }

    grid.innerHTML = availableReports.map(report => `
      <div class="report-card" data-report-id="${report.id}">
        <div class="report-card-body">
          <div class="report-card-header">
            <div class="report-card-icon-box">
              ${report.icon}
            </div>
            <span class="report-category-badge">${report.category}</span>
          </div>
          <h3 class="report-card-title">${escapeHtml(report.title)}</h3>
          <p class="report-card-desc">${escapeHtml(report.description)}</p>
        </div>
        <div class="report-card-footer">
          <span style="font-size:0.78rem; color:var(--text-muted);">
            ${report.superadminOnly ? 'Super Admin Only' : 'Interactive Analytics'}
          </span>
          <span class="report-card-action">
            Open Report
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </span>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.report-card').forEach(card => {
      card.addEventListener('click', function () {
        const reportId = this.getAttribute('data-report-id');
        openReportPreview(reportId);
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. MODAL PREVIEW & DYNAMIC FILTERS
  // ──────────────────────────────────────────────────────────────────────────

  async function openReportPreview(reportId, initialFilters = {}) {
    const reportDef = REPORT_REGISTRY.find(r => r.id === reportId);
    if (!reportDef) return;

    activeReportId = reportId;
    activeFilters = Object.assign({}, initialFilters);

    const modal = document.getElementById('reportPreviewModal');
    if (!modal) return;

    const titleEl = document.getElementById('previewModalTitle');
    const catEl = document.getElementById('previewModalCategory');
    const iconEl = document.getElementById('previewModalIcon');
    if (titleEl) titleEl.textContent = reportDef.title;
    if (catEl) catEl.textContent = reportDef.category.toUpperCase();
    if (iconEl) iconEl.innerHTML = reportDef.icon;

    renderFilterForm(reportDef);
    modal.style.display = 'flex';
    await fetchAndRenderReport();
  }

  function renderFilterForm(reportDef) {
    const form = document.getElementById('previewFilterForm');
    if (!form) return;

    const fields = reportDef.filterFields || [];
    let html = '';

    fields.forEach(field => {
      if (field === 'start_date') {
        const val = activeFilters.start_date || '';
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_start_date">From Date</label>
            <input type="date" id="filter_start_date" class="report-filter-input" value="${val}">
          </div>
        `;
      } else if (field === 'end_date') {
        const val = activeFilters.end_date || '';
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_end_date">To Date</label>
            <input type="date" id="filter_end_date" class="report-filter-input" value="${val}">
          </div>
        `;
      } else if (field === 'month') {
        const val = activeFilters.month || '';
        const months = (filterOptions && (filterOptions.months || filterOptions.available_months)) ? (filterOptions.months || filterOptions.available_months) : [];
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_month">Billing Month</label>
            <select id="filter_month" class="report-filter-select">
              <option value="">All Available Months</option>
              ${months.map(m => {
                const mVal = typeof m === 'object' ? (m.month || m.date || '') : m;
                const mLabel = typeof m === 'object' ? (m.label || m.month || m.date) : m;
                return `<option value="${mVal}" ${val === mVal ? 'selected' : ''}>${escapeHtml(mLabel)}</option>`;
              }).join('')}
            </select>
          </div>
        `;
      } else if (field === 'batch_id') {
        const val = activeFilters.batch_id || '';
        const batches = (filterOptions && filterOptions.batches) ? filterOptions.batches : [];
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_batch_id">Batch</label>
            <select id="filter_batch_id" class="report-filter-select">
              <option value="">All Batches</option>
              ${batches.map(b => `<option value="${b.batch_id}" ${val == b.batch_id ? 'selected' : ''}>${escapeHtml(b.display_name)}</option>`).join('')}
            </select>
          </div>
        `;
      } else if (field === 'coach_id') {
        const val = activeFilters.coach_id || '';
        const coaches = (filterOptions && filterOptions.coaches) ? filterOptions.coaches : [];
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_coach_id">Coach</label>
            <select id="filter_coach_id" class="report-filter-select">
              <option value="">All Coaches</option>
              ${coaches.map(c => `<option value="${c.coach_id}" ${val == c.coach_id ? 'selected' : ''}>${escapeHtml(c.coach_name)}</option>`).join('')}
            </select>
          </div>
        `;
      } else if (field === 'student_id') {
        const val = activeFilters.student_id || '';
        const students = (filterOptions && filterOptions.students) ? filterOptions.students : [];
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_student_id">Student</label>
            <select id="filter_student_id" class="report-filter-select">
              <option value="">All Students</option>
              ${students.map(s => `<option value="${s.student_id}" ${val == s.student_id ? 'selected' : ''}>${escapeHtml(s.student_name)} (ID: ${s.student_id})</option>`).join('')}
            </select>
          </div>
        `;
      } else if (field === 'status') {
        const val = activeFilters.status || '';
        const isAtt = reportDef.id === 'attendance_report';
        const isFee = reportDef.id === 'fees_payments';
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_status">Status</label>
            <select id="filter_status" class="report-filter-select">
              <option value="">All Statuses</option>
              ${isAtt ? `
                <option value="Present" ${val === 'Present' ? 'selected' : ''}>Present</option>
                <option value="Absent" ${val === 'Absent' ? 'selected' : ''}>Absent</option>
              ` : isFee ? `
                <option value="Paid" ${val === 'Paid' ? 'selected' : ''}>Paid</option>
                <option value="Unpaid" ${val === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
                <option value="Overdue" ${val === 'Overdue' ? 'selected' : ''}>Overdue</option>
              ` : `
                <option value="Active" ${val === 'Active' ? 'selected' : ''}>Active</option>
                <option value="Inactive" ${val === 'Inactive' ? 'selected' : ''}>Inactive</option>
              `}
            </select>
          </div>
        `;
      } else if (field === 'branch') {
        const val = activeFilters.branch || '';
        const branches = (filterOptions && filterOptions.branches) ? filterOptions.branches : [];
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_branch">Branch / Location</label>
            <select id="filter_branch" class="report-filter-select">
              <option value="">All Branches</option>
              ${branches.map(b => `<option value="${b}" ${val === b ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('')}
            </select>
          </div>
        `;
      } else if (field === 'gender') {
        const val = activeFilters.gender || '';
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_gender">Gender</label>
            <select id="filter_gender" class="report-filter-select">
              <option value="">All Genders</option>
              <option value="Male" ${val === 'Male' ? 'selected' : ''}>Male</option>
              <option value="Female" ${val === 'Female' ? 'selected' : ''}>Female</option>
            </select>
          </div>
        `;
      } else if (field === 'payment_method') {
        const val = activeFilters.payment_method || '';
        const methods = (filterOptions && filterOptions.payment_methods) ? filterOptions.payment_methods : ['Cash', 'GPay / UPI', 'Bank Transfer', 'Razorpay'];
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_payment_method">Payment Method</label>
            <select id="filter_payment_method" class="report-filter-select">
              <option value="">All Recorded Methods</option>
              ${methods.map(m => `<option value="${m}" ${val === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
            </select>
          </div>
        `;
      } else if (field === 'item_id') {
        const val = activeFilters.item_id || '';
        const items = (filterOptions && filterOptions.inventory_items) ? filterOptions.inventory_items : [];
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_item_id">Equipment Item</label>
            <select id="filter_item_id" class="report-filter-select">
              <option value="">All Inventory Items</option>
              ${items.map(it => {
                const itId = it.inventory_id || it.id;
                return `<option value="${itId}" ${val == itId ? 'selected' : ''}>${escapeHtml(it.item_name)}</option>`;
              }).join('')}
            </select>
          </div>
        `;
      } else if (field === 'action_type') {
        const val = activeFilters.action_type || '';
        html += `
          <div class="report-filter-group">
            <label class="report-filter-label" for="filter_action_type">Movement Type</label>
            <select id="filter_action_type" class="report-filter-select">
              <option value="">All Movement Types</option>
              <option value="Added" ${val === 'Added' ? 'selected' : ''}>Added Stock</option>
              <option value="Deducted" ${val === 'Deducted' ? 'selected' : ''}>Deducted Stock</option>
              <option value="Allocated" ${val === 'Allocated' ? 'selected' : ''}>Allocated to Batch</option>
              <option value="Deallocated" ${val === 'Deallocated' ? 'selected' : ''}>Deallocated from Batch</option>
            </select>
          </div>
        `;
      }
    });

    html += `
      <div class="report-filter-actions">
        <button type="button" class="btn-filter-apply" id="btnApplyPreviewFilters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Apply Filters
        </button>
        <button type="button" class="btn-filter-reset" id="btnResetPreviewFilters">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          Reset
        </button>
      </div>
    `;

    form.innerHTML = html;

    // Bind Apply & Reset buttons
    const applyBtn = document.getElementById('btnApplyPreviewFilters');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        collectFiltersFromForm();
        fetchAndRenderReport();
      });
    }

    const resetBtn = document.getElementById('btnResetPreviewFilters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        activeFilters = {};
        renderFilterForm(reportDef);
        fetchAndRenderReport();
      });
    }
  }

  function collectFiltersFromForm() {
    activeFilters = {};
    const form = document.getElementById('previewFilterForm');
    if (!form) return;

    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(input => {
      const id = input.id.replace('filter_', '');
      const val = input.value.trim();
      if (val !== '' && val !== 'all') {
        activeFilters[id] = val;
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. FETCH AND RENDER REPORT DATA
  // ──────────────────────────────────────────────────────────────────────────

  async function fetchAndRenderReport() {
    if (!activeReportId) return;

    const currentToken = ++activeRequestToken;
    const loadingState = document.getElementById('previewLoadingState');
    const contentArea = document.getElementById('previewContentArea');

    if (loadingState) loadingState.style.display = 'flex';
    if (contentArea) contentArea.style.opacity = '0.35';

    try {
      const params = Object.assign({ report: activeReportId }, activeFilters);
      const res = await fetchReportsJson('get_report', params);

      // Protect against out-of-order stale responses
      if (currentToken !== activeRequestToken) return;

      if (!res || !res.success || !res.data) {
        throw new Error(res?.error || 'Unable to generate report data.');
      }

      currentReportData = res.data;
      renderReportContent(res.data);

    } catch (err) {
      if (currentToken !== activeRequestToken) return;

      console.error('Report fetch error:', err);
      if (contentArea) {
        contentArea.innerHTML = `
          <div class="report-empty-state">
            <div class="report-empty-icon" style="color: var(--color-danger);">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div class="report-empty-text" style="color: var(--color-danger);">Failed to load report data</div>
            <p style="font-size:0.85rem; color:var(--text-muted); max-width: 500px; margin: 0.5rem auto 0;">
              ${escapeHtml(err.message || 'Server error occurred.')}
            </p>
          </div>
        `;
      }
    } finally {
      if (currentToken === activeRequestToken) {
        if (loadingState) loadingState.style.display = 'none';
        if (contentArea) contentArea.style.opacity = '1';
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. RENDER REPORT CONTENT (METRICS, CHARTS, TABLES, SECONDARY SECTIONS)
  // ──────────────────────────────────────────────────────────────────────────

  function renderReportContent(data) {
    const periodEl = document.getElementById('previewModalPeriod');
    const genEl = document.getElementById('previewModalGenerated');
    if (periodEl) periodEl.textContent = data.period || 'All Records';
    if (genEl) genEl.textContent = `${data.generated_date || 'Today'} • ${data.generated_time || ''}`;

    // 1. Summary KPI Metrics Cards
    const metricsGrid = document.getElementById('previewMetricsGrid');
    if (metricsGrid && data.summary_metrics) {
      metricsGrid.innerHTML = data.summary_metrics.map(m => `
        <div class="report-metric-card">
          <span class="report-metric-label">${escapeHtml(m.label || '')}</span>
          <span class="report-metric-value">${escapeHtml(String(m.value !== undefined ? m.value : 0))}</span>
          ${m.subtext ? `<span class="report-metric-subtext">${escapeHtml(m.subtext)}</span>` : ''}
        </div>
      `).join('');
    }

    // 2. Visual Analytics / Chart
    renderReportChart(data.chart);

    // 3. Primary Data Table
    renderReportTable(data.table_headers, data.table_rows, data.empty);

    // 4. Secondary Breakdown Section
    renderSecondarySections(data);

    // 5. Notes & Metadata
    const notesContent = document.getElementById('previewNotesContent');
    if (notesContent && data.notes) {
      notesContent.textContent = data.notes;
    }
  }

  function renderReportChart(chartConfig) {
    const chartSection = document.getElementById('previewChartSection');
    const canvas = document.getElementById('reportChartCanvas');

    if (currentReportChart) {
      currentReportChart.destroy();
      currentReportChart = null;
    }

    if (!chartConfig || !chartConfig.labels || chartConfig.labels.length === 0) {
      if (chartSection) chartSection.style.display = 'none';
      return;
    }

    if (chartSection) chartSection.style.display = 'block';

    const ctx = canvas.getContext('2d');
    const defaultColors = ['#22C55E', '#C9A227', '#38BDF8', '#F59E0B', '#EF4444', '#A855F7', '#EC4899'];

    const datasets = (chartConfig.datasets || []).map((ds, idx) => ({
      label: ds.label || 'Count',
      data: ds.data || [],
      backgroundColor: ds.backgroundColor || defaultColors[idx % defaultColors.length],
      borderColor: '#151A21',
      borderWidth: 1,
      borderRadius: 4
    }));

    currentReportChart = new Chart(ctx, {
      type: chartConfig.type || 'bar',
      data: {
        labels: chartConfig.labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'top',
            labels: { color: '#94A3B8', boxWidth: 12, padding: 12 }
          },
          tooltip: {
            backgroundColor: '#1E2530',
            titleColor: '#F8FAFC',
            bodyColor: '#CBD5E1',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#94A3B8' }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#94A3B8', precision: 0 }
          }
        }
      }
    });
  }

  function renderReportTable(headers, rows, isEmpty) {
    const thead = document.getElementById('previewTableHead');
    const tbody = document.getElementById('previewTableBody');
    const countBadge = document.getElementById('previewTableCount');

    if (!thead || !tbody) return;

    thead.innerHTML = `<tr>${(headers || []).map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;

    if (isEmpty || !rows || rows.length === 0) {
      if (countBadge) countBadge.textContent = '0 records found';
      tbody.innerHTML = `
        <tr class="report-empty-row">
          <td colspan="${headers?.length || 1}" class="report-table-empty-cell">
            <div class="reports-empty-notice">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
              <span>No records found for the selected filters.</span>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    if (countBadge) {
      countBadge.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} found`;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        ${r.map((cell, idx) => {
          let cellStr = cell !== null && cell !== undefined ? String(cell) : '—';
          let alignClass = '';
          if (idx === 0) alignClass = 'style="font-weight: 500;"';
          if (cellStr === 'Active' || cellStr === 'Paid' || cellStr === 'Present') {
            cellStr = `<span class="report-badge badge-active">${escapeHtml(cellStr)}</span>`;
          } else if (cellStr === 'Inactive' || cellStr === 'Absent' || cellStr === 'Overdue') {
            cellStr = `<span class="report-badge badge-danger">${escapeHtml(cellStr)}</span>`;
          } else if (cellStr === 'Unpaid') {
            cellStr = `<span class="report-badge badge-amber">${escapeHtml(cellStr)}</span>`;
          } else {
            cellStr = escapeHtml(cellStr);
          }
          return `<td ${alignClass}>${cellStr}</td>`;
        }).join('')}
      </tr>
    `).join('');
  }

  function renderSecondarySections(data) {
    const secArea = document.getElementById('previewSecondarySection');
    if (!secArea) return;

    secArea.innerHTML = '';
    secArea.style.display = 'none';

    // 1. Batch Summary Section (Student & Batch report)
    if (data.batch_summary && data.batch_summary.rows && data.batch_summary.rows.length > 0) {
      secArea.style.display = 'block';
      secArea.innerHTML = `
        <div class="report-table-section">
          <div class="report-table-header">
            <span class="report-table-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
              </svg>
              ${escapeHtml(data.batch_summary.title || 'Batch Enrollment & Capacity Summary')}
            </span>
            <span class="report-table-count">${data.batch_summary.rows.length} batches</span>
          </div>
          <div class="report-table-wrapper">
            <table class="report-data-table">
              <thead>
                <tr>${data.batch_summary.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${data.batch_summary.rows.map(r => `
                  <tr>
                    ${r.map((c, i) => `<td ${i === 0 ? 'style="font-weight: 500;"' : ''}>${escapeHtml(String(c))}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 2. Compact Breakdowns (Fees & Payments report)
    else if (data.compact_views) {
      secArea.style.display = 'block';
      const pm = data.compact_views.payment_methods;
      const mt = data.compact_views.monthly_trend;

      let subHtml = '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">';

      if (pm && pm.rows) {
        subHtml += `
          <div class="report-table-section">
            <div class="report-table-header">
              <span class="report-table-title">${escapeHtml(pm.title || 'Payment Methods')}</span>
            </div>
            <div class="report-table-wrapper">
              <table class="report-data-table">
                <thead><tr>${pm.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                <tbody>${pm.rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
        `;
      }

      if (mt && mt.rows) {
        subHtml += `
          <div class="report-table-section">
            <div class="report-table-header">
              <span class="report-table-title">${escapeHtml(mt.title || 'Monthly Trend')}</span>
            </div>
            <div class="report-table-wrapper">
              <table class="report-data-table">
                <thead><tr>${mt.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                <tbody>${mt.rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
              </table>
            </div>
          </div>
        `;
      }

      subHtml += '</div>';
      secArea.innerHTML = subHtml;
    }

    // 3. Movement History & Audit Log (Inventory report)
    else if (data.secondary_table && data.secondary_table.rows && data.secondary_table.rows.length > 0) {
      secArea.style.display = 'block';
      const st = data.secondary_table;
      secArea.innerHTML = `
        <div class="report-table-section">
          <div class="report-table-header">
            <span class="report-table-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${escapeHtml(st.title || 'Movement History & Audit Log')}
            </span>
            <span class="report-table-count">${st.rows.length} log entries</span>
          </div>
          <div class="report-table-wrapper">
            <table class="report-data-table">
              <thead><tr>${st.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
              <tbody>
                ${st.rows.map(r => `
                  <tr>${r.map((c, i) => `<td ${i === 0 ? 'style="font-family:monospace; font-size:0.85rem;"' : ''}>${escapeHtml(String(c))}</td>`).join('')}</tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
