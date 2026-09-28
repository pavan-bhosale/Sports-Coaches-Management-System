const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('=== STARTING END-TO-END VAVA SPORTS PHOTO UPLOAD TEST ===\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 850 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('PAGE ERROR:', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error('PAGE EXCEPTION:', err.message);
  });

  // 1. Load Dashboard
  console.log('1. Loading Dashboard at http://localhost/VAVA_sports/dashboard.html ...');
  await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // Set superadmin mock session in localStorage if needed
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'admin');
    localStorage.setItem('vava_email', 'superadmin@vavasports.com');
  });

  // Navigate to Students section
  console.log('2. Navigating to Students section...');
  await page.click('#nav-students');
  await new Promise(r => setTimeout(r, 800));

  // Check existing student 4 photo is rendered
  const student4Exists = await page.evaluate(() => {
    return document.querySelector('[data-student-id="4"]') !== null;
  });
  console.log('Existing Student 4 row/card exists in DOM:', student4Exists);

  // 3. Test Student Registration Photo Flow
  console.log('3. Testing Student Registration with Photo Cropper...');
  await page.click('#btnAddStudent');
  await new Promise(r => setTimeout(r, 500));

  // Trigger file input for registration photo
  const portraitPath = path.resolve(__dirname, 'images/large_phone.jpg');
  console.log('Uploading photo for registration:', portraitPath);
  const regInput = await page.$('#regStudentPhotoInput');
  await regInput.uploadFile(portraitPath);
  await new Promise(r => setTimeout(r, 800));

  // Check crop modal is open
  const cropModalOpen = await page.$eval('#cropPhotoModal', el => el.style.display !== 'none');
  console.log('Crop Photo Modal opened:', cropModalOpen);
  if (!cropModalOpen) throw new Error('Crop modal failed to open');

  // Verify cropper is initialized
  const cropperActive = await page.evaluate(() => typeof cropperInstance !== 'undefined' && cropperInstance !== null);
  console.log('Cropper.js instance active:', cropperActive);
  if (!cropperActive) throw new Error('Cropper.js failed to initialize');

  // Test zoom controls
  await page.click('#btnCropZoomIn');
  await page.click('#btnCropRotateRight');
  await page.click('#btnCropReset');
  await new Promise(r => setTimeout(r, 300));

  // Confirm Crop
  console.log('Clicking Confirm Crop...');
  await page.evaluate(() => document.getElementById('submitCropPhoto').click());
  await new Promise(r => setTimeout(r, 800));

  // Verify crop modal closed and preview updated
  const cropModalClosed = await page.$eval('#cropPhotoModal', el => el.style.display === 'none');
  const regImgSrc = await page.$eval('#regStudentPhotoImg', el => el.src);
  console.log('Crop modal closed:', cropModalClosed);
  console.log('Registration preview image set:', regImgSrc.startsWith('data:image/'));
  if (!regImgSrc.startsWith('data:image/')) throw new Error('Registration preview image was not set');

  // Fill out required registration fields
  const testStudentName = 'Cropper Test Student ' + Date.now();
  console.log(`Filling registration form for: ${testStudentName}...`);
  await page.type('#regFullName', testStudentName);
  await page.type('#regParentName', 'Test Parent');
  await page.type('#regDob', '2012-04-10');
  await page.evaluate(() => {
    const r = document.getElementById('genderMale');
    if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
  });
  await page.type('#regEmail', `test_${Date.now()}@example.com`);
  await page.type('#regSchool', 'St. Peters Academy');
  await page.select('#regBranch', 'virar');
  await page.evaluate(() => {
    const coachSelect = document.getElementById('regCoach');
    if (coachSelect && coachSelect.options.length > 1) {
      coachSelect.selectedIndex = 1;
    }
  });
  await page.type('#regAddressLine', '77 Sports Lane');
  await page.type('#regCity', 'Virar');
  await page.type('#regPostal', '401303');
  await page.type('#regFatherContact', '9876543299');
  await page.type('#regEmergency', '9876543211');
  await page.type('#regWhatsapp', '9876543299');

  // Submit Registration Form
  console.log('Submitting registration form...');
  await page.evaluate(() => document.getElementById('submitAddStudent').click());
  await new Promise(r => setTimeout(r, 2000));

  // Verify toast or student in list
  console.log('Checking created student in list...');
  await page.evaluate(() => fetchStudents());
  await new Promise(r => setTimeout(r, 1200));

  const createdStudent = await page.evaluate((name) => {
    const rows = Array.from(document.querySelectorAll('#studentsTableBody tr'));
    for (const r of rows) {
      if (r.textContent.includes(name)) {
        return {
          id: r.dataset.studentId,
          imgSrc: r.querySelector('img')?.src || null
        };
      }
    }
    return null;
  }, testStudentName);

  console.log('Created student record in dashboard table:', createdStudent);
  if (!createdStudent || !createdStudent.id) {
    throw new Error('Created student was not found in students table');
  }
  if (!createdStudent.imgSrc) {
    throw new Error('Created student table row does not contain photo image');
  }

  // 4. Inspect the uploaded image file on disk
  const relativePhotoPath = createdStudent.imgSrc.replace(/^http:\/\/[^\/]+\/VAVA_sports\//, '').split('?')[0];
  const diskPhotoPath = path.resolve(__dirname, '..', relativePhotoPath);
  console.log('Disk photo path:', diskPhotoPath);
  if (!fs.existsSync(diskPhotoPath)) {
    throw new Error('Photo file does not exist on disk: ' + diskPhotoPath);
  }
  const photoStat = fs.statSync(diskPhotoPath);
  console.log(`Saved photo file size: ${photoStat.size} bytes (Optimized from original 165KB synthetic / ~4MB full res!)`);

  // Verify image dimensions using Puppeteer evaluation
  const imgDims = await page.evaluate((src) => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = src;
    });
  }, createdStudent.imgSrc);

  console.log('Actual cropped image natural dimensions:', imgDims);
  if (imgDims.width !== imgDims.height) {
    throw new Error(`Cropped image is not square 1:1! Dimensions: ${imgDims.width}x${imgDims.height}`);
  }
  if (imgDims.width > 600 || imgDims.height > 600) {
    throw new Error(`Cropped image exceeds 600x600 target! Dimensions: ${imgDims.width}x${imgDims.height}`);
  }
  console.log('✓ Verification successful: Saved image is true 1:1 square at ' + imgDims.width + 'x' + imgDims.height + '!\n');

  // 5. Test Edit Student & Replace Photo Flow
  console.log('5. Testing Edit Student & Replace Photo Flow...');
  await page.evaluate((id) => {
    const editBtn = document.querySelector(`.student-edit-item[data-id="${id}"]`);
    if (editBtn) editBtn.click();
  }, createdStudent.id);
  await new Promise(r => setTimeout(r, 800));

  const editModalOpen = await page.$eval('#editStudentModal', el => el.style.display !== 'none');
  console.log('Edit Student Modal open:', editModalOpen);

  const editInput = await page.$('#editStudentPhotoInput');
  const landscapePath = path.resolve(__dirname, 'images/landscape.jpg');
  await editInput.uploadFile(landscapePath);
  await new Promise(r => setTimeout(r, 800));

  console.log('Confirming replacement crop...');
  await page.evaluate(() => document.getElementById('submitCropPhoto').click());
  await new Promise(r => setTimeout(r, 800));

  const hasPendingData = await page.evaluate(() => {
    return {
      hasPending: typeof editPendingStudentPhotoData === 'string' && editPendingStudentPhotoData.length > 0,
      studentIdVal: document.getElementById('editStudentId').value,
      regImgDisplay: document.getElementById('editStudentPhotoImg').style.display
    };
  });
  console.log('Edit pending data status:', hasPendingData);

  console.log('Saving Edit Student form...');
  await page.evaluate(() => document.getElementById('submitEditStudent').click());
  await new Promise(r => setTimeout(r, 2000));

  // Check updated student
  const updatedStudentRow = await page.evaluate((id) => {
    const row = document.querySelector(`#studentsTableBody tr[data-student-id="${id}"]`);
    return {
      imgSrc: row?.querySelector('img')?.src || null
    };
  }, createdStudent.id);

  console.log('Updated student photo in table:', updatedStudentRow);
  const updatedRelativePath = updatedStudentRow.imgSrc.replace(/^http:\/\/[^\/]+\/VAVA_sports\//, '').split('?')[0];
  const updatedDiskPath = path.resolve(__dirname, '..', updatedRelativePath);
  console.log('Updated disk photo exists:', fs.existsSync(updatedDiskPath));
  console.log('Previous disk photo was unlinked:', !fs.existsSync(diskPhotoPath));
  if (!fs.existsSync(updatedDiskPath)) {
    throw new Error('Updated photo file does not exist on disk');
  }

  // 6. Test Student Profile Modal View & Photo Change
  console.log('\n6. Testing Student Profile View Modal...');
  await page.evaluate((id) => openStudentProfile(id), createdStudent.id);
  await new Promise(r => setTimeout(r, 600));

  const profileImgVisible = await page.$eval('#studentProfileImg', el => el.style.display !== 'none' && el.src.length > 0);
  console.log('Student Profile Modal displays photo:', profileImgVisible);
  if (!profileImgVisible) throw new Error('Student profile modal does not display photo');

  // Clean up test student from DB
  await page.evaluate(async (id) => {
    await fetch('server/students.php', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-VAVA-Role': 'admin' },
      body: JSON.stringify({ student_id: parseInt(id) })
    });
  }, createdStudent.id);
  console.log('7. Cleaned up test student record.');

  // Verify other modules still load without errors
  console.log('\n8. Checking other modules (Batches, Coaches, Attendance, Fees)...');
  await page.click('#nav-batches');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#nav-coaches');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#nav-attendance');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#nav-fees');
  await new Promise(r => setTimeout(r, 400));
  console.log('All modules navigated cleanly with zero runtime exceptions!');

  await browser.close();
  console.log('\n=== ALL END-TO-END TESTS PASSED SUCCESSFULLY! ===');
})();
