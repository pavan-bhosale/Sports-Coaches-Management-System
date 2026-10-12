/**
 * VAVA Sports Academy - Batches Module
 * Handles dynamic student counts, coach assignment, and coach conflict warnings.
 */

let fetchBatchesRequestId = 0;
let batchToDelete = null;
let activeBatchDetailId = null;
let coachConflictConfirmCb = null;
let coachConflictCancelCb = null;

function updateLiveCount(count) {
  const el = document.getElementById('batchesLiveCount');
  if (!el) return;
  el.textContent = count === 1 ? '1 Active Batch' : `${count} Active Batches`;
}

function getBatchInitials(name) {
  if (!name) return 'B';
  const match = name.trim().match(/batch\s*(\d+)/i);
  if (match) {
    return 'B' + match[1];
  }
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.trim().substring(0, 2).toUpperCase();
}

/**
 * Check if a coach is already assigned to other batches (excluding currentBatchId).
 */
function checkCoachConflict(coachId, currentBatchId = null) {
  if (!coachId || parseInt(coachId) <= 0) return [];
  const cId = parseInt(coachId);
  const curId = currentBatchId ? parseInt(currentBatchId) : null;

  return (cachedBatchesList || []).filter(b => {
    return parseInt(b.coach_id) === cId && (!curId || parseInt(b.batch_id) !== curId);
  });
}

/**
 * Display the Coach Already Assigned warning modal before saving batch.
 */
function showCoachConflictWarning(coachId, otherBatches, onConfirm, onCancel) {
  const modal = document.getElementById('coachConflictModal');
  if (!modal) {
    // If modal element not found, proceed
    if (typeof onConfirm === 'function') onConfirm();
    return;
  }

  // Find coach name
  let coachName = 'This coach';
  const coachObj = (cachedCoachesList || []).find(c => parseInt(c.coach_id) === parseInt(coachId));
  if (coachObj && coachObj.coach_name) {
    coachName = coachObj.coach_name;
  } else {
    const editSel = document.getElementById('editBatchCoach');
    const newSel = document.getElementById('newBatchCoach');
    const activeSel = (modal.dataset.origin === 'add') ? newSel : editSel;
    if (activeSel && activeSel.selectedOptions[0]) {
      coachName = activeSel.selectedOptions[0].text;
    }
  }

  const descEl = document.getElementById('coachConflictDesc');
  if (descEl) {
    descEl.innerHTML = `Coach <strong>${coachName}</strong> is already assigned to the following batch(es):`;
  }

  const listEl = document.getElementById('coachConflictBatchList');
  if (listEl) {
    listEl.innerHTML = otherBatches.map(b => {
      const timeFmt = b.batch_time ? formatBatchTime(b.batch_time) : '';
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0.5rem; background:rgba(255,255,255,0.04); border-radius:6px;">
          <span style="font-weight:600; color:var(--text-primary); font-size:0.875rem;">${b.batch_name}</span>
          ${timeFmt ? `<span style="color:var(--gold-highlight); font-size:0.825rem; font-weight:500;">${timeFmt}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  coachConflictConfirmCb = onConfirm;
  coachConflictCancelCb = onCancel;

  openModal('coachConflictModal');
}

// ── Fetch & Render Batches (Table & Mobile Cards) ────────────────────────
async function fetchBatches() {
  const requestId = ++fetchBatchesRequestId;
  const tableWidget    = document.getElementById('batchesTableWidget');
  const cardsContainer = document.getElementById('batchCardsContainer');
  const tableBody      = document.getElementById('batchesTableBody');
  const emptyState     = document.getElementById('batchesEmptyState');
  if (!tableBody || !emptyState || !tableWidget) return;

  tableBody.innerHTML = '';
  if (cardsContainer) cardsContainer.innerHTML = '';

  try {
    const res  = await fetch(BATCHES_API, {
      credentials: 'include',
      headers: getBatchAuthHeaders()
    });
    const data = await res.json();
    if (requestId !== fetchBatchesRequestId) return;
    if (!data.success) throw new Error(data.error || 'Fetch failed.');

    const batches = data.batches || [];
    cachedBatchesList = batches;
    updateLiveCount(batches.length);
    populateBatchDropdowns(batches);
    populateCoachDropdowns();

    if (batches.length === 0) {
      tableWidget.style.display = 'none';
      if (cardsContainer) cardsContainer.style.display = 'none';
      emptyState.style.display  = 'flex';
      tableBody.innerHTML = '';
      if (cardsContainer) cardsContainer.innerHTML = '';
    } else {
      emptyState.style.display  = 'none';
      tableWidget.style.display = 'block';
      if (cardsContainer) cardsContainer.style.display = '';
      tableBody.innerHTML = '';
      if (cardsContainer) cardsContainer.innerHTML = '';

      batches.forEach(batch => {
        const initials = getBatchInitials(batch.batch_name);
        const batchTimeFormatted = formatBatchTime(batch.batch_time);
        const dynamicStudents = parseInt(batch.student_count ?? batch.current_students ?? 0);
        const coachDisplay = batch.coach_name
          ? `<span class="coach-batch-tag" style="font-size:0.835rem;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${batch.coach_name}</span>`
          : `<span class="text-secondary" style="font-size:0.835rem;">Not Assigned</span>`;

        // 1. Desktop Table Row (Clickable to view batch details)
        const tr = document.createElement('tr');
        tr.dataset.batchId = batch.batch_id;
        tr.style.cursor = 'pointer';
        tr.title = `Click to view details for ${batch.batch_name}`;
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.batch-actions-wrap') || e.target.closest('.batch-actions-menu') || e.target.closest('.batch-actions-btn')) {
            return;
          }
          openBatchDetails(batch.batch_id);
        });

        tr.innerHTML = `
          <td><span class="student-name">${escapeHtml(batch.batch_name)}</span></td>
          <td><span class="branch-tag">${escapeHtml(batch.batch_location || '—')}</span></td>
          <td class="text-secondary" style="font-size:0.85rem;">${batchTimeFormatted}</td>
          <td>${coachDisplay}</td>
          <td style="font-size:0.875rem; font-weight:600;">${dynamicStudents}</td>
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
                  data-time="${batch.batch_time || ''}"
                  data-coach-id="${batch.coach_id || ''}"
                  data-coach-name="${encodeURIComponent(batch.coach_name || '')}">
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

        // 2. Mobile Card Element (Clean text alignment without circular avatar, clickable to view details)
        if (cardsContainer) {
          const card = document.createElement('div');
          card.className = 'batch-card-mobile';
          card.dataset.batchId = batch.batch_id;
          card.style.cursor = 'pointer';
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');
          card.setAttribute('aria-label', `View details for batch ${batch.batch_name}`);
          card.addEventListener('click', (e) => {
            if (e.target.closest('.batch-actions-wrap') || e.target.closest('.batch-actions-menu') || e.target.closest('.batch-actions-btn')) {
              return;
            }
            openBatchDetails(batch.batch_id);
          });
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (e.target.closest('.batch-actions-wrap') || e.target.closest('.batch-actions-menu') || e.target.closest('.batch-actions-btn')) {
                return;
              }
              e.preventDefault();
              openBatchDetails(batch.batch_id);
            }
          });

          const coachMobileDisplay = batch.coach_name || 'Not Assigned';

          card.innerHTML = `
            <div class="batch-card-top">
              <div class="batch-card-info">
                <div class="batch-card-name">${escapeHtml(batch.batch_name)}</div>
                <div class="batch-card-location">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>${escapeHtml(batch.batch_location || '—')}</span>
                </div>
              </div>
              <div class="batch-actions-wrap">
                <button class="batch-actions-btn batch-three-dots-btn" data-id="${batch.batch_id}" type="button" aria-label="Batch Actions">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                  </svg>
                </button>
                <div class="batch-actions-menu" id="batchMenu-mobile-${batch.batch_id}">
                  <button class="batch-action-item batch-edit-item" data-id="${batch.batch_id}"
                    data-name="${encodeURIComponent(batch.batch_name)}"
                    data-location="${encodeURIComponent(batch.batch_location)}"
                    data-time="${batch.batch_time || ''}"
                    data-coach-id="${batch.coach_id || ''}"
                    data-coach-name="${encodeURIComponent(batch.coach_name || '')}">
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
            </div>

            <div class="batch-card-divider"></div>

            <div class="batch-card-bottom-grid">
              <div class="batch-meta-col">
                <div class="batch-meta-val">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span>${batchTimeFormatted}</span>
                </div>
                <div class="batch-meta-lbl">Training Time</div>
              </div>
              <div class="batch-meta-col">
                <div class="batch-meta-val">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:110px;">${coachMobileDisplay}</span>
                </div>
                <div class="batch-meta-lbl">Coach</div>
              </div>
              <div class="batch-meta-col">
                <div class="batch-meta-val">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span>${dynamicStudents}</span>
                </div>
                <div class="batch-meta-lbl">Students</div>
              </div>
            </div>
          `;
          cardsContainer.appendChild(card);
        }
      });

      // Re-apply batch search filter if search term is active
      const searchInput = document.getElementById('batchSearchInput');
      if (searchInput && searchInput.value.trim() !== '') {
        searchInput.dispatchEvent(new Event('input'));
      }
    }
  } catch (err) {
    console.error('Fetch Batches Error:', err);
    showToast('Could not load batches.', 'error');
  }
}

function getBatchAuthHeaders() {
  const role = localStorage.getItem('vava_role') || 'admin';
  const email = localStorage.getItem('vava_email') || '';
  const coach_id = localStorage.getItem('vava_coach_id') || '0';
  let name = '';
  try {
    const u = JSON.parse(localStorage.getItem('vava_user') || '{}');
    name = u.name || '';
  } catch(e) {}
  return {
    'Content-Type': 'application/json',
    'X-VAVA-Role': role,
    'X-VAVA-Email': email,
    'X-VAVA-Coach-ID': String(coach_id),
    'X-VAVA-Actor-Name': name
  };
}

// ── Batches Initialization & Event Listeners ──────────────
document.addEventListener('DOMContentLoaded', () => {
  // Add Batch Modal Controls
  const btnAddNewBatch     = document.getElementById('btnAddNewBatch');
  const closeAddBatchModal = document.getElementById('closeAddBatchModal');
  const cancelAddBatch     = document.getElementById('cancelAddBatch');
  const submitAddBatch     = document.getElementById('submitAddBatch');
  const addBatchForm       = document.getElementById('addBatchForm');

  const storedRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
  const isSuperAdmin = (storedRole === 'admin' || storedRole === 'superadmin');
  if (btnAddNewBatch) {
    btnAddNewBatch.style.display = isSuperAdmin ? '' : 'none';
    btnAddNewBatch.addEventListener('click', async () => {
      await populateCoachDropdowns();
      const coachSel = document.getElementById('newBatchCoach');
      if (coachSel) coachSel.value = '';
      openModal('addBatchModal');
    });
  }
  if (closeAddBatchModal) closeAddBatchModal.addEventListener('click', () => closeModal('addBatchModal'));
  if (cancelAddBatch)     cancelAddBatch.addEventListener('click',    () => closeModal('addBatchModal'));

  // Execute Add Batch API Request
  async function executeCreateBatch(name, location, time, coachId) {
    submitAddBatch.disabled = true;
    submitAddBatch.innerHTML = 'Creating...';

    try {
      const res = await fetch(BATCHES_API, {
        method: 'POST',
        credentials: 'include',
        headers: getBatchAuthHeaders(),
        body: JSON.stringify({
          batch_name: name,
          batch_location: location,
          batch_time: time,
          coach_id: coachId > 0 ? coachId : null
        })
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
  }

  if (submitAddBatch) {
    submitAddBatch.addEventListener('click', async () => {
      const name     = document.getElementById('newBatchName')?.value.trim();
      const location = document.getElementById('newBatchLocation')?.value.trim();
      const time     = document.getElementById('newBatchTime')?.value;
      const coachSel = document.getElementById('newBatchCoach');
      const coachId  = coachSel ? parseInt(coachSel.value) || 0 : 0;

      if (!name || !location || !time) {
        showToast('Please fill all required fields.', 'error');
        return;
      }

      // Check for coach conflict if a coach is selected
      if (coachId > 0) {
        const conflictBatches = checkCoachConflict(coachId, null);
        if (conflictBatches.length > 0) {
          const modal = document.getElementById('coachConflictModal');
          if (modal) modal.dataset.origin = 'add';
          showCoachConflictWarning(
            coachId,
            conflictBatches,
            () => executeCreateBatch(name, location, time, coachId),
            () => {
              // Cancelled: do not proceed with save
            }
          );
          return;
        }
      }

      // No conflict or no coach selected: proceed directly
      await executeCreateBatch(name, location, time, coachId);
    });
  }

  // Edit Batch Controls
  const closeEditBatchModal = document.getElementById('closeEditBatchModal');
  const cancelEditBatch     = document.getElementById('cancelEditBatch');
  const submitEditBatch     = document.getElementById('submitEditBatch');

  if (closeEditBatchModal) closeEditBatchModal.addEventListener('click', () => closeModal('editBatchModal'));
  if (cancelEditBatch)     cancelEditBatch.addEventListener('click',     () => closeModal('editBatchModal'));

  document.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.batch-edit-item');
    if (!editBtn) return;

    document.querySelectorAll('.batch-actions-menu.open').forEach(m => m.classList.remove('open'));

    await populateCoachDropdowns();

    const batchId = editBtn.dataset.id;
    const batchName = decodeURIComponent(editBtn.dataset.name || '');
    const batchLoc = decodeURIComponent(editBtn.dataset.location || '');
    const batchTime = editBtn.dataset.time || '';
    const coachId = editBtn.dataset.coachId || '';

    document.getElementById('editBatchId').value       = batchId;
    document.getElementById('editBatchName').value     = batchName;
    document.getElementById('editBatchLocation').value = batchLoc;
    document.getElementById('editBatchTime').value     = batchTime;

    const editCoachSel = document.getElementById('editBatchCoach');
    if (editCoachSel) {
      editCoachSel.value = coachId || '';
      editCoachSel.dataset.originalCoachId = coachId || '';
    }

    openModal('editBatchModal');
  });

  // Execute Edit Batch API Request
  async function executeUpdateBatch(id, name, location, time, coachId) {
    submitEditBatch.disabled = true;
    submitEditBatch.innerHTML = 'Saving...';

    try {
      const res = await fetch(BATCHES_API, {
        method: 'PUT',
        credentials: 'include',
        headers: getBatchAuthHeaders(),
        body: JSON.stringify({
          batch_id: parseInt(id),
          batch_name: name,
          batch_location: location,
          batch_time: time,
          coach_id: coachId > 0 ? coachId : null
        })
      });
      const data = await res.json();
      if (data.success) {
        closeModal('editBatchModal');
        showToast(`Batch "${name}" updated successfully!`, 'success');
        fetchBatches();
        if (activeBatchDetailId && parseInt(activeBatchDetailId) === parseInt(id)) {
          openBatchDetails(parseInt(id));
        }
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
  }

  if (submitEditBatch) {
    submitEditBatch.addEventListener('click', async () => {
      const id       = document.getElementById('editBatchId')?.value;
      const name     = document.getElementById('editBatchName')?.value.trim();
      const location = document.getElementById('editBatchLocation')?.value.trim();
      const time     = document.getElementById('editBatchTime')?.value;
      const coachSel = document.getElementById('editBatchCoach');
      const coachId  = coachSel ? parseInt(coachSel.value) || 0 : 0;
      const origCoachId = coachSel ? parseInt(coachSel.dataset.originalCoachId) || 0 : 0;

      if (!id || !name || !location || !time) {
        showToast('Please fill all required fields.', 'error');
        return;
      }

      // Check for coach conflict if coach is selected AND (it's newly changed or assigned elsewhere)
      if (coachId > 0 && coachId !== origCoachId) {
        const conflictBatches = checkCoachConflict(coachId, id);
        if (conflictBatches.length > 0) {
          const modal = document.getElementById('coachConflictModal');
          if (modal) modal.dataset.origin = 'edit';
          showCoachConflictWarning(
            coachId,
            conflictBatches,
            () => executeUpdateBatch(id, name, location, time, coachId),
            () => {
              // Cancelled: revert dropdown to original coach assignment and do not save
              if (coachSel) coachSel.value = origCoachId ? String(origCoachId) : '';
            }
          );
          return;
        }
      }

      // No conflict or unchanged: proceed directly
      await executeUpdateBatch(id, name, location, time, coachId);
    });
  }

  // Coach Conflict Modal Controls
  const closeCoachConflictModal = document.getElementById('closeCoachConflictModal');
  const cancelCoachConflict     = document.getElementById('cancelCoachConflict');
  const confirmCoachConflict    = document.getElementById('confirmCoachConflict');

  const closeConflict = () => {
    closeModal('coachConflictModal');
    if (typeof coachConflictCancelCb === 'function') {
      coachConflictCancelCb();
    }
    coachConflictConfirmCb = null;
    coachConflictCancelCb = null;
  };

  if (closeCoachConflictModal) closeCoachConflictModal.addEventListener('click', closeConflict);
  if (cancelCoachConflict)     cancelCoachConflict.addEventListener('click', closeConflict);

  if (confirmCoachConflict) {
    confirmCoachConflict.addEventListener('click', () => {
      closeModal('coachConflictModal');
      if (typeof coachConflictConfirmCb === 'function') {
        coachConflictConfirmCb();
      }
      coachConflictConfirmCb = null;
      coachConflictCancelCb = null;
    });
  }

  // Delete Batch Controls
  const closeDeleteBatchModal = document.getElementById('closeDeleteBatchModal');
  const cancelDeleteBatch     = document.getElementById('cancelDeleteBatch');
  const confirmDeleteBatch    = document.getElementById('confirmDeleteBatch');

  if (closeDeleteBatchModal) closeDeleteBatchModal.addEventListener('click', () => closeModal('deleteBatchModal'));
  if (cancelDeleteBatch)     cancelDeleteBatch.addEventListener('click',     () => closeModal('deleteBatchModal'));

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
          credentials: 'include',
          headers: getBatchAuthHeaders(),
          body: JSON.stringify({ batch_id: parseInt(batchToDelete) })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Batch deleted successfully!', 'success');
          if (activeBatchDetailId && parseInt(activeBatchDetailId) === parseInt(batchToDelete)) {
            closeModal('batchDetailsModal');
            activeBatchDetailId = null;
          }
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

  // Batch Search Filter Listener
  const batchSearchInput = document.getElementById('batchSearchInput');
  if (batchSearchInput) {
    batchSearchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#batchesTableBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
      document.querySelectorAll('#batchCardsContainer .batch-card-mobile').forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  }

  // Close Batch Details Modal Button
  const closeBatchDetailsModalBtn = document.getElementById('closeBatchDetailsModal');
  if (closeBatchDetailsModalBtn) {
    closeBatchDetailsModalBtn.addEventListener('click', () => {
      closeModal('batchDetailsModal');
      activeBatchDetailId = null;
    });
  }
});

// ── Open Dynamic Batch Details Popup ───────────────────────────────────────
async function openBatchDetails(batchId) {
  if (!batchId) return;
  activeBatchDetailId = batchId;

  const modal = document.getElementById('batchDetailsModal');
  const titleEl = document.getElementById('batchDetailsTitle');
  const bodyEl = document.getElementById('batchDetailsBody');
  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = 'Batch Details';

  // Render initial loading state
  bodyEl.innerHTML = `
    <div class="batch-details-loading">
      <div class="batch-details-spinner"></div>
      <span>Fetching batch information...</span>
    </div>
  `;

  openModal('batchDetailsModal');

  try {
    const res = await fetch(`${BATCHES_API}?id=${encodeURIComponent(batchId)}`, {
      credentials: 'include',
      headers: getBatchAuthHeaders()
    });
    const data = await res.json();

    if (!data.success || !data.batch) {
      throw new Error(data.error || 'Batch not found.');
    }

    const b = data.batch;
    if (titleEl) titleEl.textContent = b.batch_name || 'Batch Details';

    const timeFormatted = b.batch_time ? formatBatchTime(b.batch_time) : '—';
    const students = Array.isArray(b.students) ? b.students : [];
    const studentCount = parseInt(b.student_count ?? students.length);
    const maxCapacity = (b.max_students && parseInt(b.max_students) > 0) ? parseInt(b.max_students) : '—';
    const monthlyFee = b.monthly_fee ? `₹${parseFloat(b.monthly_fee).toLocaleString('en-IN')}` : '₹0';
    const totalDue = b.total_payment_due ? `₹${parseFloat(b.total_payment_due).toLocaleString('en-IN')}` : '₹0';
    const createdDate = b.created_at ? formatCoachDate(b.created_at.split(' ')[0]) : '—';

    // Coach details card (compact layout)
    const hasCoach = !!(b.coach_id && b.coach_name);
    let coachHtml = '';
    if (hasCoach) {
      const coachPhoto = b.coach_photo 
        ? `<img src="${escapeHtml(b.coach_photo)}" alt="${escapeHtml(b.coach_name)}" class="batch-detail-coach-photo">`
        : `<div class="batch-detail-coach-initials">${escapeHtml(getBatchInitials(b.coach_name))}</div>`;

      coachHtml = `
        <div class="batch-detail-section-card">
          <div class="batch-detail-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            Assigned Coach
          </div>
          <div class="batch-detail-coach-profile">
            ${coachPhoto}
            <div class="batch-detail-coach-meta">
              <div class="batch-detail-coach-row">
                <span class="batch-detail-coach-name">${escapeHtml(b.coach_name)}</span>
                <span class="batch-detail-pill gold">${escapeHtml(b.coach_sport || b.sport || 'Lead Coach')}</span>
                ${b.coach_license ? `<span class="batch-detail-pill subtle">${escapeHtml(b.coach_license)}</span>` : ''}
              </div>
              <div class="batch-detail-coach-contacts">
                ${b.coach_email ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg> ${escapeHtml(b.coach_email)}</span>` : ''}
                ${b.coach_phone ? `<span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.76a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${escapeHtml(b.coach_phone)}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      coachHtml = `
        <div class="batch-detail-section-card">
          <div class="batch-detail-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            Assigned Coach
          </div>
          <div class="batch-detail-empty-compact">
            <span>No coach currently assigned to this batch</span>
          </div>
        </div>
      `;
    }

    // Students list HTML (compact roster)
    let studentsHtml = '';
    if (students.length > 0) {
      const studentItems = students.map(s => {
        const studentPhoto = s.student_photo
          ? `<img src="${escapeHtml(s.student_photo)}" alt="${escapeHtml(s.student_name)}" class="batch-student-avatar-img">`
          : `<div class="batch-student-avatar-initials">${escapeHtml(getBatchInitials(s.student_name))}</div>`;

        const joinedStr = s.joined_date ? formatCoachDate(s.joined_date) : '';
        const statusBadge = (s.status || '').toLowerCase() === 'inactive'
          ? `<span class="batch-student-status badge-inactive">Inactive</span>`
          : `<span class="batch-student-status badge-active">Active</span>`;

        return `
          <div class="batch-student-list-item">
            ${studentPhoto}
            <div class="batch-student-item-info">
              <div class="batch-student-name">${escapeHtml(s.student_name)}</div>
              <div class="batch-student-meta">
                ${s.gender ? `<span>${escapeHtml(s.gender)}</span>` : ''}
                ${joinedStr ? `<span>${s.gender ? '• ' : ''}Joined: ${joinedStr}</span>` : ''}
              </div>
            </div>
            ${statusBadge}
          </div>
        `;
      }).join('');

      studentsHtml = `
        <div class="batch-detail-section-card">
          <div class="batch-detail-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Enrolled Students</span>
            <span class="batch-detail-count-badge">${students.length}</span>
          </div>
          <div class="batch-students-scroll-list">
            ${studentItems}
          </div>
        </div>
      `;
    } else {
      studentsHtml = `
        <div class="batch-detail-section-card">
          <div class="batch-detail-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span>Enrolled Students</span>
            <span class="batch-detail-count-badge">0</span>
          </div>
          <div class="batch-detail-empty-compact">
            <span>No students currently registered in this batch</span>
          </div>
        </div>
      `;
    }

    bodyEl.innerHTML = `
      <div class="batch-details-layout">
        <!-- Top Compact Meta Strip -->
        <div class="batch-detail-strip">
          <div class="batch-detail-strip-pills">
            <span class="batch-detail-pill sport">${escapeHtml(b.sport || 'Football')}</span>
            <span class="batch-detail-pill status">${escapeHtml(b.status || 'Active')}</span>
            <span class="batch-detail-pill id">ID #${b.batch_id}</span>
          </div>
          <div class="batch-detail-strip-meta">
            <span class="batch-detail-pill subtle" title="Capacity: Enrolled / Max">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              ${studentCount} / ${maxCapacity}
            </span>
            <span class="batch-detail-pill gold" title="Monthly Fee">
              ${monthlyFee}/mo
            </span>
          </div>
        </div>

        <!-- Section A: Schedule & Logistics Grid -->
        <div class="batch-detail-section-card">
          <div class="batch-detail-section-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Schedule & Logistics
          </div>
          <div class="batch-detail-grid">
            <div class="batch-detail-item">
              <span class="batch-detail-label">Location / Ground</span>
              <span class="batch-detail-value highlight" title="${escapeHtml(b.batch_location || '—')}">${escapeHtml(b.batch_location || '—')}</span>
            </div>
            <div class="batch-detail-item">
              <span class="batch-detail-label">Training Schedule</span>
              <span class="batch-detail-value">${timeFormatted}</span>
            </div>
            <div class="batch-detail-item">
              <span class="batch-detail-label">Payment Due</span>
              <span class="batch-detail-value">${totalDue}</span>
            </div>
            <div class="batch-detail-item">
              <span class="batch-detail-label">Created On</span>
              <span class="batch-detail-value">${createdDate}</span>
            </div>
          </div>
        </div>

        <!-- Section B: Assigned Coach -->
        ${coachHtml}

        <!-- Section C: Enrolled Students -->
        ${studentsHtml}
      </div>
    `;
  } catch (err) {
    console.error('Fetch Batch Details Error:', err);
    if (titleEl) titleEl.textContent = 'Batch Details';
    bodyEl.innerHTML = `
      <div class="batch-details-error">
        <div class="batch-error-icon">⚠️</div>
        <h3>Failed to Load Batch</h3>
        <p>${escapeHtml(err.message || 'Unable to retrieve batch details. Please try again.')}</p>
        <button type="button" class="btn-sb-ghost" onclick="closeModal('batchDetailsModal')">Close</button>
      </div>
    `;
  }
}

window.openBatchDetails = openBatchDetails;
