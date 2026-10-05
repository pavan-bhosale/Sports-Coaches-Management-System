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

  const info = await page.evaluate(() => {
    const h = document.querySelector('#panelStudentTraining .dash-panel-header');
    const titleCol = h.children[0];
    const actionsCol = h.children[1];
    return {
      hStyle: window.getComputedStyle(h).display,
      hFlexWrap: window.getComputedStyle(h).flexWrap,
      titleColWidth: titleCol.getBoundingClientRect().width,
      actionsColWidth: actionsCol.getBoundingClientRect().width,
      total: titleCol.getBoundingClientRect().width + actionsCol.getBoundingClientRect().width
    };
  });

  console.log('Header elements:\n', JSON.stringify(info, null, 2));
  await browser.close();
})();
