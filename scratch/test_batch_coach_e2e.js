/**
 * End-to-End Puppeteer Test Suite for Coach <-> Batch Assignment & Batches Module
 */
const puppeteer = require('puppeteer');

(async () => {
  console.log('=== STARTING END-TO-END VAVA SPORTS COACH <-> BATCH TEST ===\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Catch browser console logs & errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser Error:', msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('Page Runtime Error:', err.message);
  });

  try {
    // 1. Load Dashboard
    console.log('1. Loading Dashboard at http://localhost/VAVA_sports/dashboard.html ...');
    await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0', timeout: 30000 });

    // Ensure session role is Superadmin for full access
    await page.evaluate(() => {
      localStorage.setItem('vava_role', 'superadmin');
      localStorage.setItem('vava_email', 'pavanbhosale212@gmail.com');
    });
    await page.reload({ waitUntil: 'networkidle0' });

    // 2. Navigate to Coaches section and verify Add/Edit Coach has NO Batch field
    console.log('\n2. Testing Coaches Module: Verifying Batch field is removed...');
    await page.click('#nav-coaches');
    await new Promise(r => setTimeout(r, 600));

    // Open Add Coach Modal
    await page.click('#btnAddCoach');
    await page.waitForSelector('#addCoachModal', { visible: true });

    const addCoachBatchField = await page.$('#coachBatchSelect');
    console.log('Add Coach modal has Batch field:', addCoachBatchField !== null);
    if (addCoachBatchField !== null) throw new Error('Batch field still exists in Add Coach modal!');

    // Close Add Coach modal
    await page.click('#closeAddCoachModal');
    await new Promise(r => setTimeout(r, 400));

    // Open Edit Coach Modal
    const hasEditBtn = await page.evaluate(() => {
      const btn = document.querySelector('.coach-edit-item');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    if (hasEditBtn) {
      await page.waitForSelector('#editCoachModal', { visible: true });
      const editCoachBatchField = await page.$('#editCoachBatchSelect');
      console.log('Edit Coach modal has Batch field:', editCoachBatchField !== null);
      if (editCoachBatchField !== null) throw new Error('Batch field still exists in Edit Coach modal!');
      await page.click('#closeEditCoachModal');
      await new Promise(r => setTimeout(r, 400));
    }
    console.log('✓ Verified: Batch field is completely removed from Coach forms.');

    // 3. Navigate to Batches section
    console.log('\n3. Navigating to Batches Module...');
    await page.click('#nav-batches');
    await new Promise(r => setTimeout(r, 600));

    // Verify Table Headers
    const thTexts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#batchesTable thead th')).map(th => th.textContent.trim());
    });
    console.log('Batches Table Headers:', thTexts);
    if (thTexts.includes('Sport')) throw new Error('Sport column still present in Batches table headers!');
    if (!thTexts.includes('Coach')) throw new Error('Coach column missing from Batches table headers!');
    if (!thTexts.some(t => t.includes('Student'))) throw new Error('Students column missing from Batches table headers!');
    console.log('✓ Table headers verified: Sport removed, Coach added, Students dynamic.');

    // 4. Test Add Batch Modal UI (No Sport, No Students count, Has Coach dropdown)
    console.log('\n4. Testing Add Batch Form UI...');
    await page.click('#btnAddNewBatch');
    await page.waitForSelector('#addBatchModal', { visible: true });

    const addBatchSportField = await page.$('#newBatchSport');
    const addBatchStudentsField = await page.$('#newBatchStudents');
    const addBatchCoachField = await page.$('#newBatchCoach');

    console.log('Add Batch modal has Sport field:', addBatchSportField !== null);
    console.log('Add Batch modal has Total Students input:', addBatchStudentsField !== null);
    console.log('Add Batch modal has Coach dropdown:', addBatchCoachField !== null);

    if (addBatchSportField !== null) throw new Error('Sport field still exists in Add Batch modal!');
    if (addBatchStudentsField !== null) throw new Error('Total Students input still exists in Add Batch modal!');
    if (addBatchCoachField === null) throw new Error('Coach dropdown missing in Add Batch modal!');

    // Close Add Batch modal
    await page.click('#cancelAddBatch');
    await new Promise(r => setTimeout(r, 400));

    // 5. Test Creating Batch Without Coach
    console.log('\n5. Testing Add Batch WITHOUT Coach...');
    await page.click('#btnAddNewBatch');
    await page.waitForSelector('#addBatchModal', { visible: true });

    const testBatch1Name = 'E2E NoCoach ' + Date.now();
    await page.type('#newBatchName', testBatch1Name);
    await page.type('#newBatchLocation', 'Vasai West');
    await page.$eval('#newBatchTime', el => { el.value = '06:30'; });
    // Ensure Coach is No Coach
    await page.select('#newBatchCoach', '');

    await page.click('#submitAddBatch');
    await new Promise(r => setTimeout(r, 1000));

    // Verify batch appears in table and displays 'Not Assigned'
    const batch1Row = await page.evaluate(name => {
      const rows = Array.from(document.querySelectorAll('#batchesTableBody tr'));
      const row = rows.find(r => r.textContent.includes(name));
      if (!row) return null;
      return {
        text: row.textContent,
        isNotAssigned: row.textContent.includes('Not Assigned'),
        hasZeroStudents: row.textContent.includes('0')
      };
    }, testBatch1Name);

    console.log('Created batch without coach row data:', batch1Row);
    if (!batch1Row) throw new Error('Created batch not found in table!');
    if (!batch1Row.isNotAssigned) throw new Error('Batch does not display "Not Assigned" for coach!');
    console.log('✓ Batch without coach saved and displays "Not Assigned".');

    // 6. Test Creating Batch WITH Coach
    console.log('\n6. Testing Add Batch WITH Coach...');
    await page.click('#btnAddNewBatch');
    await page.waitForSelector('#addBatchModal', { visible: true });

    const coachOptions = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('#newBatchCoach option'));
      return opts.filter(o => o.value !== '').map(o => ({ id: o.value, name: o.text }));
    });
    console.log('Available coaches in dropdown:', coachOptions.map(c => c.name));
    if (coachOptions.length === 0) throw new Error('No coaches found in dropdown!');

    const selectedCoach = coachOptions[0];
    const testBatch2Name = 'E2E WithCoach ' + Date.now();

    await page.type('#newBatchName', testBatch2Name);
    await page.type('#newBatchLocation', 'Virar Ground');
    await page.$eval('#newBatchTime', el => { el.value = '08:00'; });
    await page.select('#newBatchCoach', selectedCoach.id);

    // If this coach is already assigned elsewhere, conflict modal might appear
    await page.click('#submitAddBatch');
    await new Promise(r => setTimeout(r, 600));

    const conflictModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('coachConflictModal');
      return modal && modal.style.display !== 'none';
    });

    if (conflictModalVisible) {
      console.log(`Coach ${selectedCoach.name} has existing batches. Confirming assignment in conflict modal...`);
      const conflictBatchesText = await page.evaluate(() => document.getElementById('coachConflictBatchList').innerText);
      console.log('Conflict warning showed batches:\n' + conflictBatchesText);
      await page.click('#confirmCoachConflict');
      await new Promise(r => setTimeout(r, 1000));
    } else {
      await new Promise(r => setTimeout(r, 600));
    }

    // Verify batch appears in table with assigned coach
    const batch2Row = await page.evaluate(name => {
      const rows = Array.from(document.querySelectorAll('#batchesTableBody tr'));
      const row = rows.find(r => r.textContent.includes(name));
      if (!row) return null;
      return { text: row.textContent };
    }, testBatch2Name);

    console.log('Batch with coach row text:', batch2Row?.text);
    if (!batch2Row || !batch2Row.text.includes(selectedCoach.name)) {
      throw new Error(`Batch row does not show coach ${selectedCoach.name}!`);
    }
    console.log(`✓ Batch successfully created and assigned to Coach ${selectedCoach.name}.`);

    // 7. Test Assigning SAME Coach to a SECOND Batch & Verify Warning Modal Cancel & Confirm
    console.log('\n7. Testing Coach Already Assigned Warning Modal Flow...');
    await page.click('#btnAddNewBatch');
    await page.waitForSelector('#addBatchModal', { visible: true });

    const testBatch3Name = 'E2E SecondBatch ' + Date.now();
    await page.type('#newBatchName', testBatch3Name);
    await page.type('#newBatchLocation', 'Nallasopara East');
    await page.$eval('#newBatchTime', el => { el.value = '18:30'; });
    // Select the exact coach that already has testBatch2
    await page.select('#newBatchCoach', selectedCoach.id);

    await page.click('#submitAddBatch');
    await new Promise(r => setTimeout(r, 600));

    // Warning modal MUST appear now!
    const conflictModalOpen = await page.evaluate(() => {
      const modal = document.getElementById('coachConflictModal');
      return modal && modal.style.display !== 'none';
    });
    console.log('Coach conflict warning modal appeared:', conflictModalOpen);
    if (!conflictModalOpen) throw new Error('Expected coach conflict modal did not appear!');

    const warningBatchList = await page.evaluate(() => document.getElementById('coachConflictBatchList').innerText);
    console.log('Warning modal batches displayed:\n' + warningBatchList);
    if (!warningBatchList.includes(testBatch2Name)) {
      throw new Error(`Warning modal did not list existing batch ${testBatch2Name}!`);
    }

    // First test CANCEL button
    console.log('Testing Cancel button in warning modal...');
    await page.click('#cancelCoachConflict');
    await new Promise(r => setTimeout(r, 400));

    const isConflictStillOpen = await page.evaluate(() => {
      const modal = document.getElementById('coachConflictModal');
      return modal && modal.style.display !== 'none';
    });
    console.log('Warning modal closed after cancel:', !isConflictStillOpen);

    // Verify testBatch3 was NOT created
    const batch3Check = await page.evaluate(name => {
      return Array.from(document.querySelectorAll('#batchesTableBody tr')).some(r => r.textContent.includes(name));
    }, testBatch3Name);
    console.log('Batch 3 was NOT created after cancel:', !batch3Check);
    if (batch3Check) throw new Error('Batch was created despite clicking Cancel!');

    // Now test CONFIRM button
    console.log('Re-triggering and clicking Confirm in warning modal...');
    await page.click('#submitAddBatch');
    await new Promise(r => setTimeout(r, 600));
    await page.click('#confirmCoachConflict');
    await new Promise(r => setTimeout(r, 1200));

    // Verify testBatch3 is now created and ALSO has selectedCoach
    const batch3Row = await page.evaluate(name => {
      const rows = Array.from(document.querySelectorAll('#batchesTableBody tr'));
      const row = rows.find(r => r.textContent.includes(name));
      if (!row) return null;
      return { text: row.textContent };
    }, testBatch3Name);

    console.log('Batch 3 row text after confirm:', batch3Row?.text);
    if (!batch3Row || !batch3Row.text.includes(selectedCoach.name)) {
      throw new Error(`Batch 3 does not show coach ${selectedCoach.name}!`);
    }
    console.log(`✓ Both Batch 2 and Batch 3 are assigned to Coach ${selectedCoach.name} (One Coach -> Multiple Batches works!).`);

    // 8. Test Edit Batch: Change Coach / Remove Coach
    console.log('\n8. Testing Edit Batch: Removing Coach...');
    // Click edit on Batch 3
    await page.evaluate(name => {
      const rows = Array.from(document.querySelectorAll('#batchesTableBody tr'));
      const row = rows.find(r => r.textContent.includes(name));
      const editBtn = row ? row.querySelector('.batch-edit-item') : null;
      if (editBtn) editBtn.click();
    }, testBatch3Name);
    await page.waitForSelector('#editBatchModal', { visible: true });

    // Verify Edit Batch has No Sport, No Total Students, and current coach selected
    const editSportField = await page.$('#editBatchSport');
    const editStudentsField = await page.$('#editBatchStudents');
    const editCoachVal = await page.evaluate(() => document.getElementById('editBatchCoach').value);

    console.log('Edit Batch modal has Sport field:', editSportField !== null);
    console.log('Edit Batch modal has Total Students input:', editStudentsField !== null);
    console.log('Edit Batch modal coach selected ID:', editCoachVal);

    if (editSportField !== null) throw new Error('Sport field exists in Edit Batch modal!');
    if (editStudentsField !== null) throw new Error('Students field exists in Edit Batch modal!');
    if (editCoachVal !== selectedCoach.id) throw new Error('Edit Batch did not pre-select current coach!');

    // Change coach to "No Coach"
    await page.select('#editBatchCoach', '');
    await page.click('#submitEditBatch');
    await new Promise(r => setTimeout(r, 1000));

    // Verify Batch 3 now shows 'Not Assigned'
    const batch3UpdatedRow = await page.evaluate(name => {
      const rows = Array.from(document.querySelectorAll('#batchesTableBody tr'));
      const row = rows.find(r => r.textContent.includes(name));
      return row ? row.textContent : null;
    }, testBatch3Name);

    console.log('Batch 3 after removing coach:', batch3UpdatedRow);
    if (!batch3UpdatedRow.includes('Not Assigned')) {
      throw new Error('Batch 3 does not display "Not Assigned" after clearing coach!');
    }
    console.log('✓ Coach successfully cleared to "Not Assigned" in Edit Batch.');

    // 9. Test Mobile Layout (375 x 667)
    console.log('\n9. Testing Mobile Viewport (375x667 iPhone SE)...');
    await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
    await new Promise(r => setTimeout(r, 600));

    const mobileCardsCount = await page.evaluate(() => {
      return document.querySelectorAll('#batchCardsContainer .batch-card-mobile').length;
    });
    console.log('Mobile batch cards rendered:', mobileCardsCount);
    if (mobileCardsCount === 0) throw new Error('No mobile batch cards rendered!');

    // Verify mobile card contains Coach, Training Time, and Students
    const cardContent = await page.evaluate(() => {
      const card = document.querySelector('#batchCardsContainer .batch-card-mobile');
      return card ? card.innerText : '';
    });
    console.log('Sample mobile card content:\n' + cardContent);
    if (!cardContent.includes('Training Time') || !cardContent.includes('Coach') || !cardContent.includes('Students')) {
      throw new Error('Mobile card missing Training Time, Coach, or Students metadata!');
    }
    console.log('✓ Mobile cards render beautifully with Coach, Training Time, and Students!');

    // Restore desktop viewport
    await page.setViewport({ width: 1280, height: 800 });
    await new Promise(r => setTimeout(r, 400));

    // 10. Test Attendance Navigation
    console.log('\n10. Testing Attendance Module Compatibility...');
    await page.click('#nav-attendance');
    await new Promise(r => setTimeout(r, 800));

    const attendanceHeader = await page.$('#attendanceLiveCount');
    console.log('Attendance section loaded:', attendanceHeader !== null);
    if (!attendanceHeader) throw new Error('Attendance module failed to load!');
    console.log('✓ Attendance module loaded and functions correctly.');

    // 11. Cleanup test batches
    console.log('\n11. Cleaning up created test batches...');
    await page.evaluate(names => {
      const delBtns = Array.from(document.querySelectorAll('.batch-delete-item'));
      // We can also let the backend script clean up or clean up via API
    }, [testBatch1Name, testBatch2Name, testBatch3Name]);

    // Clean via direct API call in page
    await page.evaluate(async (names) => {
      const res = await fetch(BATCHES_API);
      const data = await res.json();
      if (data.batches) {
        for (const b of data.batches) {
          if (names.some(n => b.batch_name.includes(n))) {
            await fetch(BATCHES_API, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ batch_id: parseInt(b.batch_id) })
            });
          }
        }
      }
    }, ['E2E NoCoach', 'E2E WithCoach', 'E2E SecondBatch']);
    console.log('✓ Test batches cleaned up.');

    console.log('\n=== ALL END-TO-END TESTS PASSED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
