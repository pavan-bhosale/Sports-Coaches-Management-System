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
    console.log('=== STARTING 5 CONSOLIDATED REPORTS BROWSER AUDIT ===\n');

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
      } else if (window.navigateToSection) {
        window.navigateToSection('#reports');
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    // 3. Verify exactly 5 report cards
    const cardCount = await page.evaluate(() => {
      const cards = document.querySelectorAll('.report-card');
      return cards.length;
    });
    console.log(`Report Catalog Cards count: ${cardCount}`);
    if (cardCount !== 5) {
      throw new Error(`CRITICAL: Expected EXACTLY 5 report cards, but found ${cardCount}!`);
    }
    console.log('PASS: Exactly 5 report cards rendered in the catalog!');

    // Verify card titles
    const cardTitles = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.report-card-title')).map(el => el.innerText.trim());
    });
    console.log('Report Titles:', cardTitles);

    const expectedReports = [
      'student_batch',
      'attendance_report',
      'fees_payments',
      'coach_activity',
      'inventory_report'
    ];

    // 4. Test each of the 5 reports
    for (const repId of expectedReports) {
      console.log(`\n--- Testing Report: ${repId} ---`);
      
      // Click report card
      await page.evaluate((id) => {
        const card = document.querySelector(`.report-card[data-report-id="${id}"]`);
        if (card) card.click();
      }, repId);
      await new Promise(r => setTimeout(r, 1500));

      // Audit modal
      const modalAudit = await page.evaluate(() => {
        const modal = document.getElementById('reportPreviewModal');
        const isVisible = modal && modal.style.display !== 'none';
        const title = document.getElementById('previewModalTitle')?.innerText?.trim();
        const hasDoctype = document.body.innerText.includes('<!DOCTYPE');
        const metricCards = document.querySelectorAll('.report-metric-card');
        const kpis = Array.from(metricCards).map(c => ({
          label: c.querySelector('.report-metric-label')?.innerText?.trim(),
          value: c.querySelector('.report-metric-value')?.innerText?.trim()
        }));
        const tableRows = document.querySelectorAll('#previewTableBody tr');
        const secondarySection = document.getElementById('previewSecondarySection');
        const hasSecondary = secondarySection && secondarySection.style.display !== 'none';
        const hasPdfButton = !!document.getElementById('btnDownloadReportPdf') || document.body.innerText.includes('Download PDF');

        return {
          isVisible,
          title,
          hasDoctype,
          kpiCount: metricCards.length,
          kpis,
          tableRowCount: tableRows.length,
          hasSecondary,
          hasPdfButton
        };
      });

      console.log(`Audit for [${repId}]:`, JSON.stringify(modalAudit, null, 2));

      if (!modalAudit.isVisible) throw new Error(`Modal failed to open for ${repId}`);
      if (modalAudit.hasDoctype) throw new Error(`<!DOCTYPE error found for ${repId}`);
      if (modalAudit.kpiCount < 4) throw new Error(`Expected at least 4 metrics for ${repId}, got ${modalAudit.kpiCount}`);
      if (modalAudit.tableRowCount === 0) throw new Error(`Expected data rows for ${repId}, got 0`);
      if (modalAudit.hasPdfButton) throw new Error(`PDF download button still found in UI for ${repId}`);

      console.log(`PASS: [${repId}] rendered ${modalAudit.kpiCount} KPIs, ${modalAudit.tableRowCount} table rows, hasSecondary: ${modalAudit.hasSecondary}`);

      // Test zero-data filter
      console.log(`Testing zero-data filter on [${repId}]...`);
      await page.evaluate(() => {
        const statusSelect = document.getElementById('filter_status');
        if (statusSelect) {
          // Select something impossible or Inactive
          statusSelect.value = 'Inactive';
        }
        const startDate = document.getElementById('filter_start_date');
        const endDate = document.getElementById('filter_end_date');
        if (startDate && endDate) {
          startDate.value = '2099-01-01';
          endDate.value = '2099-01-31';
        }
        const applyBtn = document.getElementById('btnApplyPreviewFilters');
        if (applyBtn) applyBtn.click();
      });
      await new Promise(r => setTimeout(r, 1500));

      const emptyAudit = await page.evaluate(() => {
        const emptyCell = document.querySelector('.report-table-empty-cell');
        const bodyText = document.body.innerText;
        const hasEmptyMsg = !!emptyCell || bodyText.includes('No records found');
        const kpiValues = Array.from(document.querySelectorAll('.report-metric-value')).map(el => el.innerText.trim());
        const hasNaN = kpiValues.some(v => v.includes('NaN') || v.includes('undefined') || v.includes('null'));
        return {
          hasEmptyMsg,
          kpiValues,
          hasNaN
        };
      });

      console.log(`Empty state audit for [${repId}]:`, JSON.stringify(emptyAudit));
      if (!emptyAudit.hasEmptyMsg) {
        console.log(`Note: No empty cell flagged or data remained`);
      }
      if (emptyAudit.hasNaN) {
        throw new Error(`NaN/undefined detected in KPI values for ${repId}`);
      }

      // Test Reset button
      console.log(`Testing Reset on [${repId}]...`);
      await page.evaluate(() => {
        const resetBtn = document.getElementById('btnResetPreviewFilters');
        if (resetBtn) resetBtn.click();
      });
      await new Promise(r => setTimeout(r, 1500));

      // Close Modal
      await page.evaluate(() => {
        const closeBtn = document.getElementById('closeReportPreviewModal');
        if (closeBtn) closeBtn.click();
      });
      await new Promise(r => setTimeout(r, 500));
    }

    // 5. Test Responsive Viewports (no page-level horizontal overflow)
    console.log('\n5. Testing Responsive Viewports...');
    const viewports = [
      { name: 'Mobile S', width: 320, height: 667 },
      { name: 'Mobile M', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1280, height: 800 }
    ];

    for (const vp of viewports) {
      await page.setViewport(vp);
      await new Promise(r => setTimeout(r, 400));
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      console.log(`Viewport ${vp.name} (${vp.width}x${vp.height}): horizontal overflow = ${hasOverflow}`);
      if (hasOverflow) {
        throw new Error(`Horizontal overflow detected at ${vp.name} (${vp.width}px)!`);
      }
    }

    console.log('\n=== ALL 5 CONSOLIDATED REPORTS AUDIT TESTS PASSED! ===');

  } catch (err) {
    console.error('TEST RUN FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
