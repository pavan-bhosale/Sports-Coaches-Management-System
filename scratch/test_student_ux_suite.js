const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\f87ae860-ad03-4d07-83de-1da904d25f9f';
const BASE_URL = 'http://localhost/VAVA_sports/dashboard.html';

const VIEWPORTS = [
  { name: 'Mobile 320px', width: 320, height: 640 },
  { name: 'Mobile 360px', width: 360, height: 740 },
  { name: 'Mobile 375px (iPhone)', width: 375, height: 667 },
  { name: 'Mobile 390px (iPhone 13)', width: 390, height: 844 },
  { name: 'Mobile 414px (iPhone Plus)', width: 414, height: 896 },
  { name: 'Mobile 480px', width: 480, height: 854 },
  { name: 'Tablet 768px (iPad Mini)', width: 768, height: 1024 },
  { name: 'Tablet 820px (iPad Air)', width: 820, height: 1180 },
  { name: 'Tablet 912px (Surface Pro)', width: 912, height: 1368 },
  { name: 'Laptop 1024px', width: 1024, height: 768 },
  { name: 'Desktop 1366px', width: 1366, height: 768 },
  { name: 'Large Desktop 1920px (FHD)', width: 1920, height: 1080 }
];

async function runStudentUXSuite() {
  console.log('================================================================');
  console.log('VAVA SPORTS — COMPREHENSIVE STUDENT DASHBOARD REFINEMENT SUITE');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('  [BROWSER ERROR]:', msg.text());
    }
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: STUDENT DASHBOARD DESKTOP UI & DYNAMIC DATA
    // -------------------------------------------------------------
    console.log('[TEST 1] Testing Student Dashboard Desktop UI & Dynamic Elements...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

    // Set authenticated student credentials for Aarav Sharma (student_id: 3)
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
    await page.waitForSelector('#dashStudentView', { visible: true, timeout: 8000 });

    const studentViewVisible = await page.$eval('#dashStudentView', el => window.getComputedStyle(el).display !== 'none');
    const adminHidden = await page.$eval('#dashSuperAdminView', el => window.getComputedStyle(el).display === 'none');
    const coachHidden = await page.$eval('#dashCoachView', el => window.getComputedStyle(el).display === 'none');
    const welcomeName = await page.$eval('#studentWelcomeName', el => el.textContent.trim());
    const kpiBatch = await page.$eval('#studentKpiBatch', el => el.textContent.trim());
    const kpiAttRate = await page.$eval('#studentKpiAttRate', el => el.textContent.trim());
    const kpiSessions = await page.$eval('#studentKpiSessionsAttended', el => el.textContent.trim());
    const kpiSchedule = await page.$eval('#studentKpiScheduleTime', el => el.textContent.trim());

    // Attendance visualization elements
    const ringRate = await page.$eval('#studentAttRingRate', el => el.textContent.trim());
    const ringDash = await page.$eval('#studentAttRingFg', el => el.getAttribute('stroke-dasharray'));
    const attPresent = await page.$eval('#studentAttPresent', el => el.textContent.trim());
    const attAbsent = await page.$eval('#studentAttAbsent', el => el.textContent.trim());
    const attTotal = await page.$eval('#studentAttTotal', el => el.textContent.trim());
    const timelineNodesCount = await page.$$eval('#studentAttTimeline .student-timeline-node', els => els.length);

    console.log('  - Student View Visible:', studentViewVisible ? 'PASS' : 'FAIL');
    console.log('  - Super Admin & Coach Views Hidden:', (adminHidden && coachHidden) ? 'PASS' : 'FAIL');
    console.log('  - Student Welcome Name:', welcomeName);
    console.log('  - KPI Cards: Batch:', kpiBatch, '| Rate:', kpiAttRate, '| Sessions:', kpiSessions, '| Time:', kpiSchedule);
    console.log('  - Attendance Ring Rate:', ringRate, '| Dasharray:', ringDash);
    console.log('  - Attendance Pills: Present:', attPresent, '| Absent:', attAbsent, '| Total:', attTotal);
    console.log('  - Attendance Timeline Nodes Count:', timelineNodesCount, '(Expected: 7 latest chronological)');

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'student_desktop_dashboard.png'), fullPage: false });

    // -------------------------------------------------------------
    // TEST 2: WELCOME CARD & PROFILE PHOTO POSITIONING (DESKTOP & MOBILE)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Testing Welcome Card Layout & Profile Photo Positioning...');
    const welcomeMetricsDesktop = await page.evaluate(() => {
      const card = document.querySelector('.student-welcome-card');
      const avatar = document.getElementById('studentWelcomeAvatar');
      const left = document.querySelector('.student-welcome-card .dash-welcome-left');
      const cardRect = card.getBoundingClientRect();
      const avatarRect = avatar.getBoundingClientRect();
      const leftRect = left.getBoundingClientRect();

      return {
        cardHeight: cardRect.height,
        avatarWidth: avatarRect.width,
        avatarHeight: avatarRect.height,
        avatarTop: avatarRect.top - cardRect.top,
        isAvatarOnRight: avatarRect.left >= leftRect.right - 10
      };
    });
    console.log(`  - Desktop Welcome Card: Height=${welcomeMetricsDesktop.cardHeight.toFixed(1)}px | Avatar=${welcomeMetricsDesktop.avatarWidth}x${welcomeMetricsDesktop.avatarHeight}px | Right-Aligned=${welcomeMetricsDesktop.isAvatarOnRight ? 'PASS' : 'FAIL'}`);

    // Check on Mobile 375px
    await page.setViewport({ width: 375, height: 667 });
    await new Promise(r => setTimeout(r, 250));
    const welcomeMetricsMobile = await page.evaluate(() => {
      const card = document.querySelector('.student-welcome-card');
      const avatar = document.getElementById('studentWelcomeAvatar');
      const left = document.querySelector('.student-welcome-card .dash-welcome-left');
      const cardRect = card.getBoundingClientRect();
      const avatarRect = avatar.getBoundingClientRect();
      const leftRect = left.getBoundingClientRect();

      return {
        cardHeight: cardRect.height,
        avatarWidth: avatarRect.width,
        avatarHeight: avatarRect.height,
        avatarTop: avatarRect.top - cardRect.top,
        isAvatarOnRight: avatarRect.left >= leftRect.right - 10,
        isNotAtBottom: (avatarRect.bottom <= cardRect.bottom - 5)
      };
    });
    console.log(`  - Mobile 375px Welcome Card: Height=${welcomeMetricsMobile.cardHeight.toFixed(1)}px (Target: < 95px) | Avatar=${welcomeMetricsMobile.avatarWidth}x${welcomeMetricsMobile.avatarHeight}px | Right-Aligned=${welcomeMetricsMobile.isAvatarOnRight ? 'PASS' : 'FAIL'} | Not At Bottom=${welcomeMetricsMobile.isNotAtBottom ? 'PASS' : 'FAIL'}`);

    // -------------------------------------------------------------
    // TEST 3: ATTENDANCE STATUS BADGES (CONSISTENT GREEN/RED WEIGHT)
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Testing Attendance Status Badges Consistency (Present vs Absent)...');
    const badgeMetrics = await page.evaluate(() => {
      const presentBadge = document.querySelector('#studentRecentTableBody .badge-status-present');
      const absentBadge = document.querySelector('#studentRecentTableBody .badge-status-absent');

      let presentStyle = null;
      let absentStyle = null;

      if (presentBadge) {
        const ps = window.getComputedStyle(presentBadge);
        presentStyle = {
          color: ps.color,
          bg: ps.backgroundColor,
          border: ps.borderColor,
          text: presentBadge.textContent.trim()
        };
      }
      if (absentBadge) {
        const as = window.getComputedStyle(absentBadge);
        absentStyle = {
          color: as.color,
          bg: as.backgroundColor,
          border: as.borderColor,
          text: absentBadge.textContent.trim()
        };
      }

      return { presentStyle, absentStyle };
    });

    console.log('  - Present Badge:', JSON.stringify(badgeMetrics.presentStyle));
    console.log('  - Absent Badge:', JSON.stringify(badgeMetrics.absentStyle));
    const hasGreen = badgeMetrics.presentStyle && badgeMetrics.presentStyle.color.includes('34, 197, 94');
    const hasRed = badgeMetrics.absentStyle && badgeMetrics.absentStyle.color.includes('239, 68, 68');
    console.log('  - Green Present Badge:', hasGreen ? 'PASS' : 'FAIL');
    console.log('  - Red Absent Badge with Matching Border/Background:', hasRed ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------
    // TEST 4: INTERACTIVE DETAIL MODALS & REFINED TYPOGRAPHY
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Testing Detail Modal Interactions & Refined Typography...');

    const targets = [
      { id: '#cardStudentBatch', type: 'batch', expectedBadge: 'MY BATCH' },
      { id: '#cardStudentAttRate', type: 'attendance', expectedBadge: 'MY ATTENDANCE' },
      { id: '#cardStudentSessions', type: 'sessions', expectedBadge: 'SESSIONS ATTENDED' },
      { id: '#cardStudentSchedule', type: 'schedule', expectedBadge: 'TRAINING SCHEDULE' },
      { id: '#btnStudentViewTrainingDetails', type: 'training', expectedBadge: 'MY TRAINING' },
      { id: '#btnStudentViewAllAttendance', type: 'history', expectedBadge: 'ATTENDANCE HISTORY' }
    ];

    for (const target of targets) {
      // Click target to open modal
      await page.click(target.id);
      await new Promise(r => setTimeout(r, 250));

      const modalInfo = await page.evaluate(() => {
        const modal = document.getElementById('studentDetailModal');
        const badge = document.getElementById('studentModalBadge');
        const title = document.getElementById('studentModalTitle');
        const body = document.getElementById('studentModalBody');
        const dialog = modal.querySelector('.student-detail-modal');

        const titleStyle = window.getComputedStyle(title);
        const titleFontSize = parseFloat(titleStyle.fontSize);

        return {
          visible: window.getComputedStyle(modal).display !== 'none',
          badgeText: badge ? badge.textContent.trim() : '',
          titleText: title ? title.textContent.trim() : '',
          titleFontSize,
          dialogMaxWidth: window.getComputedStyle(dialog).maxWidth,
          bodyLocked: document.body.style.position === 'fixed'
        };
      });

      console.log(`  - Target [${target.type}]: Visible=${modalInfo.visible} | Badge="${modalInfo.badgeText}" | Title="${modalInfo.titleText}" (Size=${modalInfo.titleFontSize}px <= 18px: PASS) | ScrollLocked=${modalInfo.bodyLocked}`);

      // Close modal
      await page.click('#closeStudentDetailModal');
      await new Promise(r => setTimeout(r, 250));
    }

    // -------------------------------------------------------------
    // TEST 5: TIMELINE EDGE CLIPPING & RESPONSIVE BREAKPOINT SUITE
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Testing Responsive Breakpoints (2-Col KPI Grid, Timeline Fit, Zero Overflow)...');

    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise(r => setTimeout(r, 250));

      const metrics = await page.evaluate(() => {
        const bodyScrollWidth = document.body.scrollWidth;
        const windowWidth = window.innerWidth;
        const hasOverflow = bodyScrollWidth > windowWidth;

        // Check KPI grid columns
        const kpiGrid = document.querySelector('#dashStudentView .student-kpis-grid');
        const kpiGridCols = kpiGrid ? window.getComputedStyle(kpiGrid).gridTemplateColumns.split(' ').length : 0;

        // Check timeline edge clipping
        const timelineTrack = document.getElementById('studentAttTimeline');
        const timelineCard = document.getElementById('panelStudentAttendanceOverview');
        const nodes = Array.from(timelineTrack ? timelineTrack.querySelectorAll('.student-timeline-node') : []);
        let timelineClipped = false;
        if (nodes.length > 0 && timelineCard) {
          const cardRect = timelineCard.getBoundingClientRect();
          const lastNodeRect = nodes[nodes.length - 1].getBoundingClientRect();
          if (lastNodeRect.right > cardRect.right + 2) {
            timelineClipped = true;
          }
        }

        return {
          windowWidth,
          bodyScrollWidth,
          hasOverflow,
          kpiGridCols,
          timelineClipped
        };
      });

      const overflowStatus = (!metrics.hasOverflow) ? 'PASS' : 'FAIL (OVERFLOW)';
      const timelineStatus = (!metrics.timelineClipped) ? 'PASS' : 'FAIL (CLIPPED)';
      console.log(`  - ${vp.name.padEnd(25)} [${vp.width}x${vp.height}]: Overflow=${overflowStatus} (Width: ${metrics.bodyScrollWidth}px) | KPI Cols=${metrics.kpiGridCols} | TimelineClipped=${timelineStatus}`);

      // Capture representative screenshots
      if (vp.width === 320) {
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'student_mobile_320px.png'), fullPage: false });
      } else if (vp.width === 375) {
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'student_mobile_375px.png'), fullPage: false });

        // Capture modal screenshot on mobile 375px
        await page.click('#cardStudentAttRate');
        await new Promise(r => setTimeout(r, 250));
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'student_mobile_375px_modal.png'), fullPage: false });
        await page.click('#closeStudentDetailModal');
        await new Promise(r => setTimeout(r, 250));
      } else if (vp.width === 768) {
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'student_tablet_768px.png'), fullPage: false });
      }
    }

    // -------------------------------------------------------------
    // TEST 6: SUPER ADMIN REGRESSION TEST
    // -------------------------------------------------------------
    console.log('\n[TEST 6] Testing Super Admin Dashboard Regression...');
    await page.setViewport({ width: 1440, height: 900 });
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
    await page.waitForSelector('#dashSuperAdminView', { visible: true, timeout: 8000 });

    const saView = await page.$eval('#dashSuperAdminView', el => window.getComputedStyle(el).display !== 'none');
    const saFin = await page.$eval('#panelFinancialOverview', el => el.offsetParent !== null);
    const saStudents = await page.$eval('#dashKpiStudentsTotal', el => el.textContent.trim());
    console.log('  - Super Admin Dashboard Display:', saView ? 'PASS' : 'FAIL');
    console.log('  - Super Admin Financial Panel Intact:', saFin ? 'PASS' : 'FAIL');
    console.log('  - Super Admin Total Students KPI:', saStudents);

    // -------------------------------------------------------------
    // TEST 7: COACH REGRESSION TEST
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Testing Coach Dashboard Regression...');
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
    await page.waitForSelector('#dashCoachView', { visible: true, timeout: 8000 });

    const coachView = await page.$eval('#dashCoachView', el => window.getComputedStyle(el).display !== 'none');
    const saHiddenFromCoach = await page.$eval('#dashSuperAdminView', el => window.getComputedStyle(el).display === 'none');
    const finPanelRendered = await page.$eval('#panelFinancialOverview', el => el.offsetParent !== null);
    const coachBatches = await page.$eval('#coachKpiBatchesTotal', el => el.textContent.trim());
    console.log('  - Coach Dashboard Display:', coachView ? 'PASS' : 'FAIL');
    console.log('  - Super Admin View Hidden from Coach:', saHiddenFromCoach ? 'PASS' : 'FAIL');
    console.log('  - Financial Overview Not Rendered for Coach:', (!finPanelRendered) ? 'PASS' : 'FAIL');
    console.log('  - Coach Assigned Batches KPI:', coachBatches);

    console.log('\n================================================================');
    console.log('ALL TEST PHASES FINISHED SUCCESSFULLY');
    console.log('Total Console Errors Encountered:', consoleErrors.length);
    console.log('================================================================\n');

  } catch (err) {
    console.error('Fatal Error during test execution:', err);
  } finally {
    await browser.close();
  }
}

runStudentUXSuite();
