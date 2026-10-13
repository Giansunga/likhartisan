async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:4173/?pane-width=${Date.now()}#home-collections`, { waitUntil: 'domcontentloaded' });
  const nav = page.getByRole('navigation', { name: 'Landing page sections' });
  await nav.waitFor({ state: 'visible' });
  const dimensions = await nav.locator('ol').boundingBox();
  const dot = await nav.locator('.home-section-nav__dot').first().boundingBox();
  if (dimensions.width !== 32 || dimensions.height !== 238) throw new Error('Unexpected pane dimensions');
  if (Math.abs(dot.x + dot.width / 2 - dimensions.x - dimensions.width / 2) > .5) throw new Error('Dots are not centered');
  await page.mouse.move(500, 90);
  await nav.screenshot({ path: 'output/playwright/landing-pane-dots.png' });
  return { width: dimensions.width, height: dimensions.height, dotsCentered: true };
}
