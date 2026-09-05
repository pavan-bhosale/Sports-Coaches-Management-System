/**
 * VAVA Sports Academy - Navigation & Layout Module
 */

let currentActiveSectionHash = null;

// Branch Mock Data
const branchData = {
  all: {
    count: '3 active branches',
    students: '355',
    collections: '₹2,95,000',
    overdue: '₹42,500'
  },
  vasai: {
    count: 'Vasai East Branch',
    students: '120',
    collections: '₹1,15,000',
    overdue: '₹12,500'
  },
  nallasopara: {
    count: 'Nallasopara East Branch',
    students: '95',
    collections: '₹75,000',
    overdue: '₹18,000'
  },
  virar: {
    count: 'Virar West Turf Branch',
    students: '140',
    collections: '₹1,05,000',
    overdue: '₹12,000'
  }
};

function navigateToSection(targetHref, showToastNotice = true) {
  if (!targetHref || targetHref === '#') targetHref = '#overview';

  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
  const appSidebar = document.getElementById('appSidebar');
  const pageTitle = document.getElementById('pageTitle');
  const currentSectionName = document.getElementById('currentSectionName');

  const link = document.querySelector(`.sidebar-nav .nav-link[href="${targetHref}"]`) ||
               document.querySelector('.sidebar-nav .nav-link[href="#overview"]');

  if (!link) return;

  const isSameSection = (currentActiveSectionHash === targetHref);
  currentActiveSectionHash = targetHref;

  navLinks.forEach(l => l.classList.remove('active'));
  link.classList.add('active');

  const spanText = link.querySelector('span:not(.nav-icon):not(.nav-badge)')?.textContent.trim() || 'Dashboard';
  if (pageTitle) pageTitle.textContent = spanText;
  if (currentSectionName) currentSectionName.textContent = spanText;

  const welcomeBanner = document.querySelector('.welcome-banner');
  const kpiGrid = document.querySelector('.kpi-grid');
  const dashboardGridLayout = document.querySelector('.dashboard-grid-layout');
  const studentsSection = document.getElementById('studentsSection');
  const batchesSection = document.getElementById('batchesSection');
  const coachesSection = document.getElementById('coachesSection');
  const globalStatusPill = document.querySelector('.content-header .status-indicator-pill');

  // Reset all sections
  if (welcomeBanner) welcomeBanner.style.display = 'none';
  if (kpiGrid) kpiGrid.style.display = 'none';
  if (dashboardGridLayout) dashboardGridLayout.style.display = 'none';
  if (studentsSection) studentsSection.style.display = 'none';
  if (batchesSection) batchesSection.style.display = 'none';
  if (coachesSection) coachesSection.style.display = 'none';

  if (targetHref === '#overview') {
    if (welcomeBanner) welcomeBanner.style.display = '';
    if (kpiGrid) kpiGrid.style.display = '';
    if (dashboardGridLayout) dashboardGridLayout.style.display = '';
    if (globalStatusPill) globalStatusPill.style.display = '';
  } else if (targetHref === '#students') {
    if (studentsSection) {
      studentsSection.style.display = '';
      if (typeof fetchStudents === 'function') fetchStudents();
    }
    if (globalStatusPill) globalStatusPill.style.display = 'none';
  } else if (targetHref === '#batches') {
    if (batchesSection) {
      batchesSection.style.display = '';
      if (typeof fetchBatches === 'function') fetchBatches();
    }
    if (globalStatusPill) globalStatusPill.style.display = 'none';
  } else if (targetHref === '#coaches') {
    if (coachesSection) {
      coachesSection.style.display = '';
      if (typeof fetchCoaches === 'function') fetchCoaches();
    }
    if (globalStatusPill) globalStatusPill.style.display = 'none';
  }

  if (showToastNotice && !isSameSection) {
    showToast(`Navigated to ${spanText}`, 'info');
  }

  // Close mobile drawer on selection
  if (window.innerWidth <= 1024 && appSidebar) {
    appSidebar.classList.remove('mobile-open');
  }
}

function handleHashRoute() {
  const currentHash = window.location.hash || '#overview';
  if (currentHash !== currentActiveSectionHash) {
    navigateToSection(currentHash, false);
  }
}

// Global Follow-up Triggers (WhatsApp & Payment)
window.triggerFollowup = (name, phone, amount, days) => {
  const message = `Hello! This is a reminder from VAVA Sports Academy regarding fee payment of ${amount} for ${name} (${days} days overdue). Kindly clear the dues at your earliest convenience. Thank you!`;
  const encoded = encodeURIComponent(message);
  const waUrl = `https://wa.me/91${phone}?text=${encoded}`;
  
  showToast(`Opening WhatsApp reminder draft for ${name}...`, 'success');
  window.open(waUrl, '_blank');
};

window.recordPaymentModal = (name, amount) => {
  const confirmed = confirm(`Record fee receipt of ${amount} for student ${name}?`);
  if (confirmed) {
    showToast(`Payment of ${amount} recorded for ${name}! Receipt generated.`, 'success');
  }
};

// ── Navigation Initialization & Event Listeners ───────────
document.addEventListener('DOMContentLoaded', () => {
  // 1. Role Title Setting
  const dashboardTitles = {
    admin:   'Super Admin Dashboard',
    coach:   'Coach Dashboard',
    student: 'Student Dashboard'
  };
  const storedRole = localStorage.getItem('vava_role') || 'admin';
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) {
    pageTitleEl.textContent = dashboardTitles[storedRole] || 'Super Admin Dashboard';
  }

  // 2. Navigation Link Click Handling
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetHref = link.getAttribute('href');
      if (targetHref) {
        navigateToSection(targetHref, true);
      }
    });
  });

  // 3. Sidebar Toggle (Retractable Desktop & Mobile Open)
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const appSidebar = document.getElementById('appSidebar');
  const dashboardLayout = document.querySelector('.dashboard-layout');

  if (sidebarToggleBtn && dashboardLayout) {
    sidebarToggleBtn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        dashboardLayout.classList.toggle('sidebar-mobile-open');
      } else {
        dashboardLayout.classList.toggle('sidebar-collapsed');
      }
    });

    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && dashboardLayout.classList.contains('sidebar-mobile-open')) {
        if (appSidebar && !appSidebar.contains(e.target) && !sidebarToggleBtn.contains(e.target)) {
          dashboardLayout.classList.remove('sidebar-mobile-open');
        }
      }
    });
  }

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768 && dashboardLayout) {
        dashboardLayout.classList.remove('sidebar-mobile-open');
      }
    });
  });

  // 4. Branch Selector Filter Logic
  const branchSelector = document.getElementById('branchSelector');
  const activeBranchCount = document.getElementById('activeBranchCount');
  const kpiTotalStudents = document.getElementById('kpiTotalStudents');
  const kpiCollections = document.getElementById('kpiCollections');
  const kpiOverdueAmount = document.getElementById('kpiOverdueAmount');

  if (branchSelector) {
    branchSelector.addEventListener('change', () => {
      const selected = branchSelector.value;
      const data = branchData[selected] || branchData.all;

      if (activeBranchCount) activeBranchCount.textContent = data.count;
      if (kpiTotalStudents) kpiTotalStudents.textContent = data.students;
      if (kpiCollections) kpiCollections.textContent = data.collections;
      if (kpiOverdueAmount) kpiOverdueAmount.textContent = data.overdue;

      showToast(`Dashboard updated for: ${branchSelector.options[branchSelector.selectedIndex].text}`, 'info');
    });
  }

  // 5. Interactive Attendance Marking
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-status');
    if (!btn) return;

    const group = btn.closest('.status-toggle-group');
    if (!group) return;

    group.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const status = btn.getAttribute('data-status');
    const studentRow = btn.closest('tr');
    const studentName = studentRow?.querySelector('.student-name')?.textContent || 'Student';

    showToast(`${studentName} marked as ${status.toUpperCase()}`, 'info');
  });

  const btnSaveAttendance = document.getElementById('btnSaveAttendance');
  if (btnSaveAttendance) {
    btnSaveAttendance.addEventListener('click', () => {
      btnSaveAttendance.textContent = 'Saving...';
      btnSaveAttendance.disabled = true;

      setTimeout(() => {
        btnSaveAttendance.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Confirm Batch Roster
        `;
        btnSaveAttendance.disabled = false;
        showToast('Batch attendance roster synchronized & saved successfully!', 'success');
      }, 700);
    });
  }

  const btnMarkBatchAttendance = document.getElementById('btnMarkBatchAttendance');
  if (btnMarkBatchAttendance) {
    btnMarkBatchAttendance.addEventListener('click', () => {
      const el = document.getElementById('attendanceWidget');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        el.style.boxShadow = '0 0 30px var(--color-primary-glow)';
        setTimeout(() => el.style.boxShadow = '', 1500);
      }
    });
  }

  const attendanceBatchSelector = document.getElementById('attendanceBatchSelector');
  if (attendanceBatchSelector) {
    attendanceBatchSelector.addEventListener('change', () => {
      showToast(`Loaded roster for ${attendanceBatchSelector.options[attendanceBatchSelector.selectedIndex].text}`, 'info');
    });
  }

  // 6. Action Buttons & Notifications
  const btnSendAllReminders = document.getElementById('btnSendAllReminders');
  if (btnSendAllReminders) {
    btnSendAllReminders.addEventListener('click', () => {
      showToast('14 Automated WhatsApp & SMS fee reminders queued for Super Admin broadcast!', 'success');
    });
  }

  const btnExportSummary = document.getElementById('btnExportSummary');
  if (btnExportSummary) {
    btnExportSummary.addEventListener('click', () => {
      showToast('Generating VAVA Sports Academy Monthly PDF Summary...', 'info');
      setTimeout(() => {
        showToast('Summary report downloaded successfully!', 'success');
      }, 1000);
    });
  }

  const notifBellBtn = document.getElementById('notifBellBtn');
  const notifDrawer = document.getElementById('notifDrawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');

  if (notifBellBtn && notifDrawer) {
    notifBellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = notifDrawer.style.display === 'block';
      notifDrawer.style.display = isVisible ? 'none' : 'block';
    });

    closeDrawerBtn?.addEventListener('click', () => {
      notifDrawer.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
      if (!notifDrawer.contains(e.target) && !notifBellBtn.contains(e.target)) {
        notifDrawer.style.display = 'none';
      }
    });
  }

  // 7. Global Search Filter
  const globalSearchInput = document.getElementById('globalSearchInput');
  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('.data-table tbody tr');
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
      });
    });
  }

  // 8. Initial Route & Hash Change Handler
  handleHashRoute();
  window.addEventListener('hashchange', handleHashRoute);
});
