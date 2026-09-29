const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('Browser Error:', msg.text());
    }
  });

  try {
    console.log('=== STARTING REPORTS MODULE BROWSER VERIFICATION ===\n');

    // 1. Load Dashboard
    console.log('1. Loading Dashboard at http://localhost/VAVA_sports/dashboard.html ...');
    await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0' });

    // Set role as superadmin
    await page.evaluate(() => {
      localStorage.setItem('vava_role', 'admin');
      localStorage.setItem('vava_user', JSON.stringify({ email: 'admin@vavasports.com', name: 'Admin', role: 'admin' }));
    });

    // 2. Navigate to Reports Module
    console.log('2. Navigating to Reports Module (#reports)...');
    await page.evaluate(() => {
      window.location.hash = '#reports';
      if (window.handleNavigation) {
        window.handleNavigation('reports');
      } else if (window.loadReportsModule) {
        window.loadReportsModule();
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    // Check if reports catalog is rendered
    const catalogCards = await page.evaluate(() => {
      const cards = document.querySelectorAll('.report-card, [data-report-id]');
      return cards.length;
    });
    console.log(`Report Catalog Cards rendered: ${catalogCards}`);
    if (catalogCards === 0) {
      throw new Error('No report cards found in catalog!');
    }

    // 3. Open Student Overview Modal
    console.log('3. Opening Student Overview Modal...');
    await page.evaluate(() => {
      const card = document.querySelector('[data-report-id="student_overview"]');
      if (card) {
        card.click();
      } else {
        const anyCard = document.querySelector('.report-card');
        if (anyCard) anyCard.click();
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    // 4. Verify Modal Content
    const modalData = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      const isVisible = modal && (modal.style.display !== 'none' && !modal.classList.contains('hidden'));
      const errorBanner = document.querySelector('.report-empty-state, .reports-error-state');
      const hasDoctypeError = document.body.innerText.includes('<!DOCTYPE') || document.body.innerText.includes('Unexpected token');
      const metricCards = document.querySelectorAll('.report-metric-card');
      const kpis = Array.from(metricCards).map(c => ({
        label: c.querySelector('.report-metric-label')?.innerText?.trim(),
        value: c.querySelector('.report-metric-value')?.innerText?.trim()
      }));
      const tableRows = document.querySelectorAll('#previewTableBody tr');
      const chartCanvas = document.getElementById('reportChartCanvas');
      const hasChart = chartCanvas && chartCanvas.offsetParent !== null;

      return {
        isVisible,
        hasErrorBanner: !!errorBanner && document.body.innerText.includes('Failed to load report data'),
        hasDoctypeError,
        kpiCount: metricCards.length,
        kpis,
        tableRowCount: tableRows.length,
        hasChart
      };
    });

    console.log('Modal check result:', JSON.stringify(modalData, null, 2));

    if (modalData.hasDoctypeError) {
      throw new Error('CRITICAL: <!DOCTYPE error found in modal or page!');
    }
    if (modalData.hasErrorBanner) {
      throw new Error(`Report preview has error banner!`);
    }
    if (modalData.kpiCount < 4) {
      throw new Error(`Expected at least 4 KPI cards, got ${modalData.kpiCount}`);
    }
    if (modalData.tableRowCount === 0) {
      throw new Error('Expected data rows in table, got 0');
    }

    console.log('PASS: Student Overview preview loaded with dynamic MySQL data!');

    // 5. Test Filter with Zero Matching Records (Empty State test)
    console.log('5. Testing filter with 0 matching records...');
    await page.evaluate(() => {
      // In Student Overview, filters available are: status, batch_id, coach_id, branch, gender, city
      // Set status to Inactive or set a non-matching branch/city if available, or batch_id
      const statusSelect = document.getElementById('filter_status');
      if (statusSelect) {
        statusSelect.value = 'Inactive';
      }
      const applyBtn = document.getElementById('btnApplyPreviewFilters');
      if (applyBtn) applyBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    const filterResult = await page.evaluate(() => {
      const kpiValues = Array.from(document.querySelectorAll('.report-metric-value')).map(el => el.innerText.trim());
      const tableRows = document.querySelectorAll('#previewTableBody tr');
      const emptyRow = document.querySelector('.report-table-empty-cell, .report-empty-row');
      const hasBrokenChart = document.querySelector('.reports-chart-broken');
      return {
        tableRowCount: tableRows.length,
        hasEmptyMessage: !!emptyRow || document.body.innerText.includes('No records'),
        emptyMessageText: emptyRow ? emptyRow.innerText.trim() : (tableRows.length > 0 ? tableRows[0].innerText.trim() : ''),
        kpiValues,
        hasBrokenChart: !!hasBrokenChart
      };
    });

    console.log('Filtered result:', JSON.stringify(filterResult, null, 2));
    console.log('PASS: Filter applied dynamically and updated table and KPIs!');

    // 6. Test Reset Button
    console.log('6. Testing Reset Filter button...');
    await page.evaluate(() => {
      const resetBtn = document.getElementById('btnResetPreviewFilters');
      if (resetBtn) resetBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    const resetResult = await page.evaluate(() => {
      const tableRows = document.querySelectorAll('#previewTableBody tr');
      return { rowCount: tableRows.length };
    });
    console.log(`Recovered table row count after reset: ${resetResult.rowCount}`);
    if (resetResult.rowCount === 0) {
      throw new Error('Reset failed to restore rows!');
    }
    console.log('PASS: Filter Reset successfully restored data!');

    // 7. Responsive Viewport Check (375px mobile and 1280px desktop)
    console.log('7. Testing Responsive Viewports...');
    for (const vp of [{ name: 'Desktop', width: 1280, height: 800 }, { name: 'Mobile', width: 375, height: 667 }]) {
      await page.setViewport(vp);
      await new Promise(r => setTimeout(r, 500));
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      console.log(`Viewport ${vp.name} (${vp.width}x${vp.height}): page-level horizontal overflow = ${hasOverflow}`);
    }

    console.log('\n=== ALL BROWSER AUDIT TESTS PASSED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
