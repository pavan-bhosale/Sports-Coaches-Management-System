const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 667 });
  await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0' });

  await page.evaluate(() => {
    localStorage.setItem('vava_role', 'admin');
    const link = document.querySelector('a[href="#students"]');
    if (link) link.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const info = await page.evaluate(() => {
    const card = document.querySelector('#studentCardsContainer .student-card-mobile');
    const infoEl = card.querySelector('.student-card-info');
    const nameEl = card.querySelector('.student-card-name');
    const batchEl = card.querySelector('.student-batch-badge');

    const infoStyle = window.getComputedStyle(infoEl);
    const nameStyle = window.getComputedStyle(nameEl);
    const batchStyle = window.getComputedStyle(batchEl);

    return {
      infoHtml: infoEl.outerHTML,
      infoDisplay: infoStyle.display,
      infoFlexDir: infoStyle.flexDirection,
      infoFlexWrap: infoStyle.flexWrap,
      infoWidth: infoEl.getBoundingClientRect().width,
      nameRect: nameEl.getBoundingClientRect(),
      batchRect: batchEl.getBoundingClientRect(),
      nameDisplay: nameStyle.display,
      batchDisplay: batchStyle.display,
      batchWhiteSp: batchStyle.whiteSpace
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
