/**
 * VAVA Sports Academy - Dashboard Overview Module
 * Handles real-time KPI aggregations, attendance analytics, financial collections,
 * active batches, recent activity log and Chart.js visualization.
 */

(function () {
  'use strict';

  // Module-scoped chart instances and state
  let attendanceChartInstance = null;
  let financialChartInstance = null;
  let isDashboardLoading = false;
  let quickActionsBound = false;
  let clickableNavigationBound = false;
  let isChartLegendInteracting = false;

  // ============================================================================
  // 1. UTILITY & FORMATTING HELPERS
  // ============================================================================

  function isCurrentCoach() {
    const storedRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
    return storedRole === 'coach';
  }

  function goToSection(targetHash) {
    if (!targetHash) return;
    if (typeof navigateToSection === 'function') {
      navigateToSection(targetHash, true);
    }
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }

  async function openSpecificReport(reportId) {
    if (reportId === 'fees_payments' && isCurrentCoach()) {
      return;
    }
    goToSection('#reports');
    if (typeof initReportsModule === 'function') {
      try {
        await initReportsModule();
      } catch (err) {
        console.warn(`Error initializing reports module for ${reportId} view:`, err);
      }
    }
    if (typeof window.openReportPreview === 'function') {
      window.openReportPreview(reportId);
    }
  }

  async function openActivityReport() {
    await openSpecificReport('activity_report');
  }

  async function openAttendanceReport() {
    await openSpecificReport('attendance_report');
  }

  async function openFeesReport() {
    await openSpecificReport('fees_payments');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '₹0';
    return '₹' + Number(amount || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    });
  }

  function getFormattedCurrentDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    try {
      return new Date().toLocaleDateString('en-US', options);
    } catch (e) {
      return new Date().toDateString();
    }
  }

  function formatActivityTime(raw) {
    if (!raw) return '—';
    try {
      const d = new Date(raw.replace(' ', 'T'));
      if (isNaN(d.getTime())) return raw;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
             d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (e) {
      return raw;
    }
  }

  function getModuleBadgeClass(moduleName) {
    const mod = (moduleName || '').toLowerCase().trim();
    if (mod.includes('student')) return 'dash-act-students';
    if (mod.includes('batch')) return 'dash-act-batches';
    if (mod.includes('attendance')) return 'dash-act-attendance';
    if (mod.includes('fee') || mod.includes('payment')) return 'dash-act-fees';
    if (mod.includes('coach')) return 'dash-act-coaches';
    if (mod.includes('inventory')) return 'dash-act-inventory';
    return 'dash-act-system';
  }

  function cleanChartInstances() {
    if (attendanceChartInstance) {
      try {
        attendanceChartInstance.destroy();
      } catch (e) {
        console.warn('Error destroying attendanceChartInstance:', e);
      }
      attendanceChartInstance = null;
    }
    if (financialChartInstance) {
      try {
        financialChartInstance.destroy();
      } catch (e) {
        console.warn('Error destroying financialChartInstance:', e);
      }
      financialChartInstance = null;
    }
  }

  // ============================================================================
  // 2. QUICK ACTIONS & CLICKABLE NAVIGATION BINDINGS
  // ============================================================================

  function bindQuickActionButtons() {
    if (quickActionsBound) return;
    quickActionsBound = true;

    // Super Admin Quick Actions
    const btnAddStudent = document.getElementById('btnDashAddStudent');
    if (btnAddStudent) {
      btnAddStudent.addEventListener('click', () => {
        if (typeof openRegForm === 'function') {
          openRegForm();
        } else if (typeof openModal === 'function') {
          openModal('addStudentModal');
        }
      });
    }

    const btnAddCoach = document.getElementById('btnDashAddCoach');
    if (btnAddCoach) {
      btnAddCoach.addEventListener('click', () => {
        if (typeof openCoachForm === 'function') {
          openCoachForm();
        } else if (typeof openModal === 'function') {
          openModal('addCoachModal');
        }
      });
    }

    const btnAddBatch = document.getElementById('btnDashAddBatch');
    if (btnAddBatch) {
      btnAddBatch.addEventListener('click', async () => {
        if (typeof populateCoachDropdowns === 'function') {
          await populateCoachDropdowns();
        }
        if (typeof openModal === 'function') {
          openModal('addBatchModal');
        }
      });
    }

    // Coach Quick Actions (Preserved)
    const btnCoachTakeAttendance = document.getElementById('btnDashCoachTakeAttendance');
    if (btnCoachTakeAttendance) {
      btnCoachTakeAttendance.addEventListener('click', () => {
        goToSection('#attendance');
      });
    }

    const btnCoachViewBatches = document.getElementById('btnDashCoachViewBatches');
    if (btnCoachViewBatches) {
      btnCoachViewBatches.addEventListener('click', () => {
        goToSection('#batches');
      });
    }

    const btnCoachViewStudents = document.getElementById('btnDashCoachViewStudents');
    if (btnCoachViewStudents) {
      btnCoachViewStudents.addEventListener('click', () => {
        goToSection('#students');
      });
    }

    // Retry Button
    const btnRetry = document.getElementById('btnDashRetry');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        loadDashboardOverview();
      });
    }
  }

  function bindClickableNavigation() {
    if (clickableNavigationBound) return;
    clickableNavigationBound = true;

    function attachNavClick(el, destinationFn) {
      if (!el) return;
      el.addEventListener('click', (e) => {
        // If clicking on an internal link or button, let that element handle it directly
        if (e.target.closest('button, a, .dash-panel-link') && e.target.closest('button, a, .dash-panel-link') !== el) {
          return;
        }
        destinationFn(e);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          destinationFn(e);
        }
      });
    }

    // 1. KPI 1: Students -> #students
    const cardStudents = document.getElementById('cardKpiStudents');
    attachNavClick(cardStudents, () => goToSection('#students'));

    // 2. KPI 2: Coaches -> #coaches (Admin) / #batches (Coach - My Batches)
    const cardCoaches = document.getElementById('cardKpiCoaches');
    attachNavClick(cardCoaches, () => {
      goToSection(isCurrentCoach() ? '#batches' : '#coaches');
    });

    // 3. KPI 3: Batches -> #batches (Admin) / #attendance (Coach - Today's sessions)
    const cardBatches = document.getElementById('cardKpiBatches');
    attachNavClick(cardBatches, () => {
      goToSection(isCurrentCoach() ? '#attendance' : '#batches');
    });

    // 4. KPI 4: Today's Attendance -> #attendance
    const cardAttendance = document.getElementById('cardKpiAttendance');
    attachNavClick(cardAttendance, () => goToSection('#attendance'));

    // 5. Attendance Overview Card & Trend Chart -> Reports -> Attendance Report
    const panelAttendance = document.getElementById('panelAttendanceOverview');
    attachNavClick(panelAttendance, () => {
      if (isChartLegendInteracting) return;
      openAttendanceReport();
    });

    // 6. Financial Overview Card -> Reports -> Fees & Payments Report (Super Admin strictly)
    const panelFinancial = document.getElementById('panelFinancialOverview');
    attachNavClick(panelFinancial, () => {
      if (!isCurrentCoach()) {
        openFeesReport();
      }
    });

    const linkManageFees = document.getElementById('linkDashManageFees');
    if (linkManageFees) {
      linkManageFees.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isCurrentCoach()) {
          openFeesReport();
        }
      });
    }

    // 7. Active Batches Overview -> #batches
    const panelBatches = document.getElementById('panelBatchesOverview');
    attachNavClick(panelBatches, () => goToSection('#batches'));

    const linkViewBatches = document.getElementById('linkDashViewBatches');
    if (linkViewBatches) {
      linkViewBatches.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToSection('#batches');
      });
    }

    // 8. Recent Activity Overview & Full Audit -> Activity Report
    const panelActivity = document.getElementById('panelActivityOverview');
    attachNavClick(panelActivity, () => openActivityReport());

    const linkFullAudit = document.getElementById('linkDashFullAudit');
    if (linkFullAudit) {
      linkFullAudit.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openActivityReport();
      });
    }
  }

  // ============================================================================
  // 3. MAIN DASHBOARD DATA RETRIEVAL
  // ============================================================================

  async function loadDashboardOverview() {
    if (isDashboardLoading) return;
    isDashboardLoading = true;

    const loadingState = document.getElementById('dashLoadingState');
    const errorState = document.getElementById('dashErrorState');
    const mainContent = document.getElementById('dashMainContent');

    if (loadingState) loadingState.style.display = 'block';
    if (errorState) errorState.style.display = 'none';

    // Gather verified authentication credentials from storage
    const storedRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
    const storedEmail = localStorage.getItem('vava_email') || localStorage.getItem('vava_user_email') || '';
    let coachId = localStorage.getItem('vava_coach_id') || '0';
    let userName = 'Administrator';

    try {
      const u = JSON.parse(localStorage.getItem('vava_user') || '{}');
      if (u.coach_id) coachId = u.coach_id;
      if (u.name) userName = u.name;
      else if (u.full_name) userName = u.full_name;
    } catch (e) {}

    // Resolve API endpoint URL (supports Apache and Live Server)
    const endpointUrl = (typeof getApiEndpoint === 'function')
      ? getApiEndpoint('dashboard')
      : 'server/dashboard.php';

    try {
      const response = await fetch(endpointUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VAVA-Role': storedRole,
          'X-VAVA-Email': storedEmail,
          'X-VAVA-Coach-ID': String(coachId)
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. You do not have permission to view the academy dashboard.');
        } else if (response.status === 401) {
          throw new Error('Authentication required. Please log in again to continue.');
        } else {
          throw new Error(`Server returned HTTP ${response.status} while fetching dashboard data.`);
        }
      }

      const res = await response.json();
      if (!res.success) {
        throw new Error(res.error || 'Failed to retrieve dashboard analytics.');
      }

      // Render dashboard with verified data
      renderDashboard(res.data || res, storedRole, userName);

      if (loadingState) loadingState.style.display = 'none';
      if (mainContent) mainContent.style.display = 'block';
    } catch (err) {
      console.error('Error loading dashboard overview:', err);
      if (loadingState) loadingState.style.display = 'none';
      if (mainContent) mainContent.style.display = 'none';
      if (errorState) {
        errorState.style.display = 'block';
        const msgEl = document.getElementById('dashErrorMsg');
        if (msgEl) msgEl.textContent = err.message || 'An unexpected error occurred while loading dashboard metrics.';
      }
    } finally {
      isDashboardLoading = false;
    }
  }

  // ============================================================================
  // 4. RENDERING ORCHESTRATION
  // ============================================================================

  function renderDashboard(data, currentRole, fallbackUserName) {
    bindQuickActionButtons();
    bindClickableNavigation();

    const isCoach = (data.role === 'coach' || currentRole === 'coach');

    // 1. Welcome Card
    renderWelcomeSection(data, isCoach, fallbackUserName);

    // 2. KPI Cards
    renderKpiCards(data, isCoach);

    // 3. Attendance Overview & Chart
    renderAttendanceOverview(data.attendance);

    // 4. Financial Overview (Super Admin strictly)
    renderFinancialOverview(data.financial, isCoach);

    // 5. Active Batches Overview
    renderBatchesOverview(data.batches);

    // 6. Recent Activity Log
    renderActivityOverview(data.recent_activity);
  }

  // ----------------------------------------------------------------------------
  // A. Welcome Section
  // ----------------------------------------------------------------------------
  function renderWelcomeSection(data, isCoach, fallbackUserName) {
    const welcomeName = document.getElementById('dashWelcomeName');
    const currentDate = document.getElementById('dashCurrentDate');
    const roleBadge = document.getElementById('dashRoleBadge');
    const adminActions = document.getElementById('dashAdminActions');
    const coachActions = document.getElementById('dashCoachActions');

    const displayName = data.user_name || fallbackUserName || (isCoach ? 'Coach' : 'Administrator');
    if (welcomeName) welcomeName.textContent = displayName;
    if (currentDate) currentDate.textContent = getFormattedCurrentDate();

    if (roleBadge) {
      roleBadge.textContent = isCoach ? 'Coach Operations Console' : 'Super Admin Console';
    }

    if (isCoach) {
      if (adminActions) adminActions.style.display = 'none';
      if (coachActions) coachActions.style.display = 'flex';
    } else {
      if (adminActions) adminActions.style.display = 'flex';
      if (coachActions) coachActions.style.display = 'none';
    }
  }

  // ----------------------------------------------------------------------------
  // B. KPI Cards
  // ----------------------------------------------------------------------------
  function renderKpiCards(data, isCoach) {
    const kpis = data.kpis || {};
    const att = data.attendance || {};

    // 1. Students KPI
    const labelStudents = document.getElementById('labelKpiStudents');
    const valStudentsTotal = document.getElementById('dashKpiStudentsTotal');
    const valStudentsActive = document.getElementById('dashKpiStudentsActive');
    const subStudents = document.getElementById('dashKpiStudentsSub');

    if (valStudentsTotal) valStudentsTotal.textContent = kpis.students?.total ?? 0;
    if (valStudentsActive) valStudentsActive.textContent = kpis.students?.active ?? 0;
    if (labelStudents) labelStudents.textContent = isCoach ? 'MY ATHLETES' : 'TOTAL STUDENTS';
    if (subStudents) subStudents.textContent = isCoach ? 'Assigned Enrolled' : 'Enrolled Athletes';

    // 2. Coaches / Batches Scoped KPI
    const cardCoaches = document.getElementById('cardKpiCoaches');
    const labelCoaches = document.getElementById('labelKpiCoaches');
    const valCoachesTotal = document.getElementById('dashKpiCoachesTotal');
    const valCoachesActive = document.getElementById('dashKpiCoachesActive');
    const subCoaches = document.getElementById('dashKpiCoachesSub');

    if (isCoach) {
      if (labelCoaches) labelCoaches.textContent = 'MY BATCHES';
      if (valCoachesTotal) valCoachesTotal.textContent = kpis.batches?.total ?? 0;
      if (valCoachesActive) valCoachesActive.textContent = kpis.batches?.active ?? 0;
      if (subCoaches) subCoaches.textContent = 'Assigned Programs';
    } else {
      if (labelCoaches) labelCoaches.textContent = 'TOTAL COACHES';
      if (valCoachesTotal) valCoachesTotal.textContent = kpis.coaches?.total ?? 0;
      if (valCoachesActive) valCoachesActive.textContent = kpis.coaches?.active ?? 0;
      if (subCoaches) subCoaches.textContent = 'Certified Staff';
    }

    // 3. Batches / Sessions KPI
    const labelBatches = document.getElementById('labelKpiBatches');
    const valBatchesTotal = document.getElementById('dashKpiBatchesTotal');
    const valBatchesActive = document.getElementById('dashKpiBatchesActive');
    const subBatches = document.getElementById('dashKpiBatchesSub');

    if (isCoach) {
      if (labelBatches) labelBatches.textContent = "TODAY'S SESSIONS";
      if (valBatchesTotal) valBatchesTotal.textContent = att.batches_marked ?? 0;
      const checkedIn = (att.present_today || 0) + (att.absent_today || 0);
      if (valBatchesActive) valBatchesActive.textContent = checkedIn;
      if (subBatches) subBatches.textContent = 'Athletes Checked In';
    } else {
      if (labelBatches) labelBatches.textContent = 'TOTAL BATCHES';
      if (valBatchesTotal) valBatchesTotal.textContent = kpis.batches?.total ?? 0;
      if (valBatchesActive) valBatchesActive.textContent = kpis.batches?.active ?? 0;
      if (subBatches) subBatches.textContent = 'Training Programs';
    }

    // 4. Today's Attendance KPI
    const valAttRate = document.getElementById('dashKpiAttRate');
    const badgeAtt = document.getElementById('dashKpiAttBadge');
    const countsAtt = document.getElementById('dashKpiAttCounts');

    const present = att.present_today || 0;
    const absent = att.absent_today || 0;
    const totalToday = present + absent;

    if (totalToday === 0 || att.session_status === 'none' || att.attendance_rate === null) {
      if (valAttRate) valAttRate.textContent = '--';
      if (badgeAtt) {
        badgeAtt.className = 'dash-kpi-badge badge-neutral';
        badgeAtt.textContent = 'No Sessions';
      }
      if (countsAtt) countsAtt.textContent = 'No Sessions Today';
    } else {
      if (valAttRate) valAttRate.textContent = `${att.attendance_rate}%`;
      if (badgeAtt) {
        badgeAtt.className = 'dash-kpi-badge badge-active';
        badgeAtt.textContent = `${att.batches_marked} Batches`;
      }
      if (countsAtt) countsAtt.textContent = `${present} Present • ${absent} Absent`;
    }
  }

  // ----------------------------------------------------------------------------
  // C. Attendance Overview & Chart
  // ----------------------------------------------------------------------------
  function renderAttendanceOverview(att) {
    if (!att) return;

    const presentEl = document.getElementById('dashAttPresent');
    const absentEl = document.getElementById('dashAttAbsent');
    const batchesEl = document.getElementById('dashAttBatches');
    const statusEl = document.getElementById('dashAttSessionStatus');
    const pillEl = document.getElementById('dashAttLivePill');

    const present = att.present_today || 0;
    const absent = att.absent_today || 0;
    const batches = att.batches_marked || 0;

    if (presentEl) presentEl.textContent = present;
    if (absentEl) absentEl.textContent = absent;
    if (batchesEl) batchesEl.textContent = batches;
    if (pillEl) pillEl.textContent = `${batches} Batches Marked`;

    if (statusEl) {
      if (batches === 0 || (present + absent) === 0 || att.attendance_rate === null) {
        statusEl.textContent = 'No Sessions Recorded Today';
        statusEl.className = 'dash-ribbon-val';
      } else {
        statusEl.textContent = `${att.attendance_rate}% Attendance`;
        statusEl.className = 'dash-ribbon-val text-success';
      }
    }

    // Render 7-day Attendance Trend Chart
    renderAttendanceChart(att.seven_day_trend || []);
  }

  function renderAttendanceChart(trendData) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js library is not loaded. Skipping attendance chart render.');
      return;
    }

    const canvas = document.getElementById('dashAttendanceChart');
    const emptyState = document.getElementById('dashAttChartEmpty');
    if (!canvas) return;

    // Clean previous Chart.js instance to prevent memory leaks and duplicate renders
    if (attendanceChartInstance) {
      attendanceChartInstance.destroy();
      attendanceChartInstance = null;
    }

    if (!trendData || trendData.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      canvas.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    canvas.style.display = 'block';

    const labels = trendData.map(d => d.date_formatted);
    const presentData = trendData.map(d => d.present);
    const absentData = trendData.map(d => d.absent);

    const ctx = canvas.getContext('2d');
    attendanceChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Present',
            data: presentData,
            backgroundColor: 'rgba(34, 197, 94, 0.85)',
            borderColor: '#22C55E',
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 28
          },
          {
            label: 'Absent',
            data: absentData,
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderColor: '#EF4444',
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 28
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#A7AFBC',
              boxWidth: 12,
              padding: 12,
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 }
            },
            onClick: (e, legendItem, legend) => {
              isChartLegendInteracting = true;
              setTimeout(() => { isChartLegendInteracting = false; }, 350);
              const index = legendItem.datasetIndex;
              const ci = legend.chart;
              if (ci.isDatasetVisible(index)) {
                ci.hide(index);
                legendItem.hidden = true;
              } else {
                ci.show(index);
                legendItem.hidden = false;
              }
            }
          },
          tooltip: {
            backgroundColor: '#1B2028',
            titleColor: '#FFFFFF',
            bodyColor: '#A7AFBC',
            borderColor: 'rgba(201, 162, 39, 0.3)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              footer: (items) => {
                let total = 0;
                items.forEach(i => { total += (i.raw || 0); });
                return `Total Attendees: ${total}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#737C89', font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#737C89', precision: 0, font: { size: 11 } }
          }
        }
      }
    });

    // Intercept clicks directly on the legend items to toggle datasets without triggering card navigation
    canvas.onclick = (e) => {
      if (attendanceChartInstance && attendanceChartInstance.legend) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hitBoxes = attendanceChartInstance.legend.legendHitBoxes || [];
        const isLegendHit = hitBoxes.some(box => (
          x >= (box.left - 4) &&
          x <= (box.left + box.width + 4) &&
          y >= (box.top - 4) &&
          y <= (box.top + box.height + 4)
        ));
        if (isLegendHit) {
          isChartLegendInteracting = true;
          setTimeout(() => { isChartLegendInteracting = false; }, 350);
          e.stopPropagation();
        }
      }
    };
  }

  // ----------------------------------------------------------------------------
  // D. Financial Overview (Super Admin Strictly)
  // ----------------------------------------------------------------------------
  function renderFinancialOverview(financial, isCoach) {
    const finPanel = document.getElementById('panelFinancialOverview');
    if (!finPanel) return;

    // Zero financial exposure to coaches
    if (isCoach || !financial) {
      finPanel.style.display = 'none';
      if (financialChartInstance) {
        financialChartInstance.destroy();
        financialChartInstance = null;
      }
      return;
    }

    finPanel.style.display = 'flex';

    const colEl = document.getElementById('dashFinCollected');
    const outEl = document.getElementById('dashFinOutstanding');
    const ovrEl = document.getElementById('dashFinOverdue');

    if (colEl) colEl.textContent = formatCurrency(financial.collected_this_month);
    if (outEl) outEl.textContent = formatCurrency(financial.total_outstanding);
    if (ovrEl) ovrEl.textContent = formatCurrency(financial.total_overdue);

    // 6-month collection trend chart
    renderFinancialChart(financial.six_month_trend || []);
  }

  function renderFinancialChart(trendData) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js library is not loaded. Skipping financial chart render.');
      return;
    }

    const canvas = document.getElementById('dashFinancialChart');
    const emptyState = document.getElementById('dashFinChartEmpty');
    if (!canvas) return;

    if (financialChartInstance) {
      financialChartInstance.destroy();
      financialChartInstance = null;
    }

    if (!trendData || trendData.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      canvas.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    canvas.style.display = 'block';

    const labels = trendData.map(m => m.month_label);
    const amounts = trendData.map(m => m.collected);

    const ctx = canvas.getContext('2d');

    // Create subtle gold metallic gradient for area fill
    let gradientFill = 'rgba(201, 162, 39, 0.12)';
    try {
      const gradient = ctx.createLinearGradient(0, 0, 0, 240);
      gradient.addColorStop(0, 'rgba(201, 162, 39, 0.28)');
      gradient.addColorStop(1, 'rgba(201, 162, 39, 0.01)');
      gradientFill = gradient;
    } catch (e) {}

    financialChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Fees Collected',
            data: amounts,
            borderColor: '#C9A227',
            borderWidth: 2.5,
            backgroundColor: gradientFill,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#F4D76A',
            pointBorderColor: '#090B0D',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1B2028',
            titleColor: '#FFFFFF',
            bodyColor: '#A7AFBC',
            borderColor: 'rgba(201, 162, 39, 0.3)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => `Collected: ${formatCurrency(item.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#737C89', font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: {
              color: '#737C89',
              font: { size: 11 },
              callback: (val) => formatCurrency(val)
            }
          }
        }
      }
    });
  }

  // ----------------------------------------------------------------------------
  // E. Active Batches Overview
  // ----------------------------------------------------------------------------
  function renderBatchesOverview(batchesData) {
    const tbody = document.getElementById('dashBatchTableBody');
    const emptyState = document.getElementById('dashBatchesEmpty');
    const titleEl = document.getElementById('dashBatchesTitle');

    if (!tbody) return;
    tbody.innerHTML = '';

    const list = Array.isArray(batchesData) ? batchesData : (batchesData?.list || []);
    if (list.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    list.forEach(b => {
      const studentCount = Number(b.student_count || 0);
      const maxCapacity = Number(b.max_capacity || 0);
      const pct = maxCapacity > 0 ? Math.min(100, Math.round((studentCount / maxCapacity) * 100)) : 0;

      // Color progress based on utilization
      let progressColor = 'var(--gradient-gold-metallic)';
      if (pct >= 90) {
        progressColor = 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)';
      } else if (pct >= 75) {
        progressColor = 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)';
      }

      const branchName = (typeof formatBranchLabel === 'function')
        ? formatBranchLabel(b.branch)
        : (b.branch || '—');

      const timeStr = (typeof formatBatchTime === 'function' && b.start_time)
        ? `${formatBatchTime(b.start_time)} - ${formatBatchTime(b.end_time)}`
        : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="dash-batch-name">${escapeHtml(b.batch_name)}</div>
          <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(b.sport || 'General Sports')}</div>
        </td>
        <td>
          <div style="font-weight: 500; color: #FFFFFF;">${escapeHtml(b.coach_name || 'Unassigned')}</div>
        </td>
        <td>
          <div>${escapeHtml(branchName)}</div>
          <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(timeStr)}</div>
        </td>
        <td>
          <span style="font-weight:700; color:#FFFFFF;">${studentCount}</span>
          <span style="color:var(--text-muted); font-size:0.75rem;"> athletes</span>
        </td>
        <td style="text-align:right;">
          <div class="dash-capacity-wrap">
            <div class="dash-progress-track">
              <div class="dash-progress-fill" style="width: ${pct}%; background: ${progressColor};"></div>
            </div>
            <span class="dash-capacity-text">${studentCount} / ${maxCapacity}</span>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ----------------------------------------------------------------------------
  // F. Recent Activity Timeline
  // ----------------------------------------------------------------------------
  function renderActivityOverview(activityData) {
    const timeline = document.getElementById('dashActivityTimeline');
    const emptyState = document.getElementById('dashActivityEmpty');

    if (!timeline) return;
    timeline.innerHTML = '';

    const list = Array.isArray(activityData) ? activityData : (activityData?.list || []);
    if (list.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    list.forEach(item => {
      const badgeClass = getModuleBadgeClass(item.module);
      const actorName = item.actor_name || item.user_name || 'System';
      const targetStr = item.target_name ? `<span class="dash-act-target"> • ${escapeHtml(item.target_name)}</span>` : '';
      const actionText = item.action || item.description || item.action_type || 'Activity recorded';

      const div = document.createElement('div');
      div.className = 'dash-activity-item';
      div.innerHTML = `
        <span class="dash-act-badge ${badgeClass}">${escapeHtml(item.module || 'SYSTEM')}</span>
        <div class="dash-act-body">
          <div class="dash-act-action">
            ${escapeHtml(actionText)}
            ${targetStr}
          </div>
          <div class="dash-act-meta">
            <span class="dash-act-actor">${escapeHtml(actorName)}</span>
            <span>•</span>
            <span>${formatActivityTime(item.formatted_time || item.created_at)}</span>
          </div>
        </div>
      `;
      timeline.appendChild(div);
    });
  }

  // ============================================================================
  // 5. GLOBAL ATTACHMENT & INITIALIZATION
  // ============================================================================

  window.loadDashboardOverview = loadDashboardOverview;
  window.cleanDashboardCharts = cleanChartInstances;

  document.addEventListener('DOMContentLoaded', () => {
    // If handleHashRoute exists in navigation.js, invoke it
    if (typeof handleHashRoute === 'function') {
      handleHashRoute();
    } else {
      // Direct fallback
      const hash = window.location.hash || '#overview';
      if (hash === '#overview' || hash === '' || hash === '#branches') {
        loadDashboardOverview();
      }
    }
  });

})();
