import fs from 'node:fs';
import path from 'node:path';
import { compareSupabaseProjectUrls, verifySupabaseAuthConfiguration } from '../services/supabaseAuthConfig.js';

function envValue(filePath, name) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const line = contents.split(/\r?\n/).find(item => item.trimStart().startsWith(`${name}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') || '';
}

const serverEnv = path.resolve(process.cwd(), '.env');
const frontendEnv = path.resolve(process.cwd(), '../gallery-app/.env');
const backendUrl = envValue(serverEnv, 'SUPABASE_URL');
const frontendUrl = envValue(frontendEnv, 'VITE_SUPABASE_URL');
const projectState = compareSupabaseProjectUrls(backendUrl, frontendUrl);
const backendKeyState = await verifySupabaseAuthConfiguration({
  backendUrl,
  frontendUrl,
  serviceKey: envValue(serverEnv, 'SUPABASE_SERVICE_KEY'),
});

async function verifyPublicKey() {
  const publicKey = envValue(frontendEnv, 'VITE_SUPABASE_ANON_KEY');
  if (!publicKey || projectState !== 'matched') return 'not_checked';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${new URL(backendUrl).origin}/auth/v1/settings`, {
      headers: { apikey: publicKey }, signal: controller.signal,
    });
    return response.ok ? 'verified' : [401, 403].includes(response.status) ? 'public_key_rejected' : 'auth_unreachable';
  } catch {
    return 'auth_unreachable';
  } finally {
    clearTimeout(timeout);
  }
}

const publicKeyState = await verifyPublicKey();
const state = backendKeyState === 'verified' && publicKeyState === 'verified' ? 'verified' : backendKeyState;

console.log(JSON.stringify({ event: 'likhai_local_auth_configuration', state, projectState, publicKeyState }));
if (state !== 'verified') process.exitCode = 1;
