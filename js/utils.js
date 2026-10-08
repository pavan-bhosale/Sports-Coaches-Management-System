/**
 * VAVA Sports Academy - Utility Functions & Constants
 */

// ============================================================================
// AUTOMATIC ENVIRONMENT DETECTION & API ENDPOINTS
// Resolves to full localhost paths on local development, and relative paths in production.
// ============================================================================
function getApiEndpoint(endpoint) {
  // Allow explicit config or localStorage override if set
  if (typeof window !== 'undefined' && window.VAVA_API_BASE) {
    const base = window.VAVA_API_BASE.replace(/\/+$/, '');
    return `${base}/${endpoint}.php`;
  }
  if (typeof window !== 'undefined') {
    try {
      if (localStorage.getItem('vava_api_base')) {
        localStorage.removeItem('vava_api_base');
      }
    } catch (e) {}
  }

  const hostname = (typeof window !== 'undefined' && window.location.hostname) ? window.location.hostname : 'localhost';
  const port = (typeof window !== 'undefined' && window.location.port) ? window.location.port : '';
  const pathname = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname : '/';

  // Check if running on a standalone dev server (e.g. VS Code Live Server on 5500, 3000, 5173) where Apache is separate
  const isDevServer = port !== '' && port !== '80' && port !== '443';
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocalHost && isDevServer) {
    // Cross-origin local dev: route to Apache XAMPP default port
    const targetHost = hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
    return `http://${targetHost}/VAVA_sports/server/${endpoint}.php`;
  }

  // Same-origin (works for local XAMPP, production root domain, and production subdirectory)
  const currentDir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
  return `${currentDir}server/${endpoint}.php`;
}

const STUDENTS_API   = getApiEndpoint('students');
const COACHES_API    = getApiEndpoint('coaches');
const BATCHES_API    = getApiEndpoint('batches');
const ATTENDANCE_API = getApiEndpoint('attendance');
const FEES_API       = getApiEndpoint('fees');
const INVENTORY_API  = getApiEndpoint('inventory');
const REPORTS_API    = getApiEndpoint('reports');
const DASHBOARD_API  = getApiEndpoint('dashboard');

if (typeof window !== 'undefined') {
  window.getApiEndpoint = getApiEndpoint;
  window.STUDENTS_API   = STUDENTS_API;
  window.COACHES_API    = COACHES_API;
  window.BATCHES_API    = BATCHES_API;
  window.ATTENDANCE_API = ATTENDANCE_API;
  window.FEES_API       = FEES_API;
  window.INVENTORY_API  = INVENTORY_API;
  window.REPORTS_API    = REPORTS_API;
  window.DASHBOARD_API  = DASHBOARD_API;
  window.openModal      = openModal;
  window.closeModal     = closeModal;
}

// Modal Stack & History Management for Mobile Back Button
const activeModalStack = [];
let isProgrammaticHistoryBack = false;
let isPopstateClosing = false;
let savedScrollY = 0;

function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;

  // On first modal opening, preserve current scroll position and lock background
  if (activeModalStack.length === 0) {
    savedScrollY = window.pageYOffset || document.documentElement.scrollTop || window.scrollY || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.width = '100%';
    document.body.classList.add('modal-open');
  }

  m.style.display = 'flex';

  // If not already the top of the stack, register it
  if (activeModalStack[activeModalStack.length - 1] !== id) {
    activeModalStack.push(id);
    try {
      history.pushState({ vsaModalId: id, stackDepth: activeModalStack.length }, '');
    } catch (e) {
      console.warn('History pushState failed:', e);
    }
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.style.display = 'none';
  }

  const idx = activeModalStack.lastIndexOf(id);
  const wasInStack = (idx !== -1);
  if (wasInStack) {
    activeModalStack.splice(idx, 1);
  }

  // If all modals in the stack are closed, unlock background and restore previous scroll position
  if (activeModalStack.length === 0) {
    const scrollTarget = savedScrollY;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.classList.remove('modal-open');
    window.scrollTo({
      top: scrollTarget,
      left: 0,
      behavior: 'instant'
    });
  }

  // If closed directly by user (close button, Cancel, backdrop) and not by browser popstate,
  // sync history so back button doesn't have stale states
  if (wasInStack && !isPopstateClosing) {
    isProgrammaticHistoryBack = true;
    try {
      history.back();
    } catch (e) {
      isProgrammaticHistoryBack = false;
    }
  }
}

// Global popstate listener for mobile / browser back button
window.addEventListener('popstate', (e) => {
  if (isProgrammaticHistoryBack) {
    isProgrammaticHistoryBack = false;
    return;
  }

  if (activeModalStack.length > 0) {
    const topModalId = activeModalStack[activeModalStack.length - 1];
    isPopstateClosing = true;
    try {
      // Execute specific cleanup methods if defined, falling back to closeModal
      if (topModalId === 'addStudentModal' && typeof closeRegForm === 'function') {
        closeRegForm();
      } else if (topModalId === 'editStudentModal' && typeof closeEditStudentForm === 'function') {
        closeEditStudentForm();
      } else if (topModalId === 'feesPaymentDetailModal' && typeof closeStudentPaymentDetailModal === 'function') {
        closeStudentPaymentDetailModal();
      } else if (topModalId === 'feesNewPaymentModal' && typeof closeNewPaymentModal === 'function') {
        closeNewPaymentModal();
      } else if (topModalId === 'feesScheduleModal' && typeof closeScheduleModal === 'function') {
        closeScheduleModal();
      } else if (topModalId === 'feesDeleteCycleModal' && typeof closeDeleteCycleConfirmationModal === 'function') {
        closeDeleteCycleConfirmationModal();
      } else {
        closeModal(topModalId);
      }
    } catch (err) {
      console.error('Error closing modal on popstate:', err);
      closeModal(topModalId);
    } finally {
      isPopstateClosing = false;
    }
  }
});

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

function formatTime12Hour(raw) {
  if (!raw) return '—';
  const str = String(raw).trim();
  // Check for HH:MM:SS or HH:MM format
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${ampm}`;
  }
  // Try parsing ISO date or datetime string
  try {
    const d = new Date(str.includes('T') ? str : `1970-01-01T${str}`);
    if (!isNaN(d.getTime())) {
      let hour = d.getHours();
      const minute = String(d.getMinutes()).padStart(2, '0');
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      if (hour === 0) hour = 12;
      return `${hour}:${minute} ${ampm}`;
    }
  } catch (e) {}
  return str;
}

function formatBatchTime(raw) {
  return formatTime12Hour(raw);
}

// Shared State & Dropdown Populators
let cachedBatchesList = [];
let cachedCoachesList = [];

function getUtilityAuthHeaders() {
  const role = (typeof localStorage !== 'undefined' && localStorage.getItem('vava_role')) || 'admin';
  const email = (typeof localStorage !== 'undefined' && localStorage.getItem('vava_email')) || '';
  const coach_id = (typeof localStorage !== 'undefined' && localStorage.getItem('vava_coach_id')) || '0';
  let name = '';
  try {
    if (typeof localStorage !== 'undefined') {
      const u = JSON.parse(localStorage.getItem('vava_user') || '{}');
      name = u.name || '';
    }
  } catch(e) {}
  return {
    'Content-Type': 'application/json',
    'X-VAVA-Role': role,
    'X-VAVA-Email': email,
    'X-VAVA-Coach-ID': String(coach_id),
    'X-VAVA-Actor-Name': name
  };
}

if (typeof window !== 'undefined') {
  window.getUtilityAuthHeaders = getUtilityAuthHeaders;
  window.getAuthHeaders = window.getAuthHeaders || getUtilityAuthHeaders;
}

async function populateBatchDropdowns(batchesData = null) {
  try {
    if (Array.isArray(batchesData)) {
      cachedBatchesList = batchesData;
    } else {
      const res = await fetch(BATCHES_API, {
        credentials: 'include',
        headers: getUtilityAuthHeaders()
      });
      const data = await res.json();
      if (!data.success) return;
      cachedBatchesList = data.batches || [];
    }

    // Coach form batch selects (by batch_id)
    const selects = document.querySelectorAll('.coach-batch-select-input');
    selects.forEach(select => {
      const currentVal = select.value;
      const isAssignModal = select.id === 'assignBatchSelect';

      let html = isAssignModal
        ? '<option value="">Select Batch</option>'
        : '';

      cachedBatchesList.forEach(b => {
        html += `<option value="${b.batch_id}">${escapeHtml(b.batch_name)}</option>`;
      });

      if (!isAssignModal) {
        html += '<option value="0">No Batch</option>';
      }

      select.innerHTML = html;
      if (currentVal) select.value = currentVal;
    });

    // Student form batch selects (by batch_id)
    const studentBatchSelects = document.querySelectorAll('.student-batch-select-input');
    studentBatchSelects.forEach(select => {
      const currentVal = select.value;
      let html = '<option value="">Select Batch</option>';
      cachedBatchesList.forEach(b => {
        html += `<option value="${b.batch_id}">${escapeHtml(b.batch_name)}</option>`;
      });
      html += '<option value="0">No Batch</option>';
      select.innerHTML = html;
      if (currentVal !== undefined && currentVal !== null && currentVal !== '') {
        select.value = currentVal;
      }
    });
  } catch (err) {
    console.error('Error fetching batches for dropdown:', err);
  }
}

async function populateCoachDropdowns(coachesData = null) {
  try {
    if (Array.isArray(coachesData)) {
      cachedCoachesList = coachesData;
    } else {
      const res = await fetch(COACHES_API, {
        credentials: 'include',
        headers: getUtilityAuthHeaders()
      });
      const data = await res.json();
      if (!data.success) return;
      cachedCoachesList = data.coaches || [];
    }

    const studentCoachSelects = document.querySelectorAll('.student-coach-select-input');
    studentCoachSelects.forEach(select => {
      const currentVal = select.value;
      let html = '<option value="">Select Coach</option>';
      cachedCoachesList.forEach(c => {
        const nameEscaped = escapeHtml(c.coach_name);
        html += `<option value="${nameEscaped}">${nameEscaped}</option>`;
      });
      select.innerHTML = html;
      if (currentVal) select.value = currentVal;
    });

    // Batch form coach selects (by coach_id)
    const batchCoachSelects = document.querySelectorAll('.batch-coach-select-input');
    batchCoachSelects.forEach(select => {
      const currentVal = select.value;
      let html = '<option value="">No Coach</option>';
      cachedCoachesList.forEach(c => {
        const nameEscaped = escapeHtml(c.coach_name);
        html += `<option value="${c.coach_id}">${nameEscaped}</option>`;
      });
      select.innerHTML = html;
      if (currentVal) select.value = currentVal;
    });
  } catch (err) {
    console.error('Error fetching coaches for dropdown:', err);
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
      
      const wasOpen = menu && menu.classList.contains('open');

      // Close all currently open menus and reset elevation
      document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.batch-actions-menu.drop-up').forEach(m => m.classList.remove('drop-up'));
      document.querySelectorAll('.menu-open').forEach(el => el.classList.remove('menu-open'));

      if (menu && !wasOpen) {
        menu.classList.add('open');
        if (wrap) wrap.classList.add('menu-open');
        const card = actionsBtn.closest('.batch-card-mobile, .student-card-mobile, .coach-card-mobile, .attendance-card-mobile');
        if (card) card.classList.add('menu-open');

        // Check if menu extends past bottom of screen (allowing for bottom nav)
        const rect = menu.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        if (rect.bottom > viewportHeight - 75 && rect.top > rect.height) {
          menu.classList.add('drop-up');
        }
      }
      return;
    }

    if (!e.target.closest('.batch-actions-wrap')) {
      document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.batch-actions-menu.drop-up').forEach(m => m.classList.remove('drop-up'));
      document.querySelectorAll('.menu-open').forEach(el => el.classList.remove('menu-open'));
    }
  });

  // Close modals on overlay click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('sb-modal-overlay') || e.target.classList.contains('report-modal-overlay')) {
      closeModal(e.target.id);
    }
  });

  // Escape key closes topmost modal in activeModalStack
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModalStack.length > 0) {
      const topModalId = activeModalStack[activeModalStack.length - 1];
      if (topModalId === 'addStudentModal' && typeof closeRegForm === 'function') {
        closeRegForm();
      } else if (topModalId === 'editStudentModal' && typeof closeEditStudentForm === 'function') {
        closeEditStudentForm();
      } else if (topModalId === 'feesPaymentDetailModal' && typeof closeStudentPaymentDetailModal === 'function') {
        closeStudentPaymentDetailModal();
      } else if (topModalId === 'feesNewPaymentModal' && typeof closeNewPaymentModal === 'function') {
        closeNewPaymentModal();
      } else if (topModalId === 'feesScheduleModal' && typeof closeScheduleModal === 'function') {
        closeScheduleModal();
      } else if (topModalId === 'feesDeleteCycleModal' && typeof closeDeleteCycleConfirmationModal === 'function') {
        closeDeleteCycleConfirmationModal();
      } else {
        closeModal(topModalId);
      }
    }
  });
});

// ============================================================================
// GLOBAL XSS PREVENTION HELPER
// Standardized HTML entity escaping for user-controlled strings.
// ============================================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;

  // ==========================================================================
  // CENTRALIZED SESSION EXPIRY & 401 INTERCEPTOR
  // Automatically detects server session termination and smoothly redirects
  // to index.html with a user-friendly notice, avoiding stale spinners.
  // ==========================================================================
  if (!window._vavaFetchIntercepted) {
    window._vavaFetchIntercepted = true;
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      if (response && response.status === 401) {
        const isLoginPage = window.location.pathname.endsWith('index.html') || 
                            window.location.pathname.endsWith('/') || 
                            window.location.pathname === '';
        if (!isLoginPage && !window._vavaRedirectingToLogin) {
          window._vavaRedirectingToLogin = true;
          if (typeof showToast === 'function') {
            showToast('Session expired. Redirecting to login...', 'error');
          }
          try {
            localStorage.removeItem('vava_token');
            localStorage.removeItem('vava_role');
            localStorage.removeItem('vava_user');
            localStorage.removeItem('vava_email');
          } catch (e) {}
          setTimeout(() => {
            window.location.href = 'index.html';
          }, 1500);
        }
      }
      return response;
    };
  }
}

