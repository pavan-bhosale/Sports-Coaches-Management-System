/**
 * VAVA Sports Academy - Attendance Module (Coach-Only)
 */

let fetchAttendanceRequestId = 0;
let pendingDeleteSheet = null;

// Helper to retrieve auth parameters stored in localStorage
function getAuthParams() {
  const role = localStorage.getItem('vava_role') || 'coach';
  const email = localStorage.getItem('vava_email') || '';
  let coach_id = 0;
  const userStr = localStorage.getItem('vava_user');
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      if (u.coach_id) coach_id = u.coach_id;
    } catch(e) {}
  }
  return { role, email, coach_id };
}

// Update Live Sheet Count Pill
function updateAttendanceLiveCount(count) {
  const el = document.getElementById('attendanceLiveCount');
  if (!el) return;
  el.textContent = count === 1 ? '1 Attendance Sheet' : `${count} Attendance Sheets`;
}

// Update Coach Info Header
function updateCoachHeader(info) {
  const nameEl = document.getElementById('coachHeaderName');
  const batchEl = document.getElementById('coachHeaderBatch');
  if (nameEl && info && info.coach_name) {
    nameEl.textContent = info.coach_name;
  }
  if (batchEl && info && info.batch_name) {
    batchEl.textContent = info.batch_name;
  }
}

// ── Fetch & Render Main Attendance List ──────────────────────────────────────
async function fetchAttendanceSheets() {
  const requestId = ++fetchAttendanceRequestId;
  const tableWidget = document.getElementById('attendanceSectionTableWidget');
  const tableBody   = document.getElementById('attendanceSectionTableBody');
  const emptyState  = document.getElementById('attendanceSectionEmptyState');
  if (!tableBody || !emptyState || !tableWidget) return;

  tableBody.innerHTML = '';

  const { role, email, coach_id } = getAuthParams();

  try {
    const url = `${ATTENDANCE_API}?role=${encodeURIComponent(role)}&email=${encodeURIComponent(email)}&coach_id=${coach_id}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (requestId !== fetchAttendanceRequestId) return;
    if (!data.success) throw new Error(data.error || 'Fetch failed.');

    if (data.coach_info) {
      updateCoachHeader(data.coach_info);
    }

    const sheets = data.sheets || [];
    updateAttendanceLiveCount(sheets.length);

    if (sheets.length === 0) {
      tableWidget.style.display = 'none';
      emptyState.style.display  = 'flex';
      tableBody.innerHTML       = '';
    } else {
      emptyState.style.display  = 'none';
      tableWidget.style.display = 'block';
      tableBody.innerHTML       = '';

      sheets.forEach(sheet => {
        const tr = document.createElement('tr');
        tr.dataset.batchId = sheet.batch_id;
        tr.dataset.date = sheet.attendance_date;

        const safeBatchName = escapeHtml(sheet.batch_name);
        const safeCoachName = escapeHtml(sheet.coach_name);
        const formattedDate = formatDateDisplay(sheet.attendance_date);

        // Calculate Attendance (Present/Total) and Present Percentage
        const presentCount = parseInt(sheet.present_count || 0, 10);
        const totalStudents = parseInt(sheet.total_batch_students !== undefined ? sheet.total_batch_students : (sheet.total_students || sheet.sheet_records_count || 0), 10);

        const attendanceDisplay = `${presentCount}/${totalStudents}`;
        let pctDisplay = '0%';
        if (totalStudents > 0) {
          const pct = (presentCount / totalStudents) * 100;
          pctDisplay = (pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)) + '%';
        }

        const menuKey = `${sheet.batch_id}_${sheet.attendance_date.replace(/-/g, '')}`;

        // 4 Columns: Date | Attendance | Present Percentage | Actions
        tr.innerHTML = `
          <td><span class="text-secondary" style="font-size:0.9rem; font-weight: 500;">${formattedDate}</span></td>
          <td><span style="font-weight: 600; font-size:0.875rem; color: var(--text-primary);">${attendanceDisplay}</span></td>
          <td><span class="badge-status badge-success" style="font-weight: 600; font-size: 0.825rem;">${pctDisplay}</span></td>
          <td style="text-align: right;">
            <div class="batch-actions-wrap">
              <button class="batch-actions-btn" data-id="${menuKey}" type="button">
                Actions
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <div class="batch-actions-menu" id="attendanceMenu-${menuKey}">
                <button class="batch-action-item btn-open-attendance" type="button"
                  onclick="openAttendanceSheet(${sheet.batch_id}, '${sheet.attendance_date}', '${safeBatchName.replace(/'/g, "\\'")}', '${safeCoachName.replace(/'/g, "\\'")}')">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  Open Attendance
                </button>
                <button class="batch-action-item danger btn-delete-attendance" type="button"
                  onclick="promptDeleteAttendanceSheet(${sheet.batch_id}, '${sheet.attendance_date}', '${safeBatchName.replace(/'/g, "\\'")}')">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                  </svg>
                  Delete Attendance
                </button>
              </div>
            </div>
          </td>
        `;
        tableBody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Error fetching attendance sheets:', err);
    showToast(err.message || 'Failed to load attendance sheets.', 'error');
  }
}

// ── Open New Attendance Sheet Modal ───────────────────────────────────────────
function openNewAttendanceModal() {
  const dateInput = document.getElementById('newAttendanceSheetDate');
  if (dateInput) {
    // Default to today's YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
  
  openModal('newAttendanceModal');
}

// ── Submit New Attendance Sheet Form ──────────────────────────────────────────
async function submitNewAttendanceSheet(e) {
  if (e) e.preventDefault();

  const dateInput   = document.getElementById('newAttendanceSheetDate');
  const submitBtn   = document.getElementById('btnSubmitNewAttendance');
  const attendance_date = dateInput ? dateInput.value : '';

  if (!attendance_date) {
    showToast('Please select an attendance date.', 'error');
    return;
  }

  const { role, email, coach_id } = getAuthParams();

  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch(ATTENDANCE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_sheet',
        attendance_date: attendance_date,
        role: role,
        email: email,
        coach_id: coach_id
      })
    });
    const data = await res.json();

    if (!data.success) {
      showToast(data.error || 'Failed to create attendance sheet.', 'error');
      return;
    }

    showToast(data.message || 'Attendance sheet created successfully.', 'success');
    closeModal('newAttendanceModal');
    await fetchAttendanceSheets();

    // Immediately open the existing Open Attendance modal for the new sheet
    const targetBatchId = data.batch_id || 0;
    const targetDate = data.attendance_date || attendance_date;
    const targetBatchName = data.batch_name || '';
    const targetCoachName = data.coach_name || '';

    openAttendanceSheet(targetBatchId, targetDate, targetBatchName, targetCoachName);
  } catch (err) {
    console.error('Error creating attendance sheet:', err);
    showToast('Network error creating attendance sheet.', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ── Open Attendance Sheet Modal (Student Attendance List) ─────────────────────
async function openAttendanceSheet(batchId, attendanceDate, batchName, coachName) {
  const modalTitle = document.getElementById('openAttendanceTitle');
  const modalSub   = document.getElementById('openAttendanceSubtitle');
  const tbody      = document.getElementById('openAttendanceStudentTableBody');
  const batchIdInp = document.getElementById('openAttendanceBatchId');
  const dateInp    = document.getElementById('openAttendanceDate');

  const coachHeaderBatch = document.getElementById('coachHeaderBatch')?.textContent || batchName;

  if (modalTitle) modalTitle.textContent = `${coachHeaderBatch} - Attendance`;
  if (modalSub) modalSub.textContent = `Date: ${formatDateDisplay(attendanceDate)}`;
  if (batchIdInp) batchIdInp.value = batchId;
  if (dateInp) dateInp.value = attendanceDate;
  if (tbody) tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:1.5rem;">Loading students...</td></tr>';

  openModal('openAttendanceModal');

  const { role, email, coach_id } = getAuthParams();

  try {
    const url = `${ATTENDANCE_API}?action=get_students&batch_id=${batchId}&attendance_date=${attendanceDate}&role=${encodeURIComponent(role)}&email=${encodeURIComponent(email)}&coach_id=${coach_id}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load students.');
    }

    const students = data.students || [];

    if (students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">No students assigned to this batch.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    students.forEach(student => {
      const tr = document.createElement('tr');
      const isPresent = student.status === 'Present';
      const safeName = escapeHtml(student.student_name);

      tr.innerHTML = `
        <td style="padding: 0.85rem 1rem;">
          <div class="student-cell" style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="student-avatar" style="width: 32px; height: 32px; font-size: 0.8rem; border-radius: 50%; background: var(--bg-card-border); display: flex; align-items: center; justify-content: center; font-weight: 600;">
              ${getInitials(safeName)}
            </div>
            <span class="student-name" style="font-weight: 500; font-size: 0.925rem;">${safeName}</span>
          </div>
        </td>
        <td style="padding: 0.85rem 1rem; text-align: center;">
          <label class="status-checkbox-label" style="display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" class="student-status-checkbox" 
              data-student-id="${student.student_id}" 
              ${isPresent ? 'checked' : ''} 
              onchange="toggleCheckboxLabel(this)"
              style="width: 18px; height: 18px; accent-color: var(--color-primary); cursor: pointer;">
            <span class="status-indicator-badge ${isPresent ? 'badge-present' : 'badge-absent'}" style="font-size: 0.8rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 4px;">
              ${isPresent ? 'Present' : 'Absent'}
            </span>
          </label>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading student roster:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:1.5rem; color:var(--color-danger);">${err.message}</td></tr>`;
  }
}

// Helper to update checkbox status label on toggle
function toggleCheckboxLabel(checkbox) {
  const badge = checkbox.parentNode.querySelector('.status-indicator-badge');
  if (!badge) return;
  if (checkbox.checked) {
    badge.textContent = 'Present';
    badge.className = 'status-indicator-badge badge-present';
  } else {
    badge.textContent = 'Absent';
    badge.className = 'status-indicator-badge badge-absent';
  }
}

// ── Save Attendance Sheet ─────────────────────────────────────────────────────
async function saveAttendanceSheet() {
  const batchIdInp = document.getElementById('openAttendanceBatchId');
  const dateInp    = document.getElementById('openAttendanceDate');
  const saveBtn    = document.getElementById('btnSaveOpenAttendance');
  const tbody      = document.getElementById('openAttendanceStudentTableBody');

  const batch_id        = batchIdInp ? parseInt(batchIdInp.value, 10) : 0;
  const attendance_date = dateInp ? dateInp.value : '';

  if (!batch_id || !attendance_date) {
    showToast('Invalid attendance sheet selection.', 'error');
    return;
  }

  const checkboxes = tbody ? tbody.querySelectorAll('.student-status-checkbox') : [];
  const records = Array.from(checkboxes).map(cb => ({
    student_id: parseInt(cb.dataset.studentId, 10),
    status: cb.checked ? 'Present' : 'Absent'
  }));

  if (saveBtn) saveBtn.disabled = true;

  const { role, email, coach_id } = getAuthParams();

  try {
    const res = await fetch(ATTENDANCE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_attendance',
        batch_id: batch_id,
        attendance_date: attendance_date,
        records: records,
        role: role,
        email: email,
        coach_id: coach_id
      })
    });
    const data = await res.json();

    if (!data.success) {
      showToast(data.error || 'Failed to save attendance.', 'error');
      return;
    }

    showToast(data.message || 'Attendance saved successfully.', 'success');
    closeModal('openAttendanceModal');
    fetchAttendanceSheets();
  } catch (err) {
    console.error('Error saving attendance:', err);
    showToast('Network error saving attendance.', 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ── Delete Attendance Prompt & Execution ──────────────────────────────────────
function promptDeleteAttendanceSheet(batchId, attendanceDate, batchName) {
  pendingDeleteSheet = { batch_id: batchId, attendance_date: attendanceDate };
  
  const msgEl = document.getElementById('deleteAttendanceConfirmMessage');
  if (msgEl) {
    msgEl.textContent = `Do you want to delete this attendance sheet for "${batchName}" on ${formatDateDisplay(attendanceDate)}?`;
  }

  openModal('deleteAttendanceModal');
}

async function executeDeleteAttendanceSheet() {
  if (!pendingDeleteSheet) return;

  const btnConfirm = document.getElementById('btnConfirmDeleteAttendance');
  if (btnConfirm) btnConfirm.disabled = true;

  const { role, email, coach_id } = getAuthParams();

  try {
    const res = await fetch(ATTENDANCE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_sheet',
        batch_id: pendingDeleteSheet.batch_id,
        attendance_date: pendingDeleteSheet.attendance_date,
        role: role,
        email: email,
        coach_id: coach_id
      })
    });
    const data = await res.json();

    if (!data.success) {
      showToast(data.error || 'Failed to delete attendance sheet.', 'error');
      return;
    }

    showToast(data.message || 'Attendance sheet deleted.', 'success');
    closeModal('deleteAttendanceModal');
    pendingDeleteSheet = null;
    fetchAttendanceSheets();
  } catch (err) {
    console.error('Error deleting attendance sheet:', err);
    showToast('Network error deleting attendance sheet.', 'error');
  } finally {
    if (btnConfirm) btnConfirm.disabled = false;
  }
}

// ── Utility Formatting Helpers ────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getInitials(name) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Event Listener Bindings ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // New Attendance Sheet button in Action Bar
  const btnNewSheet = document.getElementById('btnNewAttendanceSheet');
  if (btnNewSheet) {
    btnNewSheet.addEventListener('click', openNewAttendanceModal);
  }

  // New Attendance Sheet form submission
  const formNewSheet = document.getElementById('newAttendanceForm');
  if (formNewSheet) {
    formNewSheet.addEventListener('submit', submitNewAttendanceSheet);
  }

  // Save Attendance button in Open Attendance modal
  const btnSaveOpen = document.getElementById('btnSaveOpenAttendance');
  if (btnSaveOpen) {
    btnSaveOpen.addEventListener('click', saveAttendanceSheet);
  }

  // Modal Close buttons
  const btnCloseNewModal = document.getElementById('closeNewAttendanceModal');
  const btnCancelNewModal = document.getElementById('btnCancelNewAttendance');
  if (btnCloseNewModal) btnCloseNewModal.addEventListener('click', () => closeModal('newAttendanceModal'));
  if (btnCancelNewModal) btnCancelNewModal.addEventListener('click', () => closeModal('newAttendanceModal'));

  const btnCloseOpenModal = document.getElementById('closeOpenAttendanceModal');
  const btnCancelOpenModal = document.getElementById('btnCloseOpenAttendance');
  if (btnCloseOpenModal) btnCloseOpenModal.addEventListener('click', () => closeModal('openAttendanceModal'));
  if (btnCancelOpenModal) btnCancelOpenModal.addEventListener('click', () => closeModal('openAttendanceModal'));

  const btnCloseDeleteModal = document.getElementById('closeDeleteAttendanceModal');
  const btnCancelDeleteModal = document.getElementById('btnCancelDeleteAttendance');
  const btnConfirmDeleteModal = document.getElementById('btnConfirmDeleteAttendance');
  if (btnCloseDeleteModal) btnCloseDeleteModal.addEventListener('click', () => closeModal('deleteAttendanceModal'));
  if (btnCancelDeleteModal) btnCancelDeleteModal.addEventListener('click', () => closeModal('deleteAttendanceModal'));
  if (btnConfirmDeleteModal) btnConfirmDeleteModal.addEventListener('click', executeDeleteAttendanceSheet);
});
