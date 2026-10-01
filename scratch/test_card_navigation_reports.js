const puppeteer = require('puppeteer');

(async () => {
  console.log('================================================================');
  console.log('  VAVA SPORTS — DASHBOARD TO REPORTS NAVIGATION TEST SUITE       ');
  console.log('================================================================\n');

  let browser;
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
    }
  }

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 800 });

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Setup Superadmin session
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('vava_role', 'superadmin');
      localStorage.setItem('vava_email', 'pavanbhosale212@gmail.com');
      localStorage.setItem('vava_user', JSON.stringify({
        name: 'Super Admin',
        role: 'superadmin',
        email: 'pavanbhosale212@gmail.com'
      }));
    });

    console.log('1. Loading Dashboard Overview as Superadmin...');
    await page.goto('http://localhost/VAVA_sports/dashboard.html#overview', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#dashMainContent', { visible: true, timeout: 6000 });
    await new Promise(r => setTimeout(r, 1000));

    // Helper function to return to overview
    async function returnToOverview() {
      await page.evaluate(() => {
        if (typeof navigateToSection === 'function') navigateToSection('#overview', false);
        window.location.hash = '#overview';
      });
      await new Promise(r => setTimeout(r, 400));
      await page.waitForSelector('#overviewSection', { visible: true });
    }

    // --------------------------------------------------------------------------
    // TEST 1: Attendance Overview Card -> Attendance Report
    // --------------------------------------------------------------------------
    console.log('\n2. Testing Attendance Overview Card Click -> Attendance Report...');
    await page.waitForSelector('#panelAttendanceOverview', { visible: true });
    await page.click('#panelAttendanceOverview');
    await new Promise(r => setTimeout(r, 1200));

    // Verify destination is #reports
    const hashAfterAttClick = await page.evaluate(() => window.location.hash);
    const reportsSectionVisible = await page.evaluate(() => {
      const sec = document.getElementById('reportsSection');
      return sec && sec.style.display !== 'none';
    });
    assert(hashAfterAttClick === '#reports', `Hash navigated to #reports (actual: ${hashAfterAttClick})`);
    assert(reportsSectionVisible, 'Reports & Analytics section is visible');

    // Verify Attendance Report preview modal opened automatically
    const attModalState = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      const isVisible = modal && modal.style.display !== 'none';
      const title = document.getElementById('previewModalTitle')?.textContent.trim();
      const category = document.getElementById('previewModalCategory')?.textContent.trim();
      const tableRows = document.querySelectorAll('#previewTableBody tr').length;
      const countText = document.getElementById('previewTableCount')?.textContent.trim();
      const statusFilter = document.getElementById('filter_status');
      return {
        isVisible,
        title,
        category,
        tableRows,
        countText,
        hasStatusFilter: !!statusFilter
      };
    });

    console.log('  Attendance Report Modal State:', JSON.stringify(attModalState, null, 2));
    assert(attModalState.isVisible === true, 'Report Preview Modal is open');
    assert(attModalState.title === 'Attendance Report', `Report title is "Attendance Report" (found: "${attModalState.title}")`);
    assert(attModalState.category === 'ATTENDANCE', `Report category is ATTENDANCE (found: "${attModalState.category}")`);
    assert(attModalState.hasStatusFilter === true, 'Attendance report filter form rendered with status filter');
    assert(attModalState.tableRows > 0, `Attendance report rendered database records (rows: ${attModalState.tableRows})`);

    // Close modal
    await page.click('#closeReportPreviewModal');
    await new Promise(r => setTimeout(r, 400));
    const attModalClosed = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      return !modal || modal.style.display === 'none';
    });
    assert(attModalClosed, 'Attendance Report modal closed successfully');

    // --------------------------------------------------------------------------
    // TEST 2: Financial Collections Card -> Fees & Payments Report
    // --------------------------------------------------------------------------
    console.log('\n3. Testing Financial Collections Card Click -> Fees & Payments Report...');
    await returnToOverview();
    await page.waitForSelector('#panelFinancialOverview', { visible: true });
    await page.click('#panelFinancialOverview');
    await new Promise(r => setTimeout(r, 1200));

    const hashAfterFinClick = await page.evaluate(() => window.location.hash);
    const reportsSecAfterFin = await page.evaluate(() => {
      const sec = document.getElementById('reportsSection');
      return sec && sec.style.display !== 'none';
    });
    assert(hashAfterFinClick === '#reports', `Hash navigated to #reports (actual: ${hashAfterFinClick})`);
    assert(reportsSecAfterFin, 'Reports section visible for Fees Report');

    const finModalState = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      const isVisible = modal && modal.style.display !== 'none';
      const title = document.getElementById('previewModalTitle')?.textContent.trim();
      const category = document.getElementById('previewModalCategory')?.textContent.trim();
      const tableRows = document.querySelectorAll('#previewTableBody tr').length;
      const countText = document.getElementById('previewTableCount')?.textContent.trim();
      const methodFilter = document.getElementById('filter_payment_method');
      return {
        isVisible,
        title,
        category,
        tableRows,
        countText,
        hasMethodFilter: !!methodFilter
      };
    });

    console.log('  Financial Report Modal State:', JSON.stringify(finModalState, null, 2));
    assert(finModalState.isVisible === true, 'Fees & Payments Report modal is open');
    assert(finModalState.title === 'Fees & Payments Report', `Report title is "Fees & Payments Report" (found: "${finModalState.title}")`);
    assert(finModalState.category === 'FEES & PAYMENTS', `Report category is FEES & PAYMENTS (found: "${finModalState.category}")`);
    assert(finModalState.hasMethodFilter === true, 'Fees report filter form rendered with payment method filter');
    assert(finModalState.tableRows > 0, `Fees report loaded actual database records (rows: ${finModalState.tableRows})`);

    // Close modal
    await page.click('#closeReportPreviewModal');
    await new Promise(r => setTimeout(r, 400));

    // --------------------------------------------------------------------------
    // TEST 3: Manage Fees Explicit Link -> Fees & Payments Report
    // --------------------------------------------------------------------------
    console.log('\n4. Testing Manage Fees Explicit Link Click -> Fees & Payments Report...');
    await returnToOverview();
    await page.waitForSelector('#linkDashManageFees', { visible: true });
    await page.click('#linkDashManageFees');
    await new Promise(r => setTimeout(r, 1200));

    const linkFinModalState = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      const isVisible = modal && modal.style.display !== 'none';
      const title = document.getElementById('previewModalTitle')?.textContent.trim();
      return { isVisible, title };
    });
    assert(linkFinModalState.isVisible && linkFinModalState.title === 'Fees & Payments Report', 
      'Manage Fees link opens Fees & Payments Report');

    await page.click('#closeReportPreviewModal');
    await new Promise(r => setTimeout(r, 400));

    // --------------------------------------------------------------------------
    // TEST 4: Switching Between Reports Inside Reports & Analytics
    // --------------------------------------------------------------------------
    console.log('\n5. Testing Switching Between Reports...');
    await page.evaluate(() => {
      window.openReportPreview('attendance_report');
    });
    await new Promise(r => setTimeout(r, 600));
    let currentTitle = await page.evaluate(() => document.getElementById('previewModalTitle')?.textContent.trim());
    assert(currentTitle === 'Attendance Report', 'Opened Attendance Report directly');

    await page.evaluate(() => {
      window.openReportPreview('fees_payments');
    });
    await new Promise(r => setTimeout(r, 600));
    currentTitle = await page.evaluate(() => document.getElementById('previewModalTitle')?.textContent.trim());
    assert(currentTitle === 'Fees & Payments Report', 'Switched cleanly to Fees & Payments Report');

    await page.click('#closeReportPreviewModal');
    await new Promise(r => setTimeout(r, 400));

    // --------------------------------------------------------------------------
    // TEST 5: Preserve All Other Dashboard Navigation
    // --------------------------------------------------------------------------
    console.log('\n6. Testing Preservation of All Other Dashboard Destinations...');
    await returnToOverview();

    // KPI 1: Students -> #students
    await page.click('#cardKpiStudents');
    await new Promise(r => setTimeout(r, 500));
    let hash = await page.evaluate(() => window.location.hash);
    let secVisible = await page.evaluate(() => document.getElementById('studentsSection')?.style.display !== 'none');
    assert(hash === '#students' && secVisible, 'Total Students KPI -> #students');

    // KPI 2: Coaches -> #coaches
    await returnToOverview();
    await page.click('#cardKpiCoaches');
    await new Promise(r => setTimeout(r, 500));
    hash = await page.evaluate(() => window.location.hash);
    secVisible = await page.evaluate(() => document.getElementById('coachesSection')?.style.display !== 'none');
    assert(hash === '#coaches' && secVisible, 'Total Coaches KPI -> #coaches');

    // KPI 3: Batches -> #batches
    await returnToOverview();
    await page.click('#cardKpiBatches');
    await new Promise(r => setTimeout(r, 500));
    hash = await page.evaluate(() => window.location.hash);
    secVisible = await page.evaluate(() => document.getElementById('batchesSection')?.style.display !== 'none');
    assert(hash === '#batches' && secVisible, 'Total Batches KPI -> #batches');

    // KPI 4: Today's Attendance -> #attendance
    await returnToOverview();
    await page.click('#cardKpiAttendance');
    await new Promise(r => setTimeout(r, 500));
    hash = await page.evaluate(() => window.location.hash);
    secVisible = await page.evaluate(() => document.getElementById('attendanceSection')?.style.display !== 'none');
    assert(hash === '#attendance' && secVisible, "Today's Attendance KPI -> #attendance");

    // Active Batches Panel -> #batches
    await returnToOverview();
    await page.click('#panelBatchesOverview');
    await new Promise(r => setTimeout(r, 500));
    hash = await page.evaluate(() => window.location.hash);
    secVisible = await page.evaluate(() => document.getElementById('batchesSection')?.style.display !== 'none');
    assert(hash === '#batches' && secVisible, 'Active Training Batches Panel -> #batches');

    // View All Batches Link -> #batches
    await returnToOverview();
    await page.click('#linkDashViewBatches');
    await new Promise(r => setTimeout(r, 500));
    hash = await page.evaluate(() => window.location.hash);
    secVisible = await page.evaluate(() => document.getElementById('batchesSection')?.style.display !== 'none');
    assert(hash === '#batches' && secVisible, 'View All Batches link -> #batches');

    // Recent Activity Panel -> Activity Report
    await returnToOverview();
    await page.click('#panelActivityOverview');
    await new Promise(r => setTimeout(r, 1000));
    let actTitle = await page.evaluate(() => document.getElementById('previewModalTitle')?.textContent.trim());
    assert(actTitle === 'Activity Report', 'Recent Academy Activity Panel -> Reports (Activity Report)');
    await page.click('#closeReportPreviewModal');
    await new Promise(r => setTimeout(r, 400));

    // Full Audit Link -> Activity Report
    await returnToOverview();
    await page.click('#linkDashFullAudit');
    await new Promise(r => setTimeout(r, 1000));
    actTitle = await page.evaluate(() => document.getElementById('previewModalTitle')?.textContent.trim());
    assert(actTitle === 'Activity Report', 'Full Audit link -> Reports (Activity Report)');
    await page.click('#closeReportPreviewModal');
    await new Promise(r => setTimeout(r, 400));

    // --------------------------------------------------------------------------
    // TEST 6: Coach Role Permission Protection
    // --------------------------------------------------------------------------
    console.log('\n7. Testing Coach Role Permissions Protection...');
    const coachPage = await browser.newPage();
    await coachPage.setViewport({ width: 1366, height: 800 });

    await coachPage.evaluateOnNewDocument(() => {
      localStorage.setItem('vava_role', 'coach');
      localStorage.setItem('vava_coach_id', '100');
      localStorage.setItem('vava_email', 'coach@vavasports.com');
      localStorage.setItem('vava_user', JSON.stringify({
        name: 'Rajesh Coach',
        role: 'coach',
        coach_id: 100,
        email: 'coach@vavasports.com'
      }));
    });

    await coachPage.goto('http://localhost/VAVA_sports/dashboard.html#overview', { waitUntil: 'networkidle2' });
    await coachPage.waitForSelector('#dashMainContent', { visible: true, timeout: 12000 });

    // Financial panel should be hidden for coaches
    const coachFinVisible = await coachPage.evaluate(() => {
      const p = document.getElementById('panelFinancialOverview');
      return p && p.style.display !== 'none' && window.getComputedStyle(p).display !== 'none';
    });
    assert(!coachFinVisible, 'Financial Collections panel is not displayed for Coach');

    // If Coach attempts to open Fees & Payments report programmatically or via URL
    const coachAttemptResult = await coachPage.evaluate(async () => {
      if (typeof initReportsModule === 'function') await initReportsModule();
      if (typeof openReportPreview === 'function') {
        await openReportPreview('fees_payments');
      }
      const modal = document.getElementById('reportPreviewModal');
      return modal && modal.style.display !== 'none';
    });
    assert(coachAttemptResult === false, 'Coach is BLOCKED from opening Fees & Payments Report');

    // But Coach CAN open Attendance Report
    const coachAttResult = await coachPage.evaluate(async () => {
      await openReportPreview('attendance_report');
      const modal = document.getElementById('reportPreviewModal');
      const title = document.getElementById('previewModalTitle')?.textContent.trim();
      return modal && modal.style.display !== 'none' && title === 'Attendance Report';
    });
    assert(coachAttResult === true, 'Coach CAN legitimately open Attendance Report');
    await coachPage.close();

    // --------------------------------------------------------------------------
    // TEST 7: Mobile Responsiveness Verification
    // --------------------------------------------------------------------------
    console.log('\n8. Testing on Mobile Viewport (375x667)...');
    await page.setViewport({ width: 375, height: 667 });
    await returnToOverview();
    await page.waitForSelector('#panelAttendanceOverview', { visible: true });
    await page.click('#panelAttendanceOverview');
    await new Promise(r => setTimeout(r, 1200));

    const mobileModalVisible = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      return modal && modal.style.display !== 'none';
    });
    assert(mobileModalVisible, 'Attendance Report opens smoothly on mobile');
    await page.click('#closeReportPreviewModal');
    await new Promise(r => setTimeout(r, 400));

    // Check console errors
    console.log('\n9. Checking Console Errors...');
    assert(consoleErrors.length === 0, `No console errors encountered (found: ${consoleErrors.length})`);
    if (consoleErrors.length > 0) {
      console.log('Console Errors:', consoleErrors);
    }

    console.log(`\n==================================================`);
    console.log(`FINAL RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log(`==================================================\n`);

    if (passedTests === totalTests) {
      console.log('ALL TESTS PASSED SUCCESSFULLY!');
    } else {
      console.error(`FAILED: ${totalTests - passedTests} test(s) failed`);
      process.exitCode = 1;
    }

  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
