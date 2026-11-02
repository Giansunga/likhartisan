async (page) => {
  await page.getByRole('button', { name: 'Bamboo Loop ₱0 each', exact: true }).click();
  await page.getByRole('button', { name: 'Pair', exact: true }).click();
  await page.getByRole('slider', { name: 'Horizontal Position', exact: true }).waitFor();
  const controls = [];
  for (const name of ['Horizontal Position', 'Vertical Position', 'Depth / Surface Offset', 'Rotation', 'Scale', 'Handle Thickness']) {
    const slider = page.getByRole('slider', { name, exact: true });
    await slider.focus();
    await slider.press('ArrowRight');
    await page.getByText('Checking attachments for this design…', { exact: true }).waitFor({ state: 'hidden' });
    controls.push({ name, value: await slider.inputValue(), min: await slider.getAttribute('min'), max: await slider.getAttribute('max') });
  }
  await page.getByRole('tab', { name: 'Right', exact: true }).click();
  await page.getByRole('slider', { name: 'Rotation', exact: true }).press('ArrowRight');
  await page.getByRole('button', { name: 'Reset Adjustments', exact: true }).click();
  await page.getByRole('tab', { name: 'Linked', exact: true }).click();
  await page.getByText('Checking attachments for this design…', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Hide socket places', exact: true }).click();
  await page.screenshot({ path: 'D:/Project/likhartisan (capstone)/gallery-app/output/freeform-repair/desktop-attachments.png' });
  return { controls, text: (await page.locator('main').innerText()).slice(0,1400) };
}
