/**
 * VAVA Sports Academy - Students Module
 */

let fetchStudentsRequestId = 0;
let studentToDeleteId = null;
let activeProfileStudentId = null;
let currentLoadedStudentData = null;

// ── Shared Cropper.js & Image Optimizer State ──────────────────
var cropperInstance = null;
var activeCropCallback = null;
var minZoomRatio = 1;
var maxZoomRatio = 3;

var regPendingStudentPhotoData = null;
var editPendingStudentPhotoData = null;

/**
 * Detect client format support: WebP preferred, fallback to JPEG
 */
function getBestImageFormat() {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const webpData = c.toDataURL('image/webp');
    if (webpData.indexOf('data:image/webp') === 0) {
      return { mime: 'image/webp', ext: 'webp', quality: 0.85 };
    }
  } catch (e) {}
  return { mime: 'image/jpeg', ext: 'jpg', quality: 0.85 };
}

/**
 * Generate client-side cropped, resized (target 600x600 max, no upscale), compressed image
 */
function generateOptimizedProfilePhoto() {
  if (!cropperInstance) return null;

  try {
    const data = cropperInstance.getData();
    const naturalCropSize = Math.round(data.width);
    const TARGET = 600;

    let croppedCanvas;
    if (naturalCropSize >= TARGET) {
      croppedCanvas = cropperInstance.getCroppedCanvas({
        width: TARGET,
        height: TARGET,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });
    } else {
      croppedCanvas = cropperInstance.getCroppedCanvas({
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });
    }

    if (!croppedCanvas) return null;

    const format = getBestImageFormat();
    return croppedCanvas.toDataURL(format.mime, format.quality);
  } catch (err) {
    console.error('Error generating optimized photo:', err);
    return null;
  }
}
window.generateOptimizedProfilePhoto = generateOptimizedProfilePhoto;

/**
 * Validates selected file and opens the WhatsApp-style crop modal
 */
function openPhotoCropper(file, options = {}) {
  if (!file) return;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  const ext = file.name.split('.').pop().toLowerCase();
  if (!validTypes.includes(file.type.toLowerCase()) && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    showToast('Unsupported file format. Please select a JPG, PNG, or WebP photo.', 'error');
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    showToast('Image file is too large (>25MB). Please select a smaller photo.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = event.target.result;
    activeCropCallback = options.onConfirm || null;

    const titleEl = document.getElementById('cropModalTitle');
    if (titleEl) titleEl.textContent = options.title || 'Crop Student Photo';

    const badgeEl = document.getElementById('cropModalBadgeText');
    if (badgeEl) badgeEl.textContent = options.badge || 'Profile Picture Editor';

    const submitTextEl = document.getElementById('submitCropPhotoText');
    if (submitTextEl) submitTextEl.textContent = options.confirmText || 'Confirm Crop';

    const zoomRange = document.getElementById('cropZoomRange');
    if (zoomRange) zoomRange.value = 0;

    openModal('cropPhotoModal');

    const cropImg = document.getElementById('cropImageTarget');
    if (!cropImg) return;

    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }

    cropImg.style.display = 'block';
    cropImg.src = dataUrl;

    cropperInstance = new Cropper(cropImg, {
      aspectRatio: 1, // Fixed square 1:1 crop area
      viewMode: 1, // Crop box cannot exceed canvas, image never exposes empty space in square
      dragMode: 'move', // Dragging viewport moves the image underneath
      autoCropArea: 0.9,
      cropBoxMovable: false, // Crop box stays fixed and centered
      cropBoxResizable: false, // Strict 1:1, no resizing
      toggleDragModeOnDblclick: false,
      center: false,
      highlight: false,
      background: false,
      modal: true,
      guides: true,
      zoomable: true,
      zoomOnTouch: true,
      zoomOnWheel: true,
      wheelZoomRatio: 0.08,
      checkOrientation: true, // EXIF orientation handled automatically
      ready() {
        const canvasData = cropperInstance.getCanvasData();
        minZoomRatio = canvasData.width / canvasData.naturalWidth;
        maxZoomRatio = minZoomRatio * 3.5;
        if (zoomRange) zoomRange.value = 0;
      },
      zoom(e) {
        const currentRatio = e.detail.ratio;
        if (zoomRange && maxZoomRatio > minZoomRatio) {
          const pct = Math.max(0, Math.min(100, ((currentRatio - minZoomRatio) / (maxZoomRatio - minZoomRatio)) * 100));
          zoomRange.value = pct;
        }
      }
    });
  };

  reader.onerror = () => {
    showToast('Error reading selected image file.', 'error');
  };
  reader.readAsDataURL(file);
}
window.openPhotoCropper = openPhotoCropper;

function clearRegPhotoPreview() {
  regPendingStudentPhotoData = null;
  const input = document.getElementById('regStudentPhotoInput');
  if (input) input.value = '';
  const img = document.getElementById('regStudentPhotoImg');
  if (img) {
    img.src = '';
    img.style.display = 'none';
  }
  const initials = document.getElementById('regStudentPhotoInitials');
  if (initials) initials.style.display = 'flex';
  const removeBtn = document.getElementById('btnRemoveRegStudentPhoto');
  if (removeBtn) removeBtn.style.display = 'none';
  const chooseBtn = document.getElementById('btnChooseRegStudentPhoto');
  if (chooseBtn) {
    chooseBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
      </svg>
      Choose Photo
    `;
  }
}

function clearEditPhotoPreview(existingPhotoUrl = null) {
  editPendingStudentPhotoData = null;
  const input = document.getElementById('editStudentPhotoInput');
  if (input) input.value = '';
  const img = document.getElementById('editStudentPhotoImg');
  const initials = document.getElementById('editStudentPhotoInitials');
  const removeBtn = document.getElementById('btnRemoveEditStudentPhoto');
  const chooseBtn = document.getElementById('btnChooseEditStudentPhoto');

  if (existingPhotoUrl) {
    if (img) {
      img.src = existingPhotoUrl + '?t=' + Date.now();
      img.style.display = 'block';
    }
    if (initials) initials.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
    if (chooseBtn) {
      chooseBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
        </svg>
        Change Photo
      `;
    }
  } else {
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
    if (initials) initials.style.display = 'flex';
    if (removeBtn) removeBtn.style.display = 'none';
    if (chooseBtn) {
      chooseBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
        </svg>
        Choose Photo
      `;
    }
  }
}

function initPhotoCropperEvents() {
  const zoomRange = document.getElementById('cropZoomRange');
  const btnZoomIn = document.getElementById('btnCropZoomIn');
  const btnZoomOut = document.getElementById('btnCropZoomOut');
  const btnReset = document.getElementById('btnCropReset');
  const btnRotL = document.getElementById('btnCropRotateLeft');
  const btnRotR = document.getElementById('btnCropRotateRight');
  const cancelBtn = document.getElementById('cancelCropPhoto');
  const closeBtn = document.getElementById('closeCropPhotoModal');
  const submitBtn = document.getElementById('submitCropPhoto');

  if (zoomRange) {
    zoomRange.addEventListener('input', (e) => {
      if (!cropperInstance) return;
      const pct = parseFloat(e.target.value) / 100;
      const targetRatio = minZoomRatio + pct * (maxZoomRatio - minZoomRatio);
      cropperInstance.zoomTo(targetRatio);
    });
  }

  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      if (cropperInstance) cropperInstance.zoom(0.15);
    });
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      if (cropperInstance) cropperInstance.zoom(-0.15);
    });
  }
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (cropperInstance) {
        cropperInstance.reset();
        if (zoomRange) zoomRange.value = 0;
      }
    });
  }

  if (btnRotL) {
    btnRotL.addEventListener('click', () => {
      if (cropperInstance) cropperInstance.rotate(-90);
    });
  }
  if (btnRotR) {
    btnRotR.addEventListener('click', () => {
      if (cropperInstance) cropperInstance.rotate(90);
    });
  }

  const closeCrop = () => {
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
    closeModal('cropPhotoModal');
  };

  if (cancelBtn) cancelBtn.addEventListener('click', closeCrop);
  if (closeBtn) closeBtn.addEventListener('click', closeCrop);

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const optimizedBase64 = generateOptimizedProfilePhoto();
      if (!optimizedBase64) {
        showToast('Image processing failed. Please try again.', 'error');
        return;
      }

      if (typeof activeCropCallback === 'function') {
        const cb = activeCropCallback;
        activeCropCallback = null;
        closeCrop();
        cb(optimizedBase64);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Uploading...';

      try {
        const profileType = (typeof window.activeProfileType !== 'undefined') ? window.activeProfileType : 'student';
        if (profileType === 'student') {
          const studentId = activeProfileStudentId || (typeof window.activeProfileStudentId !== 'undefined' ? window.activeProfileStudentId : null);
          if (!studentId) {
            closeCrop();
            return;
          }
          const res = await fetch(STUDENTS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upload_photo',
              student_id: studentId,
              image_data: optimizedBase64
            })
          });
          const data = await res.json();
          if (data.success) {
            closeCrop();
            showToast('Profile picture uploaded successfully!', 'success');
            openStudentProfile(studentId);
            fetchStudents();
          } else {
            showToast(data.error || 'Failed to upload profile picture.', 'error');
          }
        } else {
          const coachId = (typeof activeProfileCoachId !== 'undefined') ? activeProfileCoachId : null;
          if (!coachId) {
            closeCrop();
            return;
          }
          const res = await fetch(COACHES_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upload_photo',
              coach_id: coachId,
              image_data: optimizedBase64
            })
          });
          const data = await res.json();
          if (data.success) {
            closeCrop();
            showToast('Profile picture uploaded successfully!', 'success');
            if (typeof openCoachProfile === 'function') openCoachProfile(coachId);
            if (typeof fetchCoaches === 'function') fetchCoaches();
          } else {
            showToast(data.error || 'Failed to upload profile picture.', 'error');
          }
        }
      } catch (err) {
        console.error('Upload Photo Error:', err);
        showToast('Connection error. Could not upload photo.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span id="submitCropPhotoText">Confirm Crop</span>
        `;
      }
    });
  }
}

// Auth helper functions for role-restricted student queries and note operations
function getStudentAuthHeaders() {
  const role = localStorage.getItem('vava_role') || 'admin';
  const email = localStorage.getItem('vava_email') || '';
  let coach_id = 0;
  const userStr = localStorage.getItem('vava_user');
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      if (u.coach_id) coach_id = u.coach_id;
    } catch(e) {}
  }
  return {
    'Content-Type': 'application/json',
    'X-VAVA-Role': role,
    'X-VAVA-Email': email,
    'X-VAVA-Coach-Id': String(coach_id)
  };
}

function getStudentAuthQuery() {
  const role = localStorage.getItem('vava_role') || 'admin';
  const email = localStorage.getItem('vava_email') || '';
  let coach_id = 0;
  const userStr = localStorage.getItem('vava_user');
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      if (u.coach_id) coach_id = u.coach_id;
    } catch(e) {}
  }
  return `role=${encodeURIComponent(role)}&email=${encodeURIComponent(email)}&coach_id=${encodeURIComponent(coach_id)}`;
}

function updateStudentsLiveCount(count) {
  const el = document.getElementById('studentsLiveCount');
  if (!el) return;
  el.textContent = count === 1 ? '1 Active Student' : `${count} Active Students`;
}

// ── Fetch & Render Students (Table & Mobile Cards) ────────────────────────
async function fetchStudents() {
  const requestId = ++fetchStudentsRequestId;
  const tableWidget    = document.getElementById('studentsTableWidget');
  const cardsContainer = document.getElementById('studentCardsContainer');
  const tableBody      = document.getElementById('studentsTableBody');
  const emptyState     = document.getElementById('studentsEmptyState');
  if (!tableBody || !emptyState || !tableWidget) return;

  tableBody.innerHTML = '';
  if (cardsContainer) cardsContainer.innerHTML = '';

  try {
    const url = `${STUDENTS_API}?${getStudentAuthQuery()}`;
    const res = await fetch(url, { headers: getStudentAuthHeaders() });
    const data = await res.json();
    if (requestId !== fetchStudentsRequestId) return;
    if (!data.success) throw new Error(data.error || 'Fetch failed.');

    const students = data.students || [];
    updateStudentsLiveCount(students.length);

    if (students.length === 0) {
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

      students.forEach(student => {
        const initials = getStudentInitials(student.student_name);
        const branchLabel = formatBranchLabel(student.branch_name);
        const coachLabel = formatCoachLabel(student.coach_name);
        const whatsappFormatted = student.whatsapp_number ? `+91 ${student.whatsapp_number}` : '—';
        const studentJsonStr = encodeURIComponent(JSON.stringify(student));
        const batchDisplay = student.batch_name || 'No Batch';

        // 1) Desktop Table Row
        const tr = document.createElement('tr');
        tr.dataset.studentId = student.student_id;
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

        // 2) Mobile Card Element
        if (cardsContainer) {
          const card = document.createElement('div');
          card.className = 'student-card-mobile';
          card.dataset.studentId = student.student_id;
          card.setAttribute('role', 'button');
          card.setAttribute('tabindex', '0');
          card.setAttribute('aria-label', `View profile for ${student.student_name}`);
          card.innerHTML = `
            <div class="student-card-header">
              <div class="student-card-avatar bg-avatar-green" style="${student.student_photo ? 'background:none;padding:0;' : ''}">
                ${student.student_photo ? `<img src="${student.student_photo}?t=${Date.now()}" alt="Student Photo">` : initials}
              </div>
              <div class="student-card-info">
                <a href="javascript:void(0)" class="student-card-name student-name-link" data-id="${student.student_id}" title="${student.student_name}">${student.student_name}</a>
                <span class="student-batch-badge" title="${batchDisplay}">${batchDisplay}</span>
              </div>
              <div class="batch-actions-wrap">
                <button class="batch-actions-btn student-three-dots-btn" data-id="${student.student_id}" type="button" aria-label="Student Actions">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                  </svg>
                </button>
                <div class="batch-actions-menu" id="studentMenu-mobile-${student.student_id}">
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
            </div>

            <div class="student-card-divider"></div>

            <div class="student-card-grid-top">
              <div class="student-meta-col">
                <div class="student-meta-val">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>${branchLabel}</span>
                </div>
                <div class="student-meta-lbl">Branch</div>
              </div>
              <div class="student-meta-col">
                <div class="student-meta-val">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                    <path d="M9 22v-4h6v4"/>
                    <path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/>
                    <path d="M12 10h.01"/><path d="M12 14h.01"/>
                  </svg>
                  <span>${student.city || '—'}</span>
                </div>
                <div class="student-meta-lbl">City</div>
              </div>
              <div class="student-meta-col">
                <div class="student-meta-val">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                  </svg>
                  <span>${student.blood_group || 'N/A'}</span>
                </div>
                <div class="student-meta-lbl">Blood Group</div>
              </div>
            </div>

            <div class="student-card-divider"></div>

            <div class="student-card-grid-bottom">
              <div class="student-meta-col">
                <div class="student-meta-val">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.76a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <span>${whatsappFormatted}</span>
                </div>
                <div class="student-meta-lbl">WhatsApp Number</div>
              </div>
              <div class="student-meta-col">
                <div class="student-meta-val">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span>${coachLabel}</span>
                </div>
                <div class="student-meta-lbl">Coach</div>
              </div>
            </div>
          `;
          cardsContainer.appendChild(card);
        }
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

// ── Add Student Form Modal Functions ────────────────────────
function openRegForm() {
  populateBatchDropdowns();
  populateCoachDropdowns();
  clearRegPhotoPreview();
  openModal('addStudentModal');
}

function closeRegForm() {
  closeModal('addStudentModal');
  clearRegErrors();
  clearRegPhotoPreview();
}

function clearRegErrors() {
  document.querySelectorAll('#addStudentModal .reg-error').forEach(e => e.classList.remove('visible'));
  document.querySelectorAll('#addStudentModal .reg-input, #addStudentModal .reg-gender-group').forEach(el => el.classList.remove('reg-input-error'));
}

// ── Edit Student Form Modal Functions ───────────────────────
function openEditStudentForm() {
  populateBatchDropdowns();
  populateCoachDropdowns();
  openModal('editStudentModal');
}

function closeEditStudentForm() {
  closeModal('editStudentModal');
  clearEditStudentErrors();
  clearEditPhotoPreview(null);
}

function clearEditStudentErrors() {
  const form = document.getElementById('editStudentForm');
  if (form) {
    form.querySelectorAll('.reg-error').forEach(e => e.classList.remove('visible'));
    form.querySelectorAll('.reg-input, .reg-gender-group').forEach(el => el.classList.remove('reg-input-error'));
  }
}

// ── Open Student Profile Modal ──────────────────────────────
async function openStudentProfile(studentId) {
  if (typeof activeProfileType !== 'undefined') {
    window.activeProfileType = 'student';
  }
  activeProfileStudentId = studentId || null;
  const modal = document.getElementById('studentProfileModal');
  if (!modal) return;

  try {
    const idParam = (studentId !== undefined && studentId !== null && studentId !== '') ? `id=${encodeURIComponent(studentId)}&` : '';
    const url = `${STUDENTS_API}?${idParam}${getStudentAuthQuery()}`;
    const res = await fetch(url, {
      headers: getStudentAuthHeaders(),
      credentials: 'include'
    });
    const data = await res.json();
    if (!data.success || !data.student) throw new Error(data.error || 'Student not found');

    const student = data.student;
    currentLoadedStudentData = student;
    activeProfileStudentId = student.student_id;

    // Check viewing role for role-aware profile presentation
    const storedRole = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
    const isStudent = (storedRole === 'student');

    // Section 8: Role-based restrictions - student has read-only profile access (hide photo edit overlay)
    const btnEditPhoto = document.getElementById('btnEditStudentPhoto');
    const photoDropdown = document.getElementById('studentPhotoDropdown');
    if (btnEditPhoto) {
      btnEditPhoto.style.display = isStudent ? 'none' : '';
    }
    if (photoDropdown && isStudent) {
      photoDropdown.classList.remove('show');
    }

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

    // Student Email & School Name Display Handling
    const rawEmail = student.student_email || '';
    const displayEmail = (rawEmail && !rawEmail.endsWith('@vavasports.local')) ? rawEmail : '—';
    const displaySchool = student.school_name || '—';

    const viewStudentEmailTop = document.getElementById('viewStudentEmailTop');
    if (viewStudentEmailTop) viewStudentEmailTop.textContent = displayEmail;

    const viewStudentEmailVal = document.getElementById('viewStudentEmailVal');
    if (viewStudentEmailVal) viewStudentEmailVal.textContent = displayEmail;

    const viewStudentSchool = document.getElementById('viewStudentSchool');
    if (viewStudentSchool) viewStudentSchool.textContent = displaySchool;

    // Photo Rendering
    const imgEl = document.getElementById('studentProfileImg');
    const initialsEl = document.getElementById('studentProfileInitials');
    const btnDeletePhoto = document.getElementById('btnDeleteStudentPhoto');

    if (student.student_photo) {
      imgEl.src = student.student_photo + '?t=' + Date.now();
      imgEl.style.display = 'block';
      initialsEl.style.display = 'none';
      if (btnDeletePhoto) btnDeletePhoto.style.display = isStudent ? 'none' : 'flex';
    } else {
      imgEl.src = '';
      imgEl.style.display = 'none';
      initialsEl.textContent = getStudentInitials(student.student_name);
      initialsEl.style.display = 'block';
      if (btnDeletePhoto) btnDeletePhoto.style.display = 'none';
    }

    // Render Student Note (single note per student directly on student record - automatically hidden for students)
    renderStudentNoteUI(student);

    openModal('studentProfileModal');
  } catch (err) {
    console.error('Error opening student profile:', err);
    showToast('Could not load student profile.', 'error');
  }
}
window.openStudentProfile = openStudentProfile;

// ── Students Initialization & Event Listeners ─────────────
document.addEventListener('DOMContentLoaded', () => {
  const btnAddStudent = document.getElementById('btnAddStudent');
  const closeAddStudentBtn = document.getElementById('closeAddStudentModal');
  const cancelAddStudent = document.getElementById('cancelAddStudent');
  const submitAddStudent = document.getElementById('submitAddStudent');

  if (btnAddStudent) btnAddStudent.addEventListener('click', openRegForm);
  if (closeAddStudentBtn) closeAddStudentBtn.addEventListener('click', closeRegForm);
  if (cancelAddStudent) cancelAddStudent.addEventListener('click', closeRegForm);

  const regBatchSelect = document.getElementById('regBatch');
  if (regBatchSelect) {
    regBatchSelect.addEventListener('change', () => {
      const bId = parseInt(regBatchSelect.value, 10);
      if (bId > 0 && Array.isArray(cachedBatchesList)) {
        const found = cachedBatchesList.find(b => parseInt(b.batch_id, 10) === bId);
        if (found && found.coach_name) {
          const regCoachEl = document.getElementById('regCoach');
          if (regCoachEl) regCoachEl.value = found.coach_name;
        }
      }
    });
  }

  const editRegBatchSelect = document.getElementById('editRegBatch');
  if (editRegBatchSelect) {
    editRegBatchSelect.addEventListener('change', () => {
      const bId = parseInt(editRegBatchSelect.value, 10);
      if (bId > 0 && Array.isArray(cachedBatchesList)) {
        const found = cachedBatchesList.find(b => parseInt(b.batch_id, 10) === bId);
        if (found && found.coach_name) {
          const editCoachEl = document.getElementById('editRegCoach');
          if (editCoachEl) editCoachEl.value = found.coach_name;
        }
      }
    });
  }

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
    { id: 'regEmail',       check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), errId: 'err-regEmail' },
    { id: 'regSchool',      check: v => v.trim().length > 0,            errId: 'err-regSchool' },
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
      const selectedBatchId = regBatchEl ? parseInt(regBatchEl.value, 10) : 0;
      let selectedBatchName = 'No Batch';
      let selectedCoachId = null;
      let selectedCoachName = document.getElementById('regCoach') ? document.getElementById('regCoach').value : '';

      if (selectedBatchId > 0 && Array.isArray(cachedBatchesList)) {
        const foundBatch = cachedBatchesList.find(b => parseInt(b.batch_id, 10) === selectedBatchId);
        if (foundBatch) {
          selectedBatchName = foundBatch.batch_name;
          if (foundBatch.coach_id) selectedCoachId = parseInt(foundBatch.coach_id, 10);
          if (foundBatch.coach_name && !selectedCoachName) selectedCoachName = foundBatch.coach_name;
        }
      }

      const payload = {
        student_name: document.getElementById('regFullName').value.trim(),
        parent_name: document.getElementById('regParentName').value.trim(),
        date_of_birth: document.getElementById('regDob').value,
        gender: genderSelected.value,
        blood_group: document.getElementById('regBloodGroup').value,
        branch_name: document.getElementById('regBranch').value,
        batch_id: selectedBatchId > 0 ? selectedBatchId : null,
        batch_name: selectedBatchName,
        coach_id: selectedCoachId,
        coach_name: selectedCoachName,
        address: document.getElementById('regAddressLine').value.trim(),
        city: document.getElementById('regCity').value.trim(),
        postal_code: document.getElementById('regPostal').value.trim(),
        father_contact_number: document.getElementById('regFatherContact').value.trim(),
        mother_contact_number: document.getElementById('regMotherContact').value.trim(),
        emergency_contact_number: document.getElementById('regEmergency').value.trim(),
        whatsapp_number: document.getElementById('regWhatsapp').value.trim(),
        student_email: document.getElementById('regEmail').value.trim(),
        school_name: document.getElementById('regSchool').value.trim()
      };

      if (regPendingStudentPhotoData) {
        payload.image_data = regPendingStudentPhotoData;
      }

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
          clearRegPhotoPreview();
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

  // ── Edit Student Handlers ─────────────────────────────────
  const closeEditStudentBtn = document.getElementById('closeEditStudentModal');
  const cancelEditStudent = document.getElementById('cancelEditStudent');
  const submitEditStudent = document.getElementById('submitEditStudent');

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
      if (editBatchEl) {
        if (s.batch_id && parseInt(s.batch_id, 10) > 0) {
          editBatchEl.value = String(s.batch_id);
        } else if (s.batch_name && s.batch_name !== 'No Batch') {
          const matches = (cachedBatchesList || []).filter(b => b.batch_name.trim().toLowerCase() === s.batch_name.trim().toLowerCase());
          if (matches.length === 1) {
            editBatchEl.value = String(matches[0].batch_id);
          } else {
            editBatchEl.value = '0';
          }
        } else {
          editBatchEl.value = '0';
        }
      }
      const editCoachEl = document.getElementById('editRegCoach');
      if (editCoachEl) editCoachEl.value = s.coach_name || '';

      document.getElementById('editRegAddressLine').value = s.address || '';
      document.getElementById('editRegCity').value = s.city || '';
      document.getElementById('editRegPostal').value = s.postal_code || '';
      document.getElementById('editRegFatherContact').value = s.father_contact_number || '';
      document.getElementById('editRegMotherContact').value = s.mother_contact_number || '';
      document.getElementById('editRegEmergency').value = s.emergency_contact_number || '';
      document.getElementById('editRegWhatsapp').value = s.whatsapp_number || '';
      document.getElementById('editRegEmail').value = (s.student_email && !s.student_email.endsWith('@vavasports.local')) ? s.student_email : '';
      document.getElementById('editRegSchool').value = s.school_name || '';

      clearEditPhotoPreview(s.student_photo || null);
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
    { id: 'editRegEmail',       check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), errId: 'err-editRegEmail' },
    { id: 'editRegSchool',      check: v => v.trim().length > 0,            errId: 'err-editRegSchool' },
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
      const selectedBatchId = editBatchEl ? parseInt(editBatchEl.value, 10) : 0;
      let selectedBatchName = 'No Batch';
      let selectedCoachId = null;
      let selectedCoachName = document.getElementById('editRegCoach') ? document.getElementById('editRegCoach').value : '';

      if (selectedBatchId > 0 && Array.isArray(cachedBatchesList)) {
        const foundBatch = cachedBatchesList.find(b => parseInt(b.batch_id, 10) === selectedBatchId);
        if (foundBatch) {
          selectedBatchName = foundBatch.batch_name;
          if (foundBatch.coach_id) selectedCoachId = parseInt(foundBatch.coach_id, 10);
          if (foundBatch.coach_name && !selectedCoachName) selectedCoachName = foundBatch.coach_name;
        }
      }

      const payload = {
        student_id: parseInt(document.getElementById('editStudentId').value),
        student_name: document.getElementById('editRegFullName').value.trim(),
        parent_name: document.getElementById('editRegParentName').value.trim(),
        date_of_birth: document.getElementById('editRegDob').value,
        gender: genderSelected.value,
        blood_group: document.getElementById('editRegBloodGroup').value,
        branch_name: document.getElementById('editRegBranch').value,
        batch_id: selectedBatchId > 0 ? selectedBatchId : null,
        batch_name: selectedBatchName,
        coach_id: selectedCoachId,
        coach_name: selectedCoachName,
        address: document.getElementById('editRegAddressLine').value.trim(),
        city: document.getElementById('editRegCity').value.trim(),
        postal_code: document.getElementById('editRegPostal').value.trim(),
        father_contact_number: document.getElementById('editRegFatherContact').value.trim(),
        mother_contact_number: document.getElementById('editRegMotherContact').value.trim(),
        emergency_contact_number: document.getElementById('editRegEmergency').value.trim(),
        whatsapp_number: document.getElementById('editRegWhatsapp').value.trim(),
        student_email: document.getElementById('editRegEmail').value.trim(),
        school_name: document.getElementById('editRegSchool').value.trim()
      };

      if (editPendingStudentPhotoData === 'REMOVE') {
        payload.remove_photo = true;
      } else if (editPendingStudentPhotoData) {
        payload.image_data = editPendingStudentPhotoData;
      }

      try {
        const res = await fetch(STUDENTS_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          closeEditStudentForm();
          clearEditPhotoPreview(null);
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

  // ── Delete Student Handlers ───────────────────────────────
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
    openModal('deleteStudentModal');
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

  // Clear error on input change
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

  // ── Student Profile Handlers ──────────────────────────────
  const closeStudentProfileModal = document.getElementById('closeStudentProfileModal');
  if (closeStudentProfileModal) {
    closeStudentProfileModal.addEventListener('click', () => closeModal('studentProfileModal'));
  }

  document.addEventListener('click', (e) => {
    // 1. If clicking inside the actions dropdown/buttons, do not trigger profile
    if (e.target.closest('.batch-actions-wrap')) return;

    // 2. Click anywhere on mobile/tablet student card
    const card = e.target.closest('.student-card-mobile');
    if (card && card.dataset.studentId) {
      openStudentProfile(card.dataset.studentId);
      return;
    }

    // 3. Click on desktop table student name link
    const link = e.target.closest('.student-name-link');
    if (link) {
      const studentId = link.getAttribute('data-id');
      if (studentId) {
        openStudentProfile(studentId);
      }
      return;
    }

    // 4. Click anywhere on desktop table row (student info)
    const tr = e.target.closest('#studentsTableBody tr');
    if (tr && tr.dataset.studentId) {
      openStudentProfile(tr.dataset.studentId);
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('.batch-actions-wrap')) return;
      const card = e.target.closest('.student-card-mobile');
      if (card && card.dataset.studentId && document.activeElement === card) {
        e.preventDefault();
        openStudentProfile(card.dataset.studentId);
      }
    }
  });

  // Photo Hover Menu & Actions
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

  const btnAddStudentPhoto = document.getElementById('btnAddStudentPhoto');
  const studentPhotoFileInput = document.getElementById('studentPhotoFileInput');
  if (btnAddStudentPhoto && studentPhotoFileInput) {
    btnAddStudentPhoto.addEventListener('click', () => {
      if (studentPhotoDropdown) studentPhotoDropdown.classList.remove('show');
      studentPhotoFileInput.value = '';
      studentPhotoFileInput.click();
    });
  }

  // Initialize Photo Cropper Engine & Controls
  initPhotoCropperEvents();

  // Registration Form Photo Picker
  const btnChooseRegPhoto = document.getElementById('btnChooseRegStudentPhoto');
  const btnRemoveRegPhoto = document.getElementById('btnRemoveRegStudentPhoto');
  const regPhotoInput = document.getElementById('regStudentPhotoInput');

  if (btnChooseRegPhoto && regPhotoInput) {
    btnChooseRegPhoto.addEventListener('click', () => {
      regPhotoInput.value = '';
      regPhotoInput.click();
    });
  }

  if (regPhotoInput) {
    regPhotoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      openPhotoCropper(file, {
        title: 'Crop Student Photo',
        badge: 'New Student Profile Photo',
        confirmText: 'Confirm Crop',
        onConfirm: (optimizedBase64) => {
          regPendingStudentPhotoData = optimizedBase64;
          const img = document.getElementById('regStudentPhotoImg');
          const initials = document.getElementById('regStudentPhotoInitials');
          const removeBtn = document.getElementById('btnRemoveRegStudentPhoto');
          const chooseBtn = document.getElementById('btnChooseRegStudentPhoto');

          if (img) {
            img.src = optimizedBase64;
            img.style.display = 'block';
          }
          if (initials) initials.style.display = 'none';
          if (removeBtn) removeBtn.style.display = 'inline-flex';
          if (chooseBtn) {
            chooseBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
              </svg>
              Change Photo
            `;
          }
        }
      });
    });
  }

  if (btnRemoveRegPhoto) {
    btnRemoveRegPhoto.addEventListener('click', () => {
      clearRegPhotoPreview();
    });
  }

  // Edit Student Form Photo Picker
  const btnChooseEditPhoto = document.getElementById('btnChooseEditStudentPhoto');
  const btnRemoveEditPhoto = document.getElementById('btnRemoveEditStudentPhoto');
  const editPhotoInput = document.getElementById('editStudentPhotoInput');

  if (btnChooseEditPhoto && editPhotoInput) {
    btnChooseEditPhoto.addEventListener('click', () => {
      editPhotoInput.value = '';
      editPhotoInput.click();
    });
  }

  if (editPhotoInput) {
    editPhotoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      openPhotoCropper(file, {
        title: 'Crop Student Photo',
        badge: 'Edit Student Profile Photo',
        confirmText: 'Confirm Crop',
        onConfirm: (optimizedBase64) => {
          editPendingStudentPhotoData = optimizedBase64;
          const img = document.getElementById('editStudentPhotoImg');
          const initials = document.getElementById('editStudentPhotoInitials');
          const removeBtn = document.getElementById('btnRemoveEditStudentPhoto');
          const chooseBtn = document.getElementById('btnChooseEditStudentPhoto');

          if (img) {
            img.src = optimizedBase64;
            img.style.display = 'block';
          }
          if (initials) initials.style.display = 'none';
          if (removeBtn) removeBtn.style.display = 'inline-flex';
          if (chooseBtn) {
            chooseBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
              </svg>
              Change Photo
            `;
          }
        }
      });
    });
  }

  if (btnRemoveEditPhoto) {
    btnRemoveEditPhoto.addEventListener('click', () => {
      editPendingStudentPhotoData = 'REMOVE';
      const img = document.getElementById('editStudentPhotoImg');
      const initials = document.getElementById('editStudentPhotoInitials');
      const chooseBtn = document.getElementById('btnChooseEditStudentPhoto');
      if (img) {
        img.src = '';
        img.style.display = 'none';
      }
      if (initials) initials.style.display = 'flex';
      btnRemoveEditPhoto.style.display = 'none';
      if (chooseBtn) {
        chooseBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
          Choose Photo
        `;
      }
    });
  }

  // Student Profile Modal Photo Picker
  if (studentPhotoFileInput) {
    studentPhotoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      activeProfileType = 'student';
      window.activeProfileType = 'student';

      openPhotoCropper(file, {
        title: 'Crop Student Profile Picture',
        badge: 'Student Profile Picture',
        confirmText: 'Save & Upload',
        onConfirm: async (optimizedBase64) => {
          if (!activeProfileStudentId) return;

          const submitBtn = document.getElementById('submitCropPhoto');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Uploading...';
          }

          try {
            const res = await fetch(STUDENTS_API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'upload_photo',
                student_id: activeProfileStudentId,
                image_data: optimizedBase64
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
          } catch (err) {
            console.error('Upload Photo Error:', err);
            showToast('Connection error. Could not upload photo.', 'error');
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span id="submitCropPhotoText">Confirm Crop</span>
              `;
            }
          }
        }
      });
    });
  }

  // Delete Student Photo
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

  // ── Student Search Filter Listener ────────────────────────
  const sbSearchInput = document.getElementById('sbSearchInput');
  if (sbSearchInput) {
    sbSearchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#studentsTableBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
      document.querySelectorAll('#studentCardsContainer .student-card-mobile').forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  }

  // Initialize Student Note Listeners
  initStudentNoteListeners();
});

// ── Render Student Note UI (Single Note Per Student) ─────────────────────
function renderStudentNoteUI(student) {
  const container = document.getElementById('studentNoteSection');
  if (!container) return;

  const role = (localStorage.getItem('vava_role') || 'admin').toLowerCase();
  const isSuperAdmin = (role === 'admin' || role === 'superadmin');
  const isCoach = (role === 'coach');
  const isStudent = (role === 'student');

  if (isStudent) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const readOnlyBadge = document.getElementById('studentNoteReadOnlyBadge');
  const headerActions = document.getElementById('studentNoteHeaderActions');
  const noteView = document.getElementById('studentNoteView');
  const noteText = document.getElementById('studentNoteText');
  const deleteConfirm = document.getElementById('studentNoteDeleteConfirm');
  const emptyState = document.getElementById('studentNoteEmpty');
  const emptyText = document.getElementById('studentNoteEmptyText');
  const btnOpenAdd = document.getElementById('btnOpenAddNote');
  const formState = document.getElementById('studentNoteForm');
  const noteInput = document.getElementById('studentNoteInput');
  const charCount = document.getElementById('studentNoteCharCount');

  // Reset transient form/confirmation states
  if (deleteConfirm) deleteConfirm.style.display = 'none';
  if (formState) formState.style.display = 'none';

  const noteContent = (student && student.student_note) ? student.student_note.trim() : '';

  if (isSuperAdmin) {
    // Super Admin: READ-ONLY
    if (readOnlyBadge) readOnlyBadge.style.display = 'inline-block';
    if (headerActions) headerActions.innerHTML = '';

    if (noteContent) {
      if (noteView) noteView.style.display = 'block';
      if (noteText) noteText.textContent = noteContent;
      if (emptyState) emptyState.style.display = 'none';
    } else {
      if (noteView) noteView.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      if (emptyText) emptyText.textContent = 'No note recorded for this student.';
      if (btnOpenAdd) btnOpenAdd.style.display = 'none';
    }
    return;
  }

  // Coach: Active Management (Add, Edit, Delete)
  if (readOnlyBadge) readOnlyBadge.style.display = 'none';

  if (noteContent) {
    // Note exists: show note view + Edit & Delete controls
    if (emptyState) emptyState.style.display = 'none';
    if (noteView) noteView.style.display = 'block';
    if (noteText) noteText.textContent = noteContent;

    if (headerActions) {
      headerActions.innerHTML = `
        <button type="button" class="btn-note-action" id="btnEditNote" title="Edit Note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit
        </button>
        <button type="button" class="btn-note-action btn-note-delete" id="btnDeleteNote" title="Delete Note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
          Delete
        </button>
      `;

      const btnEdit = document.getElementById('btnEditNote');
      if (btnEdit) {
        btnEdit.onclick = () => {
          if (noteView) noteView.style.display = 'none';
          if (formState) formState.style.display = 'block';
          if (noteInput) {
            noteInput.value = noteContent;
            noteInput.focus();
            if (charCount) charCount.textContent = `${noteInput.value.length}/1000`;
          }
        };
      }

      const btnDelete = document.getElementById('btnDeleteNote');
      if (btnDelete) {
        btnDelete.onclick = () => {
          if (deleteConfirm) deleteConfirm.style.display = 'flex';
        };
      }
    }
  } else {
    // No note yet: show Add Note button
    if (headerActions) headerActions.innerHTML = '';
    if (noteView) noteView.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    if (emptyText) emptyText.textContent = 'No note recorded for this student.';
    if (btnOpenAdd) {
      btnOpenAdd.style.display = 'inline-flex';
      btnOpenAdd.onclick = () => {
        if (emptyState) emptyState.style.display = 'none';
        if (formState) formState.style.display = 'block';
        if (noteInput) {
          noteInput.value = '';
          noteInput.focus();
          if (charCount) charCount.textContent = '0/1000';
        }
      };
    }
  }
}

// ── Initialize Student Note Event Listeners ─────────────────────────────
function initStudentNoteListeners() {
  const noteInput = document.getElementById('studentNoteInput');
  const charCount = document.getElementById('studentNoteCharCount');
  if (noteInput && charCount) {
    noteInput.addEventListener('input', () => {
      charCount.textContent = `${noteInput.value.length}/1000`;
    });
  }

  // Cancel Note Form
  const btnCancelNote = document.getElementById('btnCancelNoteForm');
  if (btnCancelNote) {
    btnCancelNote.addEventListener('click', () => {
      renderStudentNoteUI(currentLoadedStudentData);
    });
  }

  // Save Note (Add or Edit)
  const btnSaveNote = document.getElementById('btnSaveNote');
  if (btnSaveNote) {
    btnSaveNote.addEventListener('click', async () => {
      const input = document.getElementById('studentNoteInput');
      const val = input ? input.value.trim() : '';
      if (!val) {
        showToast('Note content cannot be empty.', 'error');
        return;
      }
      if (!activeProfileStudentId) return;

      btnSaveNote.disabled = true;
      btnSaveNote.textContent = 'Saving...';

      try {
        const res = await fetch(STUDENTS_API, {
          method: 'POST',
          headers: getStudentAuthHeaders(),
          body: JSON.stringify({
            action: 'save_note',
            student_id: activeProfileStudentId,
            student_note: val
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to save note.');
        }

        if (currentLoadedStudentData) {
          currentLoadedStudentData.student_note = val;
        }
        renderStudentNoteUI(currentLoadedStudentData);
        showToast(data.message || 'Note saved successfully.', 'success');
      } catch (err) {
        console.error('Save note error:', err);
        showToast(err.message || 'Error saving note.', 'error');
      } finally {
        btnSaveNote.disabled = false;
        btnSaveNote.textContent = 'Save Note';
      }
    });
  }

  // Cancel Delete
  const btnCancelDelete = document.getElementById('btnCancelDeleteNote');
  if (btnCancelDelete) {
    btnCancelDelete.addEventListener('click', () => {
      const deleteConfirm = document.getElementById('studentNoteDeleteConfirm');
      if (deleteConfirm) deleteConfirm.style.display = 'none';
    });
  }

  // Confirm Delete
  const btnConfirmDelete = document.getElementById('btnConfirmDeleteNote');
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', async () => {
      if (!activeProfileStudentId) return;

      btnConfirmDelete.disabled = true;
      btnConfirmDelete.textContent = 'Deleting...';

      try {
        const res = await fetch(STUDENTS_API, {
          method: 'POST',
          headers: getStudentAuthHeaders(),
          body: JSON.stringify({
            action: 'delete_note',
            student_id: activeProfileStudentId
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to delete note.');
        }

        if (currentLoadedStudentData) {
          currentLoadedStudentData.student_note = null;
        }
        renderStudentNoteUI(currentLoadedStudentData);
        showToast('Student note deleted successfully.', 'success');
      } catch (err) {
        console.error('Delete note error:', err);
        showToast(err.message || 'Error deleting note.', 'error');
      } finally {
        btnConfirmDelete.disabled = false;
        btnConfirmDelete.textContent = 'Delete';
      }
    });
  }
}

