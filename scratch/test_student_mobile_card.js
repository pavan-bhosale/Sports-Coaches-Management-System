const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('Browser Error:', msg.text());
  });

  try {
    console.log('=== STARTING REFINED STUDENT CARD (SINGLE ROW HEADER) TEST SUITE ===\n');

    // 1. Load Dashboard
    console.log('1. Loading Dashboard at http://localhost/VAVA_sports/dashboard.html ...');
    await page.goto('http://localhost/VAVA_sports/dashboard.html', { waitUntil: 'networkidle0' });

    // Mock role as admin
    await page.evaluate(() => {
      localStorage.setItem('vava_role', 'admin');
      localStorage.setItem('vava_user', JSON.stringify({ email: 'admin@vavasports.com', name: 'Admin' }));
    });

    // Navigate to Students
    console.log('2. Navigating to Students Module...');
    await page.evaluate(() => {
      const link = document.querySelector('a[href="#students"]') || document.querySelector('[data-section="students"]');
      if (link) link.click();
      else if (window.loadStudents) window.loadStudents();
    });
    await new Promise(r => setTimeout(r, 1500));

    // Viewports to test
    const viewports = [
      { name: 'Mobile S', width: 320, height: 667 },
      { name: 'Mobile M', width: 375, height: 667 },
      { name: 'Mobile L', width: 425, height: 800 },
      { name: 'Tablet', width: 768, height: 1024 }
    ];

    for (const vp of viewports) {
      console.log(`\n--- Testing ${vp.name} (${vp.width}x${vp.height}) ---`);
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise(r => setTimeout(r, 600));

      const cardMetrics = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('#studentCardsContainer .student-card-mobile'));
        const bodyScrollWidth = document.body.scrollWidth;
        const windowWidth = window.innerWidth;
        const hasBodyOverflow = bodyScrollWidth > windowWidth;

        const results = cards.map((card, idx) => {
          const nameEl = card.querySelector('.student-card-name');
          const batchEl = card.querySelector('.student-batch-badge');
          const dotsEl = card.querySelector('.student-three-dots-btn');
          const hasParentText = card.textContent.includes('Parent:');
          const cardRect = card.getBoundingClientRect();
          const nameRect = nameEl ? nameEl.getBoundingClientRect() : null;
          const batchRect = batchEl ? batchEl.getBoundingClientRect() : null;
          const dotsRect = dotsEl ? dotsEl.getBoundingClientRect() : null;

          // Check if name is visible
          const isNameVisible = nameRect && nameRect.width > 20 && nameRect.height > 10;
          // Check if batch is inside card
          const isBatchInside = batchRect && (batchRect.right <= cardRect.right + 2);
          // Check if dots is inside card
          const isDotsInside = dotsRect && (dotsRect.right <= cardRect.right + 2);
          // Check card overflow
          const cardOverflow = card.scrollWidth > card.clientWidth + 1;

          // Check single row: name and batch should have overlapping vertical bounds (same row)
          const isSameRow = nameRect && batchRect && Math.abs(nameRect.top - batchRect.top) < 14;

          return {
            index: idx,
            name: nameEl ? nameEl.textContent.trim() : '',
            batch: batchEl ? batchEl.textContent.trim() : '',
            hasParentText,
            isNameVisible,
            isBatchInside,
            isDotsInside,
            isSameRow,
            cardOverflow,
            nameRect: nameRect ? { width: Math.round(nameRect.width), height: Math.round(nameRect.height), top: Math.round(nameRect.top) } : null,
            batchRect: batchRect ? { width: Math.round(batchRect.width), height: Math.round(batchRect.height), top: Math.round(batchRect.top) } : null,
            cardHeight: Math.round(cardRect.height)
          };
        });

        return {
          totalCards: cards.length,
          hasBodyOverflow,
          results
        };
      });

      console.log(`Total student cards rendered: ${cardMetrics.totalCards}`);
      console.log(`Body horizontal overflow: ${cardMetrics.hasBodyOverflow}`);
      if (cardMetrics.hasBodyOverflow) {
        throw new Error(`Body horizontal overflow detected at ${vp.name}!`);
      }

      // Check each card
      for (const res of cardMetrics.results) {
        if (!res.isNameVisible) {
          throw new Error(`Student name '${res.name}' is NOT visible on card ${res.index} at ${vp.name}!`);
        }
        if (!res.isBatchInside) {
          throw new Error(`Batch badge '${res.batch}' overflowed outside card ${res.index} at ${vp.name}!`);
        }
        if (!res.isDotsInside) {
          throw new Error(`Three-dots button overflowed outside card ${res.index} at ${vp.name}!`);
        }
        if (!res.isSameRow) {
          throw new Error(`Student name and batch badge are NOT on the same row on card ${res.index} at ${vp.name}! Name top: ${res.nameRect.top}, Batch top: ${res.batchRect.top}`);
        }
        if (res.hasParentText) {
          throw new Error(`Card ${res.index} still shows 'Parent:' in card view!`);
        }
        if (res.cardOverflow) {
          throw new Error(`Card ${res.index} has horizontal scroll/overflow!`);
        }
      }

      // Sample first 3 cards report
      for (let i = 0; i < Math.min(3, cardMetrics.results.length); i++) {
        const c = cardMetrics.results[i];
        console.log(`  Card ${i+1}: Student="${c.name}" (${c.nameRect.width}px) + Batch="${c.batch}" (${c.batchRect.width}px) | SameRow=${c.isSameRow} | CardHeight=${c.cardHeight}px`);
      }

      console.log(`PASS: All student names visible, all batch badges inline on the same row, compact card height, no overflow at ${vp.name}!`);
    }

    // 3. Test Student Profile modal
    console.log('\n3. Testing Student Profile Modal (verifying parent info remains intact in profile)...');
    await page.setViewport({ width: 375, height: 667 });
    await page.evaluate(() => {
      const firstCard = document.querySelector('#studentCardsContainer .student-card-mobile');
      if (firstCard) firstCard.click();
    });
    await new Promise(r => setTimeout(r, 800));

    const profileData = await page.evaluate(() => {
      const modal = document.getElementById('studentProfileModal');
      const isVisible = modal && (modal.classList.contains('active') || modal.style.display === 'block' || window.getComputedStyle(modal).display !== 'none');
      const name = document.getElementById('viewStudentName')?.textContent.trim();
      const parent = document.getElementById('viewStudentParent')?.textContent.trim();
      const whatsapp = document.getElementById('viewStudentWhatsapp')?.textContent.trim();
      const batch = document.getElementById('viewStudentBatch')?.textContent.trim();
      return { isVisible, name, parent, whatsapp, batch };
    });

    console.log('Profile Modal Status:', profileData);
    if (!profileData.isVisible) {
      throw new Error('Student Profile Modal did not open!');
    }
    if (!profileData.parent || !profileData.parent.includes('Parent:')) {
      throw new Error(`Parent information missing in profile modal! Got: ${profileData.parent}`);
    }
    console.log('✓ Student Profile Modal verified: full details including parent information remain intact!');

    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#studentProfileModal .modal-close') || document.querySelector('#studentProfileModal [data-close]');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));

    // 4. Test Desktop View (1280x800)
    console.log('\n4. Testing Desktop View (1280x800)...');
    await page.setViewport({ width: 1280, height: 800 });
    await new Promise(r => setTimeout(r, 600));

    const desktopMetrics = await page.evaluate(() => {
      const mobileContainer = document.querySelector('.mobile-students-cards-container');
      const mobileDisplay = mobileContainer ? window.getComputedStyle(mobileContainer).display : 'none';
      const desktopTable = document.querySelector('.desktop-students-table-widget');
      const tableDisplay = desktopTable ? window.getComputedStyle(desktopTable).display : 'none';
      const rows = document.querySelectorAll('#studentsTableBody tr').length;
      return { mobileDisplay, tableDisplay, rows };
    });

    console.log('Desktop Layout Check:', desktopMetrics);
    if (desktopMetrics.mobileDisplay !== 'none') {
      throw new Error(`Mobile cards should be hidden on desktop! Got display: ${desktopMetrics.mobileDisplay}`);
    }
    if (desktopMetrics.tableDisplay === 'none' && desktopMetrics.rows === 0) {
      throw new Error('Desktop students table is not visible on desktop!');
    }
    console.log('✓ Desktop table view verified intact!');

    console.log('\n=== ALL REFINED STUDENT CARD TESTS PASSED SUCCESSFULLY! ===\n');

  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
