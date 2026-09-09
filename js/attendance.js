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
  el.textContent = count === 1 ? '1 ATTENDANCE SHEET' : `${count} ATTENDANCE SHEETS`;
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

// Format date parts helper (Month Day, Year + Day of Week)
function formatAttendanceDateParts(dateStr) {
  if (!dateStr) return { fullDate: '', dayOfWeek: '' };
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    const fullDate = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    return { fullDate, dayOfWeek };
  }
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return { fullDate: dateStr, dayOfWeek: '' };
  return {
    fullDate: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long' })
  };
}

// Active Attendance Date Filter State
let activeAttendanceDateFilter = {
  type: 'all', // 'all', 'single', 'range'
  singleDate: '',
  startDate: '',
  endDate: ''
};

// Format short date for button display (e.g., 'Sep 8, 2026' or 'Sep 8')
function formatShortDateDisplay(dateStr, includeYear = true) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    return dateObj.toLocaleDateString('en-US', includeYear 
      ? { month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' });
  }
  return dateStr;
}

// Apply date filter to both mobile cards and desktop table rows
function applyAttendanceDateFilter() {
  const cards = document.querySelectorAll('#attendanceCardsContainer .attendance-card-mobile');
  const rows = document.querySelectorAll('#attendanceSectionTableBody tr');
  const emptyState = document.getElementById('attendanceDateEmptyState');
  const emptyMsg = document.getElementById('attendanceDateEmptyMsg');
  const labelEl = document.getElementById('attendanceSelectedDateLabel');
  const clearBtn = document.getElementById('btnAttendanceClearDate');

  let visibleCount = 0;
  const filter = activeAttendanceDateFilter;

  cards.forEach(card => {
    const cardDate = card.dataset.date || '';
    let match = true;

    if (filter.type === 'single') {
      match = (cardDate === filter.singleDate);
    } else if (filter.type === 'range') {
      match = (cardDate >= filter.startDate && cardDate <= filter.endDate);
    }

    if (match) {
      card.style.display = '';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });

  rows.forEach(row => {
    const rowDate = row.dataset.date || '';
    let match = true;

    if (filter.type === 'single') {
      match = (rowDate === filter.singleDate);
    } else if (filter.type === 'range') {
      match = (rowDate >= filter.startDate && rowDate <= filter.endDate);
    }

    row.style.display = match ? '' : 'none';
  });

  // Update button label & clear button visibility
  if (filter.type === 'single') {
    if (labelEl) labelEl.textContent = formatShortDateDisplay(filter.singleDate);
    if (clearBtn) clearBtn.style.display = 'inline-flex';
  } else if (filter.type === 'range') {
    const startTxt = formatShortDateDisplay(filter.startDate, false);
    const endTxt = formatShortDateDisplay(filter.endDate, false);
    if (labelEl) labelEl.textContent = `${startTxt} – ${endTxt}`;
    if (clearBtn) clearBtn.style.display = 'inline-flex';
  } else {
    if (labelEl) labelEl.textContent = 'Select Date';
    if (clearBtn) clearBtn.style.display = 'none';
  }

  // Update Live Count pill to reflect visible filtered sheets
  if (filter.type !== 'all') {
    updateAttendanceLiveCount(visibleCount);
  } else {
    updateAttendanceLiveCount(cards.length);
  }

  // Handle empty state
  if (emptyState) {
    if (filter.type !== 'all' && visibleCount === 0 && cards.length > 0) {
      emptyState.style.display = 'flex';
      if (emptyMsg) {
        emptyMsg.textContent = filter.type === 'single'
          ? 'No attendance sheets found for this date.'
          : 'No attendance sheets found for this date range.';
      }
    } else {
      emptyState.style.display = 'none';
    }
  }
}

// ── Dedicated Attendance Calendar State & Logic ─────────────────────────────
let calViewYear = 2026;
let calViewMonth = 8; // 0-indexed: 8 = September
let calSelection = {
  start: null, // 'YYYY-MM-DD'
  end: null    // 'YYYY-MM-DD'
};

// Set of dates that currently have attendance sheets
function getDatesWithAttendanceSheets() {
  const dates = new Set();
  document.querySelectorAll('#attendanceCardsContainer .attendance-card-mobile').forEach(c => {
    if (c.dataset.date) dates.add(c.dataset.date);
  });
  return dates;
}

// Render Attendance Calendar Month & Days
function renderAttendanceCalendar() {
  const monthYearLabel = document.getElementById('attendanceCalMonthYearLabel');
  const daysGrid = document.getElementById('attendanceCalDaysGrid');
  const summaryValue = document.getElementById('attendanceCalSummaryValue');
  if (!monthYearLabel || !daysGrid) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  monthYearLabel.textContent = `${monthNames[calViewMonth]} ${calViewYear}`;

  // Weekday offset: Monday is 0, Sunday is 6
  const firstDayObj = new Date(calViewYear, calViewMonth, 1);
  const firstDayWeekday = (firstDayObj.getDay() + 6) % 7; 
  const totalDaysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();

  // Get sheet dates set
  const sheetDates = getDatesWithAttendanceSheets();

  daysGrid.innerHTML = '';

  // Leading empty cells
  for (let i = 0; i < firstDayWeekday; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'cal-day-cell cal-day-empty';
    daysGrid.appendChild(emptyCell);
  }

  // Day cells
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(calViewMonth + 1).padStart(2, '0');
    const dateStr = `${calViewYear}-${monthStr}-${dayStr}`;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day-cell';
    cell.dataset.date = dateStr;
    cell.setAttribute('aria-label', `${monthNames[calViewMonth]} ${day}, ${calViewYear}`);

    const numSpan = document.createElement('span');
    numSpan.className = 'cal-day-num';
    numSpan.textContent = day;
    cell.appendChild(numSpan);

    // Indicator dot if this date has attendance records
    if (sheetDates.has(dateStr)) {
      const dot = document.createElement('span');
      dot.className = 'cal-sheet-dot';
      cell.appendChild(dot);
    }

    // Selection styling
    const { start, end } = calSelection;
    if (start && !end) {
      if (dateStr === start) {
        cell.classList.add('cal-day-selected', 'cal-day-single');
      }
    } else if (start && end) {
      if (dateStr === start) {
        cell.classList.add('cal-day-selected', 'cal-day-start');
      } else if (dateStr === end) {
        cell.classList.add('cal-day-selected', 'cal-day-end');
      } else if (dateStr > start && dateStr < end) {
        cell.classList.add('cal-day-in-range');
      }
    }

    cell.addEventListener('click', () => handleAttendanceCalendarDayClick(dateStr));
    daysGrid.appendChild(cell);
  }

  // Update Summary label in modal footer
  if (summaryValue) {
    if (calSelection.start && calSelection.end) {
      const startParts = calSelection.start.split('-');
      const endParts = calSelection.end.split('-');
      const sameYear = startParts[0] === endParts[0];
      const s = formatShortDateDisplay(calSelection.start, !sameYear);
      const e = formatShortDateDisplay(calSelection.end, true);
      summaryValue.textContent = `${s} – ${e}`;
    } else if (calSelection.start) {
      summaryValue.textContent = formatShortDateDisplay(calSelection.start, true);
    } else {
      summaryValue.textContent = 'All Dates';
    }
  }
}

// Handle Day Click on Attendance Calendar
function handleAttendanceCalendarDayClick(dateStr) {
  // If no selection yet, or both start & end were already selected -> start new single selection
  if (!calSelection.start || (calSelection.start && calSelection.end)) {
    calSelection.start = dateStr;
    calSelection.end = null;
    activeAttendanceDateFilter = {
      type: 'single',
      singleDate: dateStr,
      startDate: '',
      endDate: ''
    };
  } else {
    // Start was selected, end was not
    if (dateStr === calSelection.start) {
      // Tapped same date twice -> single date
      calSelection.end = null;
      activeAttendanceDateFilter = {
        type: 'single',
        singleDate: dateStr,
        startDate: '',
        endDate: ''
      };
    } else if (dateStr < calSelection.start) {
      // Earlier second date -> auto swap so start <= end
      calSelection.end = calSelection.start;
      calSelection.start = dateStr;
      activeAttendanceDateFilter = {
        type: 'range',
        singleDate: '',
        startDate: calSelection.start,
        endDate: calSelection.end
      };
    } else {
      // Later second date -> standard range
      calSelection.end = dateStr;
      activeAttendanceDateFilter = {
        type: 'range',
        singleDate: '',
        startDate: calSelection.start,
        endDate: calSelection.end
      };
    }
  }

  // Re-render calendar highlights
  renderAttendanceCalendar();

  // IMMEDIATELY apply filter to cards and count
  applyAttendanceDateFilter();
}

// Reset Attendance Filter
function resetAttendanceCalendarFilter(shouldClose = false) {
  calSelection.start = null;
  calSelection.end = null;
  activeAttendanceDateFilter = {
    type: 'all',
    singleDate: '',
    startDate: '',
    endDate: ''
  };

  renderAttendanceCalendar();
  applyAttendanceDateFilter();

  if (shouldClose) {
    closeModal('attendanceDateFilterModal');
  }
}

// Open Dedicated Calendar Modal
function openAttendanceDateFilterModal() {
  // If active filter is set, navigate calendar to that date
  if (calSelection.start) {
    const parts = calSelection.start.split('-');
    if (parts.length === 3) {
      calViewYear = parseInt(parts[0], 10);
      calViewMonth = parseInt(parts[1], 10) - 1;
    }
  } else {
    // If no filter, center around the latest attendance sheet's date
    const firstCard = document.querySelector('#attendanceCardsContainer .attendance-card-mobile');
    if (firstCard && firstCard.dataset.date) {
      const p = firstCard.dataset.date.split('-');
      if (p.length === 3) {
        calViewYear = parseInt(p[0], 10);
        calViewMonth = parseInt(p[1], 10) - 1;
      }
    } else {
      const now = new Date();
      calViewYear = now.getFullYear();
      calViewMonth = now.getMonth();
    }
  }

  renderAttendanceCalendar();
  openModal('attendanceDateFilterModal');
}

// ── Fetch & Render Main Attendance List ──────────────────────────────────────
async function fetchAttendanceSheets() {
  const requestId = ++fetchAttendanceRequestId;
  const tableWidget = document.getElementById('attendanceSectionTableWidget');
  const tableBody   = document.getElementById('attendanceSectionTableBody');
  const emptyState  = document.getElementById('attendanceSectionEmptyState');
  const cardsContainer = document.getElementById('attendanceCardsContainer');
  const dateEmptyState = document.getElementById('attendanceDateEmptyState');
  if (!tableBody || !emptyState || !tableWidget) return;

  tableBody.innerHTML = '';
  if (cardsContainer) cardsContainer.innerHTML = '';
  if (dateEmptyState) dateEmptyState.style.display = 'none';

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
      if (cardsContainer) cardsContainer.style.display = 'none';
      emptyState.style.display  = 'flex';
      tableBody.innerHTML       = '';
      if (cardsContainer) cardsContainer.innerHTML = '';
    } else {
      emptyState.style.display  = 'none';
      tableWidget.style.display = 'block';
      if (cardsContainer) cardsContainer.style.display = '';
      tableBody.innerHTML       = '';
      if (cardsContainer) cardsContainer.innerHTML = '';

      sheets.forEach(sheet => {
        const safeBatchName = escapeHtml(sheet.batch_name);
        const safeCoachName = escapeHtml(sheet.coach_name);
        const formattedDate = formatDateDisplay(sheet.attendance_date);
        const { fullDate, dayOfWeek } = formatAttendanceDateParts(sheet.attendance_date);

        // Calculate Attendance (Present/Total) and Present Percentage
        const presentCount = parseInt(sheet.present_count || 0, 10);
        const totalStudents = parseInt(sheet.total_batch_students !== undefined ? sheet.total_batch_students : (sheet.total_students || sheet.sheet_records_count || 0), 10);

        const attendanceDisplay = `${presentCount}/${totalStudents}`;
        let pct = 0;
        if (totalStudents > 0) {
          pct = Math.round((presentCount / totalStudents) * 100);
        }
        const pctDisplay = `${pct}%`;

        const menuKey = `${sheet.batch_id}_${sheet.attendance_date.replace(/-/g, '')}`;

        // 1. Desktop Table Row
        const tr = document.createElement('tr');
        tr.dataset.batchId = sheet.batch_id;
        tr.dataset.batchName = sheet.batch_name || '';
        tr.dataset.date = sheet.attendance_date;

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

        // 2. Mobile Attendance Card (Matches IMAGE 1 Target Design)
        if (cardsContainer) {
          const card = document.createElement('div');
          card.className = 'attendance-card-mobile';
          card.dataset.batchId = sheet.batch_id;
          card.dataset.date = sheet.attendance_date;
          card.dataset.batchName = sheet.batch_name || '';
          card.dataset.coachName = sheet.coach_name || '';
          card.dataset.fullDate = fullDate;
          card.dataset.day = dayOfWeek;

          card.innerHTML = `
            <!-- Top Row: Calendar Icon, Date & Day, 3-dots Actions Menu -->
            <div class="attendance-card-top">
              <div class="attendance-date-block">
                <div class="attendance-calendar-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                    <circle cx="8" cy="14" r="1" fill="currentColor"></circle>
                    <circle cx="12" cy="14" r="1" fill="currentColor"></circle>
                    <circle cx="16" cy="14" r="1" fill="currentColor"></circle>
                    <circle cx="8" cy="18" r="1" fill="currentColor"></circle>
                    <circle cx="12" cy="18" r="1" fill="currentColor"></circle>
                    <circle cx="16" cy="18" r="1" fill="currentColor"></circle>
                  </svg>
                </div>
                <div class="attendance-date-text">
                  <div class="attendance-date-val">${fullDate}</div>
                  <div class="attendance-day-val">${dayOfWeek}</div>
                </div>
              </div>
              <div class="batch-actions-wrap">
                <button class="batch-actions-btn attendance-three-dots-btn" data-id="mobile-${menuKey}" type="button" aria-label="Attendance Actions">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                  </svg>
                </button>
                <div class="batch-actions-menu" id="attendanceMenu-mobile-${menuKey}">
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
            </div>

            <!-- Divider -->
            <div class="attendance-card-divider"></div>

            <!-- Bottom Row: Users Icon, Attendance Count, Circular Progress Ring & Percentage -->
            <div class="attendance-card-bottom">
              <div class="attendance-count-block">
                <div class="attendance-group-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <div class="attendance-count-text">
                  <span class="attendance-stat-label">Attendance</span>
                  <span class="attendance-stat-val">${presentCount} / ${totalStudents}</span>
                </div>
              </div>

              <div class="attendance-pct-block">
                <div class="attendance-circle-wrap">
                  <svg viewBox="0 0 36 36" class="attendance-circle-chart">
                    <path class="circle-bg"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path class="circle-fg"
                      stroke-dasharray="${pct}, 100"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </div>
                <div class="attendance-pct-text">
                  <span class="attendance-pct-val">${pctDisplay}</span>
                  <span class="attendance-pct-label">Present</span>
                </div>
              </div>
            </div>
          `;
          cardsContainer.appendChild(card);
        }
      });

      // Maintain active date filter if set
      if (activeAttendanceDateFilter.type !== 'all') {
        applyAttendanceDateFilter();
      }
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

  // Attendance Date Filter Controls
  const btnSelectDate = document.getElementById('btnAttendanceSelectDate');
  if (btnSelectDate) btnSelectDate.addEventListener('click', openAttendanceDateFilterModal);

  const btnClearDate = document.getElementById('btnAttendanceClearDate');
  if (btnClearDate) btnClearDate.addEventListener('click', resetAttendanceCalendarFilter);

  const btnResetEmpty = document.getElementById('btnResetDateFilterEmptyState');
  if (btnResetEmpty) btnResetEmpty.addEventListener('click', resetAttendanceCalendarFilter);

  // Dedicated Calendar Modal Controls
  const btnResetCal = document.getElementById('btnResetAttendanceFilter');
  if (btnResetCal) btnResetCal.addEventListener('click', () => resetAttendanceCalendarFilter(true));

  const closeDateModal = document.getElementById('closeAttendanceDateModal');
  if (closeDateModal) closeDateModal.addEventListener('click', () => closeModal('attendanceDateFilterModal'));

  const btnDoneCalendar = document.getElementById('btnDoneAttendanceCalendar');
  if (btnDoneCalendar) btnDoneCalendar.addEventListener('click', () => closeModal('attendanceDateFilterModal'));

  const btnPrevMonth = document.getElementById('btnCalPrevMonth');
  if (btnPrevMonth) {
    btnPrevMonth.addEventListener('click', () => {
      calViewMonth--;
      if (calViewMonth < 0) {
        calViewMonth = 11;
        calViewYear--;
      }
      renderAttendanceCalendar();
    });
  }

  const btnNextMonth = document.getElementById('btnCalNextMonth');
  if (btnNextMonth) {
    btnNextMonth.addEventListener('click', () => {
      calViewMonth++;
      if (calViewMonth > 11) {
        calViewMonth = 0;
        calViewYear++;
      }
      renderAttendanceCalendar();
    });
  }
});
