/**
 * VAVA Sports Academy - Coaches Module
 */

let fetchCoachesRequestId = 0;
let coachToDelete = null;
let activeProfileCoachId = null;
let currentLoadedCoachData = null;

// Global Cropper State shared with Students photo upload modal
var activeProfileType = 'coach'; // 'coach' or 'student'
var rawCropImage = null;
var cropRotation = 0;
var cropFlipH = 1;
var cropFlipV = 1;

function updateCoachesLiveCount(count) {
  const el = document.getElementById('coachesLiveCount');
  if (!el) return;
  el.textContent = count === 1 ? '1 Active Coach' : `${count} Active Coaches`;
}

// ── Fetch & Render Coaches (Table & Mobile Cards) ─────────
async function fetchCoaches() {
  const requestId = ++fetchCoachesRequestId;
  const tableWidget = document.getElementById('coachesTableWidget');
  const cardsContainer = document.getElementById('coachCardsContainer');
  const tableBody   = document.getElementById('coachRosterBody');
  const emptyState  = document.getElementById('coachesEmptyState');
  if (!tableBody || !emptyState || !tableWidget) return;

  tableBody.innerHTML = '';
  if (cardsContainer) cardsContainer.innerHTML = '';

  try {
    const res = await fetch(COACHES_API);
    const data = await res.json();
    if (requestId !== fetchCoachesRequestId) return;
    if (!data.success) throw new Error(data.error || 'Fetch failed.');

    const coaches = data.coaches || [];
    updateCoachesLiveCount(coaches.length);

    if (coaches.length === 0) {
      tableWidget.style.display = 'none';
      if (cardsContainer) cardsContainer.style.display = 'none';
      emptyState.style.display  = 'flex';
    } else {
      emptyState.style.display  = 'none';
      tableWidget.style.display = '';
      if (cardsContainer) cardsContainer.style.display = '';
      tableBody.innerHTML = '';

      coaches.forEach(coach => {
        const initials = getCoachInitials(coach.coach_name);
        const licenseLabel = formatLicenseLabel(coach.coach_license);
        const joinDateFormatted = formatCoachDate(coach.coach_joined_date);
        const phoneFormatted = coach.coach_phone ? `+91 ${coach.coach_phone}` : '—';
        const coachJsonStr = encodeURIComponent(JSON.stringify(coach));

        // 1. Desktop Table Row
        const tr = document.createElement('tr');
        tr.dataset.coachId = coach.coach_id;
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

        // 2. Mobile Card Element (Reference Design Structure)
        if (cardsContainer) {
          const card = document.createElement('div');
          card.className = 'coach-card-mobile';
          card.dataset.coachId = coach.coach_id;

          const avatarInnerHtml = (coach.coach_photo && coach.coach_photo.trim() !== '' && coach.coach_photo !== 'null')
            ? `<img src="${coach.coach_photo}" class="coach-photo-img" alt="${coach.coach_name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="coach-avatar-initials" style="display:none;">${initials}</div>`
            : `<div class="coach-avatar-initials">${initials}</div>`;
          const avatarHtml = `<div class="coach-card-avatar">${avatarInnerHtml}</div>`;

          const batchBadgeHtml = coach.batch_name
            ? `<span class="coach-card-pill pill-batch"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${coach.batch_name}</span>`
            : `<span class="coach-card-pill pill-batch"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> No Batch</span>`;

          card.innerHTML = `
            <div class="coach-card-top">
              <div class="coach-card-profile">
                ${avatarHtml}
                <div class="coach-card-info">
                  <a href="javascript:void(0)" class="coach-card-name coach-name-link" data-id="${coach.coach_id}">${coach.coach_name}</a>
                  <div class="coach-card-email">${coach.coach_email || '—'}</div>
                  <div class="coach-card-badges">
                    ${batchBadgeHtml}
                    <span class="coach-card-pill pill-license">${licenseLabel}</span>
                  </div>
                </div>
              </div>
              <div class="batch-actions-wrap">
                <button class="batch-actions-btn coach-three-dots-btn" data-id="${coach.coach_id}" type="button" aria-label="Coach Actions">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
                    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
                  </svg>
                </button>
                <div class="batch-actions-menu" id="coachMenuMobile-${coach.coach_id}">
                  <button class="batch-action-item coach-edit-item" data-id="${coach.coach_id}" data-coach="${coachJsonStr}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit Coach
                  </button>
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
            </div>

            <div class="coach-card-divider"></div>

            <div class="coach-card-bottom-grid">
              <div class="coach-meta-col">
                <div class="coach-meta-val">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span>${coach.coach_city || '—'}</span>
                </div>
                <div class="coach-meta-lbl">Location</div>
              </div>
              <div class="coach-meta-col">
                <div class="coach-meta-val">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>${joinDateFormatted}</span>
                </div>
                <div class="coach-meta-lbl">Join Date</div>
              </div>
              <div class="coach-meta-col">
                <div class="coach-meta-val">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.76a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span>${phoneFormatted}</span>
                </div>
                <div class="coach-meta-lbl">Phone Number</div>
              </div>
            </div>
          `;

          cardsContainer.appendChild(card);
        }
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

// ── Form Modal Functions ────────────────────────────────────
function openCoachForm() {
  populateBatchDropdowns();
  openModal('addCoachModal');
}

function closeCoachForm() {
  closeModal('addCoachModal');
  clearCoachErrors();
}

function clearCoachErrors() {
  const form = document.getElementById('addCoachForm');
  if (form) {
    form.querySelectorAll('.reg-error').forEach(e => e.classList.remove('visible'));
    form.querySelectorAll('.reg-input').forEach(el => el.classList.remove('reg-input-error'));
  }
}

function openEditCoachForm() {
  populateBatchDropdowns();
  openModal('editCoachModal');
}

function closeEditCoachForm() {
  closeModal('editCoachModal');
  clearEditCoachErrors();
}

function clearEditCoachErrors() {
  const form = document.getElementById('editCoachForm');
  if (form) {
    form.querySelectorAll('.reg-error').forEach(e => e.classList.remove('visible'));
    form.querySelectorAll('.reg-input').forEach(el => el.classList.remove('reg-input-error'));
  }
}

// ── Open Coach Profile Modal ────────────────────────────────
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

// ── Cropper Canvas Redraw Function ──────────────────────────
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

// ── Coaches Initialization & Event Listeners ──────────────
document.addEventListener('DOMContentLoaded', () => {
  const btnAddCoach = document.getElementById('btnAddCoach');
  const closeAddCoachBtn = document.getElementById('closeAddCoachModal');
  const cancelAddCoach = document.getElementById('cancelAddCoach');
  const submitAddCoach = document.getElementById('submitAddCoach');

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

  // ── Edit Coach Handlers ───────────────────────────────────
  const closeEditCoachBtn = document.getElementById('closeEditCoachModal');
  const cancelEditCoach   = document.getElementById('cancelEditCoach');
  const submitEditCoach   = document.getElementById('submitEditCoach');

  if (closeEditCoachBtn) closeEditCoachBtn.addEventListener('click', closeEditCoachForm);
  if (cancelEditCoach)   cancelEditCoach.addEventListener('click', closeEditCoachForm);

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

  // ── Delete Coach Handlers ─────────────────────────────────
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

  // ── Coach Profile & Photo Handlers ────────────────────────
  const closeCoachProfileModal = document.getElementById('closeCoachProfileModal');
  if (closeCoachProfileModal) {
    closeCoachProfileModal.addEventListener('click', () => closeModal('coachProfileModal'));
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('.coach-name-link');
    if (!link) return;
    const coachId = link.getAttribute('data-id');
    if (coachId) {
      openCoachProfile(coachId);
    }
  });

  // Photo Hover Menu & Actions
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

  const btnAddCoachPhoto = document.getElementById('btnAddCoachPhoto');
  const coachPhotoFileInput = document.getElementById('coachPhotoFileInput');
  if (btnAddCoachPhoto && coachPhotoFileInput) {
    btnAddCoachPhoto.addEventListener('click', () => {
      if (coachPhotoDropdown) coachPhotoDropdown.classList.remove('show');
      coachPhotoFileInput.value = '';
      coachPhotoFileInput.click();
    });
  }

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

  // Delete Coach Photo
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

  // ── Image Cropper Controls ────────────────────────────────
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

  if (submitCropPhoto) {
    submitCropPhoto.addEventListener('click', async () => {
      const canvas = document.getElementById('cropCanvas');
      if (!canvas) return;

      const base64Image = canvas.toDataURL('image/jpeg', 0.9);
      submitCropPhoto.disabled = true;
      submitCropPhoto.textContent = 'Uploading...';

      try {
        const profileType = (typeof window.activeProfileType !== 'undefined') ? window.activeProfileType : activeProfileType;
        if (profileType === 'student') {
          const studentId = activeProfileStudentId || (typeof window.activeProfileStudentId !== 'undefined' ? window.activeProfileStudentId : null);
          if (!studentId) return;
          const res = await fetch(STUDENTS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upload_photo',
              student_id: studentId,
              image_data: base64Image
            })
          });
          const data = await res.json();
          if (data.success) {
            closeModal('cropPhotoModal');
            showToast('Profile picture uploaded successfully!', 'success');
            openStudentProfile(studentId);
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

  // ── Coach Search Filter Listener ──────────────────────────
  const coachSearchInput = document.getElementById('coachSearchInput');
  if (coachSearchInput) {
    coachSearchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#coachRosterBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
      document.querySelectorAll('#coachCardsContainer .coach-card-mobile').forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  }
});
