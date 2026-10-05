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

  const parentTree = await page.evaluate(() => {
    let el = document.getElementById('panelStudentTraining');
    const parents = [];
    while (el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      parents.push({
        tag: el.tagName,
        id: el.id,
        cls: el.className,
        width: rect.width,
        right: rect.right,
        left: rect.left,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        marginLeft: style.marginLeft,
        marginRight: style.marginRight
      });
      el = el.parentElement;
    }
    return parents;
  });

  console.log('Parent tree:\n', JSON.stringify(parentTree, null, 2));
  await browser.close();
})();
