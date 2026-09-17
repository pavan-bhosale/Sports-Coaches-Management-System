/**
 * VAVA Sports Academy - Navigation & Layout Module
 */

let currentActiveSectionHash = null;

function navigateToSection(targetHref, showToastNotice = true) {
  if (!targetHref || targetHref === '#' || targetHref === '#branches') targetHref = '#overview';

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

  const overviewSection = document.getElementById('overviewSection');
  const inventorySection = document.getElementById('inventorySection');
  const reportsSection = document.getElementById('reportsSection');
  const studentsSection = document.getElementById('studentsSection');
  const batchesSection = document.getElementById('batchesSection');
  const coachesSection = document.getElementById('coachesSection');
  const attendanceSection = document.getElementById('attendanceSection');
  const feesSection = document.getElementById('feesSection');
  const mainContent = document.getElementById('mainDashboardView');
  if (mainContent) mainContent.classList.remove('is-superadmin-attendance');

  // Reset all sections
  if (overviewSection) overviewSection.style.display = 'none';
  if (inventorySection) inventorySection.style.display = 'none';
  if (reportsSection) reportsSection.style.display = 'none';
  if (studentsSection) studentsSection.style.display = 'none';
  if (batchesSection) batchesSection.style.display = 'none';
  if (coachesSection) coachesSection.style.display = 'none';
  if (attendanceSection) attendanceSection.style.display = 'none';
  if (feesSection) feesSection.style.display = 'none';

  const storedRole = localStorage.getItem('vava_role') || 'admin';
  const isSuperAdmin = (storedRole === 'admin' || storedRole === 'superadmin');
  const isCoach = (storedRole === 'coach');

  // 1. Role-based Attendance Access Protection
  if (targetHref === '#attendance' && !isCoach && !isSuperAdmin) {
    if (showToastNotice && typeof showToast === 'function') {
      showToast('Access denied. Attendance is not accessible to your role.', 'error');
    }
    navigateToSection('#overview', false);
    return;
  }

  // 2. Role-based Fees & Collections Access Protection (Super Admin Only)
  if (targetHref === '#fees' && !isSuperAdmin) {
    if (showToastNotice && typeof showToast === 'function') {
      showToast('Access denied. Fees & Collections is accessible to Super Admin only.', 'error');
    }
    navigateToSection('#overview', false);
    return;
  }

  if (targetHref === '#overview') {
    if (overviewSection) overviewSection.style.display = 'block';
    const dashboardTitles = {
      admin:   'Super Admin Dashboard',
      coach:   'Coach Dashboard',
      student: 'Student Dashboard'
    };
    if (pageTitle) pageTitle.textContent = dashboardTitles[storedRole] || 'Super Admin Dashboard';
    if (currentSectionName) currentSectionName.textContent = 'Overview';
  } else if (targetHref === '#inventory') {
    if (inventorySection) inventorySection.style.display = 'block';
    if (pageTitle) pageTitle.textContent = 'Inventory & Gear';
    if (currentSectionName) currentSectionName.textContent = 'Inventory & Gear';
  } else if (targetHref === '#reports') {
    if (reportsSection) reportsSection.style.display = 'block';
    if (pageTitle) pageTitle.textContent = 'Reports & Analytics';
    if (currentSectionName) currentSectionName.textContent = 'Reports & Analytics';
  } else if (targetHref === '#attendance') {
    if (attendanceSection) {
      attendanceSection.style.display = '';
      const coachHeader = document.getElementById('coachAttendanceHeader');
      const batchFilterWrap = document.getElementById('superadminBatchFilterWrap');
      if (isSuperAdmin) {
        attendanceSection.classList.add('is-superadmin');
        if (mainContent) mainContent.classList.add('is-superadmin-attendance');
        if (coachHeader) {
          coachHeader.style.setProperty('display', 'none', 'important');
          coachHeader.classList.add('superadmin-hidden');
        }
        if (batchFilterWrap) batchFilterWrap.style.display = 'flex';
      } else {
        attendanceSection.classList.remove('is-superadmin');
        if (mainContent) mainContent.classList.remove('is-superadmin-attendance');
        if (coachHeader) {
          coachHeader.style.removeProperty('display');
          coachHeader.classList.remove('superadmin-hidden');
        }
        if (batchFilterWrap) batchFilterWrap.style.display = 'none';
      }
      if (typeof fetchAttendanceSheets === 'function') fetchAttendanceSheets();
    }
  } else if (targetHref === '#students') {
    if (studentsSection) {
      studentsSection.style.display = '';
      if (typeof fetchStudents === 'function') fetchStudents();
    }
  } else if (targetHref === '#batches') {
    if (batchesSection) {
      batchesSection.style.display = '';
      if (typeof fetchBatches === 'function') fetchBatches();
    }
  } else if (targetHref === '#coaches') {
    if (coachesSection) {
      coachesSection.style.display = '';
      if (typeof fetchCoaches === 'function') fetchCoaches();
    }
  } else if (targetHref === '#fees') {
    if (feesSection) {
      feesSection.style.display = '';
      if (typeof initFeesModule === 'function') initFeesModule();
    }
    if (pageTitle) pageTitle.textContent = 'Fee & Payments';
    if (currentSectionName) currentSectionName.textContent = 'Fees & Collections';
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
  let currentHash = window.location.hash || '#overview';
  if (currentHash === '#branches') {
    currentHash = '#overview';
    window.location.hash = '#overview';
  }
  const storedRole = localStorage.getItem('vava_role') || 'admin';
  const isSuperAdmin = (storedRole === 'admin' || storedRole === 'superadmin');
  const isCoach = (storedRole === 'coach');
  if (currentHash === '#attendance' && !isCoach && !isSuperAdmin) {
    window.location.hash = '#overview';
    navigateToSection('#overview', false);
    return;
  }
  if (currentHash === '#fees' && !isSuperAdmin) {
    window.location.hash = '#overview';
    navigateToSection('#overview', false);
    return;
  }
  if (currentHash !== currentActiveSectionHash) {
    navigateToSection(currentHash, false);
  }
}


// ── Dynamic Sidebar Profile Element Initialization ───────
function initSidebarUserProfile() {
  const emailEl = document.getElementById('sidebarUserEmail');
  const roleEl = document.getElementById('sidebarUserRole');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  const chipEl = document.getElementById('sidebarUserProfileChip');
  const logoutBtn = document.getElementById('sidebarLogoutBtn') || document.querySelector('.logout-icon-btn');

  const storedRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
  const storedEmail = localStorage.getItem('vava_email') || '';
  let userObj = null;
  try {
    const raw = localStorage.getItem('vava_user');
    if (raw) userObj = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse vava_user:', e);
  }

  // 1. Dynamic Email
  const displayEmail = storedEmail || userObj?.email || '';

  // 2. Dynamic Role (using existing role logic / labels)
  const roleLabels = {
    admin: 'SUPER ADMIN',
    superadmin: 'SUPER ADMIN',
    coach: 'COACH',
    student: 'STUDENT'
  };
  const roleLabel = roleLabels[storedRole] || (storedRole ? storedRole.toUpperCase() : 'USER');

  // 3. Render Email & Role
  if (emailEl) {
    emailEl.textContent = displayEmail || 'Authenticated User';
    if (displayEmail) {
      emailEl.setAttribute('title', displayEmail);
    }
  }

  if (roleEl) {
    roleEl.textContent = roleLabel;
  }

  if (chipEl && displayEmail) {
    chipEl.setAttribute('title', `${displayEmail} • ${roleLabel}`);
  }

  // 4. Dynamic Avatar / Initials
  if (avatarEl) {
    const photoUrl = userObj?.picture || userObj?.coach_photo || userObj?.student_photo || userObj?.photo || '';
    
    // Dynamic initials calculation
    let initials = '';
    const displayName = userObj?.name || userObj?.coach_name || userObj?.student_name || '';
    if (displayName && typeof displayName === 'string' && !displayName.includes('@')) {
      const parts = displayName.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        initials = (parts[0][0] + parts[1][0]).toUpperCase();
      } else if (parts.length === 1 && parts[0].length >= 2) {
        initials = parts[0].substring(0, 2).toUpperCase();
      } else if (parts.length === 1) {
        initials = parts[0].toUpperCase();
      }
    } else if (displayEmail) {
      const prefix = displayEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
      if (prefix.length >= 2) {
        initials = prefix.substring(0, 2).toUpperCase();
      } else if (prefix.length === 1) {
        initials = prefix.toUpperCase();
      }
    }

    if (!initials) {
      initials = roleLabel.substring(0, 2);
    }

    if (photoUrl) {
      avatarEl.innerHTML = `<img src="${photoUrl}" alt="${displayEmail}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentElement.textContent='${initials}'">`;
    } else {
      avatarEl.textContent = initials;
    }
  }

  // 5. Logout Handling
  if (logoutBtn && !logoutBtn._hasLogoutBound) {
    logoutBtn._hasLogoutBound = true;
    logoutBtn.addEventListener('click', () => {
      try {
        localStorage.removeItem('vava_token');
        localStorage.removeItem('vava_role');
        localStorage.removeItem('vava_user');
        localStorage.removeItem('vava_email');
        if (window.google?.accounts?.id?.disableAutoSelect) {
          google.accounts.id.disableAutoSelect();
        }
      } catch (err) {
        console.error('Logout cleanup error:', err);
      }
    });
  }
}
window.initSidebarUserProfile = initSidebarUserProfile;

// ── Navigation Initialization & Event Listeners ───────────
document.addEventListener('DOMContentLoaded', () => {
  // 1. Role Title Setting & Attendance Nav Visibility
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

  const navAttendanceEl = document.getElementById('nav-attendance');
  const navFeesEl = document.getElementById('nav-fees');
  const isSuperAdminUser = (storedRole === 'admin' || storedRole === 'superadmin');
  if (navAttendanceEl) {
    if (storedRole !== 'coach' && !isSuperAdminUser) {
      navAttendanceEl.style.display = 'none';
    } else {
      navAttendanceEl.style.display = '';
    }
  }
  if (navFeesEl) {
    if (!isSuperAdminUser) {
      navFeesEl.style.display = 'none';
    } else {
      navFeesEl.style.display = '';
    }
  }

  // Initialize Sidebar Profile Element dynamically
  initSidebarUserProfile();

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
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const dashboardLayout = document.querySelector('.dashboard-layout');

  if (sidebarToggleBtn && dashboardLayout) {
    sidebarToggleBtn.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        dashboardLayout.classList.toggle('sidebar-mobile-open');
      } else {
        dashboardLayout.classList.toggle('sidebar-collapsed');
      }
    });

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', () => {
        dashboardLayout.classList.remove('sidebar-mobile-open');
      });
    }

    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 1024 && dashboardLayout.classList.contains('sidebar-mobile-open')) {
        if (appSidebar && !appSidebar.contains(e.target) && !sidebarToggleBtn.contains(e.target) && (!sidebarBackdrop || !sidebarBackdrop.contains(e.target))) {
          dashboardLayout.classList.remove('sidebar-mobile-open');
        }
      }
    });
  }

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 1024 && dashboardLayout) {
        dashboardLayout.classList.remove('sidebar-mobile-open');
      }
    });
  });


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
