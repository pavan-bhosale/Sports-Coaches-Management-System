const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('========================================================');
  console.log('ACTIVITY REPORT EXPORT E2E BROWSER TEST');
  console.log('========================================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Track export network requests
  const exportRequests = [];
  page.on('request', req => {
    if (req.url().includes('export_report')) {
      exportRequests.push({
        url: req.url(),
        method: req.method()
      });
    }
  });

  let passCount = 0;
  let failCount = 0;
  function assertCheck(name, cond, details = '') {
    if (cond) {
      console.log(`[PASS] ${name}`);
      passCount++;
    } else {
      console.log(`[FAIL] ${name}: ${details}`);
      failCount++;
    }
  }

  try {
    // 1. Load Dashboard with Superadmin Auth
    await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      localStorage.setItem('vava_role', 'superadmin');
      localStorage.setItem('vava_email', 'superadmin@vavasports.com');
      localStorage.setItem('vava_user', JSON.stringify({ email: 'superadmin@vavasports.com', name: 'Super Admin', role: 'superadmin' }));
      window.location.hash = '#reports';
      if (window.handleNavigation) window.handleNavigation('reports');
    });
    await new Promise(r => setTimeout(r, 1200));

    // 2. Open Activity Report Modal
    await page.evaluate(() => {
      const card = document.querySelector('.report-card[data-report-id="activity_report"]');
      if (card) card.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Verify modal is open
    const modalVisible = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      return modal && window.getComputedStyle(modal).display !== 'none';
    });
    assertCheck('1. Activity Report modal is open', modalVisible);

    // Verify Export dropdown button is visible
    const exportBtnVisible = await page.evaluate(() => {
      const dropdown = document.getElementById('attendanceExportDropdown');
      return dropdown && window.getComputedStyle(dropdown).display !== 'none';
    });
    assertCheck('2. Export dropdown button is visible for Activity Report', exportBtnVisible);

    // 3. Open Export Menu
    await page.evaluate(() => {
      const btn = document.getElementById('btnReportExport');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 300));

    const menuOpen = await page.evaluate(() => {
      const menu = document.getElementById('reportExportMenu');
      return menu && window.getComputedStyle(menu).display !== 'none';
    });
    assertCheck('3. Export menu opened on click', menuOpen);

    // Screenshot export menu open
    await page.screenshot({ path: path.join(__dirname, 'activity_export_menu_open.png') });

    // Click outside to close menu
    await page.evaluate(() => {
      document.body.click();
    });
    await new Promise(r => setTimeout(r, 300));

    const menuClosed = await page.evaluate(() => {
      const menu = document.getElementById('reportExportMenu');
      return menu && window.getComputedStyle(menu).display === 'none';
    });
    assertCheck('4. Export menu closes on outside click', menuClosed);

    // 4. Test PDF Export Trigger
    exportRequests.length = 0;
    await page.evaluate(() => {
      const btn = document.getElementById('btnExportAttendancePdf');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    const pdfReq = exportRequests.find(r => r.url.includes('format=pdf') && r.url.includes('report=activity_report'));
    assertCheck('5. PDF Export triggered with format=pdf & report=activity_report', !!pdfReq, JSON.stringify(exportRequests));

    // 5. Test Excel Export Trigger
    exportRequests.length = 0;
    await page.evaluate(() => {
      const btn = document.getElementById('btnExportAttendanceXlsx');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    const xlsxReq = exportRequests.find(r => r.url.includes('format=xlsx') && r.url.includes('report=activity_report'));
    assertCheck('6. Excel Export triggered with format=xlsx & report=activity_report', !!xlsxReq, JSON.stringify(exportRequests));

    // 6. Role Filter Regression Test: Filter Role = coach
    await page.evaluate(() => {
      const roleSel = document.getElementById('filter_role');
      if (roleSel) {
        roleSel.value = 'coach';
      }
      const applyBtn = document.getElementById('btnApplyPreviewFilters');
      if (applyBtn) applyBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    // Check table has 1 record for Coach Chirag Nagvekar
    const coachRowCount = await page.evaluate(() => {
      return document.querySelectorAll('#previewTableSection tbody tr').length;
    });
    assertCheck('7. UI table updates for Role=Coach (1 row)', coachRowCount === 1, `Got ${coachRowCount} rows`);

    // Export PDF with Role=Coach applied
    exportRequests.length = 0;
    await page.evaluate(() => {
      const btn = document.getElementById('btnExportAttendancePdf');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    const coachPdfReq = exportRequests.find(r => r.url.includes('role=coach') && r.url.includes('format=pdf'));
    assertCheck('8. PDF Export request contains role=coach filter', !!coachPdfReq, coachPdfReq ? coachPdfReq.url : 'No matching request');

    // 7. Role Filter Regression Test: Filter Role = superadmin
    await page.evaluate(() => {
      const roleSel = document.getElementById('filter_role');
      if (roleSel) {
        roleSel.value = 'superadmin';
      }
      const applyBtn = document.getElementById('btnApplyPreviewFilters');
      if (applyBtn) applyBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const saRowCount = await page.evaluate(() => {
      return document.querySelectorAll('#previewTableSection tbody tr').length;
    });
    assertCheck('9. UI table updates for Role=Superadmin (6 rows)', saRowCount === 6, `Got ${saRowCount} rows`);

    // Export Excel with Role=Superadmin applied
    exportRequests.length = 0;
    await page.evaluate(() => {
      const btn = document.getElementById('btnExportAttendanceXlsx');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    const saXlsxReq = exportRequests.find(r => r.url.includes('role=superadmin') && r.url.includes('format=xlsx'));
    assertCheck('10. Excel Export request contains role=superadmin filter', !!saXlsxReq, saXlsxReq ? saXlsxReq.url : 'No matching request');

    // 8. Module Filter Test: Module = INVENTORY
    await page.evaluate(() => {
      const roleSel = document.getElementById('filter_role');
      if (roleSel) roleSel.value = '';
      const modSel = document.getElementById('filter_module');
      if (modSel) modSel.value = 'INVENTORY';
      const applyBtn = document.getElementById('btnApplyPreviewFilters');
      if (applyBtn) applyBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const invRowCount = await page.evaluate(() => {
      return document.querySelectorAll('#previewTableSection tbody tr').length;
    });
    assertCheck('11. UI table updates for Module=INVENTORY (2 rows)', invRowCount === 2, `Got ${invRowCount} rows`);

    // 9. Zero-result Filter Test
    await page.evaluate(() => {
      const searchInp = document.getElementById('filter_search');
      if (searchInp) searchInp.value = 'NoSuchActivityKeyword99999';
      const applyBtn = document.getElementById('btnApplyPreviewFilters');
      if (applyBtn) applyBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    // Try exporting zero results
    await page.evaluate(() => {
      const btn = document.getElementById('btnExportAttendancePdf');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    // Verify toast or alert notification
    const toastAppeared = await page.evaluate(() => {
      const toast = document.querySelector('.toast, .vava-toast, [class*="toast"]');
      const text = toast ? toast.textContent : '';
      return text.includes('No activity data') || text.includes('No activity');
    });
    assertCheck('12. Zero-result export triggered warning toast notification', toastAppeared);

    // 10. Reset Filter Test
    await page.evaluate(() => {
      const resetBtn = document.getElementById('btnResetPreviewFilters');
      if (resetBtn) resetBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const resetRowCount = await page.evaluate(() => {
      return document.querySelectorAll('#previewTableSection tbody tr').length;
    });
    assertCheck('13. Reset filters restores all 7 activity records in table', resetRowCount === 7, `Got ${resetRowCount} rows`);

    // 11. Responsive Viewport Tests
    // Mobile L (425px)
    await page.setViewport({ width: 425, height: 800 });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(__dirname, 'activity_Mobile_425px_modal.png') });

    const overflow425 = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assertCheck('14. Mobile 425px has no horizontal window overflow', !overflow425);

    // Mobile S (320px)
    await page.setViewport({ width: 320, height: 700 });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(__dirname, 'activity_Mobile_320px_modal.png') });

    const overflow320 = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assertCheck('15. Mobile 320px has no horizontal window overflow', !overflow320);

    // Reset viewport to desktop
    await page.setViewport({ width: 1366, height: 768 });
    await new Promise(r => setTimeout(r, 300));

    // Close preview modal
    await page.evaluate(() => {
      const closeBtn = document.getElementById('closePreviewModal');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // 12. Verify Attendance Report export functionality is fully intact
    await page.evaluate(() => {
      const card = document.querySelector('.report-card[data-report-id="attendance_report"]');
      if (card) card.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const attExportVisible = await page.evaluate(() => {
      const dropdown = document.getElementById('attendanceExportDropdown');
      return dropdown && window.getComputedStyle(dropdown).display !== 'none';
    });
    assertCheck('16. Attendance Report export button remains intact and visible', attExportVisible);

    // Close attendance modal
    await page.evaluate(() => {
      const closeBtn = document.getElementById('closePreviewModal');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // 13. Verify Fees & Payments Report export functionality is fully intact
    await page.evaluate(() => {
      const card = document.querySelector('.report-card[data-report-id="fees_payments"]');
      if (card) card.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const feesExportVisible = await page.evaluate(() => {
      const dropdown = document.getElementById('attendanceExportDropdown');
      return dropdown && window.getComputedStyle(dropdown).display !== 'none';
    });
    assertCheck('17. Fees & Payments export button remains intact and visible', feesExportVisible);

  } catch (err) {
    console.error('Test execution error:', err);
    failCount++;
  } finally {
    await browser.close();
  }

  console.log('\n========================================================');
  console.log(`E2E SUMMARY: Passed: ${passCount}, Failed: ${failCount}`);
  console.log('========================================================');
})();
