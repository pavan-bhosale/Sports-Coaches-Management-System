/**
 * VAVA Sports Academy - Utility Functions & Constants
 */

// API Endpoints
const STUDENTS_API   = 'http://localhost/VAVA_sports/server/students.php';
const COACHES_API    = 'http://localhost/VAVA_sports/server/coaches.php';
const BATCHES_API    = 'http://localhost/VAVA_sports/server/batches.php';
const ATTENDANCE_API = 'http://localhost/VAVA_sports/server/attendance.php';

// Modal Open / Close Helpers
function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.style.display = 'none'; document.body.style.overflow = ''; }
}

// Toast Notification Helper
function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toastContainer');
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

// Formatting Mappings & Helpers
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

function getStudentInitials(name) {
  if (!name) return 'S';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

function getCoachInitials(name) {
  if (!name) return 'C';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

function formatBatchTime(raw) {
  if (!raw) return '—';
  try {
    return new Date(`1970-01-01T${raw}`)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return raw; }
}

// Shared State & Dropdown Populators
let cachedBatchesList = [];
let cachedCoachesList = [];

async function populateBatchDropdowns() {
  try {
    const res = await fetch(BATCHES_API);
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

async function populateCoachDropdowns() {
  try {
    const res = await fetch(COACHES_API);
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

// Global UI Listeners (Actions Dropdown & Modal Overlay Click)
document.addEventListener('DOMContentLoaded', () => {
  // Actions Dropdown Toggle
  document.addEventListener('click', (e) => {
    const actionsBtn = e.target.closest('.batch-actions-btn');
    if (actionsBtn) {
      e.stopPropagation();
      const id = actionsBtn.getAttribute('data-id');
      const wrap = actionsBtn.closest('.batch-actions-wrap');
      const menu = (wrap && wrap.querySelector('.batch-actions-menu')) || document.getElementById(`batchMenu-${id}`) || document.getElementById(`coachMenu-${id}`) || document.getElementById(`studentMenu-${id}`) || document.getElementById(`attendanceMenu-${id}`);
      document.querySelectorAll('.batch-actions-menu.open').forEach(m => {
        if (m !== menu) m.classList.remove('open');
      });
      if (menu) menu.classList.toggle('open');
      return;
    }

    if (!e.target.closest('.batch-actions-wrap')) {
      document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));
    }
  });

  // Close modals on overlay click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('sb-modal-overlay')) {
      closeModal(e.target.id);
    }
  });
});
