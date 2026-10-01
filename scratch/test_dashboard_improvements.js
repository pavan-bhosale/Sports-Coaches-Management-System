const puppeteer = require('puppeteer');
const http = require('http');

async function apiGet(headers = {}, params = '') {
  return new Promise((resolve, reject) => {
    const url = `http://localhost/VAVA_sports/server/dashboard.php${params}`;
    const req = http.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('  VAVA SPORTS — DASHBOARD IMPROVEMENTS & NAVIGATION TEST SUITE  ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: ATTENDANCE TREND — LATEST 7 ACTIVE ATTENDANCE DATES
  // --------------------------------------------------------------------------
  console.log('--- 1. Attendance Trend: Latest 7 Active Dates Verification ---');

  const adminApi = await apiGet({
    'X-VAVA-Role': 'superadmin',
    'X-VAVA-Email': 'admin@vavasports.com'
  });

  assert(adminApi.status === 200, 'Super Admin API returned HTTP 200');
  const trendData = adminApi.data?.data?.attendance?.seven_day_trend || [];
  assert(trendData.length > 0 && trendData.length <= 7, `Super Admin trend returned ${trendData.length} active dates`);
  console.log('   Super Admin Attendance Trend Dates:', trendData.map(d => `${d.date} (${d.date_formatted}) - Pres:${d.present}, Abs:${d.absent}`));

  // Verify chronological ordering (oldest to newest ASC)
  let isSortedAsc = true;
  for (let i = 1; i < trendData.length; i++) {
    if (new Date(trendData[i].date) <= new Date(trendData[i - 1].date)) {
      isSortedAsc = false;
      break;
    }
  }
  assert(isSortedAsc, 'Attendance dates are sorted chronologically ASC (oldest to newest)');

  // Verify all returned dates have actual records (present + absent > 0 or total > 0)
  const allHaveRecords = trendData.every(d => (d.present + d.absent) > 0);
  assert(allHaveRecords, 'Every date in the trend contains actual attendance records (no zero-valued phantom calendar days)');

  // Verify readable label format (e.g. 'Sep 16', 'Oct 28')
  const dateFormattedPattern = /^[A-Z][a-z]{2} \d{1,2}$/;
  const labelsWellFormatted = trendData.every(d => dateFormattedPattern.test(d.date_formatted));
  assert(labelsWellFormatted, 'Trend date labels are properly formatted (e.g. "Sep 16", "Oct 28")');

  // Verify Coach Scoped Attendance Trend
  const coachApi = await apiGet({
    'X-VAVA-Role': 'coach',
    'X-VAVA-Email': 'coach@vavasports.com',
    'X-VAVA-Coach-ID': '100'
  });
  const coachTrend = coachApi.data?.data?.attendance?.seven_day_trend || [];
  console.log('   Coach (ID 100) Attendance Trend Dates:', coachTrend.map(d => `${d.date} (${d.date_formatted}) - Pres:${d.present}, Abs:${d.absent}`));
  assert(coachTrend.length <= 7, `Coach trend returned ${coachTrend.length} active dates for assigned batches`);
  assert(coachApi.data?.data?.financial === undefined, 'Zero financial exposure in Coach API');

  // --------------------------------------------------------------------------
  // TEST 2: BROWSER E2E TESTS (Puppeteer)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Browser E2E: Welcome Section, Clickable Navigation & Modals ---');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Setup Super Admin session
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('vava_role', 'superadmin');
    localStorage.setItem('vava_email', 'pavanbhosale212@gmail.com');
    localStorage.setItem('vava_user', JSON.stringify({
      name: 'Super Admin Test',
      role: 'superadmin',
      email: 'pavanbhosale212@gmail.com'
    }));
  });

  await page.goto('http://localhost/VAVA_sports/dashboard.html#overview', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#dashMainContent', { visible: true, timeout: 5000 });

  // 2.1 Welcome Section Verification
  console.log('\n--- 2.1 Welcome Section ---');
  const takeAttendanceBtn = await page.$('#btnDashTakeAttendance');
  assert(takeAttendanceBtn === null, 'Take Attendance button is REMOVED from Super Admin Welcome Back section');

  const addStudentBtn = await page.$('#btnDashAddStudent');
  const addCoachBtn = await page.$('#btnDashAddCoach');
  const addBatchBtn = await page.$('#btnDashAddBatch');
  assert(addStudentBtn !== null, 'Add Student button exists in Welcome Back section');
  assert(addCoachBtn !== null, 'Add Coach button exists in Welcome Back section');
  assert(addBatchBtn !== null, 'Add Batch button exists in Welcome Back section');

  // Verify Add Student opens modal
  await page.click('#btnDashAddStudent');
  await page.waitForSelector('#addStudentModal', { visible: true });
  assert(await page.$eval('#addStudentModal', el => window.getComputedStyle(el).display === 'flex'), 'Add Student button opens addStudentModal');
  await page.click('#closeAddStudentModal');
  await page.waitForFunction(() => {
    const el = document.getElementById('addStudentModal');
    return !el || window.getComputedStyle(el).display === 'none';
  });

  // 2.2 Clickable Navigation Hub Verification
  console.log('\n--- 2.2 Clickable Navigation Hub ---');

  async function returnToOverview() {
    await page.evaluate(() => {
      if (typeof navigateToSection === 'function') navigateToSection('#overview', false);
      window.location.hash = '#overview';
    });
    await new Promise(r => setTimeout(r, 600));
    await page.waitForFunction(() => {
      const el = document.getElementById('overviewSection');
      const mc = document.getElementById('dashMainContent');
      return el && window.getComputedStyle(el).display !== 'none' &&
             mc && window.getComputedStyle(mc).display !== 'none';
    });
  }

  // Helper to test card navigation
  async function testCardNav(cardSelector, expectedSection, name) {
    await returnToOverview();
    await page.waitForSelector(cardSelector, { visible: true });
    await page.click(cardSelector);
    await new Promise(r => setTimeout(r, 600));

    const isVisible = await page.$eval(`#${expectedSection.replace('#', '')}Section`, el => window.getComputedStyle(el).display !== 'none');
    const hash = await page.evaluate(() => window.location.hash);
    assert(isVisible && hash === expectedSection, `Card "${name}" (${cardSelector}) navigates to ${expectedSection}`);
  }

  // 1. KPI 1: Students -> #students
  await testCardNav('#cardKpiStudents', '#students', 'Total Students KPI');

  // 2. KPI 2: Coaches -> #coaches (Admin)
  await testCardNav('#cardKpiCoaches', '#coaches', 'Total Coaches KPI');

  // 3. KPI 3: Batches -> #batches (Admin)
  await testCardNav('#cardKpiBatches', '#batches', 'Total Batches KPI');

  // 4. KPI 4: Attendance -> #attendance
  await testCardNav('#cardKpiAttendance', '#attendance', "Today's Attendance KPI");

  // 5. Attendance Overview panel -> #attendance
  await testCardNav('#panelAttendanceOverview', '#attendance', 'Attendance Overview Panel');

  // 6. Financial Overview panel -> #fees
  await testCardNav('#panelFinancialOverview', '#fees', 'Financial Collections Panel');

  // 7. Manage Fees explicit link -> #fees
  await returnToOverview();
  await page.waitForSelector('#linkDashManageFees', { visible: true });
  await page.click('#linkDashManageFees');
  await new Promise(r => setTimeout(r, 600));
  const feesSecVisible = await page.$eval('#feesSection', el => window.getComputedStyle(el).display !== 'none');
  const feesHash = await page.evaluate(() => window.location.hash);
  assert(feesSecVisible && feesHash === '#fees', 'Manage Fees link navigates to #fees');

  // 8. Active Batches Overview panel -> #batches
  await testCardNav('#panelBatchesOverview', '#batches', 'Active Training Batches Panel');

  // 9. View All Batches explicit link -> #batches
  await returnToOverview();
  await page.waitForSelector('#linkDashViewBatches', { visible: true });
  await page.click('#linkDashViewBatches');
  await new Promise(r => setTimeout(r, 600));
  const batchesSecVisible = await page.$eval('#batchesSection', el => window.getComputedStyle(el).display !== 'none');
  const batchesHash = await page.evaluate(() => window.location.hash);
  assert(batchesSecVisible && batchesHash === '#batches', 'View All Batches link navigates to #batches');

  // 10. Recent Academy Activity panel -> Activity Report
  await returnToOverview();
  await page.waitForSelector('#panelActivityOverview', { visible: true });
  await page.click('#panelActivityOverview');
  await new Promise(r => setTimeout(r, 1000));
  const modalOpenOnPanelClick = await page.$eval('#reportPreviewModal', el => window.getComputedStyle(el).display !== 'none');
  const modalTitleOnPanelClick = await page.$eval('#previewModalTitle', el => el.textContent.trim());
  assert(modalOpenOnPanelClick && modalTitleOnPanelClick.includes('Activity Report'), 'Recent Academy Activity panel navigates to Reports & opens Activity Report preview modal');
  // Close preview modal
  await page.click('#closeReportPreviewModal');
  await page.waitForFunction(() => document.getElementById('reportPreviewModal').style.display === 'none');

  // 11. Full Audit explicit link -> Activity Report
  await returnToOverview();
  await page.waitForSelector('#linkDashFullAudit', { visible: true });
  await page.click('#linkDashFullAudit');
  await new Promise(r => setTimeout(r, 1000));
  const modalOpenOnAuditLink = await page.$eval('#reportPreviewModal', el => window.getComputedStyle(el).display !== 'none');
  assert(modalOpenOnAuditLink, 'Full Audit link directly opens Activity Report modal');
  await page.click('#closeReportPreviewModal');
  await page.waitForFunction(() => document.getElementById('reportPreviewModal').style.display === 'none');

  // 12. Chart Legend Interaction does NOT cause navigation away
  console.log('\n--- 2.3 Chart Legend Click Verification ---');
  await returnToOverview();
  await page.waitForFunction(() => document.getElementById('overviewSection').style.display !== 'none');

  // Click on chart legend (top of canvas)
  const canvasRect = await page.$eval('#dashAttendanceChart', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

  const legendHitBox = await page.evaluate(() => {
    const canvas = document.getElementById('dashAttendanceChart');
    const chart = Chart.getChart(canvas);
    return chart?.legend?.legendHitBoxes?.[0] || null;
  });

  if (legendHitBox) {
    const clickX = canvasRect.x + legendHitBox.left + (legendHitBox.width / 2);
    const clickY = canvasRect.y + legendHitBox.top + (legendHitBox.height / 2);
    await page.mouse.click(clickX, clickY);
  } else {
    await page.mouse.click(canvasRect.x + canvasRect.width / 2, canvasRect.y + 16);
  }
  await new Promise(r => setTimeout(r, 500));
  const currentSectionAfterLegend = await page.evaluate(() => window.location.hash);
  const overviewStillVisible = await page.$eval('#overviewSection', el => window.getComputedStyle(el).display !== 'none');
  assert(overviewStillVisible && (currentSectionAfterLegend === '#overview' || currentSectionAfterLegend === ''), 'Clicking chart legend toggles dataset without navigating away from Overview');

  // Also verify clicking on chart body outside legend navigates to #attendance
  await returnToOverview();
  await page.mouse.click(canvasRect.x + 200, canvasRect.y + 150);
  await new Promise(r => setTimeout(r, 600));
  const attSecVisibleFromChart = await page.$eval('#attendanceSection', el => window.getComputedStyle(el).display !== 'none');
  assert(attSecVisibleFromChart, 'Clicking on Attendance chart body navigates to #attendance');

  // --------------------------------------------------------------------------
  // TEST 3: COACH ROLE VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Coach Role Security & Navigation Verification ---');
  const coachBrowserPage = await browser.newPage();
  await coachBrowserPage.setViewport({ width: 1440, height: 900 });

  await coachBrowserPage.evaluateOnNewDocument(() => {
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

  await coachBrowserPage.goto('http://localhost/VAVA_sports/dashboard.html#overview', { waitUntil: 'networkidle2' });
  await coachBrowserPage.waitForSelector('#dashMainContent', { visible: true, timeout: 5000 });

  // Coach Welcome section retains Take Attendance
  const coachTakeAttBtn = await coachBrowserPage.$('#btnDashCoachTakeAttendance');
  assert(coachTakeAttBtn !== null, 'Coach retains "Take Attendance" quick action in Welcome section');
  const coachTakeAttVisible = await coachBrowserPage.$eval('#btnDashCoachTakeAttendance', el => window.getComputedStyle(el).display !== 'none');
  assert(coachTakeAttVisible, 'Coach "Take Attendance" button is visible for Coach role');

  // Financial panel hidden
  const coachFinPanelDisplay = await coachBrowserPage.$eval('#panelFinancialOverview', el => window.getComputedStyle(el).display);
  assert(coachFinPanelDisplay === 'none', 'Financial Collections panel is completely HIDDEN for Coach');

  // Coach KPI 2 ("MY BATCHES") -> #batches
  await coachBrowserPage.click('#cardKpiCoaches');
  await coachBrowserPage.waitForFunction(() => document.getElementById('batchesSection').style.display !== 'none');
  assert(await coachBrowserPage.evaluate(() => window.location.hash === '#batches'), 'Coach KPI 2 (My Batches) navigates to #batches');

  // Coach KPI 3 ("TODAY'S SESSIONS") -> #attendance
  await coachBrowserPage.evaluate(() => navigateToSection('#overview', false));
  await coachBrowserPage.waitForFunction(() => document.getElementById('overviewSection').style.display !== 'none');
  await coachBrowserPage.click('#cardKpiBatches');
  await coachBrowserPage.waitForFunction(() => document.getElementById('attendanceSection').style.display !== 'none');
  assert(await coachBrowserPage.evaluate(() => window.location.hash === '#attendance'), "Coach KPI 3 (Today's Sessions) navigates to #attendance");

  // Coach cannot navigate to #fees
  await coachBrowserPage.evaluate(() => {
    if (typeof navigateToSection === 'function') navigateToSection('#fees', false);
  });
  await new Promise(r => setTimeout(r, 400));
  const redirectedToOverview = await coachBrowserPage.evaluate(() => {
    const feesVisible = window.getComputedStyle(document.getElementById('feesSection')).display !== 'none';
    const hash = window.location.hash;
    return !feesVisible && (hash === '#overview' || hash === '');
  });
  assert(redirectedToOverview, 'Coach cannot navigate to #fees (correctly blocked and redirected to #overview)');

  // --------------------------------------------------------------------------
  // TEST 4: RESPONSIVE TESTING ACROSS ALL 7 VIEWPORT WIDTHS
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Responsive Verification Across All 7 Required Viewports ---');

  const viewports = [
    { name: 'Small mobile', width: 320, height: 600 },
    { name: 'Standard mobile', width: 375, height: 667 },
    { name: 'Large mobile', width: 430, height: 932 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Small laptop', width: 1024, height: 768 },
    { name: 'Desktop', width: 1366, height: 768 },
    { name: 'Large desktop', width: 1920, height: 1080 }
  ];

  await page.evaluate(() => navigateToSection('#overview', false));
  await page.waitForFunction(() => document.getElementById('overviewSection').style.display !== 'none');

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 300));

    const metrics = await page.evaluate(() => {
      const docEl = document.documentElement;
      const mainContent = document.getElementById('dashMainContent');
      return {
        windowWidth: window.innerWidth,
        scrollWidth: docEl.scrollWidth,
        contentWidth: mainContent ? mainContent.scrollWidth : 0
      };
    });

    const noOverflow = metrics.scrollWidth <= metrics.windowWidth;
    assert(noOverflow, `${vp.name} (${vp.width}px): Zero horizontal overflow (scrollWidth: ${metrics.scrollWidth}px <= ${metrics.windowWidth}px)`);
  }

  // --------------------------------------------------------------------------
  // FINAL CONSOLE ERROR CHECK
  // --------------------------------------------------------------------------
  const criticalErrors = consoleErrors.filter(err => !err.includes('favicon'));
  assert(criticalErrors.length === 0, `Zero critical console errors logged during entire test run (found: ${criticalErrors.length})`);
  if (criticalErrors.length > 0) {
    console.error('Console errors:', criticalErrors);
  }

  await browser.close();

  console.log('\n================================================================');
  console.log(`  FINAL VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
