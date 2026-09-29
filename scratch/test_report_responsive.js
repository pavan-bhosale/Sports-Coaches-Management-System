const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const viewports = [
  { name: 'Mobile S', width: 320, height: 640 },
  { name: 'Mobile M', width: 375, height: 667 },
  { name: 'Mobile L', width: 425, height: 800 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop Small', width: 1024, height: 768 },
  { name: 'Desktop Standard', width: 1366, height: 768 },
  { name: 'Desktop Full HD', width: 1920, height: 1080 }
];

const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function runTests() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser Error:', msg.text());
    }
  });

  // 1. Initial dashboard load and auth setup
  await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'admin');
    localStorage.setItem('vava_user', JSON.stringify({ email: 'admin@vavasports.com', name: 'Admin', role: 'admin' }));
  });

  const results = [];

  for (const vp of viewports) {
    console.log(`\n================ Testing ${vp.name} (${vp.width}x${vp.height}) ================`);
    await page.setViewport({ width: vp.width, height: vp.height });

    // Navigate to reports section
    await page.evaluate(() => {
      window.location.hash = '#reports';
      if (window.handleNavigation) {
        window.handleNavigation('reports');
      } else if (window.navigateToSection) {
        window.navigateToSection('#reports');
      }
    });
    await new Promise(r => setTimeout(r, 1200));

    // Click Student & Batch report card
    await page.evaluate(() => {
      const card = document.querySelector('.report-card[data-report-id="student_batch"]');
      if (card) card.click();
    });

    // Wait for modal and report data
    await new Promise(r => setTimeout(r, 2000));

    // Evaluate layout measurements
    const metrics = await page.evaluate((vpWidth) => {
      const doc = document.documentElement;
      const body = document.body;
      const modal = document.getElementById('reportPreviewModal');
      const dialog = document.querySelector('.report-modal');
      const modalBody = document.querySelector('.report-modal-body');
      const kpis = Array.from(document.querySelectorAll('#previewMetricsGrid .report-metric-card'));
      const filters = document.querySelector('.report-filter-panel');
      const tableWrapper = document.querySelector('.report-table-wrapper');
      const table = document.querySelector('.report-data-table');

      const isModalVisible = modal && modal.style.display !== 'none';
      const dialogRect = dialog ? dialog.getBoundingClientRect() : null;
      const filterRect = filters ? filters.getBoundingClientRect() : null;

      // Check overflow:
      const pageScrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
      const hasPageHorizontalOverflow = pageScrollWidth > vpWidth + 1;

      const dialogScrollWidth = dialog ? dialog.scrollWidth : 0;
      const dialogClientWidth = dialog ? dialog.clientWidth : 0;
      const hasDialogHorizontalOverflow = dialogScrollWidth > dialogClientWidth + 1;

      const kpiHeights = kpis.map(k => k.getBoundingClientRect().height);

      // Check elements inside modal that might exceed dialog bounds horizontally (excluding table inside tableWrapper)
      let elementsOverflown = 0;
      const overflownNames = [];
      if (dialog) {
        const allInside = dialog.querySelectorAll('*');
        allInside.forEach(el => {
          if (el.closest('.report-table-wrapper')) return;
          const r = el.getBoundingClientRect();
          if (r.right > dialogRect.right + 2) {
            elementsOverflown++;
            overflownNames.push(el.className || el.tagName);
          }
        });
      }

      const studentRows = document.querySelectorAll('#previewTableSection tbody tr');
      const batchRows = document.querySelectorAll('#previewSecondarySection tbody tr');

      return {
        vpWidth,
        isModalVisible,
        pageScrollWidth,
        hasPageHorizontalOverflow,
        dialogWidth: dialogRect ? Math.round(dialogRect.width) : 0,
        dialogHeight: dialogRect ? Math.round(dialogRect.height) : 0,
        hasDialogHorizontalOverflow,
        elementsOverflown,
        overflownNames: overflownNames.slice(0, 3),
        kpiCount: kpis.length,
        avgKpiHeight: kpiHeights.length ? Math.round(kpiHeights.reduce((a,b)=>a+b, 0) / kpiHeights.length) : 0,
        filterHeight: filterRect ? Math.round(filterRect.height) : 0,
        tableWrapperWidth: tableWrapper ? Math.round(tableWrapper.getBoundingClientRect().width) : 0,
        tableWidth: table ? Math.round(table.getBoundingClientRect().width) : 0,
        studentRowCount: studentRows.length,
        batchRowCount: batchRows.length,
        modalBodyScrollHeight: modalBody ? modalBody.scrollHeight : 0,
        modalBodyClientHeight: modalBody ? modalBody.clientHeight : 0,
      };
    }, vp.width);

    // Save screenshot
    const screenshotPath = path.join(screenshotDir, `report_${vp.width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Close modal for next iteration
    await page.evaluate(() => {
      const closeBtn = document.getElementById('closeReportPreviewModal');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));

    const isPass = metrics.isModalVisible && !metrics.hasPageHorizontalOverflow && !metrics.hasDialogHorizontalOverflow && metrics.elementsOverflown === 0;

    const result = {
      name: vp.name,
      width: vp.width,
      status: isPass ? 'PASS' : 'FAIL',
      ...metrics
    };

    results.push(result);
    console.log(`Result: ${result.status} | Modal Visible: ${metrics.isModalVisible} | Page ScrollWidth: ${metrics.pageScrollWidth} vs Viewport: ${vp.width} | Dialog: ${metrics.dialogWidth}px | KPI H: ${metrics.avgKpiHeight}px | Filter H: ${metrics.filterHeight}px`);
  }

  await browser.close();

  fs.writeFileSync(path.join(__dirname, 'responsive_results.json'), JSON.stringify(results, null, 2));
  console.log('\nAll tests complete! Results saved to scratch/responsive_results.json');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
