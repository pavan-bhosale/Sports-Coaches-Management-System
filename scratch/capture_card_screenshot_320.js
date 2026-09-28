const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 667 }); // Mobile S
  await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0' });

  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'admin');
    localStorage.setItem('vava_user', JSON.stringify({ email: 'admin@vavasports.com', name: 'Admin' }));
    const link = document.querySelector('a[href="#students"]') || document.querySelector('[data-section="students"]');
    if (link) link.click();
    else if (window.loadStudents) window.loadStudents();
  });

  await new Promise(r => setTimeout(r, 1200));

  await page.screenshot({ path: 'scratch/student_mobile_card_320px.png' });
  console.log('Screenshot saved to scratch/student_mobile_card_320px.png');

  await browser.close();
})();
