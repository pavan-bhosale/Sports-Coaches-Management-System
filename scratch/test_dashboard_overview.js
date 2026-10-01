const puppeteer = require('puppeteer');
const http = require('http');

async function runTests() {
  console.log('====================================================');
  console.log('  VAVA SPORTS DASHBOARD OVERVIEW VERIFICATION SUITE');
  console.log('====================================================\n');

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
  // TEST 1: API Endpoint Role-Based Access Control & Schema Verification
  // --------------------------------------------------------------------------
  console.log('\n--- 1. API Verification (server/dashboard.php) ---');

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

  // 1a. Super Admin
  const adminRes = await apiGet({
    'X-VAVA-Role': 'superadmin',
    'X-VAVA-Email': 'admin@vavasports.com'
  });

  assert(adminRes.status === 200, 'Super Admin API returns HTTP 200');
  assert(adminRes.data && adminRes.data.success === true, 'Super Admin API success is true');
  assert(adminRes.data.data.role === 'superadmin', 'Super Admin role returned is superadmin');
  assert(adminRes.data.data.kpis.students.total > 0, `Total Students > 0 (${adminRes.data.data.kpis.students.total})`);
  assert(adminRes.data.data.kpis.coaches.total > 0, `Total Coaches > 0 (${adminRes.data.data.kpis.coaches.total})`);
  assert(adminRes.data.data.kpis.batches.total > 0, `Total Batches > 0 (${adminRes.data.data.kpis.batches.total})`);
  assert(adminRes.data.data.attendance !== undefined, 'Attendance object present');
  assert(adminRes.data.data.financial !== undefined, 'Financial object present for Super Admin');
  assert(adminRes.data.data.financial.collected_this_month !== undefined, `Financial collected this month: ₹${adminRes.data.data.financial.collected_this_month}`);
  assert(adminRes.data.data.financial.total_outstanding !== undefined, `Financial outstanding: ₹${adminRes.data.data.financial.total_outstanding}`);
  assert(adminRes.data.data.financial.total_overdue !== undefined, `Financial overdue: ₹${adminRes.data.data.financial.total_overdue}`);
  assert(adminRes.data.data.financial.six_month_trend.length === 6, 'Financial 6-month trend contains 6 months');
  assert(adminRes.data.data.batches.list.length > 0, `Active Batches list populated (${adminRes.data.data.batches.list.length} batches)`);
  assert(adminRes.data.data.recent_activity.list.length > 0, `Recent Activity populated (${adminRes.data.data.recent_activity.list.length} items)`);
  assert(adminRes.data.data.recent_activity.list.length <= 8, 'Recent Activity capped at 8 records');

  // 1b. Coach Access
  const coachRes = await apiGet({
    'X-VAVA-Role': 'coach',
    'X-VAVA-Email': 'coach@vavasports.com',
    'X-VAVA-Coach-ID': '100'
  });

  assert(coachRes.status === 200, 'Coach API returns HTTP 200');
  assert(coachRes.data && coachRes.data.success === true, 'Coach API success is true');
  assert(coachRes.data.data.role === 'coach', 'Coach role returned is coach');
  assert(coachRes.data.data.financial === undefined, 'CRITICAL: Financial data is COMPLETELY OMITTED for Coach');
  assert(coachRes.data.data.batches.list.every(b => b.coach_id == 100), 'Coach batches list contains only assigned batches (coach_id=100)');

  // 1c. Student Access
  const studentRes = await apiGet({
    'X-VAVA-Role': 'student',
    'X-VAVA-Email': 'student@vavasports.com'
  });

  assert(studentRes.status === 403, 'Student API returns HTTP 403 Forbidden');
  assert(studentRes.data && studentRes.data.success === false, 'Student API success is false');

  // --------------------------------------------------------------------------
  // TEST 2: Browser E2E Rendering, Charts & Navigation
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Browser E2E Verification (Puppeteer) ---');

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

  // 2a. Super Admin View
  console.log('\n--- Testing Super Admin View ---');
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('vava_role', 'superadmin');
    localStorage.setItem('vava_email', 'admin@vavasports.com');
    localStorage.setItem('vava_user', JSON.stringify({
      name: 'Super Admin Test',
      role: 'superadmin',
      email: 'admin@vavasports.com'
    }));
  });

  await page.goto('http://localhost/VAVA_sports/dashboard.html#overview', { waitUntil: 'networkidle2' });

  // Wait for #dashMainContent to be visible
  await page.waitForSelector('#dashMainContent', { visible: true, timeout: 5000 });

  const welcomeText = await page.$eval('#dashWelcomeName', el => el.textContent.trim());
  assert(welcomeText.length > 0, `Welcome message rendered correctly: "${welcomeText}"`);

  const studentCount = await page.$eval('#dashKpiStudentsTotal', el => el.textContent.trim());
  assert(parseInt(studentCount) > 0, `Total Students KPI rendered: ${studentCount}`);

  const coachCount = await page.$eval('#dashKpiCoachesTotal', el => el.textContent.trim());
  assert(parseInt(coachCount) > 0, `Total Coaches KPI rendered: ${coachCount}`);

  const batchCount = await page.$eval('#dashKpiBatchesTotal', el => el.textContent.trim());
  assert(parseInt(batchCount) > 0, `Total Batches KPI rendered: ${batchCount}`);

  const finPanelDisplay = await page.$eval('#panelFinancialOverview', el => window.getComputedStyle(el).display);
  assert(finPanelDisplay !== 'none', 'Financial Overview panel is visible for Super Admin');

  const finCollected = await page.$eval('#dashFinCollected', el => el.textContent.trim());
  assert(finCollected.startsWith('₹'), `Collected amount formatted with ₹: ${finCollected}`);

  const batchRows = await page.$$eval('#dashBatchTableBody tr', rows => rows.length);
  assert(batchRows > 0, `Batches table rendered with ${batchRows} rows`);

  const activityItems = await page.$$eval('#dashActivityTimeline .dash-activity-item', items => items.length);
  assert(activityItems > 0, `Recent activity timeline rendered with ${activityItems} items`);

  // Verify Admin quick action buttons visible, Coach quick actions hidden
  const adminActionsDisplay = await page.$eval('#dashAdminActions', el => window.getComputedStyle(el).display);
  const coachActionsDisplay = await page.$eval('#dashCoachActions', el => window.getComputedStyle(el).display);
  assert(adminActionsDisplay !== 'none', 'Admin quick actions are visible');
  assert(coachActionsDisplay === 'none', 'Coach quick actions are hidden for Super Admin');

  // 2b. Test Navigation Tab Switching & Clean Chart Destruction/Recreation
  console.log('\n--- Testing Tab Switching & Chart Recreation ---');
  // Navigate to students
  await page.click('a.nav-link[href="#students"]');
  await page.waitForFunction(() => {
    const el = document.getElementById('studentsSection');
    return el && window.getComputedStyle(el).display !== 'none';
  });

  const overviewHidden = await page.$eval('#overviewSection', el => window.getComputedStyle(el).display === 'none');
  assert(overviewHidden, 'Overview section is hidden when navigating to Students');

  // Navigate back to overview
  await page.click('a.nav-link[href="#overview"]');
  await page.waitForFunction(() => {
    const el = document.getElementById('overviewSection');
    return el && window.getComputedStyle(el).display !== 'none';
  });

  const overviewVisibleAgain = await page.$eval('#overviewSection', el => window.getComputedStyle(el).display !== 'none');
  assert(overviewVisibleAgain, 'Overview section is visible again after navigating back');

  // Check chart recreation
  const chartCanvasRendered = await page.$eval('#dashAttendanceChart', el => el.width > 0 && el.height > 0);
  assert(chartCanvasRendered, 'Attendance chart canvas recreated cleanly without error');

  // 2c. Test Quick Action Modal Opening
  console.log('\n--- Testing Quick Action Modal ---');
  await page.click('#btnDashAddStudent');
  await page.waitForFunction(() => {
    const m = document.getElementById('addStudentModal');
    return m && window.getComputedStyle(m).display === 'flex';
  });
  const addStudentModalOpen = await page.$eval('#addStudentModal', m => window.getComputedStyle(m).display === 'flex');
  assert(addStudentModalOpen, 'Quick Action "Add Student" opens addStudentModal');

  // Close modal
  await page.click('#closeAddStudentModal');
  await page.waitForFunction(() => {
    const m = document.getElementById('addStudentModal');
    return m && window.getComputedStyle(m).display === 'none';
  });

  // 2d. Coach Role Verification in Browser
  console.log('\n--- Testing Coach Role in Browser ---');
  const coachPage = await browser.newPage();
  await coachPage.setViewport({ width: 1440, height: 900 });

  await coachPage.evaluateOnNewDocument(() => {
    localStorage.setItem('vava_role', 'coach');
    localStorage.setItem('vava_coach_id', '100');
    localStorage.setItem('vava_email', 'coach@vavasports.com');
    localStorage.setItem('vava_user', JSON.stringify({
      name: 'Rajesh Pawar',
      role: 'coach',
      coach_id: 100,
      email: 'coach@vavasports.com'
    }));
  });

  await coachPage.goto('http://localhost/VAVA_sports/dashboard.html#overview', { waitUntil: 'networkidle2' });
  await coachPage.waitForSelector('#dashMainContent', { visible: true, timeout: 5000 });

  const coachWelcome = await coachPage.$eval('#dashWelcomeName', el => el.textContent.trim());
  assert(coachWelcome.length > 0, `Coach greeting: "${coachWelcome}"`);

  const coachFinDisplay = await coachPage.$eval('#panelFinancialOverview', el => window.getComputedStyle(el).display);
  assert(coachFinDisplay === 'none', 'CRITICAL: Financial Overview panel is completely hidden in DOM for Coach');

  const coachActionsVisible = await coachPage.$eval('#dashCoachActions', el => window.getComputedStyle(el).display !== 'none');
  const adminActionsHidden = await coachPage.$eval('#dashAdminActions', el => window.getComputedStyle(el).display === 'none');
  assert(coachActionsVisible, 'Coach quick actions are visible for Coach');
  assert(adminActionsHidden, 'Admin quick actions are hidden for Coach');

  const labelCoachBatches = await coachPage.$eval('#labelKpiCoaches', el => el.textContent.trim());
  assert(labelCoachBatches === 'MY BATCHES', `Card 2 label is "${labelCoachBatches}"`);

  // 2e. Responsive Layout Verification
  console.log('\n--- Testing Responsive Layout (Tablet & Mobile) ---');

  // Tablet (768x1024)
  await page.setViewport({ width: 768, height: 1024 });
  await new Promise(r => setTimeout(r, 500));
  const tabletScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(tabletScrollWidth <= 768, `Tablet (768px): No horizontal overflow (scrollWidth = ${tabletScrollWidth}px)`);

  // Mobile (375x812)
  await page.setViewport({ width: 375, height: 812 });
  await new Promise(r => setTimeout(r, 500));
  const mobileScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(mobileScrollWidth <= 375, `Mobile (375px): No horizontal overflow (scrollWidth = ${mobileScrollWidth}px)`);

  // Console errors check
  const criticalErrors = consoleErrors.filter(err => !err.includes('favicon'));
  assert(criticalErrors.length === 0, `No console errors during dashboard execution (errors: ${criticalErrors.length})`);
  if (criticalErrors.length > 0) {
    console.error('Console errors:', criticalErrors);
  }

  await browser.close();

  console.log('\n====================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
