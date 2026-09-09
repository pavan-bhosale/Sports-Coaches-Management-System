/**
 * VAVA Sports Academy - Students Module
 */

let fetchStudentsRequestId = 0;
let studentToDeleteId = null;
let activeProfileStudentId = null;
let currentLoadedStudentData = null;

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
    const res = await fetch(STUDENTS_API);
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
          card.innerHTML = `
            <div class="student-card-header">
              <div class="student-card-avatar bg-avatar-green" style="${student.student_photo ? 'background:none;padding:0;' : ''}">
                ${student.student_photo ? `<img src="${student.student_photo}?t=${Date.now()}" alt="Student Photo">` : initials}
              </div>
              <div class="student-card-info">
                <a href="javascript:void(0)" class="student-card-name student-name-link" data-id="${student.student_id}">${student.student_name}</a>
                <div class="student-card-parent">Parent: ${student.parent_name || '—'}</div>
              </div>
              <span class="student-batch-badge">${batchDisplay}</span>
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
  openModal('addStudentModal');
}

function closeRegForm() {
  closeModal('addStudentModal');
  clearRegErrors();
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
  activeProfileStudentId = studentId;
  const modal = document.getElementById('studentProfileModal');
  if (!modal) return;

  try {
    const res = await fetch(`${STUDENTS_API}?id=${studentId}`);
    const data = await res.json();
    if (!data.success || !data.student) throw new Error('Student not found');

    const student = data.student;
    currentLoadedStudentData = student;

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

    // Photo Rendering
    const imgEl = document.getElementById('studentProfileImg');
    const initialsEl = document.getElementById('studentProfileInitials');
    const btnDeletePhoto = document.getElementById('btnDeleteStudentPhoto');

    if (student.student_photo) {
      imgEl.src = student.student_photo + '?t=' + Date.now();
      imgEl.style.display = 'block';
      initialsEl.style.display = 'none';
      if (btnDeletePhoto) btnDeletePhoto.style.display = 'flex';
    } else {
      imgEl.src = '';
      imgEl.style.display = 'none';
      initialsEl.textContent = getStudentInitials(student.student_name);
      initialsEl.style.display = 'block';
      if (btnDeletePhoto) btnDeletePhoto.style.display = 'none';
    }

    openModal('studentProfileModal');
  } catch (err) {
    console.error('Error opening student profile:', err);
    showToast('Could not load student profile.', 'error');
  }
}

// ── Students Initialization & Event Listeners ─────────────
document.addEventListener('DOMContentLoaded', () => {
  const btnAddStudent = document.getElementById('btnAddStudent');
  const closeAddStudentBtn = document.getElementById('closeAddStudentModal');
  const cancelAddStudent = document.getElementById('cancelAddStudent');
  const submitAddStudent = document.getElementById('submitAddStudent');

  if (btnAddStudent) btnAddStudent.addEventListener('click', openRegForm);
  if (closeAddStudentBtn) closeAddStudentBtn.addEventListener('click', closeRegForm);
  if (cancelAddStudent) cancelAddStudent.addEventListener('click', closeRegForm);

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
      const payload = {
        student_name: document.getElementById('regFullName').value.trim(),
        parent_name: document.getElementById('regParentName').value.trim(),
        date_of_birth: document.getElementById('regDob').value,
        gender: genderSelected.value,
        blood_group: document.getElementById('regBloodGroup').value,
        branch_name: document.getElementById('regBranch').value,
        batch_name: regBatchEl ? regBatchEl.value : 'No Batch',
        coach_name: document.getElementById('regCoach').value,
        address: document.getElementById('regAddressLine').value.trim(),
        city: document.getElementById('regCity').value.trim(),
        postal_code: document.getElementById('regPostal').value.trim(),
        father_contact_number: document.getElementById('regFatherContact').value.trim(),
        mother_contact_number: document.getElementById('regMotherContact').value.trim(),
        emergency_contact_number: document.getElementById('regEmergency').value.trim(),
        whatsapp_number: document.getElementById('regWhatsapp').value.trim()
      };

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
      if (editBatchEl) editBatchEl.value = s.batch_name || 'No Batch';
      const editCoachEl = document.getElementById('editRegCoach');
      if (editCoachEl) editCoachEl.value = s.coach_name || '';

      document.getElementById('editRegAddressLine').value = s.address || '';
      document.getElementById('editRegCity').value = s.city || '';
      document.getElementById('editRegPostal').value = s.postal_code || '';
      document.getElementById('editRegFatherContact').value = s.father_contact_number || '';
      document.getElementById('editRegMotherContact').value = s.mother_contact_number || '';
      document.getElementById('editRegEmergency').value = s.emergency_contact_number || '';
      document.getElementById('editRegWhatsapp').value = s.whatsapp_number || '';

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
      const payload = {
        student_id: parseInt(document.getElementById('editStudentId').value),
        student_name: document.getElementById('editRegFullName').value.trim(),
        parent_name: document.getElementById('editRegParentName').value.trim(),
        date_of_birth: document.getElementById('editRegDob').value,
        gender: genderSelected.value,
        blood_group: document.getElementById('editRegBloodGroup').value,
        branch_name: document.getElementById('editRegBranch').value,
        batch_name: editBatchEl ? editBatchEl.value : 'No Batch',
        coach_name: document.getElementById('editRegCoach').value,
        address: document.getElementById('editRegAddressLine').value.trim(),
        city: document.getElementById('editRegCity').value.trim(),
        postal_code: document.getElementById('editRegPostal').value.trim(),
        father_contact_number: document.getElementById('editRegFatherContact').value.trim(),
        mother_contact_number: document.getElementById('editRegMotherContact').value.trim(),
        emergency_contact_number: document.getElementById('editRegEmergency').value.trim(),
        whatsapp_number: document.getElementById('editRegWhatsapp').value.trim()
      };

      try {
        const res = await fetch(STUDENTS_API, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          closeEditStudentForm();
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
    const link = e.target.closest('.student-name-link');
    if (!link) return;
    const studentId = link.getAttribute('data-id');
    if (studentId) {
      openStudentProfile(studentId);
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

  if (studentPhotoFileInput) {
    studentPhotoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (typeof activeProfileType !== 'undefined') {
        window.activeProfileType = 'student';
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (typeof rawCropImage !== 'undefined') window.rawCropImage = img;
          if (typeof cropRotation !== 'undefined') window.cropRotation = 0;
          if (typeof cropFlipH !== 'undefined') window.cropFlipH = 1;
          if (typeof cropFlipV !== 'undefined') window.cropFlipV = 1;
          if (typeof redrawCropCanvas === 'function') redrawCropCanvas();
          openModal('cropPhotoModal');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
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
});
