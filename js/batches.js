/**
 * VAVA Sports Academy - Batches Module
 */

let fetchBatchesRequestId = 0;
let batchToDelete = null;

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
    const res  = await fetch(BATCHES_API);
    const data = await res.json();
    if (requestId !== fetchBatchesRequestId) return;
    if (!data.success) throw new Error(data.error || 'Fetch failed.');

    const batches = data.batches || [];
    updateLiveCount(batches.length);
    populateBatchDropdowns();

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

        // 1. Desktop Table Row
        const tr = document.createElement('tr');
        tr.dataset.batchId = batch.batch_id;
        tr.innerHTML = `
          <td><span class="student-name">${batch.batch_name}</span></td>
          <td><span class="branch-tag">${batch.batch_location}</span></td>
          <td class="text-secondary" style="font-size:0.85rem;">${batchTimeFormatted}</td>
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

        // 2. Mobile Card Element (Target Design - NO SPORT FIELD)
        if (cardsContainer) {
          const card = document.createElement('div');
          card.className = 'batch-card-mobile';
          card.dataset.batchId = batch.batch_id;
          card.innerHTML = `
            <div class="batch-card-top">
              <div class="batch-card-avatar bg-avatar-green">${initials}</div>
              <div class="batch-card-info">
                <div class="batch-card-name">${batch.batch_name}</div>
                <div class="batch-card-location">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>${batch.batch_location || '—'}</span>
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
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span>${batch.max_students}</span>
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

// ── Batches Initialization & Event Listeners ──────────────
document.addEventListener('DOMContentLoaded', () => {
  // Add Batch Modal Controls
  const btnAddNewBatch    = document.getElementById('btnAddNewBatch');
  const closeAddBatchModal = document.getElementById('closeAddBatchModal');
  const cancelAddBatch    = document.getElementById('cancelAddBatch');
  const submitAddBatch    = document.getElementById('submitAddBatch');
  const addBatchForm      = document.getElementById('addBatchForm');

  if (btnAddNewBatch)     btnAddNewBatch.addEventListener('click', () => openModal('addBatchModal'));
  if (closeAddBatchModal) closeAddBatchModal.addEventListener('click', () => closeModal('addBatchModal'));
  if (cancelAddBatch)    cancelAddBatch.addEventListener('click', () => closeModal('addBatchModal'));

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

  // Edit Batch Controls
  const closeEditBatchModal = document.getElementById('closeEditBatchModal');
  const cancelEditBatch     = document.getElementById('cancelEditBatch');
  const submitEditBatch     = document.getElementById('submitEditBatch');

  if (closeEditBatchModal) closeEditBatchModal.addEventListener('click', () => closeModal('editBatchModal'));
  if (cancelEditBatch)     cancelEditBatch.addEventListener('click',     () => closeModal('editBatchModal'));

  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.batch-edit-item');
    if (!editBtn) return;

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

  // Sport Filter Tabs
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
});
