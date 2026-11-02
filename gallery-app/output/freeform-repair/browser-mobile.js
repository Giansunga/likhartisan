async (page) => {
  const result = [];
  for (const name of ['Horizontal Position', 'Depth / Surface Offset', 'Scale']) {
    const slider = page.getByRole('slider', { name, exact: true });
    const before = await slider.inputValue();
    await slider.press('ArrowRight');
    result.push({ name, before, after: await slider.inputValue() });
  }
  await page.getByRole('button', { name: 'Reset Adjustments', exact: true }).click();
  await page.screenshot({ path: 'D:/Project/likhartisan (capstone)/gallery-app/output/freeform-repair/desktop-attachments.png' });
  await page.setViewportSize({ width: 393, height: 852 });
  const slider = page.getByRole('slider', { name: 'Handle Thickness', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const point = { x: box.x + box.width * .5, y: box.y + box.height * .5, radiusX: 1, radiusY: 1, force: 1, id: 1 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, x: box.x + box.width * .65 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const touchValue = await slider.inputValue();
  await page.screenshot({ path: 'D:/Project/likhartisan (capstone)/gallery-app/output/freeform-repair/mobile-attachments.png', fullPage: true });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await client.detach();
  return { keyboard: result, touchValue, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
}
