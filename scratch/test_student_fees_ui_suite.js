const puppeteer = require('puppeteer');
const http = require('http');

const BASE_URL = 'http://localhost/VAVA_sports';

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`[PASS] ${message}`);
  }
}

async function run() {
  console.log('========================================================');
  console.log('VAVA SPORTS — GRAPHICAL FEES SUMMARY UI TEST SUITE');
  console.log('========================================================');

  // Step 1: Start student session via session_helper
  console.log('\n[STEP 1] Initializing student session for Aarav Sharma (student_id = 3)...');
  const sessionRes = await fetch(`${BASE_URL}/scratch/session_helper.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'role=student&email=aarav.sharma@vavasports.local&student_id=3'
  });
  const sessionJson = await sessionRes.json();
  assert(sessionJson.success === true, 'Test session initialized successfully');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set auth cookies & localStorage
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'student');
    localStorage.setItem('vava_email', 'aarav.sharma@vavasports.local');
    localStorage.setItem('vava_user', JSON.stringify({
      role: 'student',
      email: 'aarav.sharma@vavasports.local',
      name: 'Aarav Sharma',
      student_id: 3
    }));
  });

  // Navigate to Dashboard
  console.log('\n[STEP 2] Navigating to Dashboard at 1280x800...');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/dashboard.html#overview`, { waitUntil: 'networkidle2' });

  // Wait for student dashboard to load
  await page.waitForSelector('#dashStudentView', { visible: true });
  await new Promise(r => setTimeout(r, 600));

  // -------------------------------------------------------------
  // TEST A: KPI CARDS INSPECTION
  // -------------------------------------------------------------
  console.log('\n[TEST A] Checking 4 KPI cards & removal of Sessions Attended...');
  const kpiCheck = await page.evaluate(() => {
    const batchCard = document.getElementById('cardStudentBatch');
    const attCard = document.getElementById('cardStudentAttRate');
    const feesCard = document.getElementById('cardStudentFees');
    const schedCard = document.getElementById('cardStudentSchedule');
    const oldSessionsCard = document.getElementById('cardStudentSessions');

    const feesRatio = document.getElementById('studentKpiFeesRatio')?.innerText?.trim() || '';
    const feesBadge = document.getElementById('studentKpiFeesBadge')?.innerText?.trim() || '';

    return {
      hasBatchCard: !!batchCard && getComputedStyle(batchCard).display !== 'none',
      hasAttCard: !!attCard && getComputedStyle(attCard).display !== 'none',
      hasFeesCard: !!feesCard && getComputedStyle(feesCard).display !== 'none',
      hasSchedCard: !!schedCard && getComputedStyle(schedCard).display !== 'none',
      hasOldSessionsCard: !!oldSessionsCard,
      feesRatio,
      feesBadge
    };
  });

  assert(kpiCheck.hasBatchCard, 'My Batch KPI card is visible');
  assert(kpiCheck.hasAttCard, 'My Attendance KPI card is visible');
  assert(kpiCheck.hasFeesCard, 'My Fees KPI card is visible');
  assert(kpiCheck.hasSchedCard, 'Training Schedule KPI card is visible');
  assert(!kpiCheck.hasOldSessionsCard, 'Redundant Sessions Attended KPI card was removed');
  assert(kpiCheck.feesRatio.includes('1 / 6'), `My Fees card shows dynamic ratio 1 / 6 (Got: ${kpiCheck.feesRatio})`);
  assert(kpiCheck.feesRatio.includes('MONTHS PAID'), 'My Fees card includes MONTHS PAID unit');
  assert(kpiCheck.feesBadge.includes('October'), `My Fees badge identifies current month (Got: ${kpiCheck.feesBadge})`);

  // -------------------------------------------------------------
  // TEST B: GRAPHICAL DONUT/RING SUMMARY ON DASHBOARD CARD
  // -------------------------------------------------------------
  console.log('\n[TEST B] Checking Graphical Donut/Ring Fees Card on Dashboard...');
  const cardCheck = await page.evaluate(() => {
    const panel = document.getElementById('panelStudentFees');
    const ringWrap = document.getElementById('studentFeesRingWrap');
    const ringRatio = document.getElementById('studentFeesRingRatio')?.innerText?.trim() || '';
    const ringFg = document.getElementById('studentFeesRingFg');
    const ringBg = document.getElementById('studentFeesRingBg');
    const paidCount = document.getElementById('studentFeesPaidCount')?.innerText?.trim() || '';
    const dueCount = document.getElementById('studentFeesDueCount')?.innerText?.trim() || '';
    const progressPct = document.getElementById('studentFeesProgressPct')?.innerText?.trim() || '';
    const curMonthName = document.getElementById('studentFeesCurMonthName')?.innerText?.trim() || '';
    const curMonthBadge = document.getElementById('studentFeesCurMonthBadge')?.innerText?.trim() || '';

    // Check that monthly payment tiles were REMOVED from the main dashboard card
    const tilesOnCard = panel ? panel.querySelectorAll('.student-month-tile').length : 0;
    const hintOnCard = panel ? !!panel.querySelector('#studentFeesGridHint') : false;

    return {
      panelVisible: !!panel && getComputedStyle(panel).display !== 'none',
      hasRing: !!ringWrap && getComputedStyle(ringWrap).display !== 'none',
      ringRatio,
      ringDasharray: ringFg ? ringFg.getAttribute('stroke-dasharray') : '',
      ringFgColor: ringFg ? ringFg.style.stroke : '',
      ringBgColor: ringBg ? ringBg.style.stroke : '',
      paidCount,
      dueCount,
      progressPct,
      curMonthName,
      curMonthBadge,
      tilesOnCard,
      hintOnCard
    };
  });

  assert(cardCheck.panelVisible, 'Fees & Payments card is visible on dashboard');
  assert(cardCheck.hasRing, 'Donut/Ring chart is present on the dashboard card');
  assert(cardCheck.ringRatio === '1 / 6', `Donut ring center ratio is 1 / 6 (Got: ${cardCheck.ringRatio})`);
  assert(cardCheck.paidCount === '1', `Paid count legend shows 1 (Got: ${cardCheck.paidCount})`);
  assert(cardCheck.dueCount === '5', `Due count legend shows 5 (Got: ${cardCheck.dueCount})`);
  assert(cardCheck.progressPct.includes('17%'), `Progress text indicates 17% (Got: ${cardCheck.progressPct})`);
  assert(cardCheck.curMonthName === 'October 2026', `Current month name is October 2026 (Got: ${cardCheck.curMonthName})`);
  assert(cardCheck.curMonthBadge === 'Not Applicable', `Current month status is Not Applicable (Got: ${cardCheck.curMonthBadge})`);
  assert(cardCheck.tilesOnCard === 0, `No redundant month tiles on dashboard card (Got: ${cardCheck.tilesOnCard})`);
  assert(!cardCheck.hintOnCard, 'No "Click a month tile to view details" hint on dashboard card');

  // -------------------------------------------------------------
  // TEST C: CLICK DASHBOARD CARD -> OPENS DETAILED FEES POPUP
  // -------------------------------------------------------------
  console.log('\n[TEST C] Clicking Fees & Payments Dashboard Card...');
  await page.click('#panelStudentFees');
  await new Promise(r => setTimeout(r, 400));

  const popupCheck = await page.evaluate(() => {
    const modal = document.getElementById('studentDetailModal');
    const badge = document.getElementById('studentModalBadge')?.innerText?.trim();
    const title = document.getElementById('studentModalTitle')?.innerText?.trim();
    const tiles = Array.from(modal.querySelectorAll('.student-months-grid .student-month-tile'));

    const tileData = tiles.map(t => ({
      month: t.querySelector('.tile-month-text')?.innerText?.trim(),
      year: t.querySelector('.tile-year-text')?.innerText?.trim(),
      status: t.querySelector('.tile-status-pill')?.innerText?.trim(),
      isPaid: t.classList.contains('tile-paid'),
      isDue: t.classList.contains('tile-due')
    }));

    return {
      modalVisible: modal && getComputedStyle(modal).display !== 'none',
      badge,
      title,
      tileCount: tiles.length,
      tileData
    };
  });

  assert(popupCheck.modalVisible, 'Fees detail popup opened');
  assert(popupCheck.title === 'Fees & Payments', `Popup title is Fees & Payments (Got: ${popupCheck.title})`);
  assert(popupCheck.tileCount === 6, `Detailed popup contains exactly 6 expected month tiles (Got: ${popupCheck.tileCount})`);

  // Verify months in popup
  const expectedMonths = ['FEB', 'MAR', 'APR', 'JUN', 'JUL', 'SEP'];
  const actualMonths = popupCheck.tileData.map(t => t.month);
  assert(JSON.stringify(actualMonths) === JSON.stringify(expectedMonths),
    `Popup renders strictly actual expected months from DB (Got: ${actualMonths.join(', ')})`);

  // -------------------------------------------------------------
  // TEST D: CLICK TILE IN POPUP -> LEVEL 3 MONTH DETAIL
  // -------------------------------------------------------------
  console.log('\n[TEST D] Testing click on PAID month tile (Sep 2026) inside popup...');
  await page.click('#studentDetailModal .tile-paid');
  await new Promise(r => setTimeout(r, 300));

  const paidDetailCheck = await page.evaluate(() => {
    const title = document.getElementById('studentModalTitle')?.innerText?.trim();
    const bodyText = document.getElementById('studentModalBody')?.innerText || '';
    const hasBackBtn = !!document.getElementById('btnBackToFeesSummary');

    return {
      title,
      hasPaidBadge: bodyText.includes('PAID'),
      hasAmount: bodyText.includes('1,500'),
      hasDate: bodyText.includes('12 Sep 2026'),
      hasMethod: bodyText.includes('Razorpay (UPI)'),
      hasRef: bodyText.includes('pay_test_881920'),
      hasBackBtn
    };
  });

  assert(paidDetailCheck.title === 'September 2026', `Month title is September 2026 (Got: ${paidDetailCheck.title})`);
  assert(paidDetailCheck.hasPaidBadge, 'Modal displays ✓ PAID status');
  assert(paidDetailCheck.hasAmount, 'Modal displays actual amount ₹1,500');
  assert(paidDetailCheck.hasDate, 'Modal displays actual payment date 12 Sep 2026');
  assert(paidDetailCheck.hasMethod, 'Modal displays actual payment method Razorpay (UPI)');
  assert(paidDetailCheck.hasRef, 'Modal displays actual reference pay_test_881920');
  assert(paidDetailCheck.hasBackBtn, 'Back button is present');

  // Click back to all months
  console.log('  - Clicking "← Back to All Months"...');
  await page.click('#btnBackToFeesSummary');
  await new Promise(r => setTimeout(r, 300));

  const backCheck = await page.evaluate(() => {
    const title = document.getElementById('studentModalTitle')?.innerText?.trim();
    const tileCount = document.querySelectorAll('#studentDetailModal .modal-tile').length;
    return { title, tileCount };
  });

  assert(backCheck.title === 'Fees & Payments', `Returned to all months summary (Title: ${backCheck.title})`);
  assert(backCheck.tileCount === 6, `Modal displays all 6 month tiles (Got: ${backCheck.tileCount})`);

  // Close modal
  await page.click('#closeStudentDetailModal');
  await new Promise(r => setTimeout(r, 200));

  // -------------------------------------------------------------
  // TEST E: RESPONSIVE BREAKPOINTS (320px to 1920px)
  // -------------------------------------------------------------
  console.log('\n[TEST E] Testing Responsive Breakpoints (320px to 1920px)...');
  const viewports = [
    { name: 'mobile_320px', width: 320, height: 568 },
    { name: 'mobile_360px', width: 360, height: 640 },
    { name: 'mobile_375px', width: 375, height: 667 },
    { name: 'mobile_390px', width: 390, height: 844 },
    { name: 'mobile_414px', width: 414, height: 896 },
    { name: 'mobile_480px', width: 480, height: 854 },
    { name: 'tablet_600px', width: 600, height: 960 },
    { name: 'tablet_768px', width: 768, height: 1024 },
    { name: 'tablet_820px', width: 820, height: 1180 },
    { name: 'tablet_912px', width: 912, height: 1368 },
    { name: 'tablet_1024px', width: 1024, height: 768 },
    { name: 'desktop_1280px', width: 1280, height: 800 },
    { name: 'desktop_1366px', width: 1366, height: 768 },
    { name: 'desktop_1440px', width: 1440, height: 900 },
    { name: 'desktop_1600px', width: 1600, height: 900 },
    { name: 'desktop_1920px', width: 1920, height: 1080 }
  ];

  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 120));

    const metrics = await page.evaluate((vpName, vpWidth) => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const bodyScrollWidth = document.body.scrollWidth;
      const hasHorizontalScroll = scrollWidth > (vpWidth + 1) || bodyScrollWidth > (vpWidth + 1);

      // Check Donut ring sizing
      const ring = document.getElementById('studentFeesRingWrap');
      const ringRect = ring ? ring.getBoundingClientRect() : null;
      const isRingBounded = ringRect ? (ringRect.right <= clientWidth && ringRect.width > 0) : false;

      // Check 2-column mobile KPI grid
      let kpiColCount = 0;
      if (vpWidth <= 480) {
        const grid = document.querySelector('#dashStudentView .student-kpis-grid');
        if (grid) {
          const style = window.getComputedStyle(grid);
          kpiColCount = style.getPropertyValue('grid-template-columns').split(' ').filter(Boolean).length;
        }
      }

      return {
        hasHorizontalScroll,
        scrollWidth: Math.max(scrollWidth, bodyScrollWidth),
        clientWidth,
        isRingBounded,
        kpiColCount
      };
    }, vp.name, vp.width);

    assert(!metrics.hasHorizontalScroll,
      `${vp.name} (${vp.width}x${vp.height}): No horizontal page scroll (Scroll: ${metrics.scrollWidth}, Viewport: ${vp.width})`);
    assert(metrics.isRingBounded,
      `${vp.name}: Donut ring fits comfortably within viewport`);

    if (vp.width <= 480) {
      assert(metrics.kpiColCount === 2,
        `${vp.name}: 2-column mobile KPI grid strictly maintained (Got ${metrics.kpiColCount} cols)`);
    }

    // Capture key responsive screenshots
    if (['mobile_320px', 'mobile_375px', 'tablet_768px', 'desktop_1280px'].includes(vp.name)) {
      await page.screenshot({
        path: `scratch/screenshots/student_fees_graphical_${vp.name}.png`,
        fullPage: false
      });
    }
  }

  // Capture focused screenshot of the graphical Fees & Payments card
  await page.setViewport({ width: 1280, height: 800 });
  await new Promise(r => setTimeout(r, 200));
  const cardElem = await page.$('#panelStudentFees');
  if (cardElem) {
    await cardElem.screenshot({ path: 'scratch/screenshots/student_fees_graphical_card_desktop.png' });
  }

  await page.setViewport({ width: 375, height: 667 });
  await new Promise(r => setTimeout(r, 200));
  const cardElemMob = await page.$('#panelStudentFees');
  if (cardElemMob) {
    await cardElemMob.screenshot({ path: 'scratch/screenshots/student_fees_graphical_card_mobile_375px.png' });
  }

  await browser.close();

  console.log('\n========================================================');
  console.log('UI TEST SUITE SUMMARY: Complete');
  console.log('========================================================\n');
}

run().catch(err => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
