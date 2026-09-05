/**
 * VAVA Sports Academy - Dashboard Interactive Client Logic
 * Handles branch filtering, live attendance marking, WhatsApp reminders,
 * drawer toggles, and notification toasts.
 */

document.addEventListener('DOMContentLoaded', () => {
  // API Endpoints
  const STUDENTS_API = 'http://localhost/VAVA_sports/server/students.php';
  const COACHES_API  = 'http://localhost/VAVA_sports/server/coaches.php';
  const BATCHES_API  = 'http://localhost/VAVA_sports/server/batches.php';

  // DOM Elements
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const appSidebar = document.getElementById('appSidebar');
  const branchSelector = document.getElementById('branchSelector');
  const activeBranchCount = document.getElementById('activeBranchCount');
  
  // KPI Elements
  const kpiTotalStudents = document.getElementById('kpiTotalStudents');
  const kpiCollections = document.getElementById('kpiCollections');
  const kpiOverdueAmount = document.getElementById('kpiOverdueAmount');
  
  // Attendance Elements
  const attendanceBatchSelector = document.getElementById('attendanceBatchSelector');
  const btnSaveAttendance = document.getElementById('btnSaveAttendance');
  const attendanceTableBody = document.getElementById('attendanceTableBody');
  const btnMarkBatchAttendance = document.getElementById('btnMarkBatchAttendance');
  
  // Notification Elements
  const notifBellBtn = document.getElementById('notifBellBtn');
  const notifDrawer = document.getElementById('notifDrawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const btnSendAllReminders = document.getElementById('btnSendAllReminders');
  const btnExportSummary = document.getElementById('btnExportSummary');

  // Set dashboard title based on login role
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
  const toastContainer = document.getElementById('toastContainer');
  const globalSearchInput = document.getElementById('globalSearchInput');

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

  // 1. Sidebar Navigation Active Link & Section Switcher
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
  const pageTitle = document.getElementById('pageTitle');
  const currentSectionName = document.getElementById('currentSectionName');
  let currentActiveSectionHash = null;

  function navigateToSection(targetHref, showToastNotice = true) {
    if (!targetHref || targetHref === '#') targetHref = '#overview';

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
        fetchStudents();
      }
      if (globalStatusPill) globalStatusPill.style.display = 'none';
    } else if (targetHref === '#batches') {
      if (batchesSection) {
        batchesSection.style.display = '';
        fetchBatches();
      }
      if (globalStatusPill) globalStatusPill.style.display = 'none';
    } else if (targetHref === '#coaches') {
      if (coachesSection) {
        coachesSection.style.display = '';
        fetchCoaches();
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

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetHref = link.getAttribute('href');
      if (targetHref) {
        navigateToSection(targetHref, true);
      }
    });
  });



  // 2. Sidebar Toggle (Retractable Desktop & Mobile Open)
  const dashboardLayout = document.querySelector('.dashboard-layout');

  if (sidebarToggleBtn && dashboardLayout) {
    sidebarToggleBtn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        dashboardLayout.classList.toggle('sidebar-mobile-open');
      } else {
        dashboardLayout.classList.toggle('sidebar-collapsed');
      }
    });

    // Close mobile menu on outside click
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && dashboardLayout.classList.contains('sidebar-mobile-open')) {
        if (!appSidebar.contains(e.target) && !sidebarToggleBtn.contains(e.target)) {
          dashboardLayout.classList.remove('sidebar-mobile-open');
        }
      }
    });
  }

  // Close mobile sidebar on nav link click
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768 && dashboardLayout) {
        dashboardLayout.classList.remove('sidebar-mobile-open');
      }
    });
  });

  // 2. Branch Filter Logic
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

  // 3. Interactive Attendance Marking (Present / Late / Absent)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-status');
    if (!btn) return;

    const group = btn.closest('.status-toggle-group');
    if (!group) return;

    // Toggle active state
    group.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const status = btn.getAttribute('data-status');
    const studentRow = btn.closest('tr');
    const studentName = studentRow?.querySelector('.student-name')?.textContent || 'Student';

    showToast(`${studentName} marked as ${status.toUpperCase()}`, 'info');
  });

  // Save Batch Attendance Confirmation
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

  // Jump to Attendance widget button
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

  // 4. Batch Selector Change Handler
  if (attendanceBatchSelector) {
    attendanceBatchSelector.addEventListener('change', () => {
      showToast(`Loaded roster for ${attendanceBatchSelector.options[attendanceBatchSelector.selectedIndex].text}`, 'info');
    });
  }

  // 5. Follow-Up Triggers (WhatsApp & Payment)
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

  // Send All Reminders Button
  if (btnSendAllReminders) {
    btnSendAllReminders.addEventListener('click', () => {
      showToast('14 Automated WhatsApp & SMS fee reminders queued for Super Admin broadcast!', 'success');
    });
  }

  // Export Summary Report Button
  if (btnExportSummary) {
    btnExportSummary.addEventListener('click', () => {
      showToast('Generating VAVA Sports Academy Monthly PDF Summary...', 'info');
      setTimeout(() => {
        showToast('Summary report downloaded successfully!', 'success');
      }, 1000);
    });
  }

  // 6. Notification Flyout Drawer Handlers
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

  // =========================================================
  // STUDENTS & BATCHES MODULE
  // =========================================================

  // Helper to open/close modals
  function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.style.display = 'none'; document.body.style.overflow = ''; }
  }

  // =========================================================
  // STUDENTS MODULE
  // =========================================================

  const branchLabelMap = {
    'virar': 'Virar West Turf Branch',
    'nallasopara': 'Nallasopara East Branch',
    'vasai': 'Vasai East Branch (Hilton Arcade)'
  };
  function formatBranchLabel(raw) {
    if (!raw) return '—';
    return branchLabelMap[raw] || raw;
  }

  const coachLabelMap = {
    'rajesh_pawar': 'Rajesh Pawar',
    'amit_verma': 'Amit Verma',
    'priya_sharma': 'Priya Sharma',
    'suresh_nair': 'Suresh Nair',
    'deepak_kadam': 'Deepak Kadam'
  };
  function formatCoachLabel(raw) {
    if (!raw) return '—';
    return coachLabelMap[raw] || raw;
  }

  function getStudentInitials(name) {
    if (!name) return 'S';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }

  function updateStudentsLiveCount(count) {
    const el = document.getElementById('studentsLiveCount');
    if (!el) return;
    el.textContent = count === 1 ? '1 Active Student' : `${count} Active Students`;
  }

  // ── Add Student — Full-Page Registration Form ─────────────
  const btnAddStudent = document.getElementById('btnAddStudent');
  const closeAddStudentBtn = document.getElementById('closeAddStudentModal');
  const cancelAddStudent = document.getElementById('cancelAddStudent');
  const submitAddStudent = document.getElementById('submitAddStudent');

  function openRegForm() {
    populateBatchDropdowns();
    populateCoachDropdowns();
    const overlay = document.getElementById('addStudentModal');
    if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  }
  function closeRegForm() {
    const overlay = document.getElementById('addStudentModal');
    if (overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; }
    clearRegErrors();
  }
  function clearRegErrors() {
    document.querySelectorAll('#addStudentModal .reg-error').forEach(e => e.classList.remove('visible'));
    document.querySelectorAll('#addStudentModal .reg-input, #addStudentModal .reg-gender-group').forEach(el => el.classList.remove('reg-input-error'));
  }

  if (btnAddStudent) btnAddStudent.addEventListener('click', openRegForm);
  if (closeAddStudentBtn) closeAddStudentBtn.addEventListener('click', closeRegForm);
  if (cancelAddStudent) cancelAddStudent.addEventListener('click', closeRegForm);

  const regValidations = [
    { id: 'regFullName',    check: v => v.trim().length > 0,            errId: 'err-regFullName' },
    { id: 'regParentName',  check: v => v.trim().length > 0,            errId: 'err-regParentName' },
    { id: 'regDob',         check: v => v.trim().length > 0,            errId: 'err-regDob' },
    { id: 'regBranch',      check: v => v !== '',                        errId: 'err-regBranch' },
    { id: 'regCoach',       check: v => v !== '',                        errId: 'err-regCoach' },
    { id: 'regAddressLine', check: v => v.trim().length > 0,            errId: 'err-regAddressLine' },
    { id: 'regCity',        check: v => v.trim().length > 0,            errId: 'err-regCity' },
    { id: 'regPostal',      check: v => /^\d{6}$/.test(v.trim()),       errId: 'err-regPostal' },
    { id: 'regFatherContact', check: v => /^\d{10}$/.test(v.trim()),      errId: 'err-regFatherContact' },
    { id: 'regMotherContact', check: v => v.trim() === '' || /^\d{10}$/.test(v.trim()), errId: 'err-regMotherContact' },
    { id: 'regEmergency',   check: v => /^\d{10}$/.test(v.trim()),      errId: 'err-regEmergency' },
    { id: 'regWhatsapp',    check: v => /^\d{10}$/.test(v.trim()),      errId: 'err-regWhatsapp' },
  ];

  if (submitAddStudent) {
    submitAddStudent.addEventListener('click', async () => {
      clearRegErrors();
      let hasError = false;

      regValidations.forEach(({ id, check, errId }) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!check(el.value)) {
          el.classList.add('reg-input-error');
          const errEl = document.getElementById(errId);
          if (errEl) errEl.classList.add('visible');
          hasError = true;
        }
      });

      const genderSelected = document.querySelector('input[name="regGender"]:checked');
      if (!genderSelected) {
        const errEl = document.getElementById('err-regGender');
        if (errEl) errEl.classList.add('visible');
        hasError = true;
      }

      if (hasError) {
        const firstErr = document.querySelector('#addStudentModal .reg-input-error, #addStudentModal .reg-error.visible');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const regBatchEl = document.getElementById('regBatch');
      const payload = {
        student_name: document.getElementById('regFullName').value.trim(),
        parent_name: document.getElementById('regParentName').value.trim(),
        date_of_birth: document.getElementById('regDob').value,
        gender: genderSelected.value,
        blood_group: document.getElementById('regBloodGroup').value,
        branch_name: document.getElementById('regBranch').value,
        batch_name: regBatchEl ? regBatchEl.value : 'No Batch',
        coach_name: document.getElementById('regCoach').value,
        address: document.getElementById('regAddressLine').value.trim(),
        city: document.getElementById('regCity').value.trim(),
        postal_code: document.getElementById('regPostal').value.trim(),
        father_contact_number: document.getElementById('regFatherContact').value.trim(),
        mother_contact_number: document.getElementById('regMotherContact').value.trim(),
        emergency_contact_number: document.getElementById('regEmergency').value.trim(),
        whatsapp_number: document.getElementById('regWhatsapp').value.trim()
      };

      submitAddStudent.disabled = true;
      submitAddStudent.innerHTML = 'Registering...';

      try {
        const res = await fetch(STUDENTS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          closeRegForm();
          document.getElementById('addStudentForm').reset();
          showToast(`Student "${payload.student_name}" registered successfully!`, 'success');
          fetchStudents();
        } else {
          showToast(data.error || 'Failed to register student.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Register Student Error:', err);
      } finally {
        submitAddStudent.disabled = false;
        submitAddStudent.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Register Student`;
      }
    });
  }

  // ── Fetch & Render Students (Table) ────────────────────────
  let fetchStudentsRequestId = 0;
  async function fetchStudents() {
    const requestId = ++fetchStudentsRequestId;
    const tableWidget = document.getElementById('studentsTableWidget');
    const tableBody   = document.getElementById('studentsTableBody');
    const emptyState  = document.getElementById('studentsEmptyState');
    if (!tableBody || !emptyState || !tableWidget) return;

    tableBody.innerHTML = '';

    try {
      const res = await fetch(STUDENTS_API);
      const data = await res.json();
      if (requestId !== fetchStudentsRequestId) return;
      if (!data.success) throw new Error(data.error || 'Fetch failed.');

      const students = data.students || [];
      updateStudentsLiveCount(students.length);

      if (students.length === 0) {
        tableWidget.style.display = 'none';
        emptyState.style.display  = 'flex';
        tableBody.innerHTML = '';
      } else {
        emptyState.style.display  = 'none';
        tableWidget.style.display = 'block';
        tableBody.innerHTML = '';

        students.forEach(student => {
          const tr = document.createElement('tr');
          tr.dataset.studentId = student.student_id;
          const initials = getStudentInitials(student.student_name);
          const branchLabel = formatBranchLabel(student.branch_name);
          const coachLabel = formatCoachLabel(student.coach_name);
          const whatsappFormatted = student.whatsapp_number ? `+91 ${student.whatsapp_number}` : '—';
          const studentJsonStr = encodeURIComponent(JSON.stringify(student));
          const batchDisplay = student.batch_name || 'No Batch';

          tr.innerHTML = `
            <td>
              <div class="student-cell">
                <div class="student-avatar bg-avatar-green" style="${student.student_photo ? 'background:none;padding:0;' : ''}">
                  ${student.student_photo ? `<img src="${student.student_photo}?t=${Date.now()}" class="coach-photo-img" alt="Student Photo">` : initials}
                </div>
                <div>
                  <a href="javascript:void(0)" class="student-name-link" data-id="${student.student_id}" style="font-weight:600;color:var(--color-primary);text-decoration:none;">${student.student_name}</a>
                  <div class="student-sub">Parent: ${student.parent_name || '—'}</div>
                </div>
              </div>
            </td>
            <td><span class="coach-batch-tag" style="display:inline-block;">${batchDisplay}</span></td>
            <td><span class="branch-tag">${branchLabel}</span></td>
            <td>${student.city || '—'}</td>
            <td><span class="code-badge">${student.blood_group || 'N/A'}</span></td>
            <td style="font-size:0.875rem;">${whatsappFormatted}</td>
            <td>${coachLabel}</td>
            <td>
              <div class="batch-actions-wrap">
                <button class="batch-actions-btn student-actions-btn" data-id="${student.student_id}" type="button">
                  Actions
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div class="batch-actions-menu" id="studentMenu-${student.student_id}">
                  <button class="batch-action-item student-edit-item" data-id="${student.student_id}" data-student="${studentJsonStr}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit Student
                  </button>
                  <button class="batch-action-item danger student-delete-item" data-id="${student.student_id}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                    Delete Student
                  </button>
                </div>
              </div>
            </td>
          `;
          tableBody.appendChild(tr);
        });

        // Re-apply student search filter if search term is active
        const searchInput = document.getElementById('sbSearchInput');
        if (searchInput && searchInput.value.trim() !== '') {
          searchInput.dispatchEvent(new Event('input'));
        }
      }
    } catch (err) {
      console.error('Fetch Students Error:', err);
      showToast('Could not load students.', 'error');
    }
  }

  // ── Edit Student Form Handling ────────────────────────────
  const closeEditStudentBtn = document.getElementById('closeEditStudentModal');
  const cancelEditStudent = document.getElementById('cancelEditStudent');
  const submitEditStudent = document.getElementById('submitEditStudent');

  function openEditStudentForm() {
    populateBatchDropdowns();
    populateCoachDropdowns();
    const overlay = document.getElementById('editStudentModal');
    if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  }
  function closeEditStudentForm() {
    const overlay = document.getElementById('editStudentModal');
    if (overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; }
    clearEditStudentErrors();
  }
  function clearEditStudentErrors() {
    const form = document.getElementById('editStudentForm');
    if (form) {
      form.querySelectorAll('.reg-error').forEach(e => e.classList.remove('visible'));
      form.querySelectorAll('.reg-input, .reg-gender-group').forEach(el => el.classList.remove('reg-input-error'));
    }
  }

  if (closeEditStudentBtn) closeEditStudentBtn.addEventListener('click', closeEditStudentForm);
  if (cancelEditStudent) cancelEditStudent.addEventListener('click', closeEditStudentForm);

  document.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.student-edit-item');
    if (!editBtn) return;

    document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));
    const raw = editBtn.getAttribute('data-student');
    if (!raw) return;

    try {
      const s = JSON.parse(decodeURIComponent(raw));
      document.getElementById('editStudentId').value = s.student_id || '';
      document.getElementById('editRegFullName').value = s.student_name || '';
      document.getElementById('editRegParentName').value = s.parent_name || '';
      document.getElementById('editRegDob').value = s.date_of_birth || '';

      const maleRadio = document.getElementById('editGenderMale');
      const femaleRadio = document.getElementById('editGenderFemale');
      if (maleRadio) maleRadio.checked = (s.gender === 'male');
      if (femaleRadio) femaleRadio.checked = (s.gender === 'female');

      document.getElementById('editRegBloodGroup').value = s.blood_group || '';
      document.getElementById('editRegBranch').value = s.branch_name || '';

      await populateBatchDropdowns();
      await populateCoachDropdowns();

      const editBatchEl = document.getElementById('editRegBatch');
      if (editBatchEl) editBatchEl.value = s.batch_name || 'No Batch';
      const editCoachEl = document.getElementById('editRegCoach');
      if (editCoachEl) editCoachEl.value = s.coach_name || '';

      document.getElementById('editRegAddressLine').value = s.address || '';
      document.getElementById('editRegCity').value = s.city || '';
      document.getElementById('editRegPostal').value = s.postal_code || '';
      document.getElementById('editRegFatherContact').value = s.father_contact_number || '';
      document.getElementById('editRegMotherContact').value = s.mother_contact_number || '';
      document.getElementById('editRegEmergency').value = s.emergency_contact_number || '';
      document.getElementById('editRegWhatsapp').value = s.whatsapp_number || '';

      openEditStudentForm();
    } catch (err) {
      console.error('Error parsing student data:', err);
    }
  });

  const editStudentValidations = [
    { id: 'editRegFullName',    check: v => v.trim().length > 0,            errId: 'err-editRegFullName' },
    { id: 'editRegParentName',  check: v => v.trim().length > 0,            errId: 'err-editRegParentName' },
    { id: 'editRegDob',         check: v => v.trim().length > 0,            errId: 'err-editRegDob' },
    { id: 'editRegBranch',      check: v => v !== '',                        errId: 'err-editRegBranch' },
    { id: 'editRegCoach',       check: v => v !== '',                        errId: 'err-editRegCoach' },
    { id: 'editRegAddressLine', check: v => v.trim().length > 0,            errId: 'err-editRegAddressLine' },
    { id: 'editRegCity',        check: v => v.trim().length > 0,            errId: 'err-editRegCity' },
    { id: 'editRegPostal',      check: v => /^\d{6}$/.test(v.trim()),       errId: 'err-editRegPostal' },
    { id: 'editRegFatherContact', check: v => /^\d{10}$/.test(v.trim()),      errId: 'err-editRegFatherContact' },
    { id: 'editRegMotherContact', check: v => v.trim() === '' || /^\d{10}$/.test(v.trim()), errId: 'err-editRegMotherContact' },
    { id: 'editRegEmergency',   check: v => /^\d{10}$/.test(v.trim()),      errId: 'err-editRegEmergency' },
    { id: 'editRegWhatsapp',    check: v => /^\d{10}$/.test(v.trim()),      errId: 'err-editRegWhatsapp' },
  ];

  if (submitEditStudent) {
    submitEditStudent.addEventListener('click', async () => {
      clearEditStudentErrors();
      let hasError = false;

      editStudentValidations.forEach(({ id, check, errId }) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!check(el.value)) {
          el.classList.add('reg-input-error');
          const errEl = document.getElementById(errId);
          if (errEl) errEl.classList.add('visible');
          hasError = true;
        }
      });

      const genderSelected = document.querySelector('input[name="editRegGender"]:checked');
      if (!genderSelected) {
        const errEl = document.getElementById('err-editRegGender');
        if (errEl) errEl.classList.add('visible');
        hasError = true;
      }

      if (hasError) {
        const firstErr = document.querySelector('#editStudentModal .reg-input-error');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      submitEditStudent.disabled = true;
      submitEditStudent.innerHTML = 'Saving...';

      const editBatchEl = document.getElementById('editRegBatch');
      const payload = {
        student_id: parseInt(document.getElementById('editStudentId').value),
        student_name: document.getElementById('editRegFullName').value.trim(),
        parent_name: document.getElementById('editRegParentName').value.trim(),
        date_of_birth: document.getElementById('editRegDob').value,
        gender: genderSelected.value,
        blood_group: document.getElementById('editRegBloodGroup').value,
        branch_name: document.getElementById('editRegBranch').value,
        batch_name: editBatchEl ? editBatchEl.value : 'No Batch',
        coach_name: document.getElementById('editRegCoach').value,
        address: document.getElementById('editRegAddressLine').value.trim(),
        city: document.getElementById('editRegCity').value.trim(),
        postal_code: document.getElementById('editRegPostal').value.trim(),
        father_contact_number: document.getElementById('editRegFatherContact').value.trim(),
        mother_contact_number: document.getElementById('editRegMotherContact').value.trim(),
        emergency_contact_number: document.getElementById('editRegEmergency').value.trim(),
        whatsapp_number: document.getElementById('editRegWhatsapp').value.trim()
      };

      try {
        const res = await fetch(STUDENTS_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          closeEditStudentForm();
          showToast(`Student "${payload.student_name}" updated successfully!`, 'success');
          fetchStudents();
        } else {
          showToast(data.error || 'Failed to update student.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Update Student Error:', err);
      } finally {
        submitEditStudent.disabled = false;
        submitEditStudent.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save Changes`;
      }
    });
  }

  // ── Delete Student Handling ───────────────────────────────
  let studentToDeleteId = null;
  const closeDeleteStudentModal = document.getElementById('closeDeleteStudentModal');
  const cancelDeleteStudent = document.getElementById('cancelDeleteStudent');
  const confirmDeleteStudent = document.getElementById('confirmDeleteStudent');

  if (closeDeleteStudentModal) closeDeleteStudentModal.addEventListener('click', () => closeModal('deleteStudentModal'));
  if (cancelDeleteStudent) cancelDeleteStudent.addEventListener('click', () => closeModal('deleteStudentModal'));

  document.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.student-delete-item');
    if (!delBtn) return;

    document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));
    studentToDeleteId = delBtn.dataset.id;
    const modal = document.getElementById('deleteStudentModal');
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  });

  if (confirmDeleteStudent) {
    confirmDeleteStudent.addEventListener('click', async () => {
      if (!studentToDeleteId) return;

      confirmDeleteStudent.disabled = true;
      confirmDeleteStudent.textContent = 'Deleting...';

      try {
        const res = await fetch(STUDENTS_API, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: parseInt(studentToDeleteId) })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Student deleted successfully!', 'success');
          fetchStudents();
        } else {
          showToast(data.error || 'Failed to delete student.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Delete Student Error:', err);
      } finally {
        closeModal('deleteStudentModal');
        studentToDeleteId = null;
        confirmDeleteStudent.disabled = false;
        confirmDeleteStudent.textContent = 'Yes, Delete';
      }
    });
  }

  // Clear error on input change for all reg-inputs
  document.querySelectorAll('.reg-input').forEach(input => {
    input.addEventListener('input', () => {
      input.classList.remove('reg-input-error');
      const parent = input.closest('.reg-field') || input.closest('.reg-phone-wrap')?.closest('.reg-field');
      if (parent) {
        const err = parent.querySelector('.reg-error');
        if (err) err.classList.remove('visible');
      }
    });
  });
  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const errEl = document.getElementById('err-regGender') || document.getElementById('err-editRegGender');
      if (errEl) errEl.classList.remove('visible');
    });
  });

  // =========================================================
  // COACHES MODULE
  // =========================================================

  const licenseMap = {
    'aiff_a': 'AIFF A License',
    'aiff_b': 'AIFF B License',
    'aiff_c': 'AIFF C License',
    'aiff_d': 'AIFF D License',
    'bcci_level_1': 'BCCI Level 1',
    'bcci_level_2': 'BCCI Level 2',
    'bWF_level_1': 'BWF Level 1',
    'other': 'Other License'
  };

  function formatLicenseLabel(raw) {
    if (!raw) return 'Unlicensed';
    return licenseMap[raw] || raw;
  }

  function formatCoachDate(raw) {
    if (!raw) return '—';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) { return raw; }
  }

  function getCoachInitials(name) {
    if (!name) return 'C';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }

  function updateCoachesLiveCount(count) {
    const el = document.getElementById('coachesLiveCount');
    if (!el) return;
    el.textContent = count === 1 ? '1 Active Coach' : `${count} Active Coaches`;
  }

  // ── Add Coach — Full-Page Registration Form ───────────────
  const btnAddCoach = document.getElementById('btnAddCoach');
  const closeAddCoachBtn = document.getElementById('closeAddCoachModal');
  const cancelAddCoach = document.getElementById('cancelAddCoach');
  const submitAddCoach = document.getElementById('submitAddCoach');

  let cachedBatchesList = [];

  async function populateBatchDropdowns() {
    try {
      const res = await fetch(BATCHES_API || 'http://localhost/VAVA_sports/server/batches.php');
      const data = await res.json();
      if (!data.success) return;

      cachedBatchesList = data.batches || [];

      // Coach form batch selects (by batch_id)
      const selects = document.querySelectorAll('.coach-batch-select-input');
      selects.forEach(select => {
        const currentVal = select.value;
        const isAssignModal = select.id === 'assignBatchSelect';

        let html = isAssignModal
          ? '<option value="">Select Batch</option>'
          : '';

        cachedBatchesList.forEach(b => {
          html += `<option value="${b.batch_id}">${b.batch_name}</option>`;
        });

        if (!isAssignModal) {
          html += '<option value="0">No Batch</option>';
        }

        select.innerHTML = html;
        if (currentVal) select.value = currentVal;
      });

      // Student form batch selects (by batch_name string)
      const studentBatchSelects = document.querySelectorAll('.student-batch-select-input');
      studentBatchSelects.forEach(select => {
        const currentVal = select.value;
        let html = '<option value="">Select Batch</option>';
        cachedBatchesList.forEach(b => {
          const nameEscaped = b.batch_name.replace(/"/g, '&quot;');
          html += `<option value="${nameEscaped}">${b.batch_name}</option>`;
        });
        html += '<option value="No Batch">No Batch</option>';
        select.innerHTML = html;
        if (currentVal) select.value = currentVal;
      });
    } catch (err) {
      console.error('Error fetching batches for dropdown:', err);
    }
  }

  let cachedCoachesList = [];

  async function populateCoachDropdowns() {
    try {
      const res = await fetch(COACHES_API || 'http://localhost/VAVA_sports/server/coaches.php');
      const data = await res.json();
      if (!data.success) return;

      cachedCoachesList = data.coaches || [];

      const studentCoachSelects = document.querySelectorAll('.student-coach-select-input');
      studentCoachSelects.forEach(select => {
        const currentVal = select.value;
        let html = '<option value="">Select Coach</option>';
        cachedCoachesList.forEach(c => {
          const nameEscaped = c.coach_name.replace(/"/g, '&quot;');
          html += `<option value="${nameEscaped}">${c.coach_name}</option>`;
        });
        select.innerHTML = html;
        if (currentVal) select.value = currentVal;
      });
    } catch (err) {
      console.error('Error fetching coaches for student dropdown:', err);
    }
  }

  function openCoachForm() {
    populateBatchDropdowns();
    const overlay = document.getElementById('addCoachModal');
    if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  }
  function closeCoachForm() {
    const overlay = document.getElementById('addCoachModal');
    if (overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; }
    clearCoachErrors();
  }
  function clearCoachErrors() {
    const form = document.getElementById('addCoachForm');
    if (form) {
      form.querySelectorAll('.reg-error').forEach(e => e.classList.remove('visible'));
      form.querySelectorAll('.reg-input').forEach(el => el.classList.remove('reg-input-error'));
    }
  }

  if (btnAddCoach) btnAddCoach.addEventListener('click', openCoachForm);
  if (closeAddCoachBtn) closeAddCoachBtn.addEventListener('click', closeCoachForm);
  if (cancelAddCoach) cancelAddCoach.addEventListener('click', closeCoachForm);

  const coachValidations = [
    { id: 'coachFullName',      check: v => v.trim().length > 0,            errId: 'err-coachFullName' },
    { id: 'coachEmail',         check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), errId: 'err-coachEmail' },
    { id: 'coachContact',       check: v => /^\d{10}$/.test(v.trim()),      errId: 'err-coachContact' },
    { id: 'coachDob',           check: v => v.trim().length > 0,            errId: 'err-coachDob' },
    { id: 'coachDoj',           check: v => v.trim().length > 0,            errId: 'err-coachDoj' },
    { id: 'coachLicense',       check: v => v.trim().length > 0,            errId: 'err-coachLicense' },
    { id: 'coachAddressLine',   check: v => v.trim().length > 0,            errId: 'err-coachAddressLine' },
    { id: 'coachCity',          check: v => v.trim().length > 0,            errId: 'err-coachCity' },
    { id: 'coachPostal',        check: v => /^\d{6}$/.test(v.trim()),       errId: 'err-coachPostal' },
    { id: 'coachEmergencyName', check: v => v.trim().length > 0,            errId: 'err-coachEmergencyName' },
    { id: 'coachEmergencyNumber',check: v => /^\d{10}$/.test(v.trim()),     errId: 'err-coachEmergencyNumber' },
  ];

  if (submitAddCoach) {
    submitAddCoach.addEventListener('click', async () => {
      clearCoachErrors();
      let hasError = false;

      coachValidations.forEach(({ id, check, errId }) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!check(el.value)) {
          el.classList.add('reg-input-error');
          const errEl = document.getElementById(errId);
          if (errEl) errEl.classList.add('visible');
          hasError = true;
        }
      });

      if (hasError) {
        const firstErr = document.querySelector('#addCoachModal .reg-input-error');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const name            = document.getElementById('coachFullName').value.trim();
      const email           = document.getElementById('coachEmail').value.trim();
      const phone           = document.getElementById('coachContact').value.trim();
      const dob             = document.getElementById('coachDob').value;
      const doj             = document.getElementById('coachDoj').value;
      const license         = document.getElementById('coachLicense').value;
      const address         = document.getElementById('coachAddressLine').value.trim();
      const city            = document.getElementById('coachCity').value.trim();
      const postal          = document.getElementById('coachPostal').value.trim();
      const emergencyName   = document.getElementById('coachEmergencyName').value.trim();
      const emergencyNumber = document.getElementById('coachEmergencyNumber').value.trim();
      const batchSelectEl   = document.getElementById('coachBatchSelect');
      const batchId         = batchSelectEl ? parseInt(batchSelectEl.value) || 0 : 0;

      submitAddCoach.disabled = true;
      submitAddCoach.innerHTML = 'Registering...';

      try {
        const res = await fetch(COACHES_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coach_name: name,
            coach_email: email,
            coach_phone: phone,
            coach_dob: dob,
            coach_joined_date: doj,
            coach_license: license,
            coach_address: address,
            coach_city: city,
            coach_postal_code: postal,
            emergency_contact_name: emergencyName,
            emergency_contact_number: emergencyNumber,
            batch_id: batchId
          })
        });
        const data = await res.json();
        if (data.success) {
          closeCoachForm();
          document.getElementById('addCoachForm').reset();
          showToast(`Coach "${name}" registered successfully!`, 'success');
          fetchCoaches();
        } else {
          showToast(data.error || 'Failed to register coach.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Register Coach Error:', err);
      } finally {
        submitAddCoach.disabled = false;
        submitAddCoach.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Register Coach`;
      }
    });
  }

  // ── Fetch & Render Coaches (Table) ─────────────────────────
  let fetchCoachesRequestId = 0;
  async function fetchCoaches() {
    const requestId = ++fetchCoachesRequestId;
    const tableWidget = document.getElementById('coachesTableWidget');
    const tableBody   = document.getElementById('coachRosterBody');
    const emptyState  = document.getElementById('coachesEmptyState');
    if (!tableBody || !emptyState || !tableWidget) return;

    tableBody.innerHTML = '';

    try {
      const res = await fetch(COACHES_API);
      const data = await res.json();
      if (requestId !== fetchCoachesRequestId) return;
      if (!data.success) throw new Error(data.error || 'Fetch failed.');

      const coaches = data.coaches || [];
      updateCoachesLiveCount(coaches.length);

      if (coaches.length === 0) {
        tableWidget.style.display = 'none';
        emptyState.style.display  = 'flex';
        tableBody.innerHTML = '';
      } else {
        emptyState.style.display  = 'none';
        tableWidget.style.display = 'block';
        tableBody.innerHTML = '';

        coaches.forEach(coach => {
          const tr = document.createElement('tr');
          tr.dataset.coachId = coach.coach_id;
          const initials = getCoachInitials(coach.coach_name);
          const licenseLabel = formatLicenseLabel(coach.coach_license);
          const joinDateFormatted = formatCoachDate(coach.coach_joined_date);
          const phoneFormatted = coach.coach_phone ? `+91 ${coach.coach_phone}` : '—';
          const coachJsonStr = encodeURIComponent(JSON.stringify(coach));

          let batchesHtml = '';
          if (coach.batch_name) {
            batchesHtml = `<div class="coach-batch-list"><div class="coach-batch-tag"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${coach.batch_name}</div></div>`;
          } else {
            batchesHtml = '<span class="text-secondary" style="font-size:0.835rem;">—</span>';
          }

          tr.innerHTML = `
            <td>
              <div class="student-cell">
                <div class="student-avatar bg-avatar-blue" style="${coach.coach_photo ? `background:none;padding:0;` : ''}">
                  ${coach.coach_photo ? `<img src="${coach.coach_photo}" class="coach-photo-img" alt="Coach Photo">` : initials}
                </div>
                <div>
                  <a href="javascript:void(0)" class="coach-name-link" data-id="${coach.coach_id}">${coach.coach_name}</a>
                  <div class="student-sub">${coach.coach_email || ''}</div>
                </div>
              </div>
            </td>
            <td>${batchesHtml}</td>
            <td><span class="badge-status badge-success">${licenseLabel}</span></td>
            <td><span class="branch-tag">${coach.coach_city || '—'}</span></td>
            <td class="text-secondary" style="font-size:0.85rem;">${joinDateFormatted}</td>
            <td style="font-size:0.875rem;">${phoneFormatted}</td>
            <td>
              <div class="batch-actions-wrap">
                <button class="batch-actions-btn coach-actions-btn" data-id="${coach.coach_id}" type="button">
                  Actions
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div class="batch-actions-menu" id="coachMenu-${coach.coach_id}">
                  <button class="batch-action-item coach-edit-item" data-id="${coach.coach_id}" data-coach="${coachJsonStr}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit Coach
                  </button>
                  <!-- Edit Batch option commented out per 1 coach = 1 batch requirement
                  <button class="batch-action-item coach-edit-batch-item" data-id="${coach.coach_id}" data-name="${coach.coach_name}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Edit Batch
                  </button>
                  -->
                  <button class="batch-action-item danger coach-delete-item" data-id="${coach.coach_id}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                    Delete Coach
                  </button>
                </div>
              </div>
            </td>
          `;
          tableBody.appendChild(tr);
        });

        // Re-apply coach search filter if search term is active
        const searchInput = document.getElementById('coachSearchInput');
        if (searchInput && searchInput.value.trim() !== '') {
          searchInput.dispatchEvent(new Event('input'));
        }
      }
    } catch (err) {
      console.error('Fetch Coaches Error:', err);
      showToast('Could not load coaches.', 'error');
    }
  }

  // ── Edit Coach Functionality ──────────────────────────────
  const closeEditCoachBtn = document.getElementById('closeEditCoachModal');
  const cancelEditCoach   = document.getElementById('cancelEditCoach');
  const submitEditCoach   = document.getElementById('submitEditCoach');

  function openEditCoachForm() {
    populateBatchDropdowns();
    const overlay = document.getElementById('editCoachModal');
    if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  }
  function closeEditCoachForm() {
    const overlay = document.getElementById('editCoachModal');
    if (overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; }
    clearEditCoachErrors();
  }
  function clearEditCoachErrors() {
    const form = document.getElementById('editCoachForm');
    if (form) {
      form.querySelectorAll('.reg-error').forEach(e => e.classList.remove('visible'));
      form.querySelectorAll('.reg-input').forEach(el => el.classList.remove('reg-input-error'));
    }
  }

  if (closeEditCoachBtn) closeEditCoachBtn.addEventListener('click', closeEditCoachForm);
  if (cancelEditCoach)   cancelEditCoach.addEventListener('click', closeEditCoachForm);

  // Delegate: open Edit Coach form pre-filled
  document.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.coach-edit-item');
    if (!editBtn) return;

    document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));

    try {
      const coach = JSON.parse(decodeURIComponent(editBtn.dataset.coach));
      document.getElementById('editCoachId').value              = coach.coach_id || '';
      document.getElementById('editCoachFullName').value        = coach.coach_name || '';
      document.getElementById('editCoachEmail').value           = coach.coach_email || '';
      document.getElementById('editCoachContact').value         = coach.coach_phone || '';
      document.getElementById('editCoachDob').value             = coach.coach_dob || '';
      document.getElementById('editCoachDoj').value             = coach.coach_joined_date || '';
      document.getElementById('editCoachLicense').value         = coach.coach_license || '';
      document.getElementById('editCoachAddressLine').value     = coach.coach_address || '';
      document.getElementById('editCoachCity').value            = coach.coach_city || '';
      document.getElementById('editCoachPostal').value          = coach.coach_postal_code || '';
      document.getElementById('editCoachEmergencyName').value   = coach.emergency_contact_name || '';
      document.getElementById('editCoachEmergencyNumber').value = coach.emergency_contact_number || '';

      await populateBatchDropdowns();
      const batchSel = document.getElementById('editCoachBatchSelect');
      if (batchSel) {
        batchSel.value = coach.batch_id || 0;
      }

      openEditCoachForm();
    } catch (err) {
      console.error('Error parsing coach data for edit:', err);
    }
  });

  const editCoachValidations = [
    { id: 'editCoachFullName',      check: v => v.trim().length > 0,            errId: 'err-editCoachFullName' },
    { id: 'editCoachEmail',         check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), errId: 'err-editCoachEmail' },
    { id: 'editCoachContact',       check: v => /^\d{10}$/.test(v.trim()),      errId: 'err-editCoachContact' },
    { id: 'editCoachDob',           check: v => v.trim().length > 0,            errId: 'err-editCoachDob' },
    { id: 'editCoachDoj',           check: v => v.trim().length > 0,            errId: 'err-editCoachDoj' },
    { id: 'editCoachLicense',       check: v => v.trim().length > 0,            errId: 'err-editCoachLicense' },
    { id: 'editCoachAddressLine',   check: v => v.trim().length > 0,            errId: 'err-editCoachAddressLine' },
    { id: 'editCoachCity',          check: v => v.trim().length > 0,            errId: 'err-editCoachCity' },
    { id: 'editCoachPostal',        check: v => /^\d{6}$/.test(v.trim()),       errId: 'err-editCoachPostal' },
    { id: 'editCoachEmergencyName', check: v => v.trim().length > 0,            errId: 'err-editCoachEmergencyName' },
    { id: 'editCoachEmergencyNumber',check: v => /^\d{10}$/.test(v.trim()),     errId: 'err-editCoachEmergencyNumber' },
  ];

  if (submitEditCoach) {
    submitEditCoach.addEventListener('click', async () => {
      clearEditCoachErrors();
      let hasError = false;

      editCoachValidations.forEach(({ id, check, errId }) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!check(el.value)) {
          el.classList.add('reg-input-error');
          const errEl = document.getElementById(errId);
          if (errEl) errEl.classList.add('visible');
          hasError = true;
        }
      });

      if (hasError) {
        const firstErr = document.querySelector('#editCoachModal .reg-input-error');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const id              = document.getElementById('editCoachId').value;
      const name            = document.getElementById('editCoachFullName').value.trim();
      const email           = document.getElementById('editCoachEmail').value.trim();
      const phone           = document.getElementById('editCoachContact').value.trim();
      const dob             = document.getElementById('editCoachDob').value;
      const doj             = document.getElementById('editCoachDoj').value;
      const license         = document.getElementById('editCoachLicense').value;
      const address         = document.getElementById('editCoachAddressLine').value.trim();
      const city            = document.getElementById('editCoachCity').value.trim();
      const postal          = document.getElementById('editCoachPostal').value.trim();
      const emergencyName   = document.getElementById('editCoachEmergencyName').value.trim();
      const emergencyNumber = document.getElementById('editCoachEmergencyNumber').value.trim();
      const batchSelectEl   = document.getElementById('editCoachBatchSelect');
      const batchId         = batchSelectEl ? parseInt(batchSelectEl.value) || 0 : 0;

      submitEditCoach.disabled = true;
      submitEditCoach.innerHTML = 'Saving...';

      try {
        const res = await fetch(COACHES_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coach_id: parseInt(id),
            coach_name: name,
            coach_email: email,
            coach_phone: phone,
            coach_dob: dob,
            coach_joined_date: doj,
            coach_license: license,
            coach_address: address,
            coach_city: city,
            coach_postal_code: postal,
            emergency_contact_name: emergencyName,
            emergency_contact_number: emergencyNumber,
            batch_id: batchId
          })
        });
        const data = await res.json();
        if (data.success) {
          closeEditCoachForm();
          showToast(`Coach "${name}" updated successfully!`, 'success');
          fetchCoaches();
        } else {
          showToast(data.error || 'Failed to update coach.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Edit Coach Error:', err);
      } finally {
        submitEditCoach.disabled = false;
        submitEditCoach.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save Changes`;
      }
    });
  }

  // ── Delete Coach Functionality ────────────────────────────
  let coachToDelete = null;
  const closeDeleteCoachModalBtn = document.getElementById('closeDeleteCoachModal');
  const cancelDeleteCoach        = document.getElementById('cancelDeleteCoach');
  const confirmDeleteCoach       = document.getElementById('confirmDeleteCoach');

  if (closeDeleteCoachModalBtn) closeDeleteCoachModalBtn.addEventListener('click', () => closeModal('deleteCoachModal'));
  if (cancelDeleteCoach)        cancelDeleteCoach.addEventListener('click',        () => closeModal('deleteCoachModal'));

  document.addEventListener('click', (e) => {
    const deleteItem = e.target.closest('.coach-delete-item');
    if (!deleteItem) return;
    document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));
    coachToDelete = deleteItem.getAttribute('data-id');
    openModal('deleteCoachModal');
  });

  if (confirmDeleteCoach) {
    confirmDeleteCoach.addEventListener('click', async () => {
      if (!coachToDelete) return;
      confirmDeleteCoach.disabled = true;
      confirmDeleteCoach.textContent = 'Deleting...';

      try {
        const res = await fetch(COACHES_API, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coach_id: parseInt(coachToDelete) })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Coach deleted successfully!', 'success');
          fetchCoaches();
        } else {
          showToast(data.error || 'Failed to delete coach.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Delete Coach Error:', err);
      } finally {
        closeModal('deleteCoachModal');
        coachToDelete = null;
        confirmDeleteCoach.disabled = false;
        confirmDeleteCoach.textContent = 'Yes, Delete';
      }
    });
  }

  // ── Coach Search Filter ───────────────────────────────────
  const coachSearchInput = document.getElementById('coachSearchInput');
  if (coachSearchInput) {
    coachSearchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#coachRosterBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  }

  // ── Coach & Student Profile Popup & Photo Edit Logic ──────
  let activeProfileType = 'coach'; // 'coach' or 'student'
  let activeProfileCoachId = null;
  let activeProfileStudentId = null;
  let currentLoadedCoachData = null;
  let currentLoadedStudentData = null;

  // Cropper State
  let rawCropImage = null;
  let cropRotation = 0;
  let cropFlipH = 1;
  let cropFlipV = 1;

  const closeCoachProfileModal = document.getElementById('closeCoachProfileModal');
  if (closeCoachProfileModal) {
    closeCoachProfileModal.addEventListener('click', () => closeModal('coachProfileModal'));
  }

  const closeStudentProfileModal = document.getElementById('closeStudentProfileModal');
  if (closeStudentProfileModal) {
    closeStudentProfileModal.addEventListener('click', () => closeModal('studentProfileModal'));
  }

  // Open Coach Profile Modal
  async function openCoachProfile(coachId) {
    activeProfileType = 'coach';
    activeProfileCoachId = coachId;
    const modal = document.getElementById('coachProfileModal');
    if (!modal) return;

    try {
      const res = await fetch(`${COACHES_API}?id=${coachId}`);
      const data = await res.json();
      if (!data.success || !data.coach) throw new Error('Coach not found');

      const coach = data.coach;
      currentLoadedCoachData = coach;

      // Populate Text Elements
      const profileTitleEl = document.getElementById('coachProfileTitle');
      if (profileTitleEl) profileTitleEl.textContent = `${coach.coach_name}'s Profile`;

      document.getElementById('viewCoachName').textContent = coach.coach_name || 'Coach Name';
      document.getElementById('viewCoachLicense').textContent = formatLicenseLabel(coach.coach_license);
      document.getElementById('viewCoachLicenseDetail').textContent = formatLicenseLabel(coach.coach_license);
      document.getElementById('viewCoachStatus').textContent = coach.status || 'Active';
      document.getElementById('viewCoachEmail').innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        ${coach.coach_email || '—'}
      `;
      document.getElementById('viewCoachPhone').innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.76a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        ${coach.coach_phone ? '+91 ' + coach.coach_phone : '—'}
      `;
      document.getElementById('viewCoachDob').textContent = formatCoachDate(coach.coach_dob);
      document.getElementById('viewCoachDoj').textContent = formatCoachDate(coach.coach_joined_date);
      document.getElementById('viewCoachSport').textContent = coach.coach_sport || 'Not Assigned';
      document.getElementById('viewCoachAddress').textContent = coach.coach_address || '—';
      document.getElementById('viewCoachCity').textContent = coach.coach_city || '—';
      document.getElementById('viewCoachPostal').textContent = coach.coach_postal_code || '—';
      document.getElementById('viewCoachEmergName').textContent = coach.emergency_contact_name || '—';
      document.getElementById('viewCoachBatchName').textContent = coach.batch_name || 'No Batch Assigned';
      document.getElementById('viewCoachMaxStudents').textContent = coach.max_students ? `${coach.max_students} Students` : '—';

      // Photo Rendering
      const imgEl = document.getElementById('coachProfileImg');
      const initialsEl = document.getElementById('coachProfileInitials');
      const btnDeletePhoto = document.getElementById('btnDeleteCoachPhoto');

      if (coach.coach_photo) {
        imgEl.src = coach.coach_photo + '?t=' + Date.now();
        imgEl.style.display = 'block';
        initialsEl.style.display = 'none';
        if (btnDeletePhoto) btnDeletePhoto.style.display = 'flex';
      } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
        initialsEl.textContent = getCoachInitials(coach.coach_name);
        initialsEl.style.display = 'block';
        if (btnDeletePhoto) btnDeletePhoto.style.display = 'none';
      }

      openModal('coachProfileModal');
    } catch (err) {
      console.error('Error opening coach profile:', err);
      showToast('Could not load coach profile.', 'error');
    }
  }

  // Open Student Profile Modal
  async function openStudentProfile(studentId) {
    activeProfileType = 'student';
    activeProfileStudentId = studentId;
    const modal = document.getElementById('studentProfileModal');
    if (!modal) return;

    try {
      const res = await fetch(`${STUDENTS_API}?id=${studentId}`);
      const data = await res.json();
      if (!data.success || !data.student) throw new Error('Student not found');

      const student = data.student;
      currentLoadedStudentData = student;

      // Populate Text Elements
      const profileTitleEl = document.getElementById('studentProfileTitle');
      if (profileTitleEl) profileTitleEl.textContent = `${student.student_name}'s Profile`;

      document.getElementById('viewStudentName').textContent = student.student_name || 'Student Name';
      document.getElementById('viewStudentStatus').textContent = student.status || 'Active';
      document.getElementById('viewStudentParent').textContent = `Parent: ${student.parent_name || '—'}`;
      document.getElementById('viewStudentWhatsapp').innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.76a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        ${student.whatsapp_number ? '+91 ' + student.whatsapp_number : '—'}
      `;

      document.getElementById('viewStudentDob').textContent = formatCoachDate(student.date_of_birth);
      document.getElementById('viewStudentGender').textContent = student.gender ? (student.gender.charAt(0).toUpperCase() + student.gender.slice(1)) : '—';
      document.getElementById('viewStudentBloodGroup').textContent = student.blood_group || '—';
      document.getElementById('viewStudentDoj').textContent = formatCoachDate(student.joined_date);

      document.getElementById('viewStudentBranch').textContent = formatBranchLabel(student.branch_name);
      document.getElementById('viewStudentCoach').textContent = formatCoachLabel(student.coach_name);
      document.getElementById('viewStudentBatch').textContent = student.batch_name || 'No Batch';

      document.getElementById('viewStudentAddress').textContent = student.address || '—';
      document.getElementById('viewStudentCity').textContent = student.city || '—';
      document.getElementById('viewStudentPostal').textContent = student.postal_code || '—';

      document.getElementById('viewStudentFatherPhone').textContent = student.father_contact_number ? '+91 ' + student.father_contact_number : '—';
      document.getElementById('viewStudentMotherPhone').textContent = student.mother_contact_number ? '+91 ' + student.mother_contact_number : '—';
      document.getElementById('viewStudentEmergencyPhone').textContent = student.emergency_contact_number ? '+91 ' + student.emergency_contact_number : '—';
      document.getElementById('viewStudentWhatsappVal').textContent = student.whatsapp_number ? '+91 ' + student.whatsapp_number : '—';

      // Photo Rendering
      const imgEl = document.getElementById('studentProfileImg');
      const initialsEl = document.getElementById('studentProfileInitials');
      const btnDeletePhoto = document.getElementById('btnDeleteStudentPhoto');

      if (student.student_photo) {
        imgEl.src = student.student_photo + '?t=' + Date.now();
        imgEl.style.display = 'block';
        initialsEl.style.display = 'none';
        if (btnDeletePhoto) btnDeletePhoto.style.display = 'flex';
      } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
        initialsEl.textContent = getStudentInitials(student.student_name);
        initialsEl.style.display = 'block';
        if (btnDeletePhoto) btnDeletePhoto.style.display = 'none';
      }

      openModal('studentProfileModal');
    } catch (err) {
      console.error('Error opening student profile:', err);
      showToast('Could not load student profile.', 'error');
    }
  }

  // Click Delegate for Coach Name link in table
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.coach-name-link');
    if (!link) return;
    const coachId = link.getAttribute('data-id');
    if (coachId) {
      openCoachProfile(coachId);
    }
  });

  // Click Delegate for Student Name link in table
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.student-name-link');
    if (!link) return;
    const studentId = link.getAttribute('data-id');
    if (studentId) {
      openStudentProfile(studentId);
    }
  });

  // Coach Photo Hover Menu Toggle
  const btnEditCoachPhoto = document.getElementById('btnEditCoachPhoto');
  const coachPhotoDropdown = document.getElementById('coachPhotoDropdown');
  if (btnEditCoachPhoto && coachPhotoDropdown) {
    btnEditCoachPhoto.addEventListener('click', (e) => {
      e.stopPropagation();
      coachPhotoDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => {
      coachPhotoDropdown.classList.remove('show');
    });
  }

  // Student Photo Hover Menu Toggle
  const btnEditStudentPhoto = document.getElementById('btnEditStudentPhoto');
  const studentPhotoDropdown = document.getElementById('studentPhotoDropdown');
  if (btnEditStudentPhoto && studentPhotoDropdown) {
    btnEditStudentPhoto.addEventListener('click', (e) => {
      e.stopPropagation();
      studentPhotoDropdown.classList.toggle('show');
    });
    document.addEventListener('click', () => {
      studentPhotoDropdown.classList.remove('show');
    });
  }

  // Add Coach Photo Trigger
  const btnAddCoachPhoto = document.getElementById('btnAddCoachPhoto');
  const coachPhotoFileInput = document.getElementById('coachPhotoFileInput');
  if (btnAddCoachPhoto && coachPhotoFileInput) {
    btnAddCoachPhoto.addEventListener('click', () => {
      if (coachPhotoDropdown) coachPhotoDropdown.classList.remove('show');
      coachPhotoFileInput.value = '';
      coachPhotoFileInput.click();
    });
  }

  // Add Student Photo Trigger
  const btnAddStudentPhoto = document.getElementById('btnAddStudentPhoto');
  const studentPhotoFileInput = document.getElementById('studentPhotoFileInput');
  if (btnAddStudentPhoto && studentPhotoFileInput) {
    btnAddStudentPhoto.addEventListener('click', () => {
      if (studentPhotoDropdown) studentPhotoDropdown.classList.remove('show');
      studentPhotoFileInput.value = '';
      studentPhotoFileInput.click();
    });
  }

  // File Chosen (Coach Photo) -> Load into Cropper Canvas
  if (coachPhotoFileInput) {
    coachPhotoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      activeProfileType = 'coach';
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          rawCropImage = img;
          cropRotation = 0;
          cropFlipH = 1;
          cropFlipV = 1;
          redrawCropCanvas();
          openModal('cropPhotoModal');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // File Chosen (Student Photo) -> Load into Cropper Canvas
  if (studentPhotoFileInput) {
    studentPhotoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      activeProfileType = 'student';
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          rawCropImage = img;
          cropRotation = 0;
          cropFlipH = 1;
          cropFlipV = 1;
          redrawCropCanvas();
          openModal('cropPhotoModal');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Cropper Canvas Redraw Function
  function redrawCropCanvas() {
    const canvas = document.getElementById('cropCanvas');
    if (!canvas || !rawCropImage) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();

    // Move origin to center
    ctx.translate(cw / 2, ch / 2);
    // Apply Rotation
    ctx.rotate((cropRotation * Math.PI) / 180);
    // Apply Flip
    ctx.scale(cropFlipH, cropFlipV);

    // Calculate aspect ratio fit
    const imgW = rawCropImage.width;
    const imgH = rawCropImage.height;
    const scale = Math.max(cw / imgW, ch / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;

    ctx.drawImage(rawCropImage, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  // Toolbar Button Event Listeners
  const btnCropRotateLeft = document.getElementById('btnCropRotateLeft');
  const btnCropRotateRight = document.getElementById('btnCropRotateRight');
  const btnCropFlipH = document.getElementById('btnCropFlipH');
  const btnCropFlipV = document.getElementById('btnCropFlipV');
  const closeCropPhotoModal = document.getElementById('closeCropPhotoModal');
  const cancelCropPhoto = document.getElementById('cancelCropPhoto');
  const submitCropPhoto = document.getElementById('submitCropPhoto');

  if (btnCropRotateLeft) btnCropRotateLeft.addEventListener('click', () => { cropRotation = (cropRotation - 90) % 360; redrawCropCanvas(); });
  if (btnCropRotateRight) btnCropRotateRight.addEventListener('click', () => { cropRotation = (cropRotation + 90) % 360; redrawCropCanvas(); });
  if (btnCropFlipH) btnCropFlipH.addEventListener('click', () => { cropFlipH *= -1; redrawCropCanvas(); });
  if (btnCropFlipV) btnCropFlipV.addEventListener('click', () => { cropFlipV *= -1; redrawCropCanvas(); });

  if (closeCropPhotoModal) closeCropPhotoModal.addEventListener('click', () => closeModal('cropPhotoModal'));
  if (cancelCropPhoto) cancelCropPhoto.addEventListener('click', () => closeModal('cropPhotoModal'));

  // Save & Upload Cropped Photo (Handles both Coach & Student depending on activeProfileType)
  if (submitCropPhoto) {
    submitCropPhoto.addEventListener('click', async () => {
      const canvas = document.getElementById('cropCanvas');
      if (!canvas) return;

      const base64Image = canvas.toDataURL('image/jpeg', 0.9);
      submitCropPhoto.disabled = true;
      submitCropPhoto.textContent = 'Uploading...';

      try {
        if (activeProfileType === 'student') {
          if (!activeProfileStudentId) return;
          const res = await fetch(STUDENTS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upload_photo',
              student_id: activeProfileStudentId,
              image_data: base64Image
            })
          });
          const data = await res.json();
          if (data.success) {
            closeModal('cropPhotoModal');
            showToast('Profile picture uploaded successfully!', 'success');
            openStudentProfile(activeProfileStudentId);
            fetchStudents();
          } else {
            showToast(data.error || 'Failed to upload profile picture.', 'error');
          }
        } else {
          if (!activeProfileCoachId) return;
          const res = await fetch(COACHES_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upload_photo',
              coach_id: activeProfileCoachId,
              image_data: base64Image
            })
          });
          const data = await res.json();
          if (data.success) {
            closeModal('cropPhotoModal');
            showToast('Profile picture uploaded successfully!', 'success');
            openCoachProfile(activeProfileCoachId);
            fetchCoaches();
          } else {
            showToast(data.error || 'Failed to upload profile picture.', 'error');
          }
        }
      } catch (err) {
        console.error('Upload Photo Error:', err);
        showToast('Connection error. Could not upload photo.', 'error');
      } finally {
        submitCropPhoto.disabled = false;
        submitCropPhoto.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save & Upload`;
      }
    });
  }

  // Delete Coach Profile Photo Handler
  const btnDeleteCoachPhoto = document.getElementById('btnDeleteCoachPhoto');
  if (btnDeleteCoachPhoto) {
    btnDeleteCoachPhoto.addEventListener('click', async () => {
      if (!activeProfileCoachId) return;
      if (coachPhotoDropdown) coachPhotoDropdown.classList.remove('show');

      btnDeleteCoachPhoto.disabled = true;
      try {
        const res = await fetch(COACHES_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_photo',
            coach_id: activeProfileCoachId
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Profile picture deleted successfully!', 'success');
          openCoachProfile(activeProfileCoachId);
          fetchCoaches();
        } else {
          showToast(data.error || 'Failed to delete photo.', 'error');
        }
      } catch (err) {
        console.error('Delete Photo Error:', err);
        showToast('Connection error. Could not delete photo.', 'error');
      } finally {
        btnDeleteCoachPhoto.disabled = false;
      }
    });
  }

  // Delete Student Profile Photo Handler
  const btnDeleteStudentPhoto = document.getElementById('btnDeleteStudentPhoto');
  if (btnDeleteStudentPhoto) {
    btnDeleteStudentPhoto.addEventListener('click', async () => {
      if (!activeProfileStudentId) return;
      if (studentPhotoDropdown) studentPhotoDropdown.classList.remove('show');

      btnDeleteStudentPhoto.disabled = true;
      try {
        const res = await fetch(STUDENTS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_photo',
            student_id: activeProfileStudentId
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Profile picture deleted successfully!', 'success');
          openStudentProfile(activeProfileStudentId);
          fetchStudents();
        } else {
          showToast(data.error || 'Failed to delete photo.', 'error');
        }
      } catch (err) {
        console.error('Delete Photo Error:', err);
        showToast('Connection error. Could not delete photo.', 'error');
      } finally {
        btnDeleteStudentPhoto.disabled = false;
      }
    });
  }

  // ── Edit Batch Action & Modal Logic ───────────────────────
  /* ── Edit Batch Modal Logic (Disabled per 1 coach = 1 batch requirement) ─────
  const tabAddBatch = document.getElementById('tabAddBatch');
  const tabRemoveBatch = document.getElementById('tabRemoveBatch');
  const addBatchSection = document.getElementById('addBatchSection');
  const removeBatchSection = document.getElementById('removeBatchSection');

  function switchEditBatchTab(mode) {
    if (mode === 'add') {
      if (tabAddBatch) tabAddBatch.classList.add('active');
      if (tabRemoveBatch) tabRemoveBatch.classList.remove('active');
      if (addBatchSection) addBatchSection.style.display = 'block';
      if (removeBatchSection) removeBatchSection.style.display = 'none';
    } else {
      if (tabRemoveBatch) tabRemoveBatch.classList.add('active');
      if (tabAddBatch) tabAddBatch.classList.remove('active');
      if (removeBatchSection) removeBatchSection.style.display = 'block';
      if (addBatchSection) addBatchSection.style.display = 'none';
    }
  }

  if (tabAddBatch) tabAddBatch.addEventListener('click', () => switchEditBatchTab('add'));
  if (tabRemoveBatch) tabRemoveBatch.addEventListener('click', () => switchEditBatchTab('remove'));

  // Delegate: Open Edit Batch Modal
  document.addEventListener('click', async (e) => {
    const editBatchBtn = e.target.closest('.coach-edit-batch-item');
    if (!editBatchBtn) return;
    document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));

    const coachId = editBatchBtn.getAttribute('data-id');
    const coachName = editBatchBtn.getAttribute('data-name');
    if (!coachId) return;

    document.getElementById('editBatchCoachId').value = coachId;
    const titleEl = document.getElementById('editBatchCoachTitle');
    if (titleEl) titleEl.textContent = `Edit Batches for ${coachName || 'Coach'}`;

    switchEditBatchTab('add');
    openModal('editBatchCoachModal');

    // Populate Checkbox Lists
    await loadEditBatchCheckboxes(coachId);
  });

  async function loadEditBatchCheckboxes(coachId) {
    const addListContainer = document.getElementById('addBatchCheckboxList');
    const removeListContainer = document.getElementById('removeBatchCheckboxList');
    if (!addListContainer || !removeListContainer) return;

    addListContainer.innerHTML = '<div class="text-secondary" style="font-size:0.85rem; padding:0.5rem 0;">Loading batches...</div>';
    removeListContainer.innerHTML = '<div class="text-secondary" style="font-size:0.85rem; padding:0.5rem 0;">Loading batches...</div>';

    try {
      // 1. Fetch Coach Details (for assigned_batches)
      const cRes = await fetch(`${COACHES_API}?id=${coachId}`);
      const cData = await cRes.json();
      const coach = cData.coach || {};
      const assignedBatches = coach.assigned_batches || [];
      const assignedIds = new Set(assignedBatches.map(b => parseInt(b.batch_id)));

      // 2. Fetch All Database Batches
      const bRes = await fetch('http://localhost/VAVA_sports/server/batches.php');
      const bData = await bRes.json();
      const allBatches = bData.batches || [];

      // Populate Add Batches Checkbox List (All batches from DB)
      if (allBatches.length === 0) {
        addListContainer.innerHTML = '<div class="text-secondary" style="font-size:0.85rem; padding:0.5rem 0;">No batches found in database.</div>';
      } else {
        let addHtml = '';
        allBatches.forEach(b => {
          const isAlreadyAssigned = assignedIds.has(parseInt(b.batch_id));
          addHtml += `
            <label class="batch-checkbox-item">
              <input type="checkbox" class="chk-add-batch" value="${b.batch_id}" ${isAlreadyAssigned ? 'checked disabled title="Already assigned"' : ''}>
              <span class="batch-checkbox-label">
                <span class="batch-checkbox-title">${b.batch_name} ${isAlreadyAssigned ? '<span style="font-size:0.75rem; color:var(--color-primary); font-weight:400;">(Assigned)</span>' : ''}</span>
                <span class="batch-checkbox-sub">${b.sport || 'Sports'} • ${b.batch_location || 'Location'}</span>
              </span>
            </label>
          `;
        });
        addListContainer.innerHTML = addHtml;
      }

      // Populate Remove Batches Checkbox List (Only currently assigned batches)
      if (assignedBatches.length === 0) {
        removeListContainer.innerHTML = '<div class="text-secondary" style="font-size:0.85rem; padding:0.5rem 0;">No batches currently assigned to this coach.</div>';
      } else {
        let removeHtml = '';
        assignedBatches.forEach(b => {
          removeHtml += `
            <label class="batch-checkbox-item remove-item">
              <input type="checkbox" class="chk-remove-batch" value="${b.batch_id}">
              <span class="batch-checkbox-label">
                <span class="batch-checkbox-title">${b.batch_name}</span>
                <span class="batch-checkbox-sub">${b.sport || 'Sports'} • ${b.batch_location || 'Location'}</span>
              </span>
            </label>
          `;
        });
        removeListContainer.innerHTML = removeHtml;
      }

    } catch (err) {
      console.error('Error loading edit batch checkboxes:', err);
      addListContainer.innerHTML = '<div class="text-secondary" style="font-size:0.85rem; color:var(--color-danger);">Error loading batches.</div>';
      removeListContainer.innerHTML = '<div class="text-secondary" style="font-size:0.85rem; color:var(--color-danger);">Error loading batches.</div>';
    }
  }

  // Close & Cancel Buttons
  const closeEditBatchCoachModal = document.getElementById('closeEditBatchCoachModal');
  const cancelAddBatches = document.getElementById('cancelAddBatches');
  const cancelRemoveBatches = document.getElementById('cancelRemoveBatches');

  if (closeEditBatchCoachModal) closeEditBatchCoachModal.addEventListener('click', () => closeModal('editBatchCoachModal'));
  if (cancelAddBatches) cancelAddBatches.addEventListener('click', () => closeModal('editBatchCoachModal'));
  if (cancelRemoveBatches) cancelRemoveBatches.addEventListener('click', () => closeModal('editBatchCoachModal'));

  // Submit Add Batches (Bulk)
  const submitAddBatches = document.getElementById('submitAddBatches');
  if (submitAddBatches) {
    submitAddBatches.addEventListener('click', async () => {
      const coachId = parseInt(document.getElementById('editBatchCoachId').value);
      const checkedInputs = document.querySelectorAll('.chk-add-batch:checked:not([disabled])');
      const selectedIds = Array.from(checkedInputs).map(cb => parseInt(cb.value));

      if (!coachId || selectedIds.length === 0) {
        showToast('Please select at least one batch to assign.', 'error');
        return;
      }

      submitAddBatches.disabled = true;
      submitAddBatches.textContent = 'Assigning...';

      try {
        const res = await fetch(COACHES_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'assign_batches_bulk',
            coach_id: coachId,
            batch_ids: selectedIds
          })
        });
        const data = await res.json();
        if (data.success) {
          closeModal('editBatchCoachModal');
          showToast(`${selectedIds.length} batch(es) assigned successfully!`, 'success');
          fetchCoaches();
        } else {
          showToast(data.error || 'Failed to assign batches.', 'error');
        }
      } catch (err) {
        console.error('Bulk Assign Error:', err);
        showToast('Connection error. Failed to assign batches.', 'error');
      } finally {
        submitAddBatches.disabled = false;
        submitAddBatches.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Assign Selected Batches`;
      }
    });
  }

  // Submit Remove Batches (Bulk)
  const submitRemoveBatches = document.getElementById('submitRemoveBatches');
  if (submitRemoveBatches) {
    submitRemoveBatches.addEventListener('click', async () => {
      const coachId = parseInt(document.getElementById('editBatchCoachId').value);
      const checkedInputs = document.querySelectorAll('.chk-remove-batch:checked');
      const selectedIds = Array.from(checkedInputs).map(cb => parseInt(cb.value));

      if (!coachId || selectedIds.length === 0) {
        showToast('Please select at least one batch to remove.', 'error');
        return;
      }

      submitRemoveBatches.disabled = true;
      submitRemoveBatches.textContent = 'Removing...';

      try {
        const res = await fetch(COACHES_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'remove_batches_bulk',
            coach_id: coachId,
            batch_ids: selectedIds
          })
        });
        const data = await res.json();
        if (data.success) {
          closeModal('editBatchCoachModal');
          showToast(`${selectedIds.length} batch(es) removed from coach.`, 'info');
          fetchCoaches();
        } else {
          showToast(data.error || 'Failed to remove batches.', 'error');
        }
      } catch (err) {
        console.error('Bulk Remove Error:', err);
        showToast('Connection error. Failed to remove batches.', 'error');
      } finally {
        submitRemoveBatches.disabled = false;
        submitRemoveBatches.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg> Remove Selected Batches`;
      }
    });
  }
  ── End Edit Batch Modal Logic ── */

  // =========================================================
  // BATCHES MODULE
  // =========================================================

  // ── Helpers ──────────────────────────────────────────────
  function formatBatchTime(raw) {
    if (!raw) return '—';
    try {
      return new Date(`1970-01-01T${raw}`)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return raw; }
  }

  function updateLiveCount(count) {
    const el = document.getElementById('batchesLiveCount');
    if (!el) return;
    el.textContent = count === 1 ? '1 Active Batch' : `${count} Active Batches`;
  }

  // ── Add Batch Modal ───────────────────────────────────────
  const btnAddNewBatch    = document.getElementById('btnAddNewBatch');
  const closeAddBatchModal = document.getElementById('closeAddBatchModal');
  const cancelAddBatch    = document.getElementById('cancelAddBatch');
  const submitAddBatch    = document.getElementById('submitAddBatch');
  const addBatchForm      = document.getElementById('addBatchForm');

  if (btnAddNewBatch)    btnAddNewBatch.addEventListener('click', () => openModal('addBatchModal'));
  if (closeAddBatchModal) closeAddBatchModal.addEventListener('click', () => closeModal('addBatchModal'));
  if (cancelAddBatch)   cancelAddBatch.addEventListener('click', () => closeModal('addBatchModal'));

  if (submitAddBatch) {
    submitAddBatch.addEventListener('click', async () => {
      const name     = document.getElementById('newBatchName')?.value.trim();
      const location = document.getElementById('newBatchLocation')?.value;
      const time     = document.getElementById('newBatchTime')?.value;
      const sport    = document.getElementById('newBatchSport')?.value;
      const students = document.getElementById('newBatchStudents')?.value;

      if (!name || !location || !time || !sport || !students) {
        showToast('Please fill all required fields.', 'error');
        return;
      }

      submitAddBatch.disabled = true;
      submitAddBatch.innerHTML = 'Creating...';

      try {
        const res  = await fetch(BATCHES_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_name: name, batch_location: location,
                                 batch_time: time, sport, max_students: parseInt(students) })
        });
        const data = await res.json();
        if (data.success) {
          closeModal('addBatchModal');
          if (addBatchForm) addBatchForm.reset();
          showToast(`Batch "${name}" created successfully!`, 'success');
          fetchBatches();
        } else {
          showToast(data.error || 'Failed to create batch.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Create Batch Error:', err);
      } finally {
        submitAddBatch.disabled = false;
        submitAddBatch.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Create Batch`;
      }
    });
  }

  // ── Fetch & Render Batches (Table) ────────────────────────
  let fetchBatchesRequestId = 0;
  async function fetchBatches() {
    const requestId = ++fetchBatchesRequestId;
    const tableWidget = document.getElementById('batchesTableWidget');
    const tableBody   = document.getElementById('batchesTableBody');
    const emptyState  = document.getElementById('batchesEmptyState');
    if (!tableBody || !emptyState || !tableWidget) return;

    tableBody.innerHTML = '';

    try {
      const res  = await fetch(BATCHES_API);
      const data = await res.json();
      if (requestId !== fetchBatchesRequestId) return;
      if (!data.success) throw new Error(data.error || 'Fetch failed.');

      const batches = data.batches;
      updateLiveCount(batches.length);
      populateBatchDropdowns();

      if (batches.length === 0) {
        tableWidget.style.display = 'none';
        emptyState.style.display  = 'flex';
        tableBody.innerHTML = '';
      } else {
        emptyState.style.display  = 'none';
        tableWidget.style.display = 'block';
        tableBody.innerHTML = '';

        batches.forEach(batch => {
          const tr = document.createElement('tr');
          tr.dataset.batchId = batch.batch_id;
          tr.innerHTML = `
            <td><span class="student-name">${batch.batch_name}</span></td>
            <td><span class="branch-tag">${batch.batch_location}</span></td>
            <td class="text-secondary" style="font-size:0.85rem;">${formatBatchTime(batch.batch_time)}</td>
            <td style="font-size:0.875rem;">${batch.max_students}</td>
            <td><span class="batch-sport-pill">${batch.sport}</span></td>
            <td>
              <div class="batch-actions-wrap">
                <button class="batch-actions-btn" data-id="${batch.batch_id}" type="button">
                  Actions
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div class="batch-actions-menu" id="batchMenu-${batch.batch_id}">
                  <button class="batch-action-item batch-edit-item" data-id="${batch.batch_id}"
                    data-name="${encodeURIComponent(batch.batch_name)}"
                    data-location="${encodeURIComponent(batch.batch_location)}"
                    data-time="${batch.batch_time}"
                    data-sport="${encodeURIComponent(batch.sport)}"
                    data-students="${batch.max_students}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit Batch
                  </button>
                  <button class="batch-action-item danger batch-delete-item" data-id="${batch.batch_id}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                    Delete Batch
                  </button>
                </div>
              </div>
            </td>
          `;
          tableBody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error('Fetch Batches Error:', err);
      showToast('Could not load batches.', 'error');
    }
  }

  // ── Actions Dropdown toggle ───────────────────────────────
  document.addEventListener('click', (e) => {
    // Open/close the dropdown when Actions button is clicked
    const actionsBtn = e.target.closest('.batch-actions-btn');
    if (actionsBtn) {
      e.stopPropagation();
      const id   = actionsBtn.getAttribute('data-id');
      const menu = document.getElementById(`batchMenu-${id}`) || document.getElementById(`coachMenu-${id}`) || document.getElementById(`studentMenu-${id}`);
      // Close all other open menus
      document.querySelectorAll('.batch-actions-menu.open').forEach(m => {
        if (m !== menu) m.classList.remove('open');
      });
      if (menu) menu.classList.toggle('open');
      return;
    }

    // Close all menus when clicking outside
    if (!e.target.closest('.batch-actions-wrap')) {
      document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));
    }
  });

  // ── Edit Batch ────────────────────────────────────────────
  const closeEditBatchModal = document.getElementById('closeEditBatchModal');
  const cancelEditBatch     = document.getElementById('cancelEditBatch');
  const submitEditBatch     = document.getElementById('submitEditBatch');

  if (closeEditBatchModal) closeEditBatchModal.addEventListener('click', () => closeModal('editBatchModal'));
  if (cancelEditBatch)     cancelEditBatch.addEventListener('click',     () => closeModal('editBatchModal'));

  // Delegate: open Edit modal and pre-fill
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.batch-edit-item');
    if (!editBtn) return;

    // Close dropdown
    document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));

    document.getElementById('editBatchId').value       = editBtn.dataset.id;
    document.getElementById('editBatchName').value     = decodeURIComponent(editBtn.dataset.name);
    document.getElementById('editBatchLocation').value = decodeURIComponent(editBtn.dataset.location);
    document.getElementById('editBatchTime').value     = editBtn.dataset.time;
    document.getElementById('editBatchSport').value    = decodeURIComponent(editBtn.dataset.sport);
    document.getElementById('editBatchStudents').value = editBtn.dataset.students;

    openModal('editBatchModal');
  });

  if (submitEditBatch) {
    submitEditBatch.addEventListener('click', async () => {
      const id       = document.getElementById('editBatchId')?.value;
      const name     = document.getElementById('editBatchName')?.value.trim();
      const location = document.getElementById('editBatchLocation')?.value;
      const time     = document.getElementById('editBatchTime')?.value;
      const sport    = document.getElementById('editBatchSport')?.value;
      const students = document.getElementById('editBatchStudents')?.value;

      if (!name || !location || !time || !sport || !students) {
        showToast('Please fill all required fields.', 'error');
        return;
      }

      submitEditBatch.disabled = true;
      submitEditBatch.innerHTML = 'Saving...';

      try {
        const res  = await fetch(BATCHES_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_id: parseInt(id), batch_name: name,
                                 batch_location: location, batch_time: time,
                                 sport, max_students: parseInt(students) })
        });
        const data = await res.json();
        if (data.success) {
          closeModal('editBatchModal');
          showToast(`Batch "${name}" updated successfully!`, 'success');
          fetchBatches();
        } else {
          showToast(data.error || 'Failed to update batch.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Edit Batch Error:', err);
      } finally {
        submitEditBatch.disabled = false;
        submitEditBatch.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save Changes`;
      }
    });
  }

  // ── Delete Batch ──────────────────────────────────────────
  let batchToDelete = null;
  const closeDeleteBatchModal = document.getElementById('closeDeleteBatchModal');
  const cancelDeleteBatch     = document.getElementById('cancelDeleteBatch');
  const confirmDeleteBatch    = document.getElementById('confirmDeleteBatch');

  if (closeDeleteBatchModal) closeDeleteBatchModal.addEventListener('click', () => closeModal('deleteBatchModal'));
  if (cancelDeleteBatch)     cancelDeleteBatch.addEventListener('click',     () => closeModal('deleteBatchModal'));

  // Delegate: open Delete confirm from Actions menu
  document.addEventListener('click', (e) => {
    const deleteItem = e.target.closest('.batch-delete-item');
    if (!deleteItem) return;
    document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));
    batchToDelete = deleteItem.getAttribute('data-id');
    openModal('deleteBatchModal');
  });

  if (confirmDeleteBatch) {
    confirmDeleteBatch.addEventListener('click', async () => {
      if (!batchToDelete) return;
      confirmDeleteBatch.disabled = true;
      confirmDeleteBatch.textContent = 'Deleting...';

      try {
        const res  = await fetch(BATCHES_API, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_id: parseInt(batchToDelete) })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Batch deleted successfully!', 'success');
          fetchBatches();
        } else {
          showToast(data.error || 'Failed to delete batch.', 'error');
        }
      } catch (err) {
        showToast('Connection error. Please try again.', 'error');
        console.error('Delete Batch Error:', err);
      } finally {
        closeModal('deleteBatchModal');
        batchToDelete = null;
        confirmDeleteBatch.disabled = false;
        confirmDeleteBatch.textContent = 'Yes, Delete';
      }
    });
  }

  // Close modals on overlay click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('sb-modal-overlay')) {
      closeModal(e.target.id);
    }
  });



  // Sport filter tabs for batches grid
  const sbFilterTabs = document.getElementById('sbFilterTabs');
  if (sbFilterTabs) {
    sbFilterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.sb-filter-tab');
      if (!tab) return;
      sbFilterTabs.querySelectorAll('.sb-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const filter = tab.dataset.filter;
      document.querySelectorAll('.sb-batch-card').forEach(card => {
        card.style.display = (filter === 'all' || card.dataset.sport === filter) ? '' : 'none';
      });
      document.querySelectorAll('#studentsTableBody tr').forEach(row => {
        const sport = row.querySelector('.sb-sport-pill');
        if (!sport) return;
        const sportClass = sport.className.split(' ').find(c => c !== 'sb-sport-pill');
        row.style.display = (filter === 'all' || sportClass === filter) ? '' : 'none';
      });
    });
  }

  // ── Student Search Filter ─────────────────────────────────
  const sbSearchInput = document.getElementById('sbSearchInput');
  if (sbSearchInput) {
    sbSearchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#studentsTableBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  }

  // 8. Toast Helper
  function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconSvg = type === 'success'
      ? `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
      : `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `
      ${iconSvg}
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3800);
  }

  // 9. Initial Route & Hash Change Handler
  function handleHashRoute() {
    const currentHash = window.location.hash || '#overview';
    if (currentHash !== currentActiveSectionHash) {
      navigateToSection(currentHash, false);
    }
  }

  handleHashRoute();
  window.addEventListener('hashchange', handleHashRoute);
});
