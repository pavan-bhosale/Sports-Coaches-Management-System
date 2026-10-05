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

  const panelChildren = await page.evaluate(() => {
    const p1 = document.getElementById('panelStudentTraining');
    const p2 = document.getElementById('panelStudentAttendanceOverview');
    function inspect(el) {
      return Array.from(el.querySelectorAll('*'))
        .filter(c => c.getBoundingClientRect().right > 320)
        .map(c => ({
          tag: c.tagName,
          id: c.id,
          cls: c.className,
          right: c.getBoundingClientRect().right,
          width: c.getBoundingClientRect().width,
          text: c.innerText ? c.innerText.slice(0, 30) : ''
        }));
    }
    return {
      p1: inspect(p1),
      p2: inspect(p2)
    };
  });

  console.log('Panel Children overflowing at 320px:\n', JSON.stringify(panelChildren, null, 2));
  await browser.close();
})();
