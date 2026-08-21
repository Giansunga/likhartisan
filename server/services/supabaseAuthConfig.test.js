import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSupabaseProjectUrls, verifySupabaseAuthConfiguration } from './supabaseAuthConfig.js';

test('matches frontend and backend Supabase project URLs without exposing them', () => {
  assert.equal(compareSupabaseProjectUrls('https://same.supabase.co', 'https://same.supabase.co/'), 'matched');
});

test('detects a different or malformed frontend Supabase project URL', () => {
  assert.equal(compareSupabaseProjectUrls('https://backend.supabase.co', 'https://frontend.supabase.co'), 'mismatch');
  assert.equal(compareSupabaseProjectUrls('not-a-url', 'https://frontend.supabase.co'), 'invalid');
});

test('reports a verified backend key without exposing it', async () => {
  const state = await verifySupabaseAuthConfiguration({
    backendUrl: 'https://same.supabase.co', frontendUrl: 'https://same.supabase.co', serviceKey: 'secret',
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.apikey, 'secret');
      return { ok: true, status: 200 };
    },
  });
  assert.equal(state, 'verified');
});

test('identifies a rejected backend key and an unavailable Auth service', async () => {
  const rejected = await verifySupabaseAuthConfiguration({
    backendUrl: 'https://same.supabase.co', serviceKey: 'wrong', fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  assert.equal(rejected, 'service_key_rejected');
  const unavailable = await verifySupabaseAuthConfiguration({
    backendUrl: 'https://same.supabase.co', serviceKey: 'secret', fetchImpl: async () => { throw new Error('network'); },
  });
  assert.equal(unavailable, 'auth_unreachable');
});
