const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const imgDir = path.join(__dirname, 'images');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const specs = [
    { name: 'square.jpg', w: 800, h: 800, text: 'Square 800x800' },
    { name: 'portrait.jpg', w: 600, h: 1200, text: 'Portrait 600x1200' },
    { name: 'landscape.jpg', w: 1200, h: 600, text: 'Landscape 1200x600' },
    { name: 'large_phone.jpg', w: 3024, h: 4032, text: 'Large Phone 3024x4032' }
  ];

  for (const s of specs) {
    const dataUrl = await page.evaluate((w, h, text) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f59e0b';
      ctx.font = `${Math.floor(w / 15)}px sans-serif`;
      ctx.fillText(text, 50, 100);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, w - 20, h - 20);
      return canvas.toDataURL('image/jpeg', 0.9);
    }, s.w, s.h, s.text);

    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    fs.writeFileSync(path.join(imgDir, s.name), Buffer.from(base64, 'base64'));
    console.log(`Created ${s.name}: ${s.w}x${s.h} (${fs.statSync(path.join(imgDir, s.name)).size} bytes)`);
  }

  await browser.close();
})();
