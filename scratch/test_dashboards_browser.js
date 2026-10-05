const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\f87ae860-ad03-4d07-83de-1da904d25f9f';

async function runTests() {
  console.log('--- STARTING PUPPETEER ROLE-BASED DASHBOARD TESTS ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER CONSOLE ERROR:', msg.text());
    }
  });

  // =========================================================================
  // 1. SUPER ADMIN TEST
  // =========================================================================
  console.log('\n[1/6] Testing Super Admin Dashboard...');
  await page.goto('http://localhost/VAVA_sports/dashboard.html');
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'admin');
    localStorage.setItem('vava_email', 'pavanbhosale212@gmail.com');
    localStorage.setItem('vava_user', JSON.stringify({
      name: 'Pavan Bhosale',
      email: 'pavanbhosale212@gmail.com',
      role: 'admin'
    }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#dashMainContent', { visible: true, timeout: 8000 });

  const adminViewVisible = await page.$eval('#dashSuperAdminView', el => window.getComputedStyle(el).display !== 'none');
  const coachViewHiddenFromAdmin = await page.$eval('#dashCoachView', el => window.getComputedStyle(el).display === 'none');
  const studentViewHiddenFromAdmin = await page.$eval('#dashStudentView', el => window.getComputedStyle(el).display === 'none');
  const finPanelVisible = await page.$eval('#panelFinancialOverview', el => window.getComputedStyle(el).display !== 'none');
  const adminWelcome = await page.$eval('#dashWelcomeName', el => el.textContent.trim());
  const adminStudents = await page.$eval('#dashKpiStudentsTotal', el => el.textContent.trim());
  const adminBatches = await page.$eval('#dashKpiBatchesTotal', el => el.textContent.trim());

  console.log('Super Admin View Visible:', adminViewVisible);
  console.log('Coach View Hidden from Admin:', coachViewHiddenFromAdmin);
  console.log('Student View Hidden from Admin:', studentViewHiddenFromAdmin);
  console.log('Financial Panel Visible:', finPanelVisible);
  console.log('Welcome Name:', adminWelcome);
  console.log('Total Students KPI:', adminStudents);
  console.log('Total Batches KPI:', adminBatches);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'superadmin_dashboard.png'), fullPage: false });

  // =========================================================================
  // 2. COACH A TEST (Chirag Nagvekar - Coach 100)
  // =========================================================================
  console.log('\n[2/6] Testing Coach A Dashboard (Chirag Nagvekar)...');
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'coach');
    localStorage.setItem('vava_email', 'chiragdnagvekar@gmail.com');
    localStorage.setItem('vava_coach_id', '100');
    localStorage.setItem('vava_user', JSON.stringify({
      coach_id: 100,
      name: 'Chirag Nagvekar',
      email: 'chiragdnagvekar@gmail.com',
      role: 'coach'
    }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#dashMainContent', { visible: true, timeout: 8000 });

  const coachViewVisibleA = await page.$eval('#dashCoachView', el => window.getComputedStyle(el).display !== 'none');
  const adminViewHiddenFromCoachA = await page.$eval('#dashSuperAdminView', el => window.getComputedStyle(el).display === 'none');
  const studentViewHiddenFromCoachA = await page.$eval('#dashStudentView', el => window.getComputedStyle(el).display === 'none');
  const coachWelcomeA = await page.$eval('#coachWelcomeName', el => el.textContent.trim());
  const coachStudentsA = await page.$eval('#coachKpiStudentsTotal', el => el.textContent.trim());
  const coachBatchesA = await page.$eval('#coachKpiBatchesTotal', el => el.textContent.trim());
  const coachBatchRowsA = await page.$$eval('#coachBatchTableBody tr', rows => rows.map(r => r.innerText.replace(/\s+/g, ' ')));
  const coachStudentCountA = await page.$$eval('#coachStudentTableBody tr', rows => rows.length);
  const finPanelHiddenFromCoach = await page.$eval('#panelFinancialOverview', el => window.getComputedStyle(el).display === 'none');

  console.log('Coach View Visible:', coachViewVisibleA);
  console.log('Super Admin View Hidden from Coach:', adminViewHiddenFromCoachA);
  console.log('Student View Hidden from Coach:', studentViewHiddenFromCoachA);
  console.log('Financial Panel Hidden from Coach:', finPanelHiddenFromCoach);
  console.log('Welcome Name:', coachWelcomeA);
  console.log('My Students KPI:', coachStudentsA);
  console.log('My Batches KPI:', coachBatchesA);
  console.log('Coach A Batch List:', coachBatchRowsA);
  console.log('Coach A Student Table Rows Count:', coachStudentCountA);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'coach_chirag_dashboard.png'), fullPage: false });

  // =========================================================================
  // 3. COACH B TEST (Tanya Raut - Coach 101)
  // =========================================================================
  console.log('\n[3/6] Testing Coach B Dashboard (Tanya Raut)...');
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'coach');
    localStorage.setItem('vava_email', 'rauttaniya28@gmail.com');
    localStorage.setItem('vava_coach_id', '101');
    localStorage.setItem('vava_user', JSON.stringify({
      coach_id: 101,
      name: 'Tanya Raut',
      email: 'rauttaniya28@gmail.com',
      role: 'coach'
    }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#dashMainContent', { visible: true, timeout: 8000 });

  const coachWelcomeB = await page.$eval('#coachWelcomeName', el => el.textContent.trim());
  const coachStudentsB = await page.$eval('#coachKpiStudentsTotal', el => el.textContent.trim());
  const coachBatchesB = await page.$eval('#coachKpiBatchesTotal', el => el.textContent.trim());
  const coachBatchRowsB = await page.$$eval('#coachBatchTableBody tr', rows => rows.map(r => r.innerText.replace(/\s+/g, ' ')));
  const coachStudentCountB = await page.$$eval('#coachStudentTableBody tr', rows => rows.length);

  console.log('Welcome Name:', coachWelcomeB);
  console.log('My Students KPI:', coachStudentsB);
  console.log('My Batches KPI:', coachBatchesB);
  console.log('Coach B Batch List:', coachBatchRowsB);
  console.log('Coach B Student Table Rows Count:', coachStudentCountB);
  console.log('Coach B does NOT see Coach A batch (Batch 3):', !coachBatchRowsB.some(r => r.includes('Batch 3')));

  // =========================================================================
  // 4. STUDENT A TEST (Aarav Sharma - Student 3)
  // =========================================================================
  console.log('\n[4/6] Testing Student A Dashboard (Aarav Sharma)...');
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'student');
    localStorage.setItem('vava_email', 'aarav.sharma@vavasports.local');
    localStorage.setItem('vava_student_id', '3');
    localStorage.setItem('vava_user', JSON.stringify({
      student_id: 3,
      name: 'Aarav Sharma',
      email: 'aarav.sharma@vavasports.local',
      role: 'student'
    }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#dashMainContent', { visible: true, timeout: 8000 });

  const studentViewVisibleA = await page.$eval('#dashStudentView', el => window.getComputedStyle(el).display !== 'none');
  const adminViewHiddenFromStudentA = await page.$eval('#dashSuperAdminView', el => window.getComputedStyle(el).display === 'none');
  const coachViewHiddenFromStudentA = await page.$eval('#dashCoachView', el => window.getComputedStyle(el).display === 'none');
  const studentWelcomeA = await page.$eval('#studentWelcomeName', el => el.textContent.trim());
  const studentBatchKPI = await page.$eval('#studentKpiBatch', el => el.textContent.trim());
  const studentAttRateKPI = await page.$eval('#studentKpiAttRate', el => el.textContent.trim());
  const studentSessionsKPI = await page.$eval('#studentKpiSessionsAttended', el => el.textContent.trim());
  const studentCoachName = await page.$eval('#studentCoachName', el => el.textContent.trim());
  const studentRecentRows = await page.$$eval('#studentRecentTableBody tr', rows => rows.length);

  // Check sidebar navigation hiding for student
  const navStudentsHidden = await page.$eval('#nav-students', el => window.getComputedStyle(el).display === 'none');
  const navBatchesHidden = await page.$eval('#nav-batches', el => window.getComputedStyle(el).display === 'none');
  const navFeesHidden = await page.$eval('#nav-fees', el => window.getComputedStyle(el).display === 'none');

  console.log('Student View Visible:', studentViewVisibleA);
  console.log('Super Admin View Hidden:', adminViewHiddenFromStudentA);
  console.log('Coach View Hidden:', coachViewHiddenFromStudentA);
  console.log('Welcome Name:', studentWelcomeA);
  console.log('Batch KPI:', studentBatchKPI);
  console.log('Attendance Rate KPI:', studentAttRateKPI);
  console.log('Sessions Attended KPI:', studentSessionsKPI);
  console.log('Lead Coach Name in Training Card:', studentCoachName);
  console.log('Recent Attendance Rows:', studentRecentRows);
  console.log('Sidebar Restricted (nav-students hidden):', navStudentsHidden);
  console.log('Sidebar Restricted (nav-batches hidden):', navBatchesHidden);
  console.log('Sidebar Restricted (nav-fees hidden):', navFeesHidden);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'student_aarav_dashboard.png'), fullPage: false });

  // Test unauthorized navigation protection
  await page.evaluate(() => {
    navigateToSection('#students', false);
  });
  const currentHashAfterForbiddenNav = await page.evaluate(() => window.location.hash);
  console.log('Student attempted navigation to #students, redirected to:', currentHashAfterForbiddenNav);

  // =========================================================================
  // 5. STUDENT B TEST (Test Student 4 - Student 8)
  // =========================================================================
  console.log('\n[5/6] Testing Student B Dashboard (Test Student 4)...');
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'student');
    localStorage.setItem('vava_email', 'teststudent4_178878652496@vavasports.local');
    localStorage.setItem('vava_student_id', '8');
    localStorage.setItem('vava_user', JSON.stringify({
      student_id: 8,
      name: 'Test Student 4',
      email: 'teststudent4_178878652496@vavasports.local',
      role: 'student'
    }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#dashMainContent', { visible: true, timeout: 8000 });

  const studentWelcomeB = await page.$eval('#studentWelcomeName', el => el.textContent.trim());
  const studentBatchKPI_B = await page.$eval('#studentKpiBatch', el => el.textContent.trim());
  const studentCoachName_B = await page.$eval('#studentCoachName', el => el.textContent.trim());

  console.log('Welcome Name:', studentWelcomeB);
  console.log('Batch KPI:', studentBatchKPI_B);
  console.log('Lead Coach Name:', studentCoachName_B);
  console.log('Student B does NOT see Batch 3:', studentBatchKPI_B !== 'Batch 3');

  // =========================================================================
  // 6. RESPONSIVE BREAKPOINT TESTS
  // =========================================================================
  console.log('\n[6/6] Testing Responsive Breakpoints (320, 375, 430, 768, 1024, 1366, 1920)...');
  const widths = [320, 375, 430, 768, 1024, 1366, 1920];
  for (const w of widths) {
    await page.setViewport({ width: w, height: 800 });
    await new Promise(r => setTimeout(r, 200));

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`Viewport ${w}px: Horizontal Overflow Detected = ${overflow}`);
    if (w === 375) {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_375px_student.png'), fullPage: false });
    }
  }

  // Switch to Coach for mobile test
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'coach');
    localStorage.setItem('vava_email', 'chiragdnagvekar@gmail.com');
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.setViewport({ width: 375, height: 800 });
  const coachOverflowMobile = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(`Coach Viewport 375px: Horizontal Overflow Detected = ${coachOverflowMobile}`);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_375px_coach.png'), fullPage: false });

  // =========================================================================
  // 7. CROSS-ORIGIN FETCH & PREFLIGHT VERIFICATION
  // =========================================================================
  console.log('\n[7/7] Testing In-Browser Cross-Origin Fetch with All Custom Headers...');
  const corsTestResult = await page.evaluate(async () => {
    try {
      const res = await fetch('http://localhost/VAVA_sports/server/dashboard.php', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VAVA-Role': 'coach',
          'X-VAVA-Email': 'chiragdnagvekar@gmail.com',
          'X-VAVA-Coach-ID': '100',
          'X-VAVA-Student-ID': '0'
        }
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, role: data.role, success: data.success };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  console.log('Cross-Origin In-Browser Fetch Result:', JSON.stringify(corsTestResult));
  if (!corsTestResult.ok || corsTestResult.role !== 'coach') {
    throw new Error('Cross-origin fetch test failed: ' + JSON.stringify(corsTestResult));
  }

  await browser.close();
  console.log('\n--- ALL BROWSER AUTOMATION TESTS COMPLETED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('PUPPETEER TEST RUNNER FAILED:', err);
  process.exit(1);
});
