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

  const rules = await page.evaluate(() => {
    const el = document.querySelector('#studentCardsContainer .student-card-mobile .student-card-info');
    const matched = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.selectorText && el.matches(rule.selectorText)) {
            matched.push({
              selector: rule.selectorText,
              flexDir: rule.style.flexDirection,
              cssText: rule.cssText
            });
          }
        }
      } catch (e) {}
    }
    return matched;
  });

  console.log(JSON.stringify(rules, null, 2));
  await browser.close();
})();
