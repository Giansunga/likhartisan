import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent, detectSupportGoal } from './chatbotController.js';

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

const SUPPORT_GOAL_CASES = [
  ['Where is my order?', 'delivery_details'], ['Nasaan ang parcel ko?', 'delivery_details'], ['Track my package please', 'delivery_details'],
  ['Is my payment complete?', 'payment_status'], ['Bayad na ba ang order ko?', 'payment_status'], ['Can I pay with GCash?', 'payment_status'],
  ['Can I cancel my order?', 'cancel_order'], ['Gusto ko kanselahin ang binili ko', 'cancel_order'],
  ['What is the status of my refund?', 'return_status'], ['Nasaan ang return request ko?', 'return_status'], ['May refund update ba?', 'return_status'],
  ['I forgot my password', 'account_recovery'], ['Paano i-reset ang password?', 'account_recovery'],
  ['Contact the seller', 'contact_seller'], ['Gusto kong i-message ang artisan', 'contact_seller'],
  ['Help', 'clarify'], ['Patulong', 'clarify'],
];

test('routes every bilingual support-goal evaluation prompt to a practical customer goal', () => {
  for (const [message, goal] of SUPPORT_GOAL_CASES) assert.equal(detectSupportGoal(message), goal, message);
});
