async (page) => {
  if (await page.getByRole('heading', { name: 'Select a Shop' }).count()) {
    await page.getByRole('button', { name: /Maria.s Pots Jars.*Options/ }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  }
  if (await page.getByRole('button', { name: 'Bottle Teracotta Vase Bottle Teracotta Vase Vase', exact: true }).count()) {
    await page.getByRole('button', { name: 'Bottle Teracotta Vase Bottle Teracotta Vase Vase', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  }
  const samples = [];
  for (const name of ['Height', 'Body Width', 'Neck Width', 'Rim Size', 'Curvature']) {
    const slider = page.getByRole('slider', { name, exact: true });
    const start = await slider.inputValue();
    await slider.focus();
    await slider.press('End');
    const maximum = await slider.inputValue();
    await slider.press('Home');
    const minimum = await slider.inputValue();
    samples.push({ name, start, minimum, maximum });
    await page.getByRole('button', { name: 'Reset Shape', exact: true }).click();
  }
  const height = page.getByRole('slider', { name: 'Height', exact: true });
  const box = await height.boundingBox();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .5, { steps: 5 });
  await page.mouse.move(box.x + box.width + 30, box.y + 40);
  await page.mouse.up();
  const releasedValue = await height.inputValue();
  await page.getByRole('button', { name: 'Reset Shape', exact: true }).click();
  await page.screenshot({ path: 'D:/Project/likhartisan (capstone)/gallery-app/output/freeform-repair/desktop-shape.png' });
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  return { samples, releasedValue, text: (await page.locator('main').innerText()).slice(0,1600) };
}
