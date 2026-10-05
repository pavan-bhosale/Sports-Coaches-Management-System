/**
 * VAVA Sports Academy - Dashboard Overview Module
 * Handles role-based dashboard rendering:
 * 1. Super Admin Dashboard (Academy-wide operations, KPIs, financial analytics, batches, activity log)
 * 2. Coach Dashboard (Assigned batches, athletes, batch capacity, today's sessions, attendance trend)
 * 3. Student Dashboard (Personal athlete portal, training details, attendance rate, session history)
 */

(function () {
  'use strict';

  // Module-scoped chart instances and state
  let attendanceChartInstance = null;
  let financialChartInstance = null;
  let coachAttendanceChartInstance = null;
  let studentAttendanceChartInstance = null;

  let isDashboardLoading = false;
  let quickActionsBound = false;
  let coachActionsBound = false;
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

  function getInitials(name, fallback = 'U') {
    if (!name || typeof name !== 'string') return fallback;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].substring(0, 2).toUpperCase();
    } else if (parts.length === 1) {
      return parts[0].toUpperCase();
    }
    return fallback;
  }

  function cleanChartInstances() {
    if (attendanceChartInstance) {
      try { attendanceChartInstance.destroy(); } catch (e) {}
      attendanceChartInstance = null;
    }
    if (financialChartInstance) {
      try { financialChartInstance.destroy(); } catch (e) {}
      financialChartInstance = null;
    }
    if (coachAttendanceChartInstance) {
      try { coachAttendanceChartInstance.destroy(); } catch (e) {}
      coachAttendanceChartInstance = null;
    }
    if (studentAttendanceChartInstance) {
      try { studentAttendanceChartInstance.destroy(); } catch (e) {}
      studentAttendanceChartInstance = null;
    }
  }

  // ============================================================================
  // 2. QUICK ACTIONS & CLICKABLE NAVIGATION BINDINGS
  // ============================================================================

  function bindSuperAdminQuickActions() {
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

    // Legacy Coach Quick Actions (in SuperAdmin view header if shown)
    const btnCoachTakeAttendance = document.getElementById('btnDashCoachTakeAttendance');
    if (btnCoachTakeAttendance) {
      btnCoachTakeAttendance.addEventListener('click', () => goToSection('#attendance'));
    }
    const btnCoachViewBatches = document.getElementById('btnDashCoachViewBatches');
    if (btnCoachViewBatches) {
      btnCoachViewBatches.addEventListener('click', () => goToSection('#batches'));
    }
    const btnCoachViewStudents = document.getElementById('btnDashCoachViewStudents');
    if (btnCoachViewStudents) {
      btnCoachViewStudents.addEventListener('click', () => goToSection('#students'));
    }

    // Retry Button
    const btnRetry = document.getElementById('btnDashRetry');
    if (btnRetry) {
      btnRetry.addEventListener('click', () => loadDashboardOverview());
    }
  }

  function bindCoachQuickActions() {
    if (coachActionsBound) return;
    coachActionsBound = true;

    const btnTakeAtt = document.getElementById('btnCoachTakeAttendanceDirect');
    if (btnTakeAtt) {
      btnTakeAtt.addEventListener('click', () => goToSection('#attendance'));
    }

    const btnBatches = document.getElementById('btnCoachViewBatchesDirect');
    if (btnBatches) {
      btnBatches.addEventListener('click', () => goToSection('#batches'));
    }

    const btnStudents = document.getElementById('btnCoachViewStudentsDirect');
    if (btnStudents) {
      btnStudents.addEventListener('click', () => goToSection('#students'));
    }
  }

  function bindSuperAdminClickableNavigation() {
    if (clickableNavigationBound) return;
    clickableNavigationBound = true;

    function attachNavClick(el, destinationFn) {
      if (!el) return;
      el.addEventListener('click', (e) => {
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

    // 2. KPI 2: Coaches -> #coaches
    const cardCoaches = document.getElementById('cardKpiCoaches');
    attachNavClick(cardCoaches, () => goToSection('#coaches'));

    // 3. KPI 3: Batches -> #batches
    const cardBatches = document.getElementById('cardKpiBatches');
    attachNavClick(cardBatches, () => goToSection('#batches'));

    // 4. KPI 4: Today's Attendance -> #attendance
    const cardAttendance = document.getElementById('cardKpiAttendance');
    attachNavClick(cardAttendance, () => goToSection('#attendance'));

    // 5. Attendance Overview Card -> Reports -> Attendance Report
    const panelAttendance = document.getElementById('panelAttendanceOverview');
    attachNavClick(panelAttendance, () => {
      if (isChartLegendInteracting) return;
      openAttendanceReport();
    });

    // 6. Financial Overview Card -> Reports -> Fees & Payments Report
    const panelFinancial = document.getElementById('panelFinancialOverview');
    attachNavClick(panelFinancial, () => openFeesReport());

    const linkManageFees = document.getElementById('linkDashManageFees');
    if (linkManageFees) {
      linkManageFees.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFeesReport();
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

    // 8. Recent Activity Overview -> Activity Report
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

  function bindCoachClickableNavigation() {
    function attachNavClick(el, destinationFn) {
      if (!el || el._navBound) return;
      el._navBound = true;
      el.addEventListener('click', (e) => {
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

    // Coach KPI Card 1: My Students -> #students
    const cardCoachStudents = document.getElementById('cardCoachKpiStudents');
    attachNavClick(cardCoachStudents, () => goToSection('#students'));

    // Coach KPI Card 2: My Batches -> #batches
    const cardCoachBatches = document.getElementById('cardCoachKpiBatches');
    attachNavClick(cardCoachBatches, () => goToSection('#batches'));

    // Coach KPI Card 3: Today's Attendance -> #attendance
    const cardCoachAtt = document.getElementById('cardCoachKpiAttendance');
    attachNavClick(cardCoachAtt, () => goToSection('#attendance'));

    // Coach KPI Card 4: Sessions Today -> #attendance
    const cardCoachSessions = document.getElementById('cardCoachKpiSessions');
    attachNavClick(cardCoachSessions, () => goToSection('#attendance'));

    // Coach Attendance Overview Panel -> #attendance
    const panelCoachAtt = document.getElementById('panelCoachAttendanceOverview');
    attachNavClick(panelCoachAtt, () => {
      if (isChartLegendInteracting) return;
      goToSection('#attendance');
    });

    // Coach Batches Panel -> #batches
    const panelCoachBatches = document.getElementById('panelCoachBatchesOverview');
    attachNavClick(panelCoachBatches, () => goToSection('#batches'));

    const linkCoachBatches = document.getElementById('linkCoachViewBatches');
    if (linkCoachBatches && !linkCoachBatches._navBound) {
      linkCoachBatches._navBound = true;
      linkCoachBatches.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToSection('#batches');
      });
    }

    // Coach Students Panel -> #students
    const panelCoachStudents = document.getElementById('panelCoachStudentsOverview');
    attachNavClick(panelCoachStudents, () => goToSection('#students'));

    const linkCoachStudents = document.getElementById('linkCoachViewStudents');
    if (linkCoachStudents && !linkCoachStudents._navBound) {
      linkCoachStudents._navBound = true;
      linkCoachStudents.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToSection('#students');
      });
    }
  }

  // ============================================================================
  // 3. MAIN DASHBOARD DATA RETRIEVAL (ROLE ROUTED)
  // ============================================================================

  async function loadDashboardOverview() {
    if (isDashboardLoading) return;
    isDashboardLoading = true;

    const loadingState = document.getElementById('dashLoadingState');
    const errorState = document.getElementById('dashErrorState');
    const mainContent = document.getElementById('dashMainContent');

    const superAdminView = document.getElementById('dashSuperAdminView');
    const coachView = document.getElementById('dashCoachView');
    const studentView = document.getElementById('dashStudentView');

    // Prevent any flash of previous/inappropriate dashboard views
    if (superAdminView) superAdminView.style.display = 'none';
    if (coachView) coachView.style.display = 'none';
    if (studentView) studentView.style.display = 'none';

    if (loadingState) loadingState.style.display = 'block';
    if (errorState) errorState.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';

    // Gather verified credentials from client storage
    const storedRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
    let storedEmail = localStorage.getItem('vava_email') || localStorage.getItem('vava_user_email') || '';
    let coachId = localStorage.getItem('vava_coach_id') || '0';
    let studentId = localStorage.getItem('vava_student_id') || '0';
    let userName = '';

    try {
      const u = JSON.parse(localStorage.getItem('vava_user') || '{}');
      if (!storedEmail && u.email) storedEmail = u.email;
      if (coachId === '0' && u.coach_id) coachId = u.coach_id;
      if (studentId === '0' && u.student_id) studentId = u.student_id;
      if (u.name) userName = u.name;
      else if (u.full_name) userName = u.full_name;
      else if (u.coach_name) userName = u.coach_name;
      else if (u.student_name) userName = u.student_name;
    } catch (e) {}

    // Resolve API endpoint URL
    const endpointUrl = (typeof getApiEndpoint === 'function')
      ? getApiEndpoint('dashboard')
      : 'server/dashboard.php';

    try {
      const response = await fetch(endpointUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-VAVA-Role': storedRole,
          'X-VAVA-Email': storedEmail,
          'X-VAVA-Coach-ID': String(coachId),
          'X-VAVA-Student-ID': String(studentId)
        }
      });

      if (!response.ok) {
        let errorMsg = `Server returned HTTP ${response.status} while compiling dashboard data.`;
        try {
          const errPayload = await response.json();
          if (errPayload && errPayload.error) {
            errorMsg = errPayload.error;
          }
        } catch (e) {
          if (response.status === 403) {
            errorMsg = 'Access denied. You do not have permission to view this dashboard.';
          } else if (response.status === 401) {
            errorMsg = 'Authentication required. Please log in again to continue.';
          }
        }
        throw new Error(errorMsg);
      }

      let res;
      try {
        res = await response.json();
      } catch (jsonErr) {
        throw new Error('Dashboard returned an invalid response.');
      }

      if (!res.success) {
        throw new Error(res.error || 'Failed to retrieve dashboard analytics.');
      }

      const payload = res.data || res;
      const verifiedRole = (payload.role || storedRole).toLowerCase();

      // Cleanly route to role-appropriate renderer
      if (verifiedRole === 'coach') {
        if (coachView) coachView.style.display = 'block';
        renderCoachDashboard(payload);
      } else if (verifiedRole === 'student') {
        if (studentView) studentView.style.display = 'block';
        renderStudentDashboard(payload);
      } else {
        // Super Admin (default)
        if (superAdminView) superAdminView.style.display = 'block';
        renderSuperAdminDashboard(payload, userName);
      }

      if (loadingState) loadingState.style.display = 'none';
      if (mainContent) mainContent.style.display = 'block';
    } catch (err) {
      console.error('Error loading dashboard overview:', err);
      if (loadingState) loadingState.style.display = 'none';
      if (mainContent) mainContent.style.display = 'none';
      if (errorState) {
        errorState.style.display = 'block';
        const msgEl = document.getElementById('dashErrorMsg');
        let userMessage = 'An unexpected error occurred while loading dashboard metrics.';
        if (err.name === 'TypeError' && err.message && err.message.toLowerCase().includes('failed to fetch')) {
          userMessage = 'Unable to connect to the dashboard service. Please check your network connection or server status.';
        } else if (err.message) {
          userMessage = err.message;
        }
        if (msgEl) msgEl.textContent = userMessage;
      }
    } finally {
      isDashboardLoading = false;
    }
  }

  // ============================================================================
  // 4. SUPER ADMIN DASHBOARD RENDERING (UNTOUCHED LOGIC)
  // ============================================================================

  function renderSuperAdminDashboard(data, fallbackUserName) {
    bindSuperAdminQuickActions();
    bindSuperAdminClickableNavigation();

    // 1. Welcome Card
    renderWelcomeSection(data, false, fallbackUserName);

    // 2. KPI Cards
    renderKpiCards(data, false);

    // 3. Attendance Overview & Chart
    renderAttendanceOverview(data.attendance);

    // 4. Financial Overview (Super Admin strictly)
    renderFinancialOverview(data.financial, false);

    // 5. Active Batches Overview
    renderBatchesOverview(data.batches);

    // 6. Recent Activity Log
    renderActivityOverview(data.recent_activity);
  }

  function renderWelcomeSection(data, isCoach, fallbackUserName) {
    const welcomeName = document.getElementById('dashWelcomeName');
    const currentDate = document.getElementById('dashCurrentDate');
    const roleBadge = document.getElementById('dashRoleBadge');
    const adminActions = document.getElementById('dashAdminActions');
    const coachActions = document.getElementById('dashCoachActions');

    const displayName = data.user_name || fallbackUserName || 'Administrator';
    if (welcomeName) welcomeName.textContent = displayName;
    if (currentDate) currentDate.textContent = getFormattedCurrentDate();

    if (roleBadge) {
      roleBadge.textContent = 'Super Admin Console';
    }

    if (adminActions) adminActions.style.display = 'flex';
    if (coachActions) coachActions.style.display = 'none';
  }

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
    if (labelStudents) labelStudents.textContent = 'TOTAL STUDENTS';
    if (subStudents) subStudents.textContent = 'Enrolled Athletes';

    // 2. Coaches KPI
    const labelCoaches = document.getElementById('labelKpiCoaches');
    const valCoachesTotal = document.getElementById('dashKpiCoachesTotal');
    const valCoachesActive = document.getElementById('dashKpiCoachesActive');
    const subCoaches = document.getElementById('dashKpiCoachesSub');

    if (labelCoaches) labelCoaches.textContent = 'TOTAL COACHES';
    if (valCoachesTotal) valCoachesTotal.textContent = kpis.coaches?.total ?? 0;
    if (valCoachesActive) valCoachesActive.textContent = kpis.coaches?.active ?? 0;
    if (subCoaches) subCoaches.textContent = 'Certified Staff';

    // 3. Batches KPI
    const labelBatches = document.getElementById('labelKpiBatches');
    const valBatchesTotal = document.getElementById('dashKpiBatchesTotal');
    const valBatchesActive = document.getElementById('dashKpiBatchesActive');
    const subBatches = document.getElementById('dashKpiBatchesSub');

    if (labelBatches) labelBatches.textContent = 'TOTAL BATCHES';
    if (valBatchesTotal) valBatchesTotal.textContent = kpis.batches?.total ?? 0;
    if (valBatchesActive) valBatchesActive.textContent = kpis.batches?.active ?? 0;
    if (subBatches) subBatches.textContent = 'Training Programs';

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

  function renderFinancialOverview(financial, isCoach) {
    const finPanel = document.getElementById('panelFinancialOverview');
    if (!finPanel) return;

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
          legend: { display: false },
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

  function renderBatchesOverview(batchesData) {
    const tbody = document.getElementById('dashBatchTableBody');
    const emptyState = document.getElementById('dashBatchesEmpty');
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
      const maxCapacity = Number(b.max_capacity || b.capacity || 0);
      const pct = maxCapacity > 0 ? Math.min(100, Math.round((studentCount / maxCapacity) * 100)) : 0;

      let progressColor = 'var(--gradient-gold-metallic)';
      if (pct >= 90) {
        progressColor = 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)';
      } else if (pct >= 75) {
        progressColor = 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)';
      }

      const branchName = (typeof formatBranchLabel === 'function')
        ? formatBranchLabel(b.branch || b.batch_location)
        : (b.branch || b.batch_location || '—');

      const timeStr = b.batch_time || '';

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
  // 5. COACH DASHBOARD RENDERING (SCOPED OPERATIONS)
  // ============================================================================

  function renderCoachDashboard(data) {
    bindCoachQuickActions();
    bindCoachClickableNavigation();

    // 1. Welcome Card
    const coachWelcomeName = document.getElementById('coachWelcomeName');
    const coachCurrentDate = document.getElementById('coachCurrentDate');
    const displayName = data.user_name || data.user?.name || 'Coach';

    if (coachWelcomeName) coachWelcomeName.textContent = displayName;
    if (coachCurrentDate) coachCurrentDate.textContent = getFormattedCurrentDate();

    // 2. 4 Coach KPI Cards
    renderCoachKpis(data);

    // 3. Attendance Overview & Chart
    renderCoachAttendanceOverview(data.attendance);

    // 4. My Training Batches (with Capacity Progress)
    renderCoachBatches(data.batches);

    // 5. My Students (Scoped athlete roster)
    renderCoachStudents(data.students);
  }

  function renderCoachKpis(data) {
    const kpis = data.kpis || {};
    const att = data.attendance || {};

    // Card 1: My Students
    const elStudentsTotal = document.getElementById('coachKpiStudentsTotal');
    const elStudentsBadge = document.getElementById('coachKpiStudentsBadge');
    const activeStudents = kpis.students?.active ?? 0;
    if (elStudentsTotal) elStudentsTotal.textContent = activeStudents;
    if (elStudentsBadge) elStudentsBadge.textContent = `${activeStudents} Active`;

    // Card 2: My Batches
    const elBatchesTotal = document.getElementById('coachKpiBatchesTotal');
    const elBatchesBadge = document.getElementById('coachKpiBatchesBadge');
    const activeBatches = kpis.batches?.active ?? (data.batches?.total ?? 0);
    if (elBatchesTotal) elBatchesTotal.textContent = activeBatches;
    if (elBatchesBadge) elBatchesBadge.textContent = `${activeBatches} Active`;

    // Card 3: Today's Attendance
    const elAttRate = document.getElementById('coachKpiAttRate');
    const elAttBadge = document.getElementById('coachKpiAttBadge');
    const elAttCounts = document.getElementById('coachKpiAttCounts');

    const present = att.present_today || 0;
    const absent = att.absent_today || 0;
    const totalToday = present + absent;
    const rate = att.attendance_rate;

    if (totalToday === 0 || att.session_status === 'none' || rate === null) {
      if (elAttRate) elAttRate.textContent = '--';
      if (elAttBadge) {
        elAttBadge.className = 'dash-kpi-badge badge-neutral';
        elAttBadge.textContent = 'No Sessions';
      }
      if (elAttCounts) elAttCounts.textContent = 'No Sessions Today';
    } else {
      if (elAttRate) elAttRate.textContent = `${rate}%`;
      if (elAttBadge) {
        elAttBadge.className = 'dash-kpi-badge badge-active';
        elAttBadge.textContent = `${att.batches_marked_today || att.batches_marked || 0} Batches`;
      }
      if (elAttCounts) elAttCounts.textContent = `${present} Present • ${absent} Absent`;
    }

    // Card 4: Sessions Today
    const elSessionsTotal = document.getElementById('coachKpiSessionsTotal');
    const elSessionsBadge = document.getElementById('coachKpiSessionsBadge');
    const batchesMarked = att.batches_marked_today || att.batches_marked || 0;
    if (elSessionsTotal) elSessionsTotal.textContent = batchesMarked;
    if (elSessionsBadge) elSessionsBadge.textContent = `${batchesMarked} Batches`;
  }

  function renderCoachAttendanceOverview(att) {
    if (!att) return;

    const presentEl = document.getElementById('coachAttPresent');
    const absentEl = document.getElementById('coachAttAbsent');
    const batchesEl = document.getElementById('coachAttBatches');
    const statusEl = document.getElementById('coachAttSessionStatus');
    const pillEl = document.getElementById('coachAttLivePill');

    const present = att.present_today || 0;
    const absent = att.absent_today || 0;
    const batches = att.batches_marked_today || att.batches_marked || 0;
    const rate = att.attendance_rate;

    if (presentEl) presentEl.textContent = present;
    if (absentEl) absentEl.textContent = absent;
    if (batchesEl) batchesEl.textContent = batches;
    if (pillEl) pillEl.textContent = `${batches} Batches Marked`;

    if (statusEl) {
      if (batches === 0 || (present + absent) === 0 || rate === null) {
        statusEl.textContent = 'No Sessions Recorded Today';
        statusEl.className = 'dash-ribbon-val';
      } else {
        statusEl.textContent = `${rate}% Attendance`;
        statusEl.className = 'dash-ribbon-val text-success';
      }
    }

    // Render Scoped 7-Day Trend Chart
    renderCoachAttendanceChart(att.seven_day_trend || []);
  }

  function renderCoachAttendanceChart(trendData) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js library is not loaded. Skipping coach attendance chart render.');
      return;
    }

    const canvas = document.getElementById('coachAttendanceChart');
    const emptyState = document.getElementById('coachAttChartEmpty');
    if (!canvas) return;

    if (coachAttendanceChartInstance) {
      coachAttendanceChartInstance.destroy();
      coachAttendanceChartInstance = null;
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
    coachAttendanceChartInstance = new Chart(ctx, {
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

    canvas.onclick = (e) => {
      if (coachAttendanceChartInstance && coachAttendanceChartInstance.legend) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hitBoxes = coachAttendanceChartInstance.legend.legendHitBoxes || [];
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

  function renderCoachBatches(batchesData) {
    const tbody = document.getElementById('coachBatchTableBody');
    const emptyState = document.getElementById('coachBatchesEmpty');
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
      const maxCapacity = Number(b.max_capacity || b.capacity || 0);
      const pct = maxCapacity > 0 ? Math.min(100, Math.round((studentCount / maxCapacity) * 100)) : 0;

      let progressColor = 'var(--gradient-gold-metallic)';
      if (pct >= 90) {
        progressColor = 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)';
      } else if (pct >= 75) {
        progressColor = 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)';
      }

      const locationStr = b.batch_location || 'Academy Grounds';
      const timeStr = b.batch_time || 'Flexible Schedule';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="dash-batch-name">${escapeHtml(b.batch_name)}</div>
          <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(b.sport || 'Sports')}</div>
        </td>
        <td>
          <div style="color: #FFFFFF;">${escapeHtml(locationStr)}</div>
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

  function renderCoachStudents(studentsData) {
    const tbody = document.getElementById('coachStudentTableBody');
    const emptyState = document.getElementById('coachStudentsEmpty');
    if (!tbody) return;
    tbody.innerHTML = '';

    const list = Array.isArray(studentsData) ? studentsData : (studentsData?.list || []);
    if (list.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    list.forEach(st => {
      const initials = getInitials(st.student_name, 'A');
      const avatarHtml = st.student_photo
        ? `<img src="${escapeHtml(st.student_photo)}" class="coach-student-avatar" alt="${escapeHtml(st.student_name)}" onerror="this.outerHTML='<div class=\\'coach-student-avatar\\'>${initials}</div>'">`
        : `<div class="coach-student-avatar">${initials}</div>`;

      let badgeClass = 'badge-neutral';
      let statusText = st.latest_attendance_status || 'No records';
      if (statusText === 'Present') badgeClass = 'badge-active';
      else if (statusText === 'Absent') badgeClass = 'badge-inactive';

      const dateStr = st.latest_attendance_date
        ? ` <span style="font-size:0.70rem; color:var(--text-muted);">(${escapeHtml(st.latest_attendance_date)})</span>`
        : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            ${avatarHtml}
            <div>
              <div style="font-weight:600; color:#FFFFFF;">${escapeHtml(st.student_name)}</div>
              <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(st.status || 'Active')}</div>
            </div>
          </div>
        </td>
        <td>
          <span style="color:#FFFFFF; font-weight:500;">${escapeHtml(st.batch_name || 'Unassigned')}</span>
        </td>
        <td>
          <span class="dash-kpi-badge ${badgeClass}">${escapeHtml(statusText)}</span>
          ${dateStr}
        </td>
        <td style="color:var(--text-muted); font-size:0.78rem;">
          ${escapeHtml(st.student_phone || '—')}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ============================================================================
  // 6. STUDENT DASHBOARD RENDERING (PERSONAL ATHLETE PORTAL)
  // ============================================================================

  let currentStudentPayload = null;
  let isStudentInteractionsInitialized = false;

  function renderStudentDashboard(data) {
    currentStudentPayload = data;

    // 1. Personal Welcome Card & Avatar
    renderStudentWelcome(data);

    // 2. Personal 4 KPI Cards (My Batch, My Attendance, My Fees, Training Schedule)
    renderStudentKpis(data);

    // 3. Training & Lead Coach Card
    renderStudentTraining(data.batch);

    // 4. Personal Attendance Overview (Donut Ring + Chronological Timeline)
    renderStudentAttendanceOverview(data.attendance);

    // 5. Personal Fees & Payment Status (Overall Progress & Monthly Grid)
    renderStudentFeesOverview(data.fees);

    // 6. Recent Attendance Log
    renderStudentRecentAttendance(data.attendance?.recent || []);

    // 7. Interactive Detail Card Interactions
    initStudentDashboardInteractions();
  }

  function renderStudentWelcome(data) {
    const welcomeName = document.getElementById('studentWelcomeName');
    const currentDate = document.getElementById('studentCurrentDate');
    const avatarEl = document.getElementById('studentWelcomeAvatar');

    const displayName = data.user_name || data.user?.name || 'Athlete';
    if (welcomeName) welcomeName.textContent = displayName;
    if (currentDate) currentDate.textContent = getFormattedCurrentDate();

    if (avatarEl) {
      const photo = data.user?.photo || '';
      const initials = getInitials(displayName, 'A');
      if (photo) {
        avatarEl.innerHTML = `<img src="${escapeHtml(photo)}" alt="${escapeHtml(displayName)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.parentElement.textContent='${initials}'">`;
      } else {
        avatarEl.textContent = initials;
      }
    }

    const welcomeProfileEl = document.getElementById('studentWelcomeProfile') || document.querySelector('.student-welcome-profile');
    if (welcomeProfileEl && !welcomeProfileEl._hasProfileBound) {
      welcomeProfileEl._hasProfileBound = true;
      welcomeProfileEl.style.cursor = 'pointer';
      welcomeProfileEl.addEventListener('click', () => {
        if (typeof window.openStudentProfile === 'function') {
          window.openStudentProfile();
        }
      });
      welcomeProfileEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (typeof window.openStudentProfile === 'function') {
            window.openStudentProfile();
          }
        }
      });
    }
  }

  function renderStudentKpis(data) {
    const kpis = data.kpis || {};
    const batch = data.batch || {};
    const fees = data.fees || {};

    // Card 1: My Batch
    const elBatch = document.getElementById('studentKpiBatch');
    const elBatchBadge = document.getElementById('studentKpiBatchBadge');
    if (elBatch) elBatch.textContent = kpis.batch || batch.batch_name || 'No Batch Assigned';
    if (elBatchBadge) elBatchBadge.textContent = batch.sport || 'Assigned';

    // Card 2: Attendance Rate
    const elAttRate = document.getElementById('studentKpiAttRate');
    const elAttBadge = document.getElementById('studentKpiAttBadge');
    if (kpis.attendance_rate !== null && kpis.attendance_rate !== undefined) {
      if (elAttRate) elAttRate.textContent = `${kpis.attendance_rate}%`;
      if (elAttBadge) elAttBadge.textContent = `${kpis.sessions_attended || 0} / ${kpis.total_sessions || 0} Attended`;
    } else {
      if (elAttRate) elAttRate.textContent = '--';
      if (elAttBadge) elAttBadge.textContent = 'No Attendance Yet';
    }

    // Card 3: My Fees (Replaces Sessions Attended)
    const elFeesRatio = document.getElementById('studentKpiFeesRatio');
    const elFeesBadge = document.getElementById('studentKpiFeesBadge');
    const elFeesSub = document.getElementById('studentKpiFeesSub');

    if (fees.has_fees) {
      if (elFeesRatio) {
        elFeesRatio.innerHTML = `<span style="letter-spacing:-0.02em;">${fees.paid_count} / ${fees.total_expected}</span> <span class="student-kpi-sub-unit">MONTHS PAID</span>`;
      }
      if (elFeesBadge) {
        const curM = fees.current_month || {};
        if (curM.has_record) {
          if (curM.status === 'PAID') {
            elFeesBadge.className = 'dash-kpi-badge badge-present';
            elFeesBadge.innerHTML = `${escapeHtml(curM.name)} &bull; ✓ Paid`;
          } else {
            elFeesBadge.className = 'dash-kpi-badge badge-absent';
            elFeesBadge.innerHTML = `${escapeHtml(curM.name)} &bull; ✕ Due`;
          }
        } else {
          elFeesBadge.className = 'dash-kpi-badge badge-neutral';
          elFeesBadge.innerHTML = `${escapeHtml(curM.name || 'Current Month')} &bull; No Record`;
        }
      }
      if (elFeesSub) elFeesSub.textContent = 'View Payment Status →';
    } else {
      if (elFeesRatio) {
        elFeesRatio.innerHTML = `<span>-- / --</span> <span class="student-kpi-sub-unit">NO RECORDS</span>`;
      }
      if (elFeesBadge) {
        elFeesBadge.className = 'dash-kpi-badge badge-neutral';
        elFeesBadge.textContent = 'No Fees Assigned';
      }
      if (elFeesSub) elFeesSub.textContent = 'View Details →';
    }

    // Card 4: Training Schedule
    const elScheduleTime = document.getElementById('studentKpiScheduleTime');
    const elSportBadge = document.getElementById('studentKpiSportBadge');
    const elLocationSub = document.getElementById('studentKpiLocationSub');
    if (elScheduleTime) elScheduleTime.textContent = batch.batch_time || 'Flexible';
    if (elSportBadge) elSportBadge.textContent = batch.sport || 'Sports';
    if (elLocationSub) elLocationSub.textContent = batch.batch_location || 'Academy Grounds';
  }

  function renderStudentTraining(batchData) {
    const batch = batchData || {};

    const sportPill = document.getElementById('studentTrainingSportPill');
    const batchName = document.getElementById('studentTrainingBatchName');
    const location = document.getElementById('studentTrainingLocation');
    const schedule = document.getElementById('studentTrainingSchedule');
    const sport = document.getElementById('studentTrainingSport');

    if (sportPill) sportPill.textContent = batch.sport || 'Training';
    if (batchName) batchName.textContent = batch.batch_name || 'No Batch Assigned';
    if (location) location.textContent = batch.batch_location || 'Academy Grounds';
    if (schedule) schedule.textContent = batch.batch_time || 'Flexible Schedule';
    if (sport) sport.textContent = batch.sport || 'General Sports';

    // Lead Coach Chip
    const coachName = document.getElementById('studentCoachName');
    const coachEmail = document.getElementById('studentCoachEmail');
    const coachAvatar = document.getElementById('studentCoachAvatar');

    const leadCoachName = batch.coach_name || 'Unassigned';
    if (coachName) coachName.textContent = leadCoachName;
    if (coachEmail) coachEmail.textContent = batch.coach_email || '';

    if (coachAvatar) {
      const coachPhoto = batch.coach_photo || '';
      const coachInitials = getInitials(leadCoachName, 'C');
      if (coachPhoto) {
        coachAvatar.innerHTML = `<img src="${escapeHtml(coachPhoto)}" alt="${escapeHtml(leadCoachName)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.parentElement.textContent='${coachInitials}'">`;
      } else {
        coachAvatar.textContent = coachInitials;
      }
    }
  }

  function renderStudentAttendanceOverview(att) {
    if (!att) return;

    const pillEl = document.getElementById('studentAttPill');
    const presentEl = document.getElementById('studentAttPresent');
    const absentEl = document.getElementById('studentAttAbsent');
    const totalEl = document.getElementById('studentAttTotal');
    const ringFg = document.getElementById('studentAttRingFg');
    const ringRate = document.getElementById('studentAttRingRate');
    const ringLabel = document.getElementById('studentAttRingLabel');

    const present = att.present || 0;
    const absent = att.absent || 0;
    const total = att.total || (present + absent);
    const rate = att.rate;

    if (presentEl) presentEl.textContent = present;
    if (absentEl) absentEl.textContent = absent;
    if (totalEl) totalEl.textContent = total;

    // 1. Donut Ring & Rate Badge
    if (rate !== null && rate !== undefined) {
      if (pillEl) pillEl.textContent = `${rate}% Rate`;
      if (ringRate) ringRate.textContent = `${rate}%`;
      if (ringLabel) ringLabel.textContent = 'ATTENDANCE';
      if (ringFg) {
        const pct = Math.max(0, Math.min(100, parseFloat(rate)));
        ringFg.setAttribute('stroke-dasharray', `${pct}, 100`);
        ringFg.style.stroke = pct >= 75 ? '#22C55E' : (pct >= 50 ? '#C9A227' : '#EF4444');
      }
    } else {
      if (pillEl) pillEl.textContent = 'No Sessions';
      if (ringRate) ringRate.textContent = '--';
      if (ringLabel) ringLabel.textContent = 'NO SESSIONS';
      if (ringFg) {
        ringFg.setAttribute('stroke-dasharray', '0, 100');
        ringFg.style.stroke = 'rgba(255, 255, 255, 0.1)';
      }
    }

    // 2. Chronological Timeline of Recorded Sessions
    renderStudentAttendanceTimeline(att.timeline || []);
  }

  function renderStudentAttendanceTimeline(timelineData) {
    const track = document.getElementById('studentAttTimeline');
    const emptyState = document.getElementById('studentAttTimelineEmpty');
    const countBadge = document.getElementById('studentTimelineCount');
    if (!track) return;

    track.innerHTML = '';

    if (!timelineData || timelineData.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      track.style.display = 'none';
      if (countBadge) countBadge.textContent = '0 sessions';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    track.style.display = 'flex';
    if (countBadge) countBadge.textContent = `${timelineData.length} recorded session${timelineData.length === 1 ? '' : 's'}`;

    timelineData.forEach((item, index) => {
      const isPresent = (item.status === 'Present');
      const node = document.createElement('div');
      node.className = `student-timeline-item student-timeline-node ${isPresent ? 'is-present' : 'is-absent'}`;
      node.setAttribute('title', `${item.date_formatted || item.date}: ${item.status} (${item.batch_name || 'Training Batch'})`);

      node.innerHTML = `
        <div class="student-timeline-dot student-timeline-badge ${isPresent ? 'dot-present' : 'dot-absent'}">
          ${isPresent ? 'P' : 'A'}
        </div>
        <span class="student-timeline-date">${escapeHtml(item.date_label || item.date_short || item.date)}</span>
        <span class="student-timeline-day">${escapeHtml(item.day_name || '')}</span>
      `;

      track.appendChild(node);
    });
  }

  function renderStudentRecentAttendance(recentList) {
    const tbody = document.getElementById('studentRecentTableBody');
    const emptyState = document.getElementById('studentRecentEmpty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!recentList || recentList.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    recentList.forEach(rec => {
      const isPresent = (rec.status === 'Present');
      const badgeHtml = isPresent
        ? '<span class="badge-status-present">✓ Present</span>'
        : '<span class="badge-status-absent">✕ Absent</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:500; color:#FFFFFF;">${escapeHtml(rec.date_formatted || rec.attendance_date)}</td>
        <td style="color:var(--text-muted);">${escapeHtml(rec.batch_name || 'Training Batch')}</td>
        <td style="text-align:right;">
          ${badgeHtml}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --------------------------------------------------------------------------
  // 5b. Personal Fees & Monthly Payment Status Visualization
  // --------------------------------------------------------------------------

  function renderStudentFeesOverview(feesData) {
    const fees = feesData || {};
    const pill = document.getElementById('studentFeesOverviewPill');
    const ringWrap = document.getElementById('studentFeesRingWrap');
    const ringRatioEl = document.getElementById('studentFeesRingRatio');
    const ringFgEl = document.getElementById('studentFeesRingFg');
    const ringBgEl = document.getElementById('studentFeesRingBg');
    const paidCountEl = document.getElementById('studentFeesPaidCount');
    const dueCountEl = document.getElementById('studentFeesDueCount');
    const progressPctEl = document.getElementById('studentFeesProgressPct');
    const curMonthName = document.getElementById('studentFeesCurMonthName');
    const curMonthBadge = document.getElementById('studentFeesCurMonthBadge');
    const graphRow = document.getElementById('studentFeesGraphRow');
    const emptyState = document.getElementById('studentFeesEmptyState');

    if (!fees.has_fees) {
      if (pill) pill.textContent = '0 Months Paid';
      if (ringRatioEl) ringRatioEl.textContent = '-- / --';
      if (ringFgEl) ringFgEl.setAttribute('stroke-dasharray', '0, 100');
      if (ringBgEl) ringBgEl.style.stroke = 'rgba(255, 255, 255, 0.08)';
      if (paidCountEl) paidCountEl.textContent = '0';
      if (dueCountEl) dueCountEl.textContent = '0';
      if (progressPctEl) progressPctEl.textContent = 'No payment records available';
      if (curMonthName) curMonthName.textContent = fees.current_month?.label || 'Current Month';
      if (curMonthBadge) {
        curMonthBadge.className = 'sf-cur-mini-status status-neutral';
        curMonthBadge.textContent = 'Not Applicable';
      }
      if (graphRow) graphRow.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (graphRow) graphRow.style.display = 'flex';

    const total = Number(fees.total_expected || 0);
    const paid = Number(fees.paid_count || 0);
    const due = Number(fees.due_count || 0);
    const pct = Math.max(0, Math.min(100, Math.round(Number(fees.percentage_paid ?? (total > 0 ? (paid / total) * 100 : 0)))));

    if (pill) pill.textContent = `${paid} / ${total} Paid`;
    if (ringRatioEl) ringRatioEl.textContent = `${paid} / ${total}`;
    if (paidCountEl) paidCountEl.textContent = paid;
    if (dueCountEl) dueCountEl.textContent = due;
    if (progressPctEl) progressPctEl.textContent = `${pct}% of expected months paid`;

    // SVG Donut Ring Part-to-Whole Representation
    if (ringFgEl) {
      ringFgEl.setAttribute('stroke-dasharray', `${pct}, 100`);
      ringFgEl.style.stroke = (pct === 100) ? '#10B981' : (pct > 0 ? '#10B981' : 'transparent');
    }
    if (ringBgEl) {
      // Due months represented by red track arc; neutral track if 0 due months
      ringBgEl.style.stroke = (due > 0) ? 'rgba(239, 68, 68, 0.45)' : 'rgba(255, 255, 255, 0.08)';
    }
    if (ringWrap) {
      ringWrap.setAttribute('aria-label', `${paid} of ${total} expected months paid, ${due} months due.`);
    }

    // Small Secondary Current Month Footer
    const curM = fees.current_month || {};
    if (curMonthName) curMonthName.textContent = curM.label || 'Current Month';
    if (curMonthBadge) {
      if (curM.has_record) {
        if (curM.status === 'PAID') {
          curMonthBadge.className = 'sf-cur-mini-status status-paid';
          curMonthBadge.textContent = '✓ Paid';
        } else {
          curMonthBadge.className = 'sf-cur-mini-status status-due';
          curMonthBadge.textContent = '✕ Payment Due';
        }
      } else {
        curMonthBadge.className = 'sf-cur-mini-status status-neutral';
        curMonthBadge.textContent = 'Not Applicable';
      }
    }
  }

  function openStudentMonthDetailModal(m) {
    if (!m) return;
    const modal = document.getElementById('studentDetailModal');
    const badgeEl = document.getElementById('studentModalBadge');
    const titleEl = document.getElementById('studentModalTitle');
    const bodyEl = document.getElementById('studentModalBody');
    if (!modal || !bodyEl) return;

    const isPaid = (m.status === 'PAID');

    if (badgeEl) badgeEl.textContent = 'FEES & PAYMENTS';
    if (titleEl) titleEl.textContent = m.month_label;

    let contentHtml = `
      <div class="sm-hero-compact">
        <div class="sm-hero-compact-top">
          <span class="sm-hero-name">${escapeHtml(m.month_label)}</span>
          <span class="${isPaid ? 'badge-status-present' : 'badge-status-absent'}" style="font-size:0.75rem; padding:3px 10px; font-weight:700;">
            ${isPaid ? '✓ PAID' : '✕ PAYMENT DUE'}
          </span>
        </div>
        <span class="sm-hero-sub">${m.is_current_month ? 'Current Training Month • ' : ''}Monthly Membership Fee</span>
      </div>

      <div class="sm-section">
        <div class="sm-section-heading">Payment Information</div>
        <div class="sm-spec-grid">
          <div class="sm-spec-item">
            <span class="sm-spec-label">Billing Month</span>
            <span class="sm-spec-val highlight-gold">${escapeHtml(m.month_label)}</span>
          </div>
          <div class="sm-spec-item">
            <span class="sm-spec-label">Payment Status</span>
            <span class="sm-spec-val ${isPaid ? 'text-success' : 'text-danger'}" style="font-weight:700;">
              ${isPaid ? '✓ Paid' : '✕ Not Paid / Due'}
            </span>
          </div>
          <div class="sm-spec-item">
            <span class="sm-spec-label">${isPaid ? 'Amount Paid' : 'Fee Amount Due'}</span>
            <span class="sm-spec-val">₹${(isPaid && m.paid_amount ? m.paid_amount : m.fee_amount).toLocaleString('en-IN')}</span>
          </div>
          <div class="sm-spec-item">
            <span class="sm-spec-label">${isPaid ? 'Payment Date' : 'Due Date'}</span>
            <span class="sm-spec-val">${escapeHtml(isPaid ? (m.paid_at || m.paid_date_formatted || 'Recorded') : m.due_date)}</span>
          </div>
          ${isPaid && m.payment_method ? `
          <div class="sm-spec-item">
            <span class="sm-spec-label">Payment Method</span>
            <span class="sm-spec-val">${escapeHtml(m.payment_method)}</span>
          </div>
          ` : ''}
          ${isPaid && m.payment_reference ? `
          <div class="sm-spec-item">
            <span class="sm-spec-label">Payment Reference</span>
            <span class="sm-spec-val" style="font-family:monospace; font-size:0.78rem;">${escapeHtml(m.payment_reference)}</span>
          </div>
          ` : ''}
          ${isPaid && m.order_id ? `
          <div class="sm-spec-item">
            <span class="sm-spec-label">Order ID</span>
            <span class="sm-spec-val" style="font-family:monospace; font-size:0.78rem;">${escapeHtml(m.order_id)}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <div style="margin-top:1rem; display:flex; justify-content:flex-end;">
        <button type="button" class="btn-dash-text-action" id="btnBackToFeesSummary" style="font-size:0.8rem;">
          ← Back to All Months
        </button>
      </div>
    `;

    bodyEl.innerHTML = contentHtml;

    const backBtn = document.getElementById('btnBackToFeesSummary');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        openStudentModal('fees');
      });
    }

    if (typeof openModal === 'function') {
      openModal('studentDetailModal');
    } else {
      modal.style.display = 'flex';
    }
  }

  // ============================================================================
  // 6. STUDENT DASHBOARD INTERACTIVE DETAIL MODAL SYSTEM
  // ============================================================================

  function initStudentDashboardInteractions() {
    if (isStudentInteractionsInitialized) return;
    isStudentInteractionsInitialized = true;

    // Helper: Bind click and keyboard Enter/Space
    const bindInteractive = (id, type) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openStudentModal(type);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openStudentModal(type);
        }
      });
    };

    // 1. My Batch Card & Details Button
    bindInteractive('cardStudentBatch', 'batch');

    // 2. My Attendance Card & Details Button
    bindInteractive('cardStudentAttRate', 'attendance');
    bindInteractive('btnStudentViewAttDetails', 'attendance');

    // 3. My Fees Card, Panel & Button
    bindInteractive('cardStudentFees', 'fees');
    bindInteractive('panelStudentFees', 'fees');
    bindInteractive('btnStudentViewFeesModal', 'fees');
    bindInteractive('cardStudentSessions', 'fees'); // backward-compatibility fallback

    // 4. Training Schedule Card
    bindInteractive('cardStudentSchedule', 'schedule');

    // 5. My Training Panel & Button & Coach Chip
    bindInteractive('btnStudentViewTrainingDetails', 'training');
    bindInteractive('studentCoachChip', 'training');

    // 6. Recent Attendance View All Button
    bindInteractive('btnStudentViewAllAttendance', 'history');

    // Close button for student detail modal
    const closeBtn = document.getElementById('closeStudentDetailModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (typeof closeModal === 'function') {
          closeModal('studentDetailModal');
        } else {
          const m = document.getElementById('studentDetailModal');
          if (m) m.style.display = 'none';
        }
      });
    }

    // Backdrop click dismiss for student detail modal
    const modalOverlay = document.getElementById('studentDetailModal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          if (typeof closeModal === 'function') {
            closeModal('studentDetailModal');
          } else {
            modalOverlay.style.display = 'none';
          }
        }
      });
    }
  }

  function openStudentModal(type) {
    const modal = document.getElementById('studentDetailModal');
    const badgeEl = document.getElementById('studentModalBadge');
    const titleEl = document.getElementById('studentModalTitle');
    const bodyEl = document.getElementById('studentModalBody');
    if (!modal || !bodyEl) return;

    const data = currentStudentPayload || {};
    const batch = data.batch || {};
    const att = data.attendance || {};
    const kpis = data.kpis || {};
    const user = data.user || {};
    const history = att.history || att.recent || [];

    const present = att.present || 0;
    const absent = att.absent || 0;
    const total = att.total || (present + absent);
    const rateText = (att.rate !== null && att.rate !== undefined) ? `${att.rate}%` : 'No Rate';

    let badge = 'STUDENT DETAIL';
    let title = 'Athlete Overview';
    let contentHtml = '';

    const formatStatusBadge = (status) => {
      const isP = (status === 'Present');
      return isP
        ? '<span class="badge-status-present">✓ Present</span>'
        : '<span class="badge-status-absent">✕ Absent</span>';
    };

    switch (type) {
      case 'batch':
        badge = 'MY BATCH';
        title = 'Batch Details';
        contentHtml = `
          <div class="sm-hero-compact">
            <div class="sm-hero-compact-top">
              <span class="sm-hero-name">${escapeHtml(batch.batch_name || 'Assigned Batch')}</span>
              <span class="sm-sport-pill">${escapeHtml(batch.sport || 'General Sports')}</span>
            </div>
            <span class="sm-hero-sub text-success">Active Training Group</span>
          </div>

          <div class="sm-section">
            <div class="sm-section-heading">Training Details</div>
            <div class="sm-spec-grid">
              <div class="sm-spec-item">
                <span class="sm-spec-label">Sport Discipline</span>
                <span class="sm-spec-val">${escapeHtml(batch.sport || 'General Sports')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Training Ground</span>
                <span class="sm-spec-val">${escapeHtml(batch.batch_location || 'Academy Grounds')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Session Schedule</span>
                <span class="sm-spec-val">${escapeHtml(batch.batch_time || 'Flexible Schedule')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Enrollment Status</span>
                <span class="sm-spec-val text-success">Active Athlete</span>
              </div>
            </div>
          </div>

          <div class="sm-section">
            <div class="sm-section-heading">Assigned Coaching Staff</div>
            <div class="sm-coach-card">
              <div class="sm-coach-avatar">
                ${batch.coach_photo 
                  ? `<img src="${escapeHtml(batch.coach_photo)}" alt="${escapeHtml(batch.coach_name || 'Coach')}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
                  : getInitials(batch.coach_name || 'Coach', 'C')}
              </div>
              <div class="sm-coach-details">
                <span class="sm-coach-role">Head Coach</span>
                <span class="sm-coach-name">${escapeHtml(batch.coach_name || 'Unassigned')}</span>
                <span class="sm-coach-contact">${escapeHtml(batch.coach_email || 'No email registered')}</span>
                ${batch.coach_phone ? `<span class="sm-coach-phone">${escapeHtml(batch.coach_phone)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
        break;

      case 'attendance':
        badge = 'MY ATTENDANCE';
        title = 'Attendance Breakdown';
        contentHtml = `
          <div class="sm-stat-highlight-row">
            <div class="sm-stat-box">
              <span class="sm-stat-num text-gold">${escapeHtml(rateText)}</span>
              <span class="sm-stat-sub">Overall Rate</span>
            </div>
            <div class="sm-stat-box">
              <span class="sm-stat-num text-success">${present}</span>
              <span class="sm-stat-sub">Present</span>
            </div>
            <div class="sm-stat-box">
              <span class="sm-stat-num text-danger">${absent}</span>
              <span class="sm-stat-sub">Absent</span>
            </div>
            <div class="sm-stat-box">
              <span class="sm-stat-num">${total}</span>
              <span class="sm-stat-sub">Recorded</span>
            </div>
          </div>

          <div class="sm-section">
            <div class="sm-history-header">
              <span class="sm-section-heading" style="margin:0;">Recorded Attendance History</span>
              <span class="sm-history-count">${history.length} Session${history.length === 1 ? '' : 's'}</span>
            </div>

            <div class="sm-scrollable-history">
              ${history.length > 0 ? `
                <table class="sm-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Batch</th>
                      <th style="text-align:right;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${history.map(rec => `
                      <tr>
                        <td class="sm-cell-date">${escapeHtml(rec.date_formatted || rec.attendance_date)}</td>
                        <td class="sm-cell-batch">${escapeHtml(rec.batch_name || 'Training Batch')}</td>
                        <td style="text-align:right;">${formatStatusBadge(rec.status)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : `
                <div class="sm-empty-box">
                  <p>No attendance sessions recorded yet for your profile.</p>
                </div>
              `}
            </div>
          </div>
        `;
        break;

      case 'fees':
        badge = 'MY FEES';
        title = 'Fees & Payments';
        const feesData = data.fees || {};
        const monthsList = feesData.months || [];
        const curM = feesData.current_month || {};
        const pct = Math.max(0, Math.min(100, feesData.percentage_paid || 0));

        contentHtml = `
          <!-- Level 1: Overall Status -->
          <div class="student-fees-summary-card" style="margin-bottom:1rem;">
            <div class="sf-summary-top">
              <div class="sf-summary-main">
                <span class="sf-summary-ratio">${feesData.has_fees ? `${feesData.paid_count} / ${feesData.total_expected}` : '-- / --'}</span>
                <span class="sf-summary-label">MONTHS PAID</span>
              </div>
              <div class="sf-summary-cur-month">
                <span class="sf-cur-label">CURRENT MONTH</span>
                <span class="sf-cur-val">${escapeHtml(curM.label || 'Current Month')}</span>
                <span class="sf-cur-badge ${curM.has_record ? (curM.status === 'PAID' ? 'badge-present' : 'badge-absent') : 'badge-neutral'}">
                  ${curM.has_record ? (curM.status === 'PAID' ? '✓ PAID' : '✕ PAYMENT DUE') : 'NOT APPLICABLE'}
                </span>
              </div>
            </div>

            <!-- Horizontal Progress Indicator -->
            <div class="sf-progress-wrap">
              <div class="sf-progress-bar-bg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
                <div class="sf-progress-bar-fill" style="width: ${pct}%; background-color: ${pct === 100 ? '#22C55E' : (pct > 0 ? '#C9A227' : '#EF4444')};"></div>
              </div>
              <div class="sf-progress-meta">
                <span class="sf-progress-pct">${pct}% of expected months paid</span>
                <div class="sf-progress-counts">
                  <span class="sf-count-paid">Paid: <strong>${feesData.paid_count || 0}</strong></span>
                  <span class="dash-separator">•</span>
                  <span class="sf-count-due">Due: <strong>${feesData.due_count || 0}</strong></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Level 2: Monthly Payment Status Grid -->
          <div class="student-fees-grid-section">
            <div class="sf-grid-header">
              <span class="sf-grid-title">MONTHLY PAYMENT STATUS</span>
              <span class="sf-grid-hint">Click a month tile to view details</span>
            </div>
            ${monthsList.length > 0 ? `
              <div class="student-months-grid modal-months-grid">
                ${monthsList.map((m, idx) => {
                  const isPaid = (m.status === 'PAID');
                  return `
                    <div class="student-month-tile modal-tile ${isPaid ? 'tile-paid' : 'tile-due'} ${m.is_current_month ? 'tile-current' : ''}" 
                         data-month-index="${idx}" role="button" tabindex="0"
                         aria-label="Payment status for ${escapeHtml(m.month_label)}: ${isPaid ? 'Paid' : 'Payment Due'}">
                      ${m.is_current_month ? '<span class="tile-current-tag">CURRENT</span>' : ''}
                      <div class="tile-month-text">${escapeHtml(m.month_short)}</div>
                      <div class="tile-year-text">${escapeHtml(m.year)}</div>
                      <div class="tile-status-pill ${isPaid ? 'status-paid' : 'status-due'}">
                        ${isPaid ? '✓ PAID' : '✕ DUE'}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div class="sf-empty-state">
                <p>No fee or payment records currently available for your profile.</p>
              </div>
            `}
          </div>
        `;
        break;

      case 'sessions':
        badge = 'SESSIONS ATTENDED';
        title = 'Attended Sessions';
        const attendedRecords = history.filter(h => h.status === 'Present');
        contentHtml = `
          <div class="sm-stat-highlight-row" style="grid-template-columns: repeat(3, 1fr);">
            <div class="sm-stat-box">
              <span class="sm-stat-num text-success">${present}</span>
              <span class="sm-stat-sub">Attended</span>
            </div>
            <div class="sm-stat-box">
              <span class="sm-stat-num">${total}</span>
              <span class="sm-stat-sub">Total Recorded</span>
            </div>
            <div class="sm-stat-box">
              <span class="sm-stat-num text-gold">${escapeHtml(rateText)}</span>
              <span class="sm-stat-sub">Rate</span>
            </div>
          </div>

          <div class="sm-section">
            <div class="sm-history-header">
              <span class="sm-section-heading" style="margin:0;">Attended Sessions Log</span>
              <span class="sm-history-count text-success">${attendedRecords.length} Attended</span>
            </div>

            <div class="sm-scrollable-history">
              ${attendedRecords.length > 0 ? `
                <table class="sm-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Batch</th>
                      <th style="text-align:right;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${attendedRecords.map(rec => `
                      <tr>
                        <td class="sm-cell-date">${escapeHtml(rec.date_formatted || rec.attendance_date)}</td>
                        <td class="sm-cell-batch">${escapeHtml(rec.batch_name || 'Training Session')}</td>
                        <td style="text-align:right;"><span class="badge-status-present">✓ Present</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : `
                <div class="sm-empty-box">
                  <p>No attended sessions recorded yet.</p>
                </div>
              `}
            </div>
          </div>
        `;
        break;

      case 'schedule':
        badge = 'TRAINING SCHEDULE';
        title = 'Training Schedule';
        contentHtml = `
          <div class="sm-hero-compact">
            <div class="sm-hero-compact-top">
              <span class="sm-hero-name">${escapeHtml(batch.batch_time || 'Flexible Schedule')}</span>
              <span class="sm-sport-pill">${escapeHtml(batch.sport || 'Training')}</span>
            </div>
            <span class="sm-hero-sub">${escapeHtml(batch.batch_name || 'Assigned Batch')} • ${escapeHtml(batch.batch_location || 'Academy Grounds')}</span>
          </div>

          <div class="sm-section">
            <div class="sm-section-heading">Schedule & Location</div>
            <div class="sm-spec-grid">
              <div class="sm-spec-item">
                <span class="sm-spec-label">Training Time</span>
                <span class="sm-spec-val highlight-gold">${escapeHtml(batch.batch_time || 'Flexible Schedule')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Training Ground</span>
                <span class="sm-spec-val">${escapeHtml(batch.batch_location || 'Academy Grounds')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Sport Discipline</span>
                <span class="sm-spec-val">${escapeHtml(batch.sport || 'General Sports')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Batch Group</span>
                <span class="sm-spec-val">${escapeHtml(batch.batch_name || 'No Batch')}</span>
              </div>
            </div>
          </div>

          <div class="sm-section">
            <div class="sm-section-heading">Lead Coach</div>
            <div class="sm-coach-card">
              <div class="sm-coach-avatar">
                ${batch.coach_photo 
                  ? `<img src="${escapeHtml(batch.coach_photo)}" alt="${escapeHtml(batch.coach_name || 'Coach')}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
                  : getInitials(batch.coach_name || 'Coach', 'C')}
              </div>
              <div class="sm-coach-details">
                <span class="sm-coach-role">Lead Coach</span>
                <span class="sm-coach-name">${escapeHtml(batch.coach_name || 'Unassigned')}</span>
                <span class="sm-coach-contact">${escapeHtml(batch.coach_email || 'No email registered')}</span>
              </div>
            </div>
          </div>
        `;
        break;

      case 'training':
        badge = 'MY TRAINING';
        title = 'Training Program & Staff';
        contentHtml = `
          <div class="sm-hero-compact">
            <div class="sm-hero-compact-top">
              <span class="sm-hero-name">${escapeHtml(batch.batch_name || 'Training Group')}</span>
              <span class="sm-sport-pill">${escapeHtml(batch.sport || 'Training')}</span>
            </div>
            <span class="sm-hero-sub">${escapeHtml(batch.batch_location || 'Academy Grounds')} • ${escapeHtml(batch.batch_time || 'Flexible Schedule')}</span>
          </div>

          <div class="sm-section">
            <div class="sm-section-heading">Program Details</div>
            <div class="sm-spec-grid">
              <div class="sm-spec-item">
                <span class="sm-spec-label">Training Ground</span>
                <span class="sm-spec-val">${escapeHtml(batch.batch_location || 'Academy Grounds')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Daily Schedule</span>
                <span class="sm-spec-val">${escapeHtml(batch.batch_time || 'Flexible Schedule')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Sport Discipline</span>
                <span class="sm-spec-val">${escapeHtml(batch.sport || 'General Sports')}</span>
              </div>
              <div class="sm-spec-item">
                <span class="sm-spec-label">Athlete Profile</span>
                <span class="sm-spec-val">${escapeHtml(user.name || 'Student')}</span>
              </div>
            </div>
          </div>

          <div class="sm-section">
            <div class="sm-section-heading">Assigned Coaching Staff</div>
            <div class="sm-coach-card">
              <div class="sm-coach-avatar">
                ${batch.coach_photo 
                  ? `<img src="${escapeHtml(batch.coach_photo)}" alt="${escapeHtml(batch.coach_name || 'Coach')}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
                  : getInitials(batch.coach_name || 'Coach', 'C')}
              </div>
              <div class="sm-coach-details">
                <span class="sm-coach-role">Certified Lead Coach</span>
                <span class="sm-coach-name">${escapeHtml(batch.coach_name || 'Unassigned')}</span>
                <span class="sm-coach-contact">${escapeHtml(batch.coach_email || 'No email registered')}</span>
                ${batch.coach_phone ? `<span class="sm-coach-phone">${escapeHtml(batch.coach_phone)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
        break;

      case 'history':
      default:
        badge = 'ATTENDANCE HISTORY';
        title = 'Attendance History';
        contentHtml = `
          <div class="sm-history-sub-header">
            <span class="sm-history-desc">All recorded training session check-ins for your profile</span>
            <span class="sm-history-count">${history.length} Record${history.length === 1 ? '' : 's'}</span>
          </div>

          <div class="sm-scrollable-history" style="max-height: 55vh;">
            ${history.length > 0 ? `
              <table class="sm-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch</th>
                    <th style="text-align:right;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${history.map(rec => `
                    <tr>
                      <td class="sm-cell-date">${escapeHtml(rec.date_formatted || rec.attendance_date)}</td>
                      <td class="sm-cell-batch">${escapeHtml(rec.batch_name || 'Training Batch')}</td>
                      <td style="text-align:right;">${formatStatusBadge(rec.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `
              <div class="sm-empty-box">
                <p>No attendance records found.</p>
              </div>
            `}
          </div>
        `;
        break;
    }

    if (badgeEl) badgeEl.textContent = badge;
    if (titleEl) titleEl.textContent = title;
    bodyEl.innerHTML = contentHtml;

    if (type === 'fees') {
      const modalTiles = bodyEl.querySelectorAll('.modal-tile');
      const monthsList = data.fees?.months || [];
      modalTiles.forEach(tile => {
        const idx = parseInt(tile.getAttribute('data-month-index'), 10);
        const m = monthsList[idx];
        if (m) {
          tile.addEventListener('click', (e) => {
            e.stopPropagation();
            openStudentMonthDetailModal(m);
          });
          tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openStudentMonthDetailModal(m);
            }
          });
        }
      });
    }

    if (typeof openModal === 'function') {
      openModal('studentDetailModal');
    } else {
      modal.style.display = 'flex';
    }
  }

  // ============================================================================
  // 7. GLOBAL ATTACHMENT & INITIALIZATION
  // ============================================================================

  window.loadDashboardOverview = loadDashboardOverview;
  window.cleanDashboardCharts = cleanChartInstances;

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof handleHashRoute === 'function') {
      handleHashRoute();
    } else {
      const hash = window.location.hash || '#overview';
      if (hash === '#overview' || hash === '' || hash === '#branches') {
        loadDashboardOverview();
      }
    }
  });

})();
