const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERR:', err.message));

  await page.goto('http://localhost/VAVA_sports/dashboard.html');
  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'admin');
    localStorage.setItem('vava_email', 'superadmin@vavasports.com');
    navigateToSection('#students', false);
    openRegForm();
  });
  await new Promise(r => setTimeout(r, 600));

  const input = await page.$('#regStudentPhotoInput');
  await input.uploadFile(path.resolve(__dirname, 'images/large_phone.jpg'));
  await new Promise(r => setTimeout(r, 1200));

  const clickInfo = await page.evaluate(() => {
    const btn = document.getElementById('submitCropPhoto');
    console.log('Button found:', !!btn);
    console.log('activeCropCallback is function:', typeof activeCropCallback === 'function');
    btn.click();
    return {
      modalDisplay: document.getElementById('cropPhotoModal').style.display,
      regImgSrc: document.getElementById('regStudentPhotoImg').src
    };
  });

  console.log('ClickInfo result:', clickInfo);
  await browser.close();
})();
