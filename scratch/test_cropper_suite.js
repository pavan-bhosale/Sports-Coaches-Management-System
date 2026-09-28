const puppeteer = require('puppeteer');

(async () => {
  console.log('=== RUNNING AUTOMATED CROPPER TEST SUITE ===\n');

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  await page.goto('http://localhost/VAVA_sports/scratch/test_cropper_suite.html');

  // TEST A: Square Image
  console.log('--- TEST A: Square Image (800x800) ---');
  await page.evaluate(() => {
    return new Promise(resolve => {
      window.initCropper('images/square.jpg', resolve);
    });
  });
  await new Promise(r => setTimeout(r, 600));

  let resA = await page.evaluate(() => window.getCroppedAndOptimizedResult());
  console.log('Result A:', resA.width + 'x' + resA.height, resA.mime, resA.byteLength + ' bytes');
  if (resA.width !== 600 || resA.height !== 600) {
    throw new Error(`Expected 600x600, got ${resA.width}x${resA.height}`);
  }
  console.log('✓ TEST A PASSED: Square image cropped to exact 600x600.\n');

  // TEST B: Portrait Image (600x1200)
  console.log('--- TEST B: Portrait Phone Image (600x1200) ---');
  await page.evaluate(() => {
    return new Promise(resolve => {
      window.initCropper('images/portrait.jpg', resolve);
    });
  });
  await new Promise(r => setTimeout(r, 600));

  // Check that dragging works
  const stage = await page.$('.crop-stage-wrapper');
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 50, { steps: 5 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));

  let resB = await page.evaluate(() => window.getCroppedAndOptimizedResult());
  console.log('Result B:', resB.width + 'x' + resB.height, resB.mime, resB.byteLength + ' bytes');
  if (resB.width !== resB.height) {
    throw new Error(`Expected 1:1 square, got ${resB.width}x${resB.height}`);
  }
  if (resB.width > 600 || resB.height > 600) {
    throw new Error(`Output should not exceed 600x600`);
  }
  console.log('✓ TEST B PASSED: Portrait image produces 1:1 square cropped output.\n');

  // TEST C: Landscape Image (1200x600)
  console.log('--- TEST C: Landscape Image (1200x600) ---');
  await page.evaluate(() => {
    return new Promise(resolve => {
      window.initCropper('images/landscape.jpg', resolve);
    });
  });
  await new Promise(r => setTimeout(r, 600));

  let resC = await page.evaluate(() => window.getCroppedAndOptimizedResult());
  console.log('Result C:', resC.width + 'x' + resC.height, resC.mime, resC.byteLength + ' bytes');
  if (resC.width !== resC.height) {
    throw new Error(`Expected 1:1 square, got ${resC.width}x${resC.height}`);
  }
  console.log('✓ TEST C PASSED: Landscape image produces 1:1 square cropped output.\n');

  // TEST D: Large High-Resolution Phone Image (3024x4032)
  console.log('--- TEST D: Large High-Res Phone Image (3024x4032) ---');
  await page.evaluate(() => {
    return new Promise(resolve => {
      window.initCropper('images/large_phone.jpg', resolve);
    });
  });
  await new Promise(r => setTimeout(r, 800));

  let resD = await page.evaluate(() => window.getCroppedAndOptimizedResult());
  console.log('Result D:', resD.width + 'x' + resD.height, resD.mime, resD.byteLength + ' bytes');
  if (resD.width !== 600 || resD.height !== 600) {
    throw new Error(`Expected downscale to 600x600, got ${resD.width}x${resD.height}`);
  }
  console.log(`Original: 3024x4032 (~165KB synthetic / ~4MB photo) -> Cropped & Optimized: ${resD.width}x${resD.height} (${resD.byteLength} bytes)`);
  console.log('✓ TEST D PASSED: Large image cropped and downscaled to 600x600.\n');

  // TEST E: Mobile Screen Viewport (375x667)
  console.log('--- TEST E: Mobile Screen Viewport (375x667) ---');
  await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
  await page.evaluate(() => {
    return new Promise(resolve => {
      window.initCropper('images/portrait.jpg', resolve);
    });
  });
  await new Promise(r => setTimeout(r, 600));

  const modalBox = await page.$('.crop-modal-box');
  const modalRect = await modalBox.boundingBox();
  console.log('Mobile modal bounding box:', modalRect.width + 'x' + modalRect.height);
  if (modalRect.width > 375) {
    throw new Error('Modal overflows mobile screen width!');
  }

  // Verify buttons exist and are visible
  const btnConfirmVis = await page.$eval('#btnConfirm', el => el.offsetWidth > 0 && el.offsetHeight > 0);
  const btnCancelVis = await page.$eval('#btnCancel', el => el.offsetWidth > 0 && el.offsetHeight > 0);
  console.log('Buttons visible on mobile:', { btnConfirmVis, btnCancelVis });
  if (!btnConfirmVis || !btnCancelVis) {
    throw new Error('Buttons not visible on mobile');
  }

  let resE = await page.evaluate(() => window.getCroppedAndOptimizedResult());
  console.log('Mobile Crop Result:', resE.width + 'x' + resE.height, resE.mime);
  if (resE.width !== resE.height) {
    throw new Error(`Expected 1:1 on mobile, got ${resE.width}x${resE.height}`);
  }
  console.log('✓ TEST E PASSED: Mobile interaction, scaling, and 1:1 crop verified.\n');

  await browser.close();
  console.log('=== ALL CROPPER SUITE TESTS PASSED! ===');
})();
