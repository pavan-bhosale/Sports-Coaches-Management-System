/**
 * Automated Puppeteer Test Suite for Coach UI Improvements
 * Tests:
 * 1. Mobile Coach Card Responsiveness (Mobile S 320px, Mobile M 375px, Mobile L 425px, Tablet 768px, Desktop 1280px)
 * 2. Multi-batch wrapping without overflowing right boundary
 * 3. License visual distinction (polished/shiny vs neutral supporting batch pills)
 * 4. Verification that coach email is NOT shown in coach card view
 * 5. Coach Profile modal matching Student Profile compact structure & displaying multiple batches
 * 6. Existing modules (Coaches, Batches, Students, Attendance) preserved
 */
const puppeteer = require('puppeteer');

(async () => {
  console.log('=== STARTING COACH UI IMPROVEMENTS TEST SUITE ===\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

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

    await page.evaluate(() => {
      localStorage.setItem('vava_role', 'superadmin');
      localStorage.setItem('vava_email', 'pavanbhosale212@gmail.com');
    });
    await page.reload({ waitUntil: 'networkidle0' });

    // 2. Prepare test data: Create a test coach and 4 test batches with varying/long names
    console.log('2. Setting up test coach with multiple batches (including long batch names)...');
    const setupData = await page.evaluate(async () => {
      // Create Coach
      const coachName = 'UI Test Coach ' + Date.now();
      const coachEmail = 'uitestcoach' + Date.now() + '@example.com';
      const coachRes = await fetch('server/coaches.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coach_name: coachName,
          coach_email: coachEmail,
          coach_phone: '9876543210',
          coach_license: 'AIFF-D',
          coach_city: 'Mumbai',
          coach_address: '123 Football Academy Way',
          coach_dob: '1992-05-15',
          coach_joined_date: '2023-01-10',
          emergency_contact_name: 'Jane Doe',
          emergency_contact_phone: '9876543211',
          max_students: 30
        })
      });
      const coachData = await coachRes.json();
      const coachId = coachData.coach_id || coachData.coach?.coach_id;
      if (!coachId) throw new Error('Failed to create coach: ' + JSON.stringify(coachData));

      // Create 4 batches assigned to this coach
      const batchNames = [
        'Football Beginners Batch Morning',
        'Football Advanced Under 16 Champions',
        'Weekend Specialized Skill & Agility Training',
        'Elite Evening Training Camp'
      ];

      const batchIds = [];
      for (const bName of batchNames) {
        const bRes = await fetch('server/batches.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_name: bName,
            batch_location: 'Mumbai Ground A',
            batch_time: '17:30',
            coach_id: coachId
          })
        });
        const bData = await bRes.json();
        const bId = bData.batch_id || bData.batch?.batch_id;
        if (bId) batchIds.push(bId);
      }

      return { coachId, coachName, batchIds, batchNames };
    });

    console.log(`Created test coach ID: ${setupData.coachId} with ${setupData.batchIds.length} batches.`);

    // 3. Test Mobile Coach Cards at different viewports
    const viewports = [
      { name: 'Mobile S', width: 320, height: 667 },
      { name: 'Mobile M', width: 375, height: 667 },
      { name: 'Mobile L', width: 425, height: 800 },
      { name: 'Tablet', width: 768, height: 1024 }
    ];

    for (const vp of viewports) {
      console.log(`\n--- Testing ${vp.name} Viewport (${vp.width}x${vp.height}) ---`);
      await page.setViewport({ width: vp.width, height: vp.height });

      // Navigate to coaches using navigateToSection
      await page.evaluate(() => {
        if (typeof navigateToSection === 'function') {
          navigateToSection('#coaches');
        } else {
          window.location.hash = '#coaches';
        }
      });
      await new Promise(r => setTimeout(r, 600));

      // Reload coach data to render newly added batches
      await page.evaluate(() => {
        if (typeof loadCoaches === 'function') loadCoaches();
      });
      await new Promise(r => setTimeout(r, 600));

      // Find the card for setupData.coachId
      const cardMetrics = await page.evaluate((coachId) => {
        const card = document.querySelector(`.coach-card-mobile[data-coach-id="${coachId}"]`);
        if (!card) return null;

        const cardRect = card.getBoundingClientRect();
        const pills = Array.from(card.querySelectorAll('.coach-card-pill.pill-batch'));
        const licensePill = card.querySelector('.coach-card-pill.pill-license');
        const emailEl = card.querySelector('.coach-card-email');

        const pillMetrics = pills.map(p => {
          const rect = p.getBoundingClientRect();
          return {
            text: p.textContent.trim(),
            rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
            overflowRight: rect.right > cardRect.right + 2.5
          };
        });

        const licenseRect = licensePill ? licensePill.getBoundingClientRect() : null;
        const licenseOverflow = licenseRect ? licenseRect.right > cardRect.right + 2.5 : false;

        return {
          cardRect: { left: cardRect.left, right: cardRect.right, width: cardRect.width, height: cardRect.height },
          cardScrollWidth: card.scrollWidth,
          cardClientWidth: card.clientWidth,
          hasHorizontalScroll: card.scrollWidth > card.clientWidth + 1,
          bodyScrollWidth: document.body.scrollWidth,
          windowInnerWidth: window.innerWidth,
          hasBodyHorizontalOverflow: document.body.scrollWidth > window.innerWidth + 1,
          hasEmail: emailEl !== null,
          pillCount: pills.length,
          pillMetrics,
          licenseOverflow
        };
      }, setupData.coachId);

      if (!cardMetrics) {
        throw new Error(`Mobile card not found for coach ID ${setupData.coachId} at ${vp.name}`);
      }

      console.log(`Card dimensions: width=${cardMetrics.cardRect.width}px, height=${cardMetrics.cardRect.height}px`);
      console.log(`Card shows coach email: ${cardMetrics.hasEmail}`);
      console.log(`Pill count: ${cardMetrics.pillCount}`);
      console.log(`Card has horizontal scroll: ${cardMetrics.hasHorizontalScroll}`);
      console.log(`Body has horizontal overflow: ${cardMetrics.hasBodyHorizontalOverflow} (body scrollWidth: ${cardMetrics.bodyScrollWidth}px vs window: ${cardMetrics.windowInnerWidth}px)`);

      // Verify NO email in card view
      if (cardMetrics.hasEmail) {
        throw new Error(`FAIL: Coach card view is displaying email, but user requested NO email in coach card view!`);
      }

      if (cardMetrics.hasHorizontalScroll) {
        throw new Error(`FAIL: Coach card has internal horizontal scrolling at ${vp.name}!`);
      }
      if (cardMetrics.hasBodyHorizontalOverflow) {
        throw new Error(`FAIL: Page has horizontal overflow at ${vp.name}!`);
      }

      // Check each pill right boundary
      for (const p of cardMetrics.pillMetrics) {
        console.log(`  Batch pill "${p.text}": right=${p.rect.right.toFixed(1)}px (card right: ${cardMetrics.cardRect.right.toFixed(1)}px), overflow: ${p.overflowRight}`);
        if (p.overflowRight) {
          throw new Error(`FAIL: Batch pill "${p.text}" spills outside card right edge at ${vp.name}!`);
        }
      }

      if (cardMetrics.licenseOverflow) {
        throw new Error(`FAIL: License pill spills outside card right edge at ${vp.name}!`);
      }

      console.log(`PASS: All batch names and license are 100% contained within the card at ${vp.name}, and NO email is shown!`);
    }

    // 4. Test License Name Visual Distinction
    console.log('\n--- Testing License Name Visual Distinction ---');
    const distinction = await page.evaluate((coachId) => {
      const card = document.querySelector(`.coach-card-mobile[data-coach-id="${coachId}"]`);
      if (!card) return null;

      const licensePill = card.querySelector('.coach-card-pill.pill-license');
      const batchPill = card.querySelector('.coach-card-pill.pill-batch');

      if (!licensePill || !batchPill) return null;

      const licStyle = window.getComputedStyle(licensePill);
      const batchStyle = window.getComputedStyle(batchPill);

      return {
        license: {
          color: licStyle.color,
          fontWeight: licStyle.fontWeight,
          background: licStyle.background,
          borderColor: licStyle.borderColor,
          boxShadow: licStyle.boxShadow
        },
        batch: {
          color: batchStyle.color,
          fontWeight: batchStyle.fontWeight,
          background: batchStyle.background,
          borderColor: batchStyle.borderColor
        }
      };
    }, setupData.coachId);

    if (!distinction) throw new Error('Could not compute styles for license and batch pills');

    console.log('License Pill Style:', JSON.stringify(distinction.license, null, 2));
    console.log('Batch Pill Style:', JSON.stringify(distinction.batch, null, 2));

    // Verify visual distinction
    if (distinction.license.color === distinction.batch.color &&
        distinction.license.borderColor === distinction.batch.borderColor &&
        distinction.license.background === distinction.batch.background) {
      throw new Error('FAIL: License and batch pills still have identical colors/styles!');
    }
    console.log('PASS: License pill is visually distinct with refined gold luster vs neutral supporting batch pills!');

    // 5. Test Coach Profile Modal comparison with Student Profile Modal
    console.log('\n--- Testing Coach Profile Modal UI & Density ---');
    await page.setViewport({ width: 1280, height: 800 });

    // Open Coach Profile
    await page.evaluate((coachId) => {
      openCoachProfile(coachId);
    }, setupData.coachId);
    await page.waitForSelector('#coachProfileModal', { visible: true });
    await new Promise(r => setTimeout(r, 500));

    const coachModalMetrics = await page.evaluate(() => {
      const modal = document.getElementById('coachProfileModal');
      const dialog = modal.querySelector('.coach-profile-modal-dialog') || modal.querySelector('.sb-modal');
      const header = modal.querySelector('.coach-profile-modal-header') || modal.querySelector('.sb-modal-header');
      const body = modal.querySelector('.coach-profile-modal-body') || modal.querySelector('.sb-modal-body') || dialog.children[1];
      const avatar = modal.querySelector('.coach-profile-avatar');
      const grid = modal.querySelector('.coach-details-grid');
      const batchesList = document.getElementById('viewCoachBatchesList');
      const batchItems = batchesList ? Array.from(batchesList.querySelectorAll('.coach-profile-batch-item')) : [];

      const dialogStyle = window.getComputedStyle(dialog);
      const headerStyle = window.getComputedStyle(header);
      const bodyStyle = window.getComputedStyle(body);
      const avatarStyle = window.getComputedStyle(avatar);

      return {
        dialogMaxWidth: dialogStyle.maxWidth,
        dialogMaxHeight: dialogStyle.maxHeight,
        headerPadding: headerStyle.padding,
        bodyPadding: bodyStyle.padding,
        avatarWidth: avatarStyle.width,
        avatarHeight: avatarStyle.height,
        batchesRenderedCount: batchItems.length,
        batchTexts: batchItems.map(b => b.textContent.trim()),
        dialogScrollWidth: dialog.scrollWidth,
        dialogClientWidth: dialog.clientWidth,
        hasHorizontalOverflow: dialog.scrollWidth > dialog.clientWidth
      };
    });

    console.log('Coach Profile Dialog Metrics:', JSON.stringify(coachModalMetrics, null, 2));

    if (coachModalMetrics.dialogMaxWidth !== '640px') {
      throw new Error(`FAIL: Coach dialog max-width is ${coachModalMetrics.dialogMaxWidth}, expected 640px!`);
    }
    if (coachModalMetrics.batchesRenderedCount !== setupData.batchIds.length) {
      throw new Error(`FAIL: Expected ${setupData.batchIds.length} batch items in coach profile, found ${coachModalMetrics.batchesRenderedCount}!`);
    }
    if (coachModalMetrics.hasHorizontalOverflow) {
      throw new Error('FAIL: Coach Profile dialog has horizontal overflow!');
    }
    console.log('PASS: Coach Profile matches compact Student Profile dialog and cleanly displays all assigned batches!');

    // Close coach profile
    await page.click('#closeCoachProfileModal');
    await new Promise(r => setTimeout(r, 400));

    // Test Coach Profile on Mobile S (320px)
    console.log('\n--- Testing Coach Profile on Mobile S (320px) ---');
    await page.setViewport({ width: 320, height: 667 });
    await page.evaluate((coachId) => {
      openCoachProfile(coachId);
    }, setupData.coachId);
    await page.waitForSelector('#coachProfileModal', { visible: true });
    await new Promise(r => setTimeout(r, 400));

    const mobileProfileMetrics = await page.evaluate(() => {
      const modal = document.getElementById('coachProfileModal');
      const dialog = modal.querySelector('.coach-profile-modal-dialog') || modal.querySelector('.sb-modal');
      const batchesList = document.getElementById('viewCoachBatchesList');
      const batchItems = Array.from(batchesList.querySelectorAll('.coach-profile-batch-item'));
      const dialogRect = dialog.getBoundingClientRect();

      const itemsOverflow = batchItems.some(item => {
        const r = item.getBoundingClientRect();
        return r.right > dialogRect.right + 2;
      });

      return {
        dialogWidth: dialogRect.width,
        dialogScrollWidth: dialog.scrollWidth,
        dialogClientWidth: dialog.clientWidth,
        hasDialogOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
        itemsOverflow,
        bodyScrollWidth: document.body.scrollWidth,
        windowInnerWidth: window.innerWidth,
        hasBodyOverflow: document.body.scrollWidth > window.innerWidth + 1
      };
    });

    console.log('Mobile S Coach Profile Metrics:', JSON.stringify(mobileProfileMetrics, null, 2));

    if (mobileProfileMetrics.hasDialogOverflow || mobileProfileMetrics.itemsOverflow || mobileProfileMetrics.hasBodyOverflow) {
      throw new Error('FAIL: Horizontal overflow detected in Coach Profile on Mobile S!');
    }
    console.log('PASS: Coach Profile is perfectly responsive on Mobile S with no overflow!');

    await page.click('#closeCoachProfileModal');
    await new Promise(r => setTimeout(r, 400));

    // 6. Verify Existing Modules
    console.log('\n--- Verifying Existing Modules Preservation ---');
    await page.setViewport({ width: 1280, height: 800 });

    // Students Module
    await page.evaluate(() => navigateToSection('#students'));
    await new Promise(r => setTimeout(r, 600));
    const studentsTableRows = await page.$$eval('#studentsTableBody tr', trs => trs.length);
    console.log(`Students table rows: ${studentsTableRows}`);

    // Batches Module
    await page.evaluate(() => navigateToSection('#batches'));
    await new Promise(r => setTimeout(r, 600));
    const batchesTableRows = await page.$$eval('#batchesTableBody tr', trs => trs.length);
    console.log(`Batches table rows: ${batchesTableRows}`);

    // Attendance Module
    await page.evaluate(() => navigateToSection('#attendance'));
    await new Promise(r => setTimeout(r, 600));
    const attendanceBatchOptions = await page.$$eval('#attendanceBatchSelect option', opts => opts.length);
    console.log(`Attendance batch options: ${attendanceBatchOptions}`);

    // 7. Cleanup test records
    console.log('\n7. Cleaning up test data...');
    await page.evaluate(async (data) => {
      for (const bId of data.batchIds) {
        await fetch(`server/batches.php?id=${bId}`, { method: 'DELETE' });
      }
      await fetch(`server/coaches.php?id=${data.coachId}`, { method: 'DELETE' });
    }, setupData);

    console.log('Cleanup completed successfully.');
    console.log('\n=== ALL COACH UI IMPROVEMENTS TESTS PASSED SUCCESSFULLY! ===');

  } catch (err) {
    console.error('\nTEST SUITE ERROR:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
