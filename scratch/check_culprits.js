const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 640 });
  await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'admin');
    localStorage.setItem('vava_user', JSON.stringify({ email: 'admin@vavasports.com', name: 'Admin', role: 'admin' }));
    window.location.hash = '#reports';
    if (window.handleNavigation) window.handleNavigation('reports');
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => {
    const card = document.querySelector('.report-card[data-report-id="student_batch"]');
    if (card) card.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  const info = await page.evaluate(() => {
    const docW = window.innerWidth;
    const outsideTable = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.closest('.report-table-wrapper')) return;
      const r = el.getBoundingClientRect();
      if (r.right > docW) {
        outsideTable.push({
          tag: el.tagName,
          id: el.id,
          class: el.className,
          right: r.right,
          left: r.left,
          width: r.width,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth
        });
      }
    });
    return {
      windowWidth: docW,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      modalOverlayScrollWidth: document.getElementById('reportPreviewModal')?.scrollWidth,
      modalOverlayClientWidth: document.getElementById('reportPreviewModal')?.clientWidth,
      dialogScrollWidth: document.querySelector('.report-modal')?.scrollWidth,
      dialogClientWidth: document.querySelector('.report-modal')?.clientWidth,
      outsideTable
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
