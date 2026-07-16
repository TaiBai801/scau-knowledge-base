const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto('http://localhost:4173/majors/dianzikexue/semester1-1', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '.workbuddy/screenshots/nav-course-list.png', fullPage: false });
  
  // Log nav structure
  const navInfo = await page.evaluate(() => {
    const links = document.querySelectorAll('.VPNavBarMenuLink');
    const flyout = document.querySelector('.VPFlyout .button');
    const contentBody = document.querySelector('.VPNavBar .content-body');
    return {
      navLinkCount: links.length,
      navLinks: Array.from(links).map(l => ({
        text: l.textContent.trim(),
        bg: getComputedStyle(l).background,
        color: getComputedStyle(l).color,
        fontSize: getComputedStyle(l).fontSize,
        fontWeight: getComputedStyle(l).fontWeight,
        padding: getComputedStyle(l).padding,
        borderRadius: getComputedStyle(l).borderRadius,
      })),
      flyoutBtn: flyout ? {
        bg: getComputedStyle(flyout).background,
        color: getComputedStyle(flyout).color,
        fontSize: getComputedStyle(flyout).fontSize,
        padding: getComputedStyle(flyout).padding,
      } : null,
      contentBodyJustify: contentBody ? getComputedStyle(contentBody).justifyContent : null,
      navBarBg: getComputedStyle(document.querySelector('.VPNavBar')).background,
    };
  });
  
  console.log(JSON.stringify(navInfo, null, 2));
  
  await page.goto('http://localhost:4173/majors/shared/courses/c', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '.workbuddy/screenshots/nav-course-detail.png', fullPage: false });
  
  const detailNavInfo = await page.evaluate(() => {
    const links = document.querySelectorAll('.VPNavBarMenuLink');
    const contentBody = document.querySelector('.VPNavBar .content-body');
    return {
      navLinkCount: links.length,
      navLinks: Array.from(links).map(l => ({
        text: l.textContent.trim(),
        bg: getComputedStyle(l).background,
        color: getComputedStyle(l).color,
        fontSize: getComputedStyle(l).fontSize,
        fontWeight: getComputedStyle(l).fontWeight,
      })),
      contentBodyJustify: contentBody ? getComputedStyle(contentBody).justifyContent : null,
    };
  });
  
  console.log('--- DETAIL PAGE ---');
  console.log(JSON.stringify(detailNavInfo, null, 2));
  
  await browser.close();
})();
