async (page) => {
  await page.route('**/*youtube*', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Shop tour preview</body></html>' }));
  await page.goto('http://127.0.0.1:4173/#home-collections', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Landing page sections' }).waitFor({ state: 'visible' });
}
