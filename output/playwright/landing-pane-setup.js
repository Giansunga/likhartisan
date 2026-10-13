async (page) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname.includes('supabase')) {
      const data = url.pathname.includes('/rest/v1/shops') ? [{ id: 'qa-clay-corner', name: 'Clay Corner', description: '', banner: '', image: '', location: 'Santo Tomas' }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    }
    if (url.pathname.startsWith('/api/') || url.port === '3001') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.continue();
  });
}
