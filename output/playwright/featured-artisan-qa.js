async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.unroute('**/*');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'giansunga396@gmail.com', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} };
  await page.addInitScript(({ user }) => {
    const expires_at = Math.floor(Date.now() / 1000) + 3600;
    const jwt = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: expires_at })) + '.mock';
    localStorage.setItem('sb-wlnknpbjkcmxwxtuspeh-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'mock-refresh', expires_at, expires_in: 3600, token_type: 'bearer', user }));
  }, { user });
  const artisans = [{ id: 'juan', shop_id: 'shop-one', name: 'Juan Dela Cruz', specialty: 'Master Potter' }, { id: 'ana', shop_id: 'shop-two', name: 'Ana Reyes', specialty: 'Ceramic Artist' }];
  const shops = [{ id: 'shop-one', name: 'Clay Studio', image: '' }, { id: 'shop-two', name: 'Second Studio', image: '' }, { id: 'shop-empty', name: 'Empty Studio', image: '' }];
  const products = [{ id: 'qa-product', name: 'Bigasan', category: 'Jars', price: 2600, stock: 3, image: '/images/artisan_1.jpg', materials: 'Terracotta Clay', technique: 'Handcrafted & Kiln-Fired', shop_id: 'shop-one', shop_name: 'Clay Studio', featured_artisan_id: 'juan', status: 'active', measurement_unit: 'in' }];
  const variations = [{ id: 'qa-variation', product_id: 'qa-product', dimensions: '32 × 18 in', height: '32 in', opening_diameter: '18 in', price: 2600, stock: 3, product_weight_g: 28000, weight_kg: 28, measurement_unit: 'in', sort_order: 0 }];
  const writes = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname.includes('supabase')) {
      if (url.pathname.startsWith('/auth/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      if (url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.split('/').at(-1);
        if (url.pathname.includes('/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '3' });
        let rows = table === 'products' ? products : table === 'artisans' ? artisans : table === 'shops' ? shops : table === 'product_variations' ? variations : [];
        for (const [key, value] of url.searchParams) { if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3)); if (value.startsWith('in.(')) rows = rows.filter(row => value.slice(4,-1).split(',').includes(String(row[key]))); }
        const method = route.request().method();
        if (!['GET','HEAD'].includes(method)) {
          const payload = route.request().postDataJSON(); writes.push({ table, method, payload });
          if (table === 'products' && method === 'PATCH') Object.assign(products[0], payload);
          rows = table === 'products' ? [{ id: 'qa-product' }] : table === 'product_variations' ? [{ id: 'qa-variation' }] : [];
        }
        const object = route.request().headers().accept?.includes('vnd.pgrst.object');
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-' + Math.max(0,rows.length-1) + '/' + rows.length }, body: method === 'HEAD' ? '' : JSON.stringify(object ? rows[0] ?? null : rows) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname.startsWith('/api/') || url.port === '3001') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.continue();
  });
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const results = [];
  for (const width of [1440,390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:4173/admin/products/create');
    const select = page.getByRole('combobox', { name: 'Featured Artisan *' });
    await select.waitFor(); check(await select.isDisabled(), 'Artisan selector must wait for a shop');
    await page.locator('select[name="shopId"]').selectOption('shop-one');
    await select.locator('option[value="juan"]').waitFor({ state: 'attached' });
    check(await select.locator('option[value="ana"]').count() === 0, 'Cross-shop artisan visible');
    await select.focus(); await page.keyboard.press('j'); await page.keyboard.press('Enter');
    await select.selectOption('juan');
    await page.getByText('Master Potter', { exact: true }).waitFor();
    await page.screenshot({ path: 'output/playwright/featured-artisan-create-' + width + '.png', fullPage: true });
    check(await overflow(), 'Upload page overflows');
    await page.locator('select[name="shopId"]').selectOption('shop-two');
    await select.locator('option[value="ana"]').waitFor({ state: 'attached' });
    check(await select.inputValue() === '', 'Changing shop must clear artisan');
    check(await select.locator('option[value="juan"]').count() === 0, 'Previous artisan remained visible');
    await page.locator('select[name="shopId"]').selectOption('shop-empty');
    await page.getByText(/No artisans belong/).waitFor();
    check(await select.isDisabled(), 'Empty-shop selector must be disabled');
    await page.goto('http://127.0.0.1:4173/admin/products');
    await page.getByRole('button', { name: 'Edit', exact: true }).filter({ visible: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit Product' });
    await editor.getByRole('combobox', { name: 'Featured Artisan *' }).locator('option[value="juan"]').waitFor({ state: 'attached' });
    check(await editor.getByRole('combobox', { name: 'Featured Artisan *' }).inputValue() === 'juan', 'Saved artisan not preselected');
    await page.screenshot({ path: 'output/playwright/featured-artisan-edit-' + width + '.png', fullPage: true });
    check(await overflow(), 'Edit page overflows');
    await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });
    check(writes.some(write => write.table === 'products' && write.payload.featured_artisan_id === 'juan'), 'Artisan missing from edit save');
    await page.goto('http://127.0.0.1:4173/product/qa-product');
    await page.getByText('Juan Dela Cruz', { exact: true }).waitFor();
    check(await page.locator('.pdp-media .pdp-featured-artisan').count() === 1, 'Artisan must appear beneath product media');
    await page.screenshot({ path: 'output/playwright/featured-artisan-product-' + width + '.png', fullPage: true });
    check(await overflow(), 'Product page overflows');
    results.push({ width, shopFiltering: true, shopReset: true, emptyShop: true, editPreselection: true, mockedSave: true, publicRow: true, noOverflow: true });
  }
  check(errors.length === 0, 'Browser errors: ' + errors.join('; '));
  return { results, errors, mockedWrites: writes.length };
}
