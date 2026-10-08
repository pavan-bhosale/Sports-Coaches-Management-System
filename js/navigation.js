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

  if (targetHref !== '#overview' && typeof window.cleanDashboardCharts === 'function') {
    window.cleanDashboardCharts();
  }

  const storedRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
  const isSuperAdmin = (storedRole === 'admin' || storedRole === 'superadmin');
  const isCoach = (storedRole === 'coach');
  const isStudent = (storedRole === 'student');

  // 0. Student Profile Direct Modal Action
  if (targetHref === '#profile') {
    if (isStudent && typeof window.openStudentProfile === 'function') {
      window.openStudentProfile();
    }
    const overviewLink = document.querySelector('.sidebar-nav .nav-link[href="#overview"]');
    if (overviewLink) {
      navLinks.forEach(l => l.classList.remove('active'));
      overviewLink.classList.add('active');
    }
    if (window.innerWidth <= 1024 && appSidebar) {
      const layout = document.querySelector('.dashboard-layout');
      if (layout) layout.classList.remove('sidebar-mobile-open');
    }
    return;
  }

  // 1. Role-based Student Access Protection (Personal Overview Only)
  if (isStudent && targetHref !== '#overview' && targetHref !== '#profile') {
    if (showToastNotice && typeof showToast === 'function') {
      showToast('Access denied. Athlete portal is restricted to personal overview.', 'error');
    }
    window.location.hash = '#overview';
    navigateToSection('#overview', false);
    return;
  }

  // 2. Role-based Attendance Access Protection
  if (targetHref === '#attendance' && !isCoach && !isSuperAdmin) {
    if (showToastNotice && typeof showToast === 'function') {
      showToast('Access denied. Attendance is not accessible to your role.', 'error');
    }
    window.location.hash = '#overview';
    navigateToSection('#overview', false);
    return;
  }

  // 3. Role-based Fees & Collections Access Protection (Super Admin Only)
  if (targetHref === '#fees' && !isSuperAdmin) {
    if (showToastNotice && typeof showToast === 'function') {
      showToast('Access denied. Fees & Collections is accessible to Super Admin only.', 'error');
    }
    window.location.hash = '#overview';
    navigateToSection('#overview', false);
    return;
  }

  // 4. Role-based Inventory & Equipment Access Protection (Super Admin Only)
  if (targetHref === '#inventory' && !isSuperAdmin) {
    if (showToastNotice && typeof showToast === 'function') {
      showToast('Access denied. Inventory & Equipment is accessible to Super Admin only.', 'error');
    }
    window.location.hash = '#overview';
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
    if (typeof window.loadDashboardOverview === 'function') {
      window.loadDashboardOverview();
    }
  } else if (targetHref === '#inventory') {
    if (inventorySection) {
      inventorySection.style.display = 'block';
      if (typeof window.fetchInventory === 'function') {
        window.fetchInventory();
      } else if (typeof fetchInventory === 'function') {
        fetchInventory();
      }
    }
    if (pageTitle) pageTitle.textContent = 'Inventory & Equipment';
    if (currentSectionName) currentSectionName.textContent = 'Inventory & Equipment';
  } else if (targetHref === '#reports') {
    if (reportsSection) reportsSection.style.display = 'block';
    if (pageTitle) pageTitle.textContent = 'Reports & Analytics';
    if (currentSectionName) currentSectionName.textContent = 'Reports & Analytics';
    if (typeof initReportsModule === 'function') initReportsModule();
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
      if (typeof window.fetchCoaches === 'function') {
        window.fetchCoaches();
      } else if (typeof fetchCoaches === 'function') {
        fetchCoaches();
      }
    }
  } else if (targetHref === '#fees') {
    if (feesSection) {
      feesSection.style.display = '';
      if (typeof initFeesModule === 'function') initFeesModule();
    }
    if (pageTitle) pageTitle.textContent = 'Fees & Payments';
    if (currentSectionName) currentSectionName.textContent = 'Fees & Payments';
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
  const storedRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
  const isSuperAdmin = (storedRole === 'admin' || storedRole === 'superadmin');
  const isCoach = (storedRole === 'coach');
  const isStudent = (storedRole === 'student');

  if (isStudent && currentHash === '#profile') {
    window.location.hash = '#overview';
    navigateToSection('#overview', false);
    if (typeof window.openStudentProfile === 'function') {
      window.openStudentProfile();
    }
    return;
  }
  if (isStudent && currentHash !== '#overview') {
    window.location.hash = '#overview';
    navigateToSection('#overview', false);
    return;
  }
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
  if (currentHash === '#inventory' && !isSuperAdmin) {
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
  if (typeof applySidebarRolePermissions === 'function') {
    applySidebarRolePermissions();
  }
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
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (window.google?.accounts?.id?.disableAutoSelect) {
          try { google.accounts.id.disableAutoSelect(); } catch (_) {}
        }
        // Destroy authoritative server-side PHP session
        const logoutUrl = (typeof getApiEndpoint === 'function')
          ? getApiEndpoint('logout')
          : 'server/logout.php';
        try {
          const res = await fetch(logoutUrl, {
            method: 'POST',
            credentials: 'include'
          });
          if (res.ok) {
            try { await res.json(); } catch (_) {}
          }
        } catch (fetchErr) {
          console.warn('Logout server notice:', fetchErr);
        }
      } catch (err) {
        console.error('Logout cleanup error:', err);
      } finally {
        localStorage.removeItem('vava_token');
        localStorage.removeItem('vava_role');
        localStorage.removeItem('vava_user');
        localStorage.removeItem('vava_email');
        localStorage.removeItem('vava_coach_id');
        localStorage.removeItem('vava_student_id');
        localStorage.removeItem('vava_api_base');
        sessionStorage.clear();
        window.location.href = 'index.html';
      }
    });
  }

  // 6. Student Profile Click Handling (Opens existing student profile view)
  if (chipEl && !chipEl._hasProfileClickBound) {
    chipEl._hasProfileClickBound = true;
    chipEl.addEventListener('click', (e) => {
      if (e.target.closest('#sidebarLogoutBtn')) return;
      const currentRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
      if (currentRole === 'student' && typeof window.openStudentProfile === 'function') {
        window.openStudentProfile();
        if (window.innerWidth <= 1024) {
          const layout = document.querySelector('.dashboard-layout');
          if (layout) layout.classList.remove('sidebar-mobile-open');
        }
      }
    });
  }
}
function applySidebarRolePermissions(explicitRole = null) {
  const storedRole = (explicitRole || localStorage.getItem('vava_role') || 'admin').toLowerCase();
  const navAttendanceEl = document.getElementById('nav-attendance');
  const navFeesEl = document.getElementById('nav-fees');
  const navInventoryEl = document.getElementById('nav-inventory');
  const navStudentsEl = document.getElementById('nav-students');
  const navBatchesEl = document.getElementById('nav-batches');
  const navCoachesEl = document.getElementById('nav-coaches');
  const navReportsEl = document.getElementById('nav-reports');
  const navStudentProfileEl = document.getElementById('nav-student-profile');

  const isSuperAdminUser = (storedRole === 'admin' || storedRole === 'superadmin');
  const isCoachUser = (storedRole === 'coach');
  const isStudentUser = (storedRole === 'student');

  if (isStudentUser) {
    if (navStudentProfileEl) navStudentProfileEl.style.display = 'flex';
    if (navAttendanceEl) navAttendanceEl.style.display = 'none';
    if (navFeesEl) navFeesEl.style.display = 'none';
    if (navInventoryEl) navInventoryEl.style.display = 'none';
    if (navStudentsEl) navStudentsEl.style.display = 'none';
    if (navBatchesEl) navBatchesEl.style.display = 'none';
    if (navCoachesEl) navCoachesEl.style.display = 'none';
    if (navReportsEl) navReportsEl.style.display = 'none';
    const sectionTitles = document.querySelectorAll('.sidebar-nav .nav-section-title');
    sectionTitles.forEach(t => { t.style.display = 'none'; });
  } else {
    if (navStudentProfileEl) navStudentProfileEl.style.display = 'none';
    if (navAttendanceEl) {
      navAttendanceEl.style.display = (isCoachUser || isSuperAdminUser) ? '' : 'none';
    }
    if (navFeesEl) {
      navFeesEl.style.display = isSuperAdminUser ? '' : 'none';
    }
    if (navInventoryEl) {
      navInventoryEl.style.display = isSuperAdminUser ? '' : 'none';
    }
    if (navStudentsEl) navStudentsEl.style.display = '';
    if (navBatchesEl) navBatchesEl.style.display = '';
    if (navCoachesEl) navCoachesEl.style.display = '';
    if (navReportsEl) navReportsEl.style.display = '';
    const sectionTitles = document.querySelectorAll('.sidebar-nav .nav-section-title');
    sectionTitles.forEach(t => { t.style.display = ''; });
  }

  // Dynamic dashboard title sync on overview
  const dashboardTitles = {
    admin:   'Super Admin Dashboard',
    superadmin: 'Super Admin Dashboard',
    coach:   'Coach Dashboard',
    student: 'Student Dashboard'
  };
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl && (!window.location.hash || window.location.hash === '#overview')) {
    pageTitleEl.textContent = dashboardTitles[storedRole] || 'Super Admin Dashboard';
  }
}
window.applySidebarRolePermissions = applySidebarRolePermissions;

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

  applySidebarRolePermissions();

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
