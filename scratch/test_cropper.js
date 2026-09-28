const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost/VAVA_sports/scratch/test_cropper.html');
  await new Promise(r => setTimeout(r, 1000));
  const text1 = await page.$eval('#output', el => el.textContent);
  console.log('Ready state:', text1);
  await page.click('#btnCrop');
  await new Promise(r => setTimeout(r, 500));
  const text2 = await page.$eval('#output', el => el.textContent);
  console.log('Crop result:', text2);
  await browser.close();
})();
