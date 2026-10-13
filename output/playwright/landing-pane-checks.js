async (page) => {
  const results = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); results.push(label); };
  const nav = page.getByRole('navigation', { name: 'Landing page sections' });
  const current = async () => nav.locator('[aria-current="location"]').getAttribute('aria-label');
  const waitCurrent = async label => page.waitForFunction(label => document.querySelector('.home-section-nav [aria-current="location"]')?.getAttribute('aria-label') === label, label);
  const jump = async id => {
    await page.evaluate(id => document.getElementById(id).scrollIntoView({ behavior: 'instant', block: 'start' }), id);
    await nav.waitFor({ state: 'visible' });
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:4173/?pane-check=${Date.now()}#home-collections`, { waitUntil: 'domcontentloaded' });
  await nav.waitFor({ state: 'visible' });
  await waitCurrent('Collections');
  const rail = await nav.locator('ol').boundingBox();
  check(rail.width === 32, 'Desktop rail is 32px wide');
  check(rail.height <= 240, 'Desktop rail is shortened to 238px');
  check(await nav.locator('.home-section-nav__dot').count() === 8, 'Eight dots replace the numbers');
  for (const [label, id] of [['Our Story', 'home-story'], ['Collections', 'home-collections'], ['Shops', 'home-shops'], ['Design Studio', 'home-design-studio'], ['Shop Tour', 'home-shop-tour'], ['Reviews', 'home-reviews'], ['About', 'home-about']]) {
    await nav.getByRole('link', { name: label, exact: true }).click();
    await waitCurrent(label);
    check(await page.evaluate(id => document.activeElement.id === id, id), `${label}: destination receives focus`);
    check(new URL(page.url()).hash === `#${id}`, `${label}: URL points to section`);
    const rect = await page.locator(`#${id}`).boundingBox();
    check(rect.y >= 99 && rect.y <= 101, `${label}: heading clears header`);
  }
  await nav.getByRole('link', { name: 'Our Story', exact: true }).click();
  await nav.getByRole('link', { name: 'Collections', exact: true }).click();
  await page.goBack(); await waitCurrent('Our Story');
  check(await page.evaluate(() => document.activeElement.id === 'home-story'), 'Back restores section focus');
  await page.goForward(); await waitCurrent('Collections');
  check(await page.evaluate(() => document.activeElement.id === 'home-collections'), 'Forward restores section focus');
  await nav.getByRole('link', { name: 'Design Studio', exact: true }).click();
  const designHash = new URL(page.url()).hash;
  for (const fraction of [.2, .6, .85]) {
    await page.evaluate(fraction => {
      const section = document.getElementById('home-design-studio');
      window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top + section.offsetHeight * fraction, behavior: 'instant' });
    }, fraction);
    await waitCurrent('Design Studio');
    check(new URL(page.url()).hash === designHash, `Design Studio ${fraction}: scrolling keeps URL unchanged`);
  }
  const historyLength = await page.evaluate(() => history.length);
  await nav.getByRole('link', { name: 'Design Studio', exact: true }).click();
  check(await page.evaluate(() => history.length) === historyLength, 'Repeated hash click adds no history entry');
  check(Math.abs((await page.locator('#home-design-studio').boundingBox()).y - 100) <= 1, 'Repeated hash returns to section start');
  await nav.getByRole('link', { name: 'Collections', exact: true }).click();
  await nav.getByRole('link', { name: 'Collections', exact: true }).hover();
  check(await nav.getByRole('link', { name: 'Collections', exact: true }).locator('.home-section-nav__label').evaluate(el => getComputedStyle(el).opacity === '1'), 'Hover reveals section label');
  await page.mouse.move(500, 90);
  await page.screenshot({ path: 'output/playwright/landing-pane-desktop.png' });
  await nav.screenshot({ path: 'output/playwright/landing-pane-dots.png' });
  await page.getByRole('button', { name: 'Open LikhAI customer support' }).click();
  check(!(await page.locator('.home-section-nav').isVisible()), 'Support panel hides pane');
  await page.getByRole('button', { name: 'Close LikhAI', exact: true }).click();
  await nav.waitFor({ state: 'visible' });
  check(await nav.isVisible(), 'Pane returns after support panel closes');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 600 }]) {
    await page.setViewportSize(size);
    await jump('home-collections');
    const button = nav.getByRole('button', { name: 'Sections', exact: true });
    await button.waitFor({ state: 'visible' });
    check(await button.getAttribute('aria-expanded') === 'false', `${size.width}x${size.height}: compact list starts closed`);
    await button.click();
    await nav.getByRole('link', { name: 'Shops', exact: true }).focus();
    await page.keyboard.press('Escape');
    check(await button.evaluate(el => document.activeElement === el), `${size.width}x${size.height}: Escape returns focus`);
    await button.click();
    await nav.getByRole('link', { name: 'Collections', exact: true }).focus();
    await page.keyboard.press('Enter');
    check(await button.getAttribute('aria-expanded') === 'false', `${size.width}x${size.height}: selection closes list`);
    check(await page.evaluate(() => document.activeElement.id === 'home-collections'), `${size.width}x${size.height}: keyboard selection focuses section`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${size.width}x${size.height}: no horizontal overflow`);
    const rect = await button.boundingBox();
    check(rect.width >= 44 && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= size.width, `${size.width}x${size.height}: control stays inside viewport`);
    if (size.width === 390) {
      await button.click();
      await page.screenshot({ path: 'output/playwright/landing-pane-mobile.png' });
      await page.mouse.click(10, 400);
      check(await button.getAttribute('aria-expanded') === 'false', 'Outside click closes mobile list');
    }
  }
  await page.setViewportSize({ width: 720, height: 450 });
  await jump('home-collections');
  check(await nav.getByRole('button', { name: 'Sections', exact: true }).isVisible(), '200 percent equivalent viewport uses compact controls');
  await nav.getByRole('button', { name: 'Sections', exact: true }).click();
  check(await nav.locator('ol').evaluate(el => el.scrollHeight > el.clientHeight), 'Short viewport menu scrolls');
  await nav.getByRole('link', { name: 'Top', exact: true }).click();
  await nav.waitFor({ state: 'hidden' });
  check(await page.evaluate(() => document.activeElement.id === 'home-top'), 'Top receives focus and hides pane');
  await page.setViewportSize({ width: 1440, height: 900 });
  await jump('home-about');
  await page.setViewportSize({ width: 1440, height: 300 });
  await page.evaluate(() => document.getElementById('main-footer').scrollIntoView({ behavior: 'instant' }));
  await nav.waitFor({ state: 'hidden' });
  check(!(await nav.isVisible()), 'Pane hides after landing page leaves view');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4173/#home-reviews', { waitUntil: 'domcontentloaded' });
  await waitCurrent('Reviews');
  check(await page.evaluate(() => document.activeElement.id === 'home-reviews'), 'Reloaded direct Reviews URL focuses destination');
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
}
