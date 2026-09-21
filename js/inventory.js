/**
 * VAVA Sports Academy - Inventory & Equipment Module (Academy-Wide)
 * Strictly Super Admin exclusive.
 */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    items: [],
    batches: [],
    selectedItem: null,
    selectedBatchForDealloc: null,
    searchQuery: '',
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
    const container = document.getElementById('inventoryCardsContainer');
    const emptyState = document.getElementById('inventoryEmptyState');
    const countEl = document.getElementById('inventoryLiveCount');

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

      renderInventoryCards();
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
          const isAdded = (h.type === 'Added' || h.type === 'Purchase' || h.type === 'Restock');
          const changeText = isAdded ? `+${h.quantity}` : `-${h.quantity}`;
          const changeClass = isAdded ? 'inv-change-pos' : 'inv-change-neg';
          const dateOnly = formatDateOnly(h.created_at);

          let sourceHtml = '';
          if (h.source === 'Allocated Stock') {
            const batchName = h.batch_name || (h.batch_id ? `Batch #${h.batch_id}` : 'Allocated Stock');
            sourceHtml = `<span class="inv-history-source-badge is-batch" title="Deducted from ${escapeHtml(batchName)}">${escapeHtml(batchName)}</span> `;
          } else if (h.source === 'Available Stock') {
            sourceHtml = `<span class="inv-history-source-badge is-avail" title="Deducted from Available Stock">Available Stock</span> `;
          }

          return `
            <tr>
              <td><span class="inv-history-date">${dateOnly}</span></td>
              <td class="${changeClass}">${changeText}</td>
              <td class="inv-history-reason">${sourceHtml}${escapeHtml(h.reason || '—')}</td>
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

  // ── Allocate Modal ────────────────────────────────────────────────────────
  function openAllocateModal(item) {
    state.selectedItem = item;
    const nameEl = document.getElementById('allocateItemName');
    const availEl = document.getElementById('allocateAvailableStock');
    const selectEl = document.getElementById('allocateBatchSelect');
    const inputEl = document.getElementById('allocateQuantity');

    if (nameEl) nameEl.textContent = item.item_name;
    if (availEl) availEl.textContent = item.available_quantity;
    if (inputEl) {
      inputEl.value = '';
      inputEl.max = item.available_quantity;
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

    // 6. Allocate Submit
    document.getElementById('btnSubmitAllocate')?.addEventListener('click', async () => {
      if (!state.selectedItem) return;
      const batchId = parseInt(document.getElementById('allocateBatchSelect')?.value || '0', 10);
      const qty = parseInt(document.getElementById('allocateQuantity')?.value || '0', 10);

      if (!batchId) {
        notify('Please select a batch.', 'error');
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        notify('Please enter a valid quantity greater than 0.', 'error');
        return;
      }
      if (qty > state.selectedItem.available_quantity) {
        notify(`Cannot allocate ${qty} items. Only ${state.selectedItem.available_quantity} items are available.`, 'error');
        return;
      }

      try {
        const data = await safeFetchJson(getApiUrl('inventory'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            action: 'allocate',
            inventory_id: state.selectedItem.inventory_id,
            batch_id: batchId,
            quantity: qty
          })
        });

        notify(data.message || 'Equipment allocated successfully.', 'success');
        hideModal('allocateModal');
        fetchInventory();
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
