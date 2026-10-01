const puppeteer = require('puppeteer');

(async () => {
  console.log('--- STARTING VAVA SPORTS DASHBOARD LAYOUT & SCROLL TESTS ---');
  let browser;
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
    }
  }

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 800 });

    // Step 1: Set Superadmin Session
    console.log('\n1. Initializing Superadmin session...');
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('vava_role', 'superadmin');
      localStorage.setItem('vava_email', 'pavanbhosale212@gmail.com');
      localStorage.setItem('vava_user', JSON.stringify({
        name: 'Super Admin Test',
        role: 'superadmin',
        email: 'pavanbhosale212@gmail.com'
      }));
    });

    await page.goto('http://localhost/VAVA_sports/dashboard.html#overview', { waitUntil: 'networkidle2' });

    // Ensure dashboard loads
    await page.waitForSelector('#dashMainContent', { visible: true, timeout: 5000 });
    await page.waitForSelector('#panelBatchesOverview', { visible: true });
    await page.waitForSelector('#panelActivityOverview', { visible: true });

    // Allow data retrieval to finish
    await new Promise(r => setTimeout(r, 1200));

    // Test 1: Recent Academy Activity Card Height & Alignment
    console.log('\n2. Testing Recent Academy Activity Card Height & Alignment...');
    const cardMetrics = await page.evaluate(() => {
      const batchesCard = document.getElementById('panelBatchesOverview');
      const activityCard = document.getElementById('panelActivityOverview');
      const bottomGrid = document.querySelector('.dash-bottom-grid');
      const activityTimeline = document.getElementById('dashActivityTimeline');

      const bRect = batchesCard.getBoundingClientRect();
      const aRect = activityCard.getBoundingClientRect();
      const gridComputed = window.getComputedStyle(bottomGrid);
      const actComputed = window.getComputedStyle(activityCard);

      return {
        batchesTop: bRect.top,
        activityTop: aRect.top,
        batchesHeight: bRect.height,
        activityHeight: aRect.height,
        activityContentHeight: activityCard.scrollHeight,
        alignItems: gridComputed.alignItems,
        alignSelf: actComputed.alignSelf,
        activityItemsCount: activityTimeline ? activityTimeline.children.length : 0
      };
    });

    console.log('  Card Metrics:', JSON.stringify(cardMetrics, null, 2));

    // Cards should both start at the exact same top position
    assert(Math.abs(cardMetrics.batchesTop - cardMetrics.activityTop) < 2, 
      `Both cards start at the same top position (Batches: ${cardMetrics.batchesTop}px, Activity: ${cardMetrics.activityTop}px)`);

    // Grid alignItems should be 'start'
    assert(cardMetrics.alignItems === 'start', 
      `.dash-bottom-grid has align-items: start (found: ${cardMetrics.alignItems})`);

    // Activity card should not stretch to batches card height if content is smaller
    assert(cardMetrics.activityHeight < cardMetrics.batchesHeight, 
      `Activity card height (${cardMetrics.activityHeight.toFixed(1)}px) fits its content and is less than Batches card height (${cardMetrics.batchesHeight.toFixed(1)}px)`);

    // Activity card should end naturally after its content
    assert(Math.abs(cardMetrics.activityHeight - cardMetrics.activityContentHeight) <= 2, 
      `Activity card ends naturally with content (Height: ${cardMetrics.activityHeight}px, scrollHeight: ${cardMetrics.activityContentHeight}px)`);

    // Test 2: Invisible Scrollbar Verification
    console.log('\n3. Testing Invisible Scrollbars Across Application...');
    const scrollbarStyles = await page.evaluate(() => {
      const htmlStyle = window.getComputedStyle(document.documentElement);
      const bodyStyle = window.getComputedStyle(document.body);
      const sidebar = document.querySelector('.app-sidebar');
      const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null;
      const timeline = document.querySelector('.dash-activity-timeline');
      const timelineStyle = timeline ? window.getComputedStyle(timeline) : null;
      const tableWrap = document.querySelector('.dash-table-wrap');
      const tableWrapStyle = tableWrap ? window.getComputedStyle(tableWrap) : null;

      return {
        htmlScrollbarWidth: htmlStyle.scrollbarWidth,
        bodyScrollbarWidth: bodyStyle.scrollbarWidth,
        sidebarScrollbarWidth: sidebarStyle ? sidebarStyle.scrollbarWidth : null,
        timelineScrollbarWidth: timelineStyle ? timelineStyle.scrollbarWidth : null,
        tableWrapScrollbarWidth: tableWrapStyle ? tableWrapStyle.scrollbarWidth : null
      };
    });

    console.log('  Scrollbar Styles:', JSON.stringify(scrollbarStyles, null, 2));
    assert(scrollbarStyles.htmlScrollbarWidth === 'none', 'HTML element has scrollbar-width: none');
    assert(scrollbarStyles.bodyScrollbarWidth === 'none', 'Body element has scrollbar-width: none');
    assert(scrollbarStyles.sidebarScrollbarWidth === 'none', 'Sidebar has scrollbar-width: none');
    assert(scrollbarStyles.timelineScrollbarWidth === 'none', 'Activity timeline has scrollbar-width: none');
    assert(scrollbarStyles.tableWrapScrollbarWidth === 'none', 'Table wrapper has scrollbar-width: none');

    // Test scrolling is fully functional
    console.log('\n4. Testing Full Page Scrolling Functionality...');
    await page.evaluate(() => window.scrollTo(0, 300));
    const scrolledY = await page.evaluate(() => window.scrollY);
    assert(scrolledY >= 200, `Page successfully scrolled to Y=${scrolledY}px using JavaScript/wheel scroll`);
    await page.evaluate(() => window.scrollTo(0, 0));

    // Test 3: Modal Scroll Locking and Scroll Position Preservation
    console.log('\n5. Testing Modal Scroll Isolation & Background Scroll Locking...');
    // Scroll page down 250px first
    await page.evaluate(() => window.scrollTo(0, 250));
    const initialScrollY = await page.evaluate(() => window.scrollY);
    console.log(`  Initial scroll position before opening modal: ${initialScrollY}px`);

    // Open Add Batch Modal
    await page.evaluate(() => openModal('addBatchModal'));
    await new Promise(r => setTimeout(r, 200));

    const lockStateDuringModal = await page.evaluate(() => {
      const isModalOpenClass = document.body.classList.contains('modal-open');
      const bodyPos = document.body.style.position;
      const bodyTop = document.body.style.top;
      const modal = document.getElementById('addBatchModal');
      const modalVisible = modal && modal.style.display !== 'none';
      const modalBox = modal.querySelector('.sb-modal');
      const overscroll = modalBox ? window.getComputedStyle(modalBox).overscrollBehavior : null;
      const modalScrollbar = modalBox ? window.getComputedStyle(modalBox).scrollbarWidth : null;

      return {
        isModalOpenClass,
        bodyPos,
        bodyTop,
        modalVisible,
        overscroll,
        modalScrollbar
      };
    });

    console.log('  State During Modal Open:', JSON.stringify(lockStateDuringModal, null, 2));
    assert(lockStateDuringModal.modalVisible === true, 'Add Batch Modal is open and visible');
    assert(lockStateDuringModal.isModalOpenClass === true, 'body has .modal-open class');
    assert(lockStateDuringModal.bodyPos === 'fixed', 'body has position: fixed for lock');
    assert(lockStateDuringModal.bodyTop === `-${initialScrollY}px`, `body is locked at top=-${initialScrollY}px`);
    assert(lockStateDuringModal.overscroll === 'contain', 'Modal content has overscroll-behavior: contain');
    assert(lockStateDuringModal.modalScrollbar === 'none', 'Modal content has scrollbar-width: none');

    // Attempt to scroll window while modal is open
    await page.evaluate(() => window.scrollTo(0, 800));
    const scrollDuringModal = await page.evaluate(() => window.scrollY);
    assert(scrollDuringModal === 0, 'Window scroll position is locked and stationary during modal open');

    // Close the modal
    await page.evaluate(() => closeModal('addBatchModal'));
    await new Promise(r => setTimeout(r, 250));

    const stateAfterModalClose = await page.evaluate(() => {
      const isModalOpenClass = document.body.classList.contains('modal-open');
      const bodyPos = document.body.style.position;
      const currentScrollY = window.scrollY;
      return {
        isModalOpenClass,
        bodyPos,
        currentScrollY
      };
    });

    console.log('  State After Modal Close:', JSON.stringify(stateAfterModalClose, null, 2));
    assert(stateAfterModalClose.isModalOpenClass === false, 'body.modal-open class removed after close');
    assert(stateAfterModalClose.bodyPos === '', 'body position: fixed removed after close');
    assert(Math.abs(stateAfterModalClose.currentScrollY - initialScrollY) <= 2, 
      `Background scroll position accurately restored to ${stateAfterModalClose.currentScrollY}px (expected: ${initialScrollY}px)`);

    // Test 4: Multiple / Nested Modals
    console.log('\n6. Testing Multiple / Nested Modals Stack Management...');
    await page.evaluate(() => window.scrollTo(0, 180));
    const beforeNestedScroll = await page.evaluate(() => window.scrollY);

    // Open first modal
    await page.evaluate(() => openModal('addBatchModal'));
    await new Promise(r => setTimeout(r, 100));
    // Open second modal (e.g. coachConflictModal)
    await page.evaluate(() => openModal('coachConflictModal'));
    await new Promise(r => setTimeout(r, 100));

    const stackStateBothOpen = await page.evaluate(() => {
      return {
        modalOpenClass: document.body.classList.contains('modal-open'),
        bodyPos: document.body.style.position,
        conflictVisible: document.getElementById('coachConflictModal').style.display !== 'none',
        batchVisible: document.getElementById('addBatchModal').style.display !== 'none'
      };
    });

    assert(stackStateBothOpen.conflictVisible && stackStateBothOpen.batchVisible, 'Both modals registered in stack');
    assert(stackStateBothOpen.bodyPos === 'fixed', 'Background remains locked with 2 modals open');

    // Close top modal (coachConflictModal)
    await page.evaluate(() => closeModal('coachConflictModal'));
    await new Promise(r => setTimeout(r, 100));

    const stackStateOneClosed = await page.evaluate(() => {
      return {
        modalOpenClass: document.body.classList.contains('modal-open'),
        bodyPos: document.body.style.position,
        conflictVisible: document.getElementById('coachConflictModal').style.display !== 'none',
        batchVisible: document.getElementById('addBatchModal').style.display !== 'none'
      };
    });

    assert(!stackStateOneClosed.conflictVisible, 'Top modal closed successfully');
    assert(stackStateOneClosed.batchVisible, 'Bottom modal remains open');
    assert(stackStateOneClosed.bodyPos === 'fixed', 'Background STILL remains locked while 1 modal is open');

    // Close remaining modal (addBatchModal)
    await page.evaluate(() => closeModal('addBatchModal'));
    await new Promise(r => setTimeout(r, 200));

    const stackStateAllClosed = await page.evaluate(() => {
      return {
        modalOpenClass: document.body.classList.contains('modal-open'),
        bodyPos: document.body.style.position,
        restoredScroll: window.scrollY
      };
    });

    assert(stackStateAllClosed.bodyPos === '', 'Background unlocked after final modal closed');
    assert(Math.abs(stackStateAllClosed.restoredScroll - beforeNestedScroll) <= 2, 
      `Background scroll position correctly restored to ${stackStateAllClosed.restoredScroll}px`);

    // Test 5: Report Preview Modal Scroll Lock & Dismissal
    console.log('\n7. Testing Report Preview Modal...');
    await page.evaluate(() => window.scrollTo(0, 100));
    await page.evaluate(async () => {
      if (typeof initReportsModule === 'function') {
        await initReportsModule();
      }
      if (typeof window.openReportPreview === 'function') {
        window.openReportPreview('activity_report');
      } else {
        openModal('reportPreviewModal');
      }
    });
    await new Promise(r => setTimeout(r, 600));

    const reportModalState = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      const isVisible = modal && modal.style.display !== 'none';
      const bodyLocked = document.body.classList.contains('modal-open') && document.body.style.position === 'fixed';
      const modalBody = modal.querySelector('.report-modal-body');
      const overscroll = modalBody ? window.getComputedStyle(modalBody).overscrollBehavior : null;
      const scrollbar = modalBody ? window.getComputedStyle(modalBody).scrollbarWidth : null;
      return { isVisible, bodyLocked, overscroll, scrollbar };
    });

    assert(reportModalState.isVisible === true, 'Report Preview Modal opened');
    assert(reportModalState.bodyLocked === true, 'Body locked during Report Preview Modal open');
    assert(reportModalState.overscroll === 'contain', 'Report modal body has overscroll-behavior: contain');
    assert(reportModalState.scrollbar === 'none', 'Report modal body has scrollbar-width: none');

    // Close Report Preview Modal
    await page.evaluate(() => closeModal('reportPreviewModal'));
    await new Promise(r => setTimeout(r, 250));
    const reportModalClosed = await page.evaluate(() => {
      const modal = document.getElementById('reportPreviewModal');
      return !modal || modal.style.display === 'none';
    });
    assert(reportModalClosed === true, 'Report Preview Modal closed cleanly');

    // Test 6: Responsive Testing Across All Viewports
    console.log('\n8. Responsive Testing Across 7 Viewports...');
    const viewports = [
      { name: 'Mobile XS', width: 320, height: 568 },
      { name: 'Mobile S', width: 375, height: 667 },
      { name: 'Mobile M', width: 430, height: 932 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop Small', width: 1024, height: 768 },
      { name: 'Desktop Standard', width: 1366, height: 768 },
      { name: 'Desktop Large', width: 1920, height: 1080 }
    ];

    for (const vp of viewports) {
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise(r => setTimeout(r, 150));

      const vpMetrics = await page.evaluate((vpWidth) => {
        const docWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body.scrollWidth;
        const bCard = document.getElementById('panelBatchesOverview');
        const aCard = document.getElementById('panelActivityOverview');
        const bRect = bCard.getBoundingClientRect();
        const aRect = aCard.getBoundingClientRect();

        // Check if stacked or side-by-side
        const isStacked = aRect.top >= bRect.bottom - 5;
        // Check horizontal overflow
        const hasHorizontalOverflow = docWidth > vpWidth || bodyWidth > vpWidth;

        return {
          vpWidth,
          docWidth,
          hasHorizontalOverflow,
          isStacked,
          batchesHeight: bRect.height,
          activityHeight: aRect.height
        };
      }, vp.width);

      const overflowOk = !vpMetrics.hasHorizontalOverflow;
      assert(overflowOk, `${vp.name} (${vp.width}px): No horizontal overflow (scrollWidth=${vpMetrics.docWidth}px, vpWidth=${vp.width}px)`);

      if (vp.width <= 1024) {
        assert(vpMetrics.isStacked, `${vp.name} (${vp.width}px): Batches and Activity cards stack vertically as expected`);
      } else {
        assert(!vpMetrics.isStacked, `${vp.name} (${vp.width}px): Batches and Activity cards display side-by-side with independent heights`);
      }

      assert(vpMetrics.activityHeight > 50, `${vp.name} (${vp.width}px): Activity card renders with natural content height (${vpMetrics.activityHeight.toFixed(0)}px)`);
    }

    // Step 7: Regression Testing
    console.log('\n9. Regression Testing Existing Modules & Navigation...');
    // Reset to desktop view
    await page.setViewport({ width: 1366, height: 768 });
    await new Promise(r => setTimeout(r, 200));

    // Test Navigation to Batches
    await page.click('a[href="#batches"]');
    await page.waitForSelector('#batchesSection', { visible: true });
    const batchesSectionVisible = await page.evaluate(() => {
      const sec = document.getElementById('batchesSection');
      return sec && sec.style.display !== 'none';
    });
    assert(batchesSectionVisible, 'Navigation to Batches module works');

    // Test Navigation to Students
    await page.click('a[href="#students"]');
    await page.waitForSelector('#studentsSection', { visible: true });
    const studentsSectionVisible = await page.evaluate(() => {
      const sec = document.getElementById('studentsSection');
      return sec && sec.style.display !== 'none';
    });
    assert(studentsSectionVisible, 'Navigation to Students module works');

    // Return to Dashboard Overview
    await page.click('a[href="#overview"]');
    await page.waitForSelector('#dashOverviewSection', { visible: true });
    const overviewVisible = await page.evaluate(() => {
      const sec = document.getElementById('dashOverviewSection');
      return sec && sec.style.display !== 'none';
    });
    assert(overviewVisible, 'Navigation back to Dashboard Overview works');

    console.log(`\n==================================================`);
    console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log(`==================================================\n`);

    if (passedTests === totalTests) {
      console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
    } else {
      console.error(`SOME TESTS FAILED: ${totalTests - passedTests} failure(s)`);
      process.exitCode = 1;
    }

  } catch (err) {
    console.error('Test execution failed with error:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
