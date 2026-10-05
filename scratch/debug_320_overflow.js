const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 640 });
  await page.goto('http://localhost/VAVA_sports/dashboard.html');

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
  await page.waitForSelector('#dashStudentView', { visible: true });

  const overflowingElements = await page.evaluate(() => {
    const docWidth = 320;
    const all = Array.from(document.querySelectorAll('*'));
    const culprits = [];
    all.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > docWidth + 1 || rect.width > docWidth + 1) {
        culprits.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          rectRight: rect.right,
          rectWidth: rect.width
        });
      }
    });
    return culprits.slice(0, 15);
  });

  console.log('Culprits at 320px:', JSON.stringify(overflowingElements, null, 2));
  await browser.close();
})();
