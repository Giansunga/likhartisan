async (page) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => Number(document.querySelector('output')?.textContent) > 0);
  const before = Number(await page.getByLabel('Analysis passes').textContent());
  await page.waitForTimeout(1000);
  const idle = Number(await page.getByLabel('Analysis passes').textContent());
  await page.getByRole('button', { name: 'Nudge shape', exact: true }).click();
  await page.waitForFunction(count => Number(document.querySelector('output')?.textContent) > count, idle);
  const afterEdit = Number(await page.getByLabel('Analysis passes').textContent());
  const result = JSON.parse(await page.getByLabel('Analysis result').textContent());
  await page.locator('canvas').screenshot({ path: 'D:/Project/likhartisan (capstone)/gallery-app/output/freeform-repair/read-only-preview.png' });
  return { before, idle, afterEdit, status: result.status, placements: Object.values(result.placements).map(p => ({ status:p.status, rotation:p.transform.twistDegrees, depth:p.transform.surfaceOffsetRatio })) };
}
