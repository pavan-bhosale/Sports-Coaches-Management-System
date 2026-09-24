/**
 * VAVA Sports Academy - Inventory & Equipment Module (Academy-Wide)
 * Strictly Super Admin exclusive.
 */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    currentView: 'equipment', // 'equipment' | 'batch'
    items: [],
    batches: [],
    selectedItem: null,
    selectedBatch: null,
    selectedBatchForDealloc: null,
    allocateMode: 'equipment', // 'equipment' | 'batch'
    searchQuery: '',
    batchSearchQuery: '',
    isLoading: false
  };

  // Robust API endpoint resolution across localhost ports (3000, 5500, 80) and Hostinger
  function getApiUrl(endpoint) {
    if (endpoint === 'inventory' && typeof window !== 'undefined' && window.INVENTORY_API) {
      return window.INVENTORY_API;
    }
    if (endpoint === 'batches' && typeof window !== 'undefined' && window.BATCHES_API) {
      return window.BATCHES_API;
    }

    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return `http://localhost/VAVA_sports/server/${endpoint}.php`;
    }
    return `server/${endpoint}.php`;
  }

  function getAuthHeaders() {
    const role = localStorage.getItem('vava_role') || 'admin';
    const email = localStorage.getItem('vava_email') || '';
    return {
      'Content-Type': 'application/json',
      'X-VAVA-Role': role,
      'X-VAVA-Email': email
    };
  }

  // ── Toast Helper ──────────────────────────────────────────────────────────
  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  // ── Safe JSON Network Fetcher ─────────────────────────────────────────────
  async function safeFetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error('Non-JSON response received from server:', text);
      throw new Error(`Server returned an invalid response (HTTP ${res.status}). Please verify that Apache/PHP is running.`);
    }

    if (!res.ok || data.success === false) {
      const msg = data.message || data.error || `Request failed with status ${res.status}`;
      throw new Error(msg);
    }

    return data;
  }

  // ── Fetch Inventory & Batches ─────────────────────────────────────────────
  async function fetchInventory() {
    state.isLoading = true;

    try {
      const data = await safeFetchJson(getApiUrl('inventory'), {
        method: 'GET',
        headers: getAuthHeaders()
      });

      state.items = data.items || [];
      state.batches = data.batches || [];

      // If selected item is currently open, refresh its data in place
      if (state.selectedItem) {
        const fresh = state.items.find(i => i.inventory_id === state.selectedItem.inventory_id);
        if (fresh) {
          state.selectedItem = fresh;
          renderInventoryDetails(fresh);
        }
      }

      // If selected batch is currently open, refresh its data in place
      if (state.selectedBatch) {
        const freshBatch = state.batches.find(b => b.batch_id === state.selectedBatch.batch_id);
        if (freshBatch) {
          state.selectedBatch = freshBatch;
          renderBatchDetails(freshBatch);
        }
      }

      renderInventoryCards();
      renderBatchCards();
    } catch (err) {
      console.error('fetchInventory error:', err);
      notify(err.message || 'Error loading inventory.', 'error');
    } finally {
      state.isLoading = false;
    }
  }
  window.fetchInventory = fetchInventory;

  // ── Render Inventory Cards ────────────────────────────────────────────────
  function renderInventoryCards() {
    const container = document.getElementById('inventoryCardsContainer');
    const emptyState = document.getElementById('inventoryEmptyState');
    const countEl = document.getElementById('inventoryLiveCount');
    if (!container || !emptyState) return;

    let filtered = state.items;

    // 1. Search Query Filter
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.item_name.toLowerCase().includes(q)
      );
    }

    // Update count pill
    if (countEl) {
      const totalCount = state.items.length;
      countEl.textContent = totalCount === 1 ? '1 Equipment Item' : `${totalCount} Equipment Items`;
    }

    if (filtered.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      emptyState.style.display = 'flex';

      const emptyTitle = emptyState.querySelector('h3');
      const emptyDesc = emptyState.querySelector('p');
      if (state.searchQuery) {
        if (emptyTitle) emptyTitle.textContent = 'No matching equipment found';
        if (emptyDesc) emptyDesc.innerHTML = 'Try adjusting your search terms.';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'No inventory items yet';
        if (emptyDesc) emptyDesc.innerHTML = 'Click <strong>Add Item</strong> to create your first equipment record.';
      }
      return;
    }

    emptyState.style.display = 'none';
    container.style.display = 'grid';
    container.innerHTML = '';

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'inventory-card';
      card.dataset.id = item.inventory_id;

      // Batch allocations summary
      let allocSummaryHtml = '';
      if (item.allocations && item.allocations.length > 0) {
        const pills = item.allocations.map(a => {
          return `<span class="inv-batch-pill" title="${escapeHtml(a.batch_name)} (${escapeHtml(a.batch_location || 'Academy')})"><strong>${escapeHtml(a.batch_name)}</strong> (${a.quantity})</span>`;
        }).join('');
        allocSummaryHtml = `
          <div class="inv-alloc-summary">
            <span class="inv-alloc-lbl">Allocated To</span>
            <div class="inv-alloc-pills">${pills}</div>
          </div>
        `;
      } else {
        allocSummaryHtml = `
          <div class="inv-alloc-summary is-empty">
            <span>All ${item.available_quantity} available • No batch allocations</span>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="inv-card-header">
          <div class="inv-card-title-group">
            <div class="inv-item-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
                <path d="M2 12h20"></path>
              </svg>
            </div>
            <div class="inv-card-title-wrap">
              <h3 class="inv-card-title">${escapeHtml(item.item_name)}</h3>
            </div>
          </div>
          <button type="button" class="inv-card-action-trigger" data-id="${item.inventory_id}" title="View Details">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>

        <div class="inv-metrics-strip">
          <div class="inv-metric-box">
            <span class="inv-metric-val">${item.total_quantity}</span>
            <span class="inv-metric-lbl">Total</span>
          </div>
          <div class="inv-metric-box is-allocated">
            <span class="inv-metric-val">${item.allocated_quantity}</span>
            <span class="inv-metric-lbl">Allocated</span>
          </div>
          <div class="inv-metric-box is-available">
            <span class="inv-metric-val">${item.available_quantity}</span>
            <span class="inv-metric-lbl">Available</span>
          </div>
        </div>

        ${allocSummaryHtml}

        <div class="inv-card-footer">
          <button type="button" class="inv-btn-details" data-id="${item.inventory_id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span class="inv-btn-text-full">Details & History</span>
            <span class="inv-btn-text-short">Details</span>
          </button>
          <div class="inv-card-quick-actions">
            <button type="button" class="inv-quick-btn inv-btn-alloc" data-id="${item.inventory_id}" title="Allocate to Batch">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              Allocate
            </button>
            <button type="button" class="inv-quick-btn inv-btn-stock" data-id="${item.inventory_id}" title="Add Stock">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Stock
            </button>
          </div>
        </div>
      `;

      // Click card (except buttons) to open details
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openInventoryDetails(item);
      });

      // Details button
      card.querySelector('.inv-btn-details')?.addEventListener('click', () => {
        openInventoryDetails(item);
      });
      card.querySelector('.inv-card-action-trigger')?.addEventListener('click', () => {
        openInventoryDetails(item);
      });

      // Quick Allocate button
      card.querySelector('.inv-btn-alloc')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openAllocateModal(item);
      });

      // Quick Stock button
      card.querySelector('.inv-btn-stock')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddStockModal(item);
      });

      container.appendChild(card);
    });
  }

  // ── Modal Open / Close Helpers ────────────────────────────────────────────
  function showModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'flex';
  }

  function hideModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
  }

  // ── Format Helper: Short Month Date for Batch Card (e.g. 23 Sep 2026) ─────
  function formatLastAllocDate(raw) {
    if (!raw) return 'No equipment allocated yet';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return `Last allocation · ${raw}`;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `Last allocation · ${day} ${month} ${year}`;
  }

  // ── Inventory View Switcher (Equipment View / Batch View) ──────────────────
  function switchInventoryView(view) {
    state.currentView = view;
    const tabEq = document.getElementById('tabEquipmentView');
    const tabBatch = document.getElementById('tabBatchView');
    const containerEq = document.getElementById('inventoryEquipmentContainer');
    const containerBatch = document.getElementById('inventoryBatchContainer');

    if (view === 'batch') {
      tabEq?.classList.remove('active');
      tabEq?.setAttribute('aria-selected', 'false');
      tabBatch?.classList.add('active');
      tabBatch?.setAttribute('aria-selected', 'true');

      if (containerEq) containerEq.style.display = 'none';
      if (containerBatch) containerBatch.style.display = 'block';

      renderBatchCards();
    } else {
      tabBatch?.classList.remove('active');
      tabBatch?.setAttribute('aria-selected', 'false');
      tabEq?.classList.add('active');
      tabEq?.setAttribute('aria-selected', 'true');

      if (containerBatch) containerBatch.style.display = 'none';
      if (containerEq) containerEq.style.display = 'block';

      renderInventoryCards();
    }
  }

  // ── Render Batch Cards (Batch View) ───────────────────────────────────────
  function renderBatchCards() {
    const container = document.getElementById('inventoryBatchCardsContainer');
    const emptyState = document.getElementById('batchEmptyState');
    const countEl = document.getElementById('batchLiveCount');
    const emptyMsg = document.getElementById('batchEmptyMessage');
    if (!container || !emptyState) return;

    let filtered = state.batches;

    // Search filter by batch name
    if (state.batchSearchQuery) {
      const q = state.batchSearchQuery.toLowerCase();
      filtered = filtered.filter(b =>
        b.batch_name.toLowerCase().includes(q)
      );
    }

    if (countEl) {
      countEl.textContent = filtered.length;
    }

    if (filtered.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      emptyState.style.display = 'flex';
      if (emptyMsg) {
        emptyMsg.textContent = state.batchSearchQuery
          ? 'No batches match your search query.'
          : 'No batches configured yet.';
      }
      return;
    }

    emptyState.style.display = 'none';
    container.style.display = 'flex';
    container.innerHTML = '';

    filtered.forEach(b => {
      const card = document.createElement('div');
      card.className = 'inv-batch-card';
      card.dataset.batchId = b.batch_id;

      const totalUnits = b.total_allocated_units || 0;
      const typeCount = b.equipment_types_count || 0;
      const unitsValClass = totalUnits > 0 ? 'is-green' : 'is-muted';
      const typesValClass = typeCount > 0 ? 'is-cyan' : 'is-muted';
      const lastAllocText = formatLastAllocDate(b.last_allocation_date);

      card.innerHTML = `
        <div class="inv-batch-card-main">
          <div class="inv-batch-card-col-left">
            <div class="inv-batch-card-name" title="${escapeHtml(b.batch_name)}">${escapeHtml(b.batch_name)}</div>
            <div class="inv-batch-card-students">${b.student_count || 0} Students</div>
          </div>

          <div class="inv-batch-card-metrics">
            <div class="inv-batch-metric-item">
              <div class="inv-batch-icon-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
              </div>
              <div class="inv-batch-metric-content">
                <div class="inv-batch-metric-val ${unitsValClass}">${totalUnits}</div>
                <div class="inv-batch-metric-lbl">UNITS<br>ALLOCATED</div>
              </div>
            </div>

            <div class="inv-batch-metric-item">
              <div class="inv-batch-icon-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </div>
              <div class="inv-batch-metric-content">
                <div class="inv-batch-metric-val ${typesValClass}">${typeCount}</div>
                <div class="inv-batch-metric-lbl">EQUIPMENT<br>TYPES</div>
              </div>
            </div>
          </div>

          <div class="inv-batch-card-arrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>

        <div class="inv-batch-card-footer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>${lastAllocText}</span>
        </div>
      `;

      // Entire card (and arrow) is clickable
      card.addEventListener('click', () => {
        openBatchDetailsModal(b);
      });

      container.appendChild(card);
    });
  }

  // ── Details Modal ─────────────────────────────────────────────────────────
  function openInventoryDetails(item) {
    state.selectedItem = item;
    renderInventoryDetails(item);
    showModal('inventoryDetailsModal');
  }

  function renderInventoryDetails(item) {
    const titleEl = document.getElementById('invDetailTitle');
    const totalEl = document.getElementById('invDetailTotal');
    const allocEl = document.getElementById('invDetailAllocated');
    const availEl = document.getElementById('invDetailAvailable');
    const allocListEl = document.getElementById('invDetailAllocList');
    const historyListEl = document.getElementById('invDetailHistoryList');

    if (titleEl) titleEl.textContent = item.item_name;
    if (totalEl) totalEl.textContent = item.total_quantity;
    if (allocEl) allocEl.textContent = item.allocated_quantity;
    if (availEl) availEl.textContent = item.available_quantity;

    // Batch allocations breakdown
    if (allocListEl) {
      if (item.allocations && item.allocations.length > 0) {
        allocListEl.innerHTML = item.allocations.map(a => `
          <div class="inv-detail-alloc-row">
            <div class="inv-detail-alloc-batch">
              <span class="inv-batch-icon">⚽</span>
              <div>
                <span class="inv-batch-title" title="${escapeHtml(a.batch_name)}">${escapeHtml(a.batch_name)}</span>
                ${a.batch_location ? `<span class="inv-batch-sub" title="${escapeHtml(a.batch_location)}">${escapeHtml(a.batch_location)}</span>` : ''}
              </div>
            </div>
            <div class="inv-detail-alloc-actions">
              <span class="inv-qty-badge">${a.quantity} allocated</span>
              <button type="button" class="btn-sb-ghost btn-item-deallocate" data-batch-id="${a.batch_id}" data-batch-name="${escapeHtml(a.batch_name)}" data-batch-qty="${a.quantity}">
                Deallocate
              </button>
            </div>
          </div>
        `).join('');

        // Bind row-level deallocate buttons
        allocListEl.querySelectorAll('.btn-item-deallocate').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const bId = parseInt(btn.dataset.batchId, 10);
            const bName = btn.dataset.batchName;
            const bQty = parseInt(btn.dataset.batchQty, 10);
            openDeallocateModal(state.selectedItem, { batch_id: bId, batch_name: bName, quantity: bQty });
          });
        });
      } else {
        allocListEl.innerHTML = `
          <div class="inv-detail-empty-note">
            No equipment currently allocated to any batch.
          </div>
        `;
      }
    }
  }

  // ── Batch Equipment Details Modal ─────────────────────────────────────────
  function openBatchDetailsModal(batch) {
    state.selectedBatch = batch;
    renderBatchDetails(batch);
    showModal('batchEquipmentDetailsModal');
  }

  function renderBatchDetails(batch) {
    const titleEl = document.getElementById('batchDetailTitle');
    const subEl = document.getElementById('batchDetailSubtitle');
    const unitsEl = document.getElementById('batchDetailTotalUnits');
    const typesEl = document.getElementById('batchDetailEquipmentTypes');
    const allocListEl = document.getElementById('batchDetailAllocList');

    if (titleEl) titleEl.textContent = batch.batch_name;
    if (subEl) {
      const loc = batch.batch_location ? ` · ${batch.batch_location}` : '';
      subEl.textContent = `${batch.student_count || 0} Students${loc}`;
    }
    if (unitsEl) unitsEl.textContent = batch.total_allocated_units || 0;
    if (typesEl) typesEl.textContent = batch.equipment_types_count || 0;

    if (allocListEl) {
      if (batch.allocated_equipment && batch.allocated_equipment.length > 0) {
        allocListEl.innerHTML = batch.allocated_equipment.map(item => `
          <div class="inv-detail-alloc-row">
            <div class="inv-detail-alloc-batch">
              <span class="inv-batch-icon">⚽</span>
              <div>
                <span class="inv-batch-title" title="${escapeHtml(item.item_name)}">${escapeHtml(item.item_name)}</span>
                <span class="inv-batch-sub">
                  Allocated: ${formatDateOnly(item.allocation_date)} · Reason: ${escapeHtml(item.reason || 'Training equipment')}
                </span>
              </div>
            </div>
            <div class="inv-detail-alloc-actions">
              <span class="inv-qty-badge">${item.quantity} units</span>
              <button type="button" class="btn-sb-ghost btn-batch-deallocate" data-inv-id="${item.inventory_id}" data-item-name="${escapeHtml(item.item_name)}" data-qty="${item.quantity}">
                Deallocate
              </button>
            </div>
          </div>
        `).join('');

        // Wire up row-level deallocate buttons inside Batch Details
        allocListEl.querySelectorAll('.btn-batch-deallocate').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const invId = parseInt(btn.dataset.invId, 10);
            const qty = parseInt(btn.dataset.qty, 10);
            const matchingItem = state.items.find(i => i.inventory_id === invId);
            if (matchingItem) {
              openDeallocateModal(matchingItem, { batch_id: batch.batch_id, batch_name: batch.batch_name, quantity: qty });
            }
          });
        });
      } else {
        allocListEl.innerHTML = `
          <div class="inv-detail-empty-note">
            No equipment currently allocated to this batch. Click <strong>Allocate Equipment</strong> below to assign gear.
          </div>
        `;
      }
    }
  }

  // ── Dedicated Stock History Modal ──────────────────────────────────────────
  function openStockHistoryModal(item) {
    state.selectedItem = item;
    const titleEl = document.getElementById('invHistoryItemTitle');
    const subEl = document.getElementById('invHistoryItemSubtitle');
    const historyListEl = document.getElementById('invDetailHistoryList');

    if (titleEl) titleEl.textContent = `${item.item_name} — Stock History`;
    if (subEl) subEl.textContent = `Total: ${item.total_quantity} · Allocated: ${item.allocated_quantity} · Available: ${item.available_quantity}`;

    if (historyListEl) {
      if (item.stock_history && item.stock_history.length > 0) {
        // Display newest first
        const historyCopy = [...item.stock_history].reverse();
        historyListEl.innerHTML = historyCopy.map(h => {
          const isPos = (h.type === 'Added' || h.type === 'Purchase' || h.type === 'Restock' || h.type === 'Allocated');
          const changePrefix = isPos ? '+' : '-';
          const changeClass = isPos ? 'inv-change-pos' : 'inv-change-neg';
          const changeText = `${changePrefix}${h.quantity}`;
          const dateOnly = formatDateOnly(h.created_at);

          // If entry is related to a batch, display compact batch badge before the reason text
          let batchBadgeHtml = '';
          const batchLabel = h.batch_name || (h.batch_id ? `Batch #${h.batch_id}` : '');
          if (batchLabel) {
            batchBadgeHtml = `<span class="inv-history-batch-tag" title="${escapeHtml(batchLabel)}">${escapeHtml(batchLabel)}</span>`;
          }

          const reasonText = escapeHtml(h.reason || '—');

          return `
            <tr>
              <td><span class="inv-history-date">${dateOnly}</span></td>
              <td class="${changeClass}">${changeText}</td>
              <td class="inv-history-reason">${batchBadgeHtml}${reasonText}</td>
            </tr>
          `;
        }).join('');
      } else {
        historyListEl.innerHTML = `
          <tr>
            <td colspan="3" style="text-align: center; color: var(--text-secondary); padding: 1.5rem;">
              No stock history recorded yet.
            </td>
          </tr>
        `;
      }
    }

    showModal('inventoryHistoryModal');
  }

  // ── Add Stock Modal ───────────────────────────────────────────────────────
  function openAddStockModal(item) {
    state.selectedItem = item;
    const nameEl = document.getElementById('addStockItemName');
    const inputEl = document.getElementById('addStockQuantity');
    const reasonEl = document.getElementById('addStockReason');
    if (nameEl) nameEl.textContent = item.item_name;
    if (inputEl) inputEl.value = '';
    if (reasonEl) reasonEl.value = '';
    showModal('addStockModal');
  }

  // ── Deduct Stock Modal ────────────────────────────────────────────────────
  function openDeductStockModal(item) {
    state.selectedItem = item;
    const nameEl = document.getElementById('deductStockItemName');
    const availEl = document.getElementById('deductStockAvailable');
    const inputEl = document.getElementById('deductStockQuantity');
    const reasonEl = document.getElementById('deductStockReason');

    const radioAvail = document.getElementById('deductSourceAvailable');
    const radioAlloc = document.getElementById('deductSourceAllocated');
    const availHintBox = document.getElementById('deductStockAvailHintBox');
    const allocSection = document.getElementById('deductStockAllocatedSection');
    const batchSelect = document.getElementById('deductStockBatchSelect');
    const batchAllocQtyEl = document.getElementById('deductStockBatchAllocatedQty');

    if (nameEl) nameEl.textContent = item.item_name;
    if (availEl) availEl.textContent = item.available_quantity;
    if (inputEl) {
      inputEl.value = '';
      inputEl.max = item.available_quantity;
    }
    if (reasonEl) reasonEl.value = '';

    // Reset radio to Available Stock by default
    if (radioAvail) radioAvail.checked = true;
    if (availHintBox) availHintBox.style.display = 'block';
    if (allocSection) allocSection.style.display = 'none';

    // Populate allocated batches dropdown
    if (batchSelect) {
      batchSelect.innerHTML = '';
      if (item.allocations && item.allocations.length > 0) {
        item.allocations.forEach(a => {
          const opt = document.createElement('option');
          opt.value = a.batch_id;
          opt.dataset.qty = a.quantity;
          opt.dataset.name = a.batch_name;
          opt.textContent = `${a.batch_name} — ${a.quantity} allocated`;
          batchSelect.appendChild(opt);
        });
        if (batchAllocQtyEl) {
          batchAllocQtyEl.textContent = item.allocations[0].quantity;
        }
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No batches currently hold allocated stock';
        opt.disabled = true;
        batchSelect.appendChild(opt);
        if (batchAllocQtyEl) batchAllocQtyEl.textContent = '0';
      }

      batchSelect.onchange = () => {
        const selectedOpt = batchSelect.options[batchSelect.selectedIndex];
        const maxQty = parseInt(selectedOpt?.dataset?.qty || '0', 10);
        if (batchAllocQtyEl) batchAllocQtyEl.textContent = maxQty;
        if (radioAlloc?.checked && inputEl) {
          inputEl.max = maxQty;
        }
      };
    }

    function updateDeductSourceView() {
      const isAlloc = radioAlloc?.checked;
      if (isAlloc) {
        if (availHintBox) availHintBox.style.display = 'none';
        if (allocSection) allocSection.style.display = 'block';
        const selectedOpt = batchSelect?.options[batchSelect.selectedIndex];
        const maxQty = parseInt(selectedOpt?.dataset?.qty || '0', 10);
        if (batchAllocQtyEl) batchAllocQtyEl.textContent = maxQty;
        if (inputEl) inputEl.max = maxQty;
      } else {
        if (availHintBox) availHintBox.style.display = 'block';
        if (allocSection) allocSection.style.display = 'none';
        if (inputEl) inputEl.max = item.available_quantity;
      }
    }

    if (radioAvail) radioAvail.onchange = updateDeductSourceView;
    if (radioAlloc) radioAlloc.onchange = updateDeductSourceView;

    updateDeductSourceView();
    showModal('deductStockModal');
  }

  // ── Allocate Modal (from Equipment View) ───────────────────────────────────
  function openAllocateModal(item) {
    state.allocateMode = 'equipment';
    state.selectedItem = item;
    const nameEl = document.getElementById('allocateItemName');
    const availEl = document.getElementById('allocateAvailableStock');
    const batchGroup = document.getElementById('allocateBatchSelectGroup');
    const eqGroup = document.getElementById('allocateEquipmentSelectGroup');
    const selectEl = document.getElementById('allocateBatchSelect');
    const inputEl = document.getElementById('allocateQuantity');
    const reasonEl = document.getElementById('allocateReason');

    if (batchGroup) batchGroup.style.display = 'block';
    if (eqGroup) eqGroup.style.display = 'none';

    if (nameEl) nameEl.textContent = item.item_name;
    if (availEl) availEl.textContent = item.available_quantity;
    if (inputEl) {
      inputEl.value = '';
      inputEl.max = item.available_quantity;
    }
    if (reasonEl) {
      reasonEl.value = '';
    }

    if (selectEl) {
      selectEl.innerHTML = '<option value="">Select Batch...</option>';
      state.batches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.batch_id;
        const loc = b.batch_location ? ` (${b.batch_location})` : '';
        opt.textContent = `${b.batch_name}${loc}`;
        selectEl.appendChild(opt);
      });
    }

    showModal('allocateModal');
  }

  // ── Allocate From Batch View ──────────────────────────────────────────────
  function openAllocateFromBatchModal(batch) {
    state.allocateMode = 'batch';
    state.selectedBatch = batch;

    const nameEl = document.getElementById('allocateItemName');
    const availEl = document.getElementById('allocateAvailableStock');
    const batchGroup = document.getElementById('allocateBatchSelectGroup');
    const eqGroup = document.getElementById('allocateEquipmentSelectGroup');
    const eqSelect = document.getElementById('allocateEquipmentSelect');
    const inputEl = document.getElementById('allocateQuantity');
    const reasonEl = document.getElementById('allocateReason');

    if (batchGroup) batchGroup.style.display = 'none';
    if (eqGroup) eqGroup.style.display = 'block';

    if (nameEl) nameEl.textContent = `Batch: ${batch.batch_name}`;
    if (availEl) availEl.textContent = '0';
    if (inputEl) {
      inputEl.value = '';
      inputEl.max = 0;
    }
    if (reasonEl) reasonEl.value = '';

    if (eqSelect) {
      eqSelect.innerHTML = '<option value="">Select Equipment...</option>';
      const availableItems = state.items.filter(i => i.available_quantity > 0);
      if (availableItems.length > 0) {
        availableItems.forEach(i => {
          const opt = document.createElement('option');
          opt.value = i.inventory_id;
          opt.dataset.avail = i.available_quantity;
          opt.textContent = `${i.item_name} (${i.available_quantity} available)`;
          eqSelect.appendChild(opt);
        });
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.disabled = true;
        opt.textContent = 'No equipment with available stock';
        eqSelect.appendChild(opt);
      }

      eqSelect.onchange = () => {
        const selectedOpt = eqSelect.options[eqSelect.selectedIndex];
        const avail = parseInt(selectedOpt?.dataset?.avail || '0', 10);
        if (availEl) availEl.textContent = avail;
        if (inputEl) {
          inputEl.max = avail;
          if (avail > 0) inputEl.value = Math.min(1, avail);
        }
      };
    }

    showModal('allocateModal');
  }

  // ── Deallocate Modal ──────────────────────────────────────────────────────
  function openDeallocateModal(item, targetBatch = null) {
    state.selectedItem = item;
    state.selectedBatchForDealloc = targetBatch;

    const nameEl = document.getElementById('deallocateItemName');
    const selectGroup = document.getElementById('deallocateBatchSelectGroup');
    const selectEl = document.getElementById('deallocateBatchSelect');
    const displayEl = document.getElementById('deallocateBatchDisplay');
    const currQtyEl = document.getElementById('deallocateCurrentQty');
    const inputEl = document.getElementById('deallocateQuantity');

    if (nameEl) nameEl.textContent = item.item_name;

    if (targetBatch) {
      // Specific batch pre-selected
      if (selectGroup) selectGroup.style.display = 'none';
      if (displayEl) {
        displayEl.style.display = 'block';
        displayEl.textContent = `Batch: ${targetBatch.batch_name}`;
      }
      if (currQtyEl) currQtyEl.textContent = targetBatch.quantity;
      if (inputEl) {
        inputEl.max = targetBatch.quantity;
        inputEl.value = Math.min(1, targetBatch.quantity);
      }
    } else {
      // Choose from dropdown
      if (selectGroup) selectGroup.style.display = 'block';
      if (displayEl) displayEl.style.display = 'none';
      if (currQtyEl) currQtyEl.textContent = '0';
      if (inputEl) {
        inputEl.value = '';
        inputEl.max = 0;
      }

      if (selectEl) {
        selectEl.innerHTML = '<option value="">Select allocated batch...</option>';
        if (item.allocations && item.allocations.length > 0) {
          item.allocations.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.batch_id;
            opt.dataset.qty = a.quantity;
            opt.dataset.name = a.batch_name;
            opt.textContent = `${a.batch_name} — ${a.quantity} currently allocated`;
            selectEl.appendChild(opt);
          });
        } else {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No batches currently hold allocations';
          opt.disabled = true;
          selectEl.appendChild(opt);
        }

        selectEl.onchange = () => {
          const selectedOpt = selectEl.options[selectEl.selectedIndex];
          const maxQty = parseInt(selectedOpt?.dataset?.qty || '0', 10);
          if (currQtyEl) currQtyEl.textContent = maxQty;
          if (inputEl) {
            inputEl.max = maxQty;
            if (maxQty > 0) inputEl.value = Math.min(1, maxQty);
          }
        };
      }
    }

    showModal('deallocateModal');
  }

  // ── Delete Confirmation Modal ─────────────────────────────────────────────
  function openDeleteModal(item) {
    state.selectedItem = item;

    if (item.allocated_quantity > 0) {
      notify(`Cannot delete "${item.item_name}" while ${item.allocated_quantity} item(s) are allocated. Please deallocate all equipment first.`, 'error');
      return;
    }

    const nameEl = document.getElementById('deleteInventoryItemName');
    if (nameEl) nameEl.textContent = item.item_name;
    showModal('deleteInventoryModal');
  }

  // ── Helper: Format date string ────────────────────────────────────────────
  function formatDate(raw) {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  }

  // Display ONLY the date: Day/Month/Year (no hours, minutes, seconds)
  function formatDateOnly(raw) {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) {
      // If already a date string like YYYY-MM-DD or DD/MM/YYYY, extract date part
      const parts = String(raw).split(' ')[0];
      return parts || raw;
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Event Listeners Initialization ────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Top View Toggle (Equipment View vs Batch View)
    document.getElementById('tabEquipmentView')?.addEventListener('click', () => {
      switchInventoryView('equipment');
    });
    document.getElementById('tabBatchView')?.addEventListener('click', () => {
      switchInventoryView('batch');
    });

    // Batch Search Input
    document.getElementById('batchSearchInput')?.addEventListener('input', (e) => {
      state.batchSearchQuery = e.target.value.trim();
      renderBatchCards();
    });

    // Batch Details Allocate Button
    document.getElementById('btnBatchDetailAllocate')?.addEventListener('click', () => {
      if (state.selectedBatch) {
        openAllocateFromBatchModal(state.selectedBatch);
      }
    });

    // 1. Top Actions & Filters
    const btnAddNew = document.getElementById('btnAddNewInventory');
    const btnEmptyAdd = document.getElementById('btnEmptyAddInventory');
    const searchInput = document.getElementById('inventorySearchInput');

    btnAddNew?.addEventListener('click', () => {
      document.getElementById('addInvName').value = '';
      document.getElementById('addInvInitialQty').value = '0';
      showModal('addInventoryModal');
    });

    btnEmptyAdd?.addEventListener('click', () => {
      document.getElementById('addInvName').value = '';
      document.getElementById('addInvInitialQty').value = '0';
      showModal('addInventoryModal');
    });

    searchInput?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderInventoryCards();
    });

    // 2. Add Item Submit (NO Description field)
    document.getElementById('btnSubmitAddInventory')?.addEventListener('click', async () => {
      const name = document.getElementById('addInvName')?.value.trim();
      const qty = parseInt(document.getElementById('addInvInitialQty')?.value || '0', 10);

      if (!name) {
        notify('Please enter an item name.', 'error');
        return;
      }
      if (isNaN(qty) || qty < 0) {
        notify('Initial quantity must be 0 or greater.', 'error');
        return;
      }

      try {
        const data = await safeFetchJson(getApiUrl('inventory'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'create',
            item_name: name,
            initial_quantity: qty
          })
        });

        notify(`Item "${name}" created successfully.`, 'success');
        hideModal('addInventoryModal');
        fetchInventory();
      } catch (err) {
        notify(err.message || 'Creation failed.', 'error');
      }
    });

    // 3. Details Modal Action Buttons
    document.getElementById('btnDetailAddStock')?.addEventListener('click', () => {
      if (state.selectedItem) openAddStockModal(state.selectedItem);
    });
    document.getElementById('btnDetailDeductStock')?.addEventListener('click', () => {
      if (state.selectedItem) openDeductStockModal(state.selectedItem);
    });
    document.getElementById('btnDetailAllocate')?.addEventListener('click', () => {
      if (state.selectedItem) openAllocateModal(state.selectedItem);
    });
    document.getElementById('btnDetailScrollHistory')?.addEventListener('click', () => {
      if (state.selectedItem) {
        hideModal('inventoryDetailsModal');
        openStockHistoryModal(state.selectedItem);
      }
    });
    document.getElementById('btnDetailDelete')?.addEventListener('click', () => {
      if (state.selectedItem) openDeleteModal(state.selectedItem);
    });

    // 4. Add Stock Submit
    document.getElementById('btnSubmitAddStock')?.addEventListener('click', async () => {
      if (!state.selectedItem) return;
      const qty = parseInt(document.getElementById('addStockQuantity')?.value || '0', 10);
      const reason = document.getElementById('addStockReason')?.value.trim();

      if (isNaN(qty) || qty <= 0) {
        notify('Please enter a valid quantity greater than 0.', 'error');
        return;
      }

      try {
        const data = await safeFetchJson(getApiUrl('inventory'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'add_stock',
            inventory_id: state.selectedItem.inventory_id,
            quantity: qty,
            reason: reason || 'Stock replenishment'
          })
        });

        notify(`Added ${qty} items to stock.`, 'success');
        hideModal('addStockModal');
        fetchInventory();
      } catch (err) {
        notify(err.message || 'Error adding stock.', 'error');
      }
    });

    // 5. Deduct Stock Submit
    document.getElementById('btnSubmitDeductStock')?.addEventListener('click', async () => {
      if (!state.selectedItem) return;
      const deductSource = document.querySelector('input[name="deductStockSource"]:checked')?.value || 'available';
      const qty = parseInt(document.getElementById('deductStockQuantity')?.value || '0', 10);
      const reason = document.getElementById('deductStockReason')?.value.trim();

      if (isNaN(qty) || qty <= 0) {
        notify('Please enter a valid quantity greater than 0.', 'error');
        return;
      }

      let payload = {
        action: 'deduct_stock',
        inventory_id: state.selectedItem.inventory_id,
        deduct_source: deductSource,
        quantity: qty,
        reason: reason || 'Damaged/expired equipment'
      };

      if (deductSource === 'available') {
        if (qty > state.selectedItem.available_quantity) {
          notify(`Cannot deduct ${qty} items. Only ${state.selectedItem.available_quantity} items are currently available in unallocated stock.`, 'error');
          return;
        }
      } else if (deductSource === 'allocated') {
        const batchSelect = document.getElementById('deductStockBatchSelect');
        const batchId = parseInt(batchSelect?.value || '0', 10);
        const selectedOpt = batchSelect?.options[batchSelect.selectedIndex];
        const batchMax = parseInt(selectedOpt?.dataset?.qty || '0', 10);
        const batchName = selectedOpt?.dataset?.name || 'Selected batch';

        if (!batchId) {
          notify('Please select an allocated batch.', 'error');
          return;
        }

        if (qty > batchMax) {
          notify(`Cannot deduct ${qty} items from ${batchName}. Only ${batchMax} items are allocated.`, 'error');
          return;
        }

        payload.batch_id = batchId;
      }

      try {
        const data = await safeFetchJson(getApiUrl('inventory'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });

        notify(data.message || `Deducted ${qty} items from stock.`, 'success');
        hideModal('deductStockModal');
        fetchInventory();
      } catch (err) {
        notify(err.message || 'Error deducting stock.', 'error');
      }
    });

    // 6. Allocate Submit (Supports both Equipment View & Batch View flows)
    document.getElementById('btnSubmitAllocate')?.addEventListener('click', async () => {
      let inventoryId = 0;
      let batchId = 0;
      let availableLimit = 0;

      if (state.allocateMode === 'batch') {
        if (!state.selectedBatch) return;
        batchId = state.selectedBatch.batch_id;
        const eqSelect = document.getElementById('allocateEquipmentSelect');
        inventoryId = parseInt(eqSelect?.value || '0', 10);
        const selectedOpt = eqSelect?.options[eqSelect.selectedIndex];
        availableLimit = parseInt(selectedOpt?.dataset?.avail || '0', 10);

        if (!inventoryId) {
          notify('Please select an equipment item to allocate.', 'error');
          return;
        }
      } else {
        if (!state.selectedItem) return;
        inventoryId = state.selectedItem.inventory_id;
        batchId = parseInt(document.getElementById('allocateBatchSelect')?.value || '0', 10);
        availableLimit = state.selectedItem.available_quantity;

        if (!batchId) {
          notify('Please select a batch.', 'error');
          return;
        }
      }

      const qty = parseInt(document.getElementById('allocateQuantity')?.value || '0', 10);
      const reason = document.getElementById('allocateReason')?.value.trim() || '';

      if (isNaN(qty) || qty <= 0) {
        notify('Please enter a valid quantity greater than 0.', 'error');
        return;
      }
      if (qty > availableLimit) {
        notify(`Cannot allocate ${qty} items. Only ${availableLimit} items are available.`, 'error');
        return;
      }
      if (!reason) {
        notify('Please enter a reason for allocation.', 'error');
        document.getElementById('allocateReason')?.focus();
        return;
      }

      try {
        const data = await safeFetchJson(getApiUrl('inventory'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'allocate',
            inventory_id: inventoryId,
            batch_id: batchId,
            quantity: qty,
            reason: reason
          })
        });

        notify(data.message || 'Equipment allocated successfully.', 'success');
        hideModal('allocateModal');
        await fetchInventory();
      } catch (err) {
        notify(err.message || 'Error allocating equipment.', 'error');
      }
    });

    // 7. Deallocate Submit
    document.getElementById('btnSubmitDeallocate')?.addEventListener('click', async () => {
      if (!state.selectedItem) return;

      let batchId = state.selectedBatchForDealloc
        ? state.selectedBatchForDealloc.batch_id
        : parseInt(document.getElementById('deallocateBatchSelect')?.value || '0', 10);

      const qty = parseInt(document.getElementById('deallocateQuantity')?.value || '0', 10);

      if (!batchId) {
        notify('Please select a batch to deallocate from.', 'error');
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        notify('Please enter a valid quantity greater than 0.', 'error');
        return;
      }

      try {
        const data = await safeFetchJson(getApiUrl('inventory'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'deallocate',
            inventory_id: state.selectedItem.inventory_id,
            batch_id: batchId,
            quantity: qty
          })
        });

        notify(data.message || 'Equipment deallocated successfully.', 'success');
        hideModal('deallocateModal');
        state.selectedBatchForDealloc = null;
        fetchInventory();
      } catch (err) {
        notify(err.message || 'Error deallocating equipment.', 'error');
      }
    });

    // 8. Delete Confirmation Submit
    document.getElementById('btnConfirmDeleteInventory')?.addEventListener('click', async () => {
      if (!state.selectedItem) return;

      try {
        const data = await safeFetchJson(getApiUrl('inventory'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'delete',
            inventory_id: state.selectedItem.inventory_id
          })
        });

        notify(data.message || 'Inventory item deleted successfully.', 'success');
        hideModal('deleteInventoryModal');
        hideModal('inventoryDetailsModal');
        state.selectedItem = null;
        fetchInventory();
      } catch (err) {
        notify(err.message || 'Error deleting item.', 'error');
      }
    });

    // 9. Close Modal Buttons & Overlay Click
    const modalPairs = [
      { close: 'closeAddInventoryModal', cancel: 'cancelAddInventory', modal: 'addInventoryModal' },
      { close: 'closeInventoryDetailsModal', cancel: 'cancelInventoryDetails', modal: 'inventoryDetailsModal' },
      { close: 'closeBatchEquipmentDetailsModal', cancel: 'cancelBatchEquipmentDetails', modal: 'batchEquipmentDetailsModal' },
      { close: 'closeAddStockModal', cancel: 'cancelAddStock', modal: 'addStockModal' },
      { close: 'closeDeductStockModal', cancel: 'cancelDeductStock', modal: 'deductStockModal' },
      { close: 'closeAllocateModal', cancel: 'cancelAllocate', modal: 'allocateModal' },
      { close: 'closeDeallocateModal', cancel: 'cancelDeallocate', modal: 'deallocateModal' },
      { close: 'closeDeleteInventoryModal', cancel: 'cancelDeleteInventory', modal: 'deleteInventoryModal' },
      { close: 'closeInventoryHistoryModal', cancel: 'cancelInventoryHistory', modal: 'inventoryHistoryModal' }
    ];

    modalPairs.forEach(pair => {
      document.getElementById(pair.close)?.addEventListener('click', () => {
        hideModal(pair.modal);
        if (pair.modal === 'inventoryHistoryModal' && state.selectedItem) {
          showModal('inventoryDetailsModal');
        }
      });
      document.getElementById(pair.cancel)?.addEventListener('click', () => {
        hideModal(pair.modal);
        if (pair.modal === 'inventoryHistoryModal' && state.selectedItem) {
          showModal('inventoryDetailsModal');
        }
      });

      const modalEl = document.getElementById(pair.modal);
      modalEl?.addEventListener('click', (e) => {
        if (e.target === modalEl) {
          hideModal(pair.modal);
          if (pair.modal === 'inventoryHistoryModal' && state.selectedItem) {
            showModal('inventoryDetailsModal');
          }
        }
      });
    });

    // Escape key closes open modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        modalPairs.forEach(p => hideModal(p.modal));
      }
    });
  });

})();
