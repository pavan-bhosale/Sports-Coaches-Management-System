const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('========================================================');
  console.log('FEES & PAYMENTS REPORT EXPORT E2E BROWSER TEST');
  console.log('========================================================\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Track downloads / network requests
  const networkRequests = [];
  page.on('request', req => {
    if (req.url().includes('export_report') || req.url().includes('get_report')) {
      networkRequests.push({
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

    // 2. Open Fees & Payments Report Modal
    await page.evaluate(() => {
      const card = document.querySelector('.report-card[data-report-id="fees_payments"]');
      if (card) card.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Verify modal is open
    const modalVisible = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      return modal && window.getComputedStyle(modal).display !== 'none';
    });
    assertCheck('1. Fees & Payments modal is open', modalVisible);

    // Verify Export dropdown button is visible
    const exportBtnVisible = await page.evaluate(() => {
      const dropdown = document.getElementById('attendanceExportDropdown');
      return dropdown && window.getComputedStyle(dropdown).display !== 'none';
    });
    assertCheck('2. Export dropdown button is visible for Fees & Payments', exportBtnVisible);

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
    await page.screenshot({ path: path.join(__dirname, 'fees_export_menu_open.png') });

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

    // 4. Test PDF Export Trigger (Unfiltered)
    networkRequests.length = 0;
    await page.evaluate(() => {
      const btn = document.getElementById('btnReportExport');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const pdfBtn = document.getElementById('btnExportAttendancePdf');
      if (pdfBtn) pdfBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const pdfReq = networkRequests.find(r => r.url.includes('report=fees_payments') && r.url.includes('format=pdf'));
    assertCheck('5. PDF export request triggered with report=fees_payments&format=pdf', !!pdfReq, JSON.stringify(networkRequests));

    // 5. Test Excel Export Trigger (Unfiltered)
    networkRequests.length = 0;
    await page.evaluate(() => {
      const btn = document.getElementById('btnReportExport');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const xlsxBtn = document.getElementById('btnExportAttendanceXlsx');
      if (xlsxBtn) xlsxBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const xlsxReq = networkRequests.find(r => r.url.includes('report=fees_payments') && r.url.includes('format=xlsx'));
    assertCheck('6. Excel export request triggered with report=fees_payments&format=xlsx', !!xlsxReq, JSON.stringify(networkRequests));

    // 6. Test Active Filters: Filter by Batch 5 (batch_id = 7)
    await page.evaluate(() => {
      const batchSel = document.getElementById('filter_batch_id');
      if (batchSel) {
        batchSel.value = '7';
      }
      const applyBtn = document.getElementById('btnApplyPreviewFilters');
      if (applyBtn) applyBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    const batchRowCount = await page.evaluate(() => {
      return document.querySelectorAll('#previewTableBody tr').length;
    });
    assertCheck('7. Batch 5 filter applied: Web table renders 6 rows', batchRowCount === 6, `Got ${batchRowCount} rows`);

    // Export PDF with Batch 5 active
    networkRequests.length = 0;
    await page.evaluate(() => {
      const btn = document.getElementById('btnReportExport');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const pdfBtn = document.getElementById('btnExportAttendancePdf');
      if (pdfBtn) pdfBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const batchPdfReq = networkRequests.find(r => r.url.includes('report=fees_payments') && r.url.includes('format=pdf') && r.url.includes('batch_id=7'));
    assertCheck('8. Filtered PDF export carries batch_id=7 parameter', !!batchPdfReq, JSON.stringify(networkRequests));

    // Verify filter state is still intact (not reset after export!)
    const filterStateIntact = await page.evaluate(() => {
      const batchSel = document.getElementById('filter_batch_id');
      return batchSel && batchSel.value === '7';
    });
    assertCheck('9. Batch filter state remains intact after export', filterStateIntact);

    // 7. Test Zero-Result Export Toast Handling
    // Apply impossible status filter with Batch 5 (Batch 5 only has Overdue/Unpaid fees, no Paid fees)
    await page.evaluate(() => {
      const statusSel = document.getElementById('filter_status');
      if (statusSel) {
        statusSel.value = 'Paid';
      }
      const applyBtn = document.getElementById('btnApplyPreviewFilters');
      if (applyBtn) applyBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Export PDF for zero results
    await page.evaluate(() => {
      const btn = document.getElementById('btnReportExport');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
      const pdfBtn = document.getElementById('btnExportAttendancePdf');
      if (pdfBtn) pdfBtn.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const toastMsg = await page.evaluate(() => {
      const toast = document.querySelector('.toast, .custom-toast, [class*="toast"]');
      return toast ? toast.textContent : '';
    });
    assertCheck('10. Zero-result export triggers warning/info toast', toastMsg.includes('No fee or payment data available') || toastMsg.length > 0, `Toast: "${toastMsg}"`);

    // 8. Test Reset Button
    await page.evaluate(() => {
      const resetBtn = document.getElementById('btnResetPreviewFilters');
      if (resetBtn) resetBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500));

    const resetRowCount = await page.evaluate(() => {
      return document.querySelectorAll('#previewTableBody tr').length;
    });
    assertCheck('11. Reset button restores all 61 fee rows', resetRowCount === 61, `Got ${resetRowCount} rows`);

    // 9. Close Modal and verify other reports
    await page.evaluate(() => {
      const closeBtn = document.getElementById('closeReportPreviewModal');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // Open Activity Report -> Export button MUST be HIDDEN
    await page.evaluate(() => {
      const card = document.querySelector('.report-card[data-report-id="activity_report"]');
      if (card) card.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const activityExportHidden = await page.evaluate(() => {
      const dropdown = document.getElementById('attendanceExportDropdown');
      return !dropdown || window.getComputedStyle(dropdown).display === 'none';
    });
    assertCheck('12. Export button is HIDDEN for Activity Report', activityExportHidden);

    // Close Activity modal
    await page.evaluate(() => {
      const closeBtn = document.getElementById('closeReportPreviewModal');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // Open Attendance Report -> Export button MUST be VISIBLE
    await page.evaluate(() => {
      const card = document.querySelector('.report-card[data-report-id="attendance_report"]');
      if (card) card.click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const attendanceExportVisible = await page.evaluate(() => {
      const dropdown = document.getElementById('attendanceExportDropdown');
      return dropdown && window.getComputedStyle(dropdown).display !== 'none';
    });
    assertCheck('13. Export button is VISIBLE for Attendance Report', attendanceExportVisible);

    // Close Attendance modal
    await page.evaluate(() => {
      const closeBtn = document.getElementById('closeReportPreviewModal');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 600));

    // 10. Responsive Viewport Check (375x667 and 320x568)
    for (const vp of [{ width: 375, height: 667, name: 'Mobile_375px' }, { width: 320, height: 568, name: 'Mobile_320px' }]) {
      await page.setViewport(vp);
      await page.evaluate(() => {
        const card = document.querySelector('.report-card[data-report-id="fees_payments"]');
        if (card) card.click();
      });
      await new Promise(r => setTimeout(r, 1500));

      const hasOverflow = await page.evaluate(() => {
        const modalContent = document.querySelector('.report-modal-content');
        if (!modalContent) return false;
        return modalContent.scrollWidth > modalContent.clientWidth + 1;
      });
      assertCheck(`14. ${vp.name}: No horizontal container overflow`, !hasOverflow);

      await page.screenshot({ path: path.join(__dirname, `fees_${vp.name}_modal.png`) });

      await page.evaluate(() => {
        const closeBtn = document.getElementById('closeReportPreviewModal');
        if (closeBtn) closeBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }

  } catch (err) {
    console.error('Fatal E2E error:', err);
    failCount++;
  } finally {
    await browser.close();
  }

  console.log('\n========================================================');
  console.log(`E2E TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
  console.log('========================================================');

  if (failCount > 0) {
    process.exit(1);
  }
})();
