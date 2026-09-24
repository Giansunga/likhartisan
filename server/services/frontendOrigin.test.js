import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedFrontendOrigin } from './frontendOrigin.js';

test('allows requests without an Origin header, local development, and the configured frontend', () => {
  assert.equal(isAllowedFrontendOrigin(undefined, 'https://likhartisan.com'), true);
  assert.equal(isAllowedFrontendOrigin('http://localhost:5173', 'https://likhartisan.com'), true);
  assert.equal(isAllowedFrontendOrigin('https://likhartisan.com', 'https://likhartisan.com'), true);
});

test('allows project preview deployments but rejects the legacy production host', () => {
  assert.equal(isAllowedFrontendOrigin('https://likhartisan-feature-branch.vercel.app', 'https://likhartisan.com'), true);
  assert.equal(isAllowedFrontendOrigin('https://likhartisan.vercel.app', 'https://likhartisan.com'), false);
});

test('rejects unrelated origins and lookalike preview hosts', () => {
  assert.equal(isAllowedFrontendOrigin('https://example.com', 'https://likhartisan.com'), false);
  assert.equal(isAllowedFrontendOrigin('https://likhartisan.vercel.app.example.com', 'https://likhartisan.com'), false);
});
