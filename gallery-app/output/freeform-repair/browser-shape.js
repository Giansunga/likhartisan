async (page) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Bottle Teracotta Vase Bottle Teracotta Vase Vase', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).first().click();
  await page.getByRole('slider', { name: 'Height', exact: true }).waitFor();
  await page.screenshot({ path: 'D:/Project/likhartisan (capstone)/gallery-app/output/freeform-repair/desktop-shape.png' });
  return { sliders: await page.getByRole('slider').count(), body: (await page.locator('main').innerText()).slice(0,1300) };
}
