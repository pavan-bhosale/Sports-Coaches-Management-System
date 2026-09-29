const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'admin');
    localStorage.setItem('vava_user', JSON.stringify({ email: 'admin@vavasports.com', name: 'Admin', role: 'admin' }));
    window.location.hash = '#reports';
    if (window.handleNavigation) window.handleNavigation('reports');
  });
  await new Promise(r => setTimeout(r, 1200));

  // 1. Open report
  await page.evaluate(() => {
    const card = document.querySelector('.report-card[data-report-id="student_batch"]');
    if (card) card.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const initialRows = await page.evaluate(() => {
    return document.querySelectorAll('#previewTableBody tr').length;
  });
  console.log(`Initial rows: ${initialRows}`);

  // 2. Select filter (e.g. branch Virar)
  const filterApplied = await page.evaluate(async () => {
    const branchSelect = document.getElementById('filter_branch');
    if (branchSelect) {
      for (let i = 0; i < branchSelect.options.length; i++) {
        if (branchSelect.options[i].value.toLowerCase().includes('virar')) {
          branchSelect.selectedIndex = i;
          break;
        }
      }
    }
    const applyBtn = document.querySelector('.btn-filter-apply');
    if (applyBtn) applyBtn.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 1500));

  const filteredRows = await page.evaluate(() => {
    return document.querySelectorAll('#previewTableBody tr').length;
  });
  console.log(`Filtered rows (branch virar): ${filteredRows}`);

  // 3. Click Reset
  await page.evaluate(() => {
    const resetBtn = document.querySelector('.btn-filter-reset');
    if (resetBtn) resetBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const resetRows = await page.evaluate(() => {
    return document.querySelectorAll('#previewTableBody tr').length;
  });
  console.log(`Rows after reset: ${resetRows}`);

  // 4. Test Close button
  await page.evaluate(() => {
    const closeBtn = document.getElementById('closeReportPreviewModal');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const isClosed = await page.evaluate(() => {
    const modal = document.getElementById('reportPreviewModal');
    return modal ? modal.style.display === 'none' : true;
  });
  console.log(`Modal closed successfully: ${isClosed}`);

  await browser.close();

  if (initialRows > 0 && resetRows === initialRows && isClosed) {
    console.log('ALL FUNCTIONAL TESTS PASSED!');
  } else {
    console.error('FUNCTIONAL TEST FAILED!');
    process.exit(1);
  }
})();
