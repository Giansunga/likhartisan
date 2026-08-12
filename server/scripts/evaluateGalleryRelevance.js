import fs from 'node:fs/promises';

const baseUrl = (process.env.GALLERY_SEARCH_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const fixtures = JSON.parse(await fs.readFile(new URL('../test/fixtures/gallery-relevance.json', import.meta.url), 'utf8'));
let passed = 0;
const failures = [];

for (const fixture of fixtures) {
  const response = await fetch(`${baseUrl}/api/gallery/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: fixture.query,
      page: 1,
      sort: 'relevance',
      visibleFilters: { category: null, shopId: null, favoritesOnly: false, favoriteProductIds: [] },
    }),
  });
  if (!response.ok) {
    failures.push(`${fixture.query}: HTTP ${response.status}`);
    continue;
  }
  const result = await response.json();
  const topFive = result.products.slice(0, 5);
  const noInactive = result.products.every(product => product.status === 'active');
  const noPriceViolations = result.products.every(product =>
    (fixture.minPrice == null || product.effectivePrice >= fixture.minPrice)
    && (fixture.maxPrice == null || product.effectivePrice <= fixture.maxPrice));
  const relevantInTopFive = topFive.some(product => product.category === fixture.expectedCategory);
  if (noInactive && noPriceViolations && relevantInTopFive) passed += 1;
  else failures.push(`${fixture.query}: category=${relevantInTopFive}, active=${noInactive}, price=${noPriceViolations}`);
}

const score = passed / fixtures.length;
console.log(`Gallery relevance: ${passed}/${fixtures.length} (${(score * 100).toFixed(0)}%)`);
for (const failure of failures) console.error(`- ${failure}`);
if (score < 0.8 || failures.some(failure => /active=false|price=false/.test(failure))) process.exitCode = 1;
