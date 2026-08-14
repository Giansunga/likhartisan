import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent } from './chatbotController.js';

const CASES = [
  ['Where is my order?', 'order'], ['Nasaan na ang order ko?', 'order'], ['Track my package', 'order'],
  ['Show me terracotta bowls', 'product'], ['Magkano ang paso?', 'product'], ['May ceramic vase ba?', 'product'],
  ['Which artisan made this?', 'shop'], ['Pakita ang mga tindahan', 'shop'],
  ['How do I customize a 3D design?', 'freeform'], ['Paano baguhin ang kulay sa Freeform?', 'freeform'],
  ['Can I pay using GCash?', 'checkout'], ['Paano magbayad gamit ang Maya?', 'checkout'],
  ['How much is delivery?', 'shipping'], ['May courier delivery ba?', 'shipping'],
  ['I need a refund', 'returns'], ['Paano kanselahin ang binili ko?', 'returns'],
  ['I forgot my password', 'account'], ['Paano mag-login?', 'account'],
  ['Tell me about LikhArtisan', 'general'], ['Hello po', 'general'],
];

test('routes at least 90 percent of the bilingual support evaluation set correctly', () => {
  const correct = CASES.filter(([message, intent]) => detectIntent(message).primary === intent).length;
  assert.ok(correct / CASES.length >= 0.9, `${correct}/${CASES.length} evaluation prompts routed correctly`);
});
