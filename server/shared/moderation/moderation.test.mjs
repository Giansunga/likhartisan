import { test } from 'node:test';
import assert from 'node:assert/strict';
import { censorText, censorMessageRecord, censorMessageBody, censorRpc } from './index.mjs';
import { censorText as browserCensor } from '../../../gallery-app/src/lib/generated/moderation/index.mjs';
import { fixtures } from './fixtures.mjs';
import { readFile } from 'node:fs/promises';

test('generated browser code is identical to the shared source', async () => {
  for (const file of ['index.mjs','dictionary.mjs']) {
    const source = await readFile(new URL(file,import.meta.url),'utf8');
    const generated = await readFile(new URL(`../../../gallery-app/src/lib/generated/moderation/${file}`,import.meta.url),'utf8');
    assert.equal(generated.slice(generated.indexOf('\n')+1),source);
  }
});

test('shared fixtures match browser and server; filtering is idempotent', () => {
  for (const [input, expected] of fixtures) {
    assert.equal(censorText(input), expected, String(input));
    assert.equal(browserCensor(input), expected);
    assert.equal(censorText(expected), expected);
  }
});
test('structured messages and RPCs preserve non-message fields', () => {
  const payload = { type: 'product_inquiry', productName: 'shit', productPrice: 100, message: 'shit', productImage: 'https://example.com/fuck.jpg', design: { note: 'shit' } };
  assert.deepEqual(JSON.parse(censorMessageBody(JSON.stringify(payload))), { ...payload, message: '****' });
  const original = { p_buyer_note: 'gago', p_design_snapshot: { name: 'gago' }, p_quantity: 100 };
  assert.deepEqual(censorRpc('submit_design_request', original), { ...original, p_buyer_note: '****' });
  assert.deepEqual(censorRpc('unrelated', original), original);
  assert.deepEqual(censorMessageRecord('products', { description: 'shit' }), { description: 'shit' });
  assert.deepEqual(censorMessageRecord('design_request_events', { payload: { response: 'puta', summary: { shop_response: 'shit', name: 'shit' }, design_snapshot: { note: 'shit' } } }), { payload: { response: '****', summary: { shop_response: '****', name: 'shit' }, design_snapshot: { note: 'shit' } } });
});
