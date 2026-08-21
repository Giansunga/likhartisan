let configurationState = 'unchecked';

function normalizedOrigin(value) {
  try {
    const parsed = new URL(String(value || ''));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function compareSupabaseProjectUrls(backendUrl, frontendUrl) {
  const backendOrigin = normalizedOrigin(backendUrl);
  const frontendOrigin = normalizedOrigin(frontendUrl);
  if (!backendOrigin || !frontendOrigin) return 'invalid';
  return backendOrigin === frontendOrigin ? 'matched' : 'mismatch';
}

export function validateSupabaseAuthConfiguration({ backendUrl, frontendUrl } = {}) {
  if (!normalizedOrigin(backendUrl)) configurationState = 'invalid';
  else if (frontendUrl) configurationState = compareSupabaseProjectUrls(backendUrl, frontendUrl);
  else configurationState = 'backend_configured';

  const log = JSON.stringify({ event: 'likhai_auth_configuration', state: configurationState });
  if (configurationState === 'invalid' || configurationState === 'mismatch') console.warn(log);
  else console.info(log);
  return configurationState;
}

function setConfigurationState(state) {
  configurationState = state;
  const log = JSON.stringify({ event: 'likhai_auth_configuration', state });
  if (['invalid', 'mismatch', 'service_key_missing', 'service_key_rejected', 'auth_unreachable'].includes(state)) console.warn(log);
  else console.info(log);
  return state;
}

export async function verifySupabaseAuthConfiguration({
  backendUrl,
  frontendUrl,
  serviceKey,
  fetchImpl = fetch,
  timeoutMs = 5_000,
} = {}) {
  const staticState = validateSupabaseAuthConfiguration({ backendUrl, frontendUrl });
  if (staticState === 'invalid' || staticState === 'mismatch') return staticState;
  if (!serviceKey || typeof serviceKey !== 'string') return setConfigurationState('service_key_missing');

  const origin = normalizedOrigin(backendUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${origin}/auth/v1/settings`, {
      headers: { apikey: serviceKey },
      signal: controller.signal,
    });
    if (response.ok) return setConfigurationState('verified');
    if ([401, 403].includes(response.status)) return setConfigurationState('service_key_rejected');
    return setConfigurationState('auth_unreachable');
  } catch {
    return setConfigurationState('auth_unreachable');
  } finally {
    clearTimeout(timeout);
  }
}

export function getSupabaseAuthConfigurationState() {
  return configurationState;
}
