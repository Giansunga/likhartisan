import test from 'node:test';
import assert from 'node:assert/strict';
import { cmToInches, normalizeCatalogMeasurement } from './measurements.js';

test('uses the exact 2.54 cm per inch conversion', () => {
  assert.equal(cmToInches(2.54), 1);
  assert.equal(Number(cmToInches(20).toFixed(2)), 7.87);
});

test('normalizes legacy catalog measurements before order snapshots', () => {
  assert.equal(normalizeCatalogMeasurement('20 x 10 cm', 'cm'), '7.87 in x 3.94 in');
  assert.equal(normalizeCatalogMeasurement('8 in', 'in'), '8.00 in');
});
