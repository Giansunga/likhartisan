async (page) => {
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Back', exact: true }).click();
  const height = page.getByRole('slider', { name: 'Height', exact: true });
  await height.scrollIntoViewIfNeeded();
  const box = await height.boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const point = { x: box.x + box.width * .5, y: box.y + box.height * .5, radiusX: 1, radiusY: 1, force: 1, id: 1 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, x: box.x + box.width * .6 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const changedHeight = await height.inputValue();
  await page.getByText('Checking attachments for this design…', { exact: true }).waitFor({ state: 'hidden' });
  await page.screenshot({ path: 'D:/Project/likhartisan (capstone)/gallery-app/output/freeform-repair/mobile-shape.png', fullPage: true });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await client.detach();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await page.getByText('Checking attachments for this design…', { exact: true }).waitFor({ state: 'hidden' });
  return { changedHeight, saveEnabled: await page.getByRole('button', { name: 'Save Design', exact: true }).isEnabled(),
    sendEnabled: await page.getByRole('button', { name: 'Send to Shop', exact: true }).isEnabled(),
    attachments: (await page.locator('main').innerText()).includes('Bamboo Loop') };
}
