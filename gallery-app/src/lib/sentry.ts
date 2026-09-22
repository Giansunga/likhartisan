import * as Sentry from '@sentry/react';
import type { Integration } from '@sentry/core';
import type { SupabaseClient } from '@supabase/supabase-js';

let initialized = false;

function sampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

export function initSentry(supabaseClient?: SupabaseClient) {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  const integrations: Integration[] = [Sentry.browserTracingIntegration()];
  if (supabaseClient) integrations.push(Sentry.supabaseIntegration({ supabaseClient }));

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations,
    tracesSampleRate: sampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1),
    sendDefaultPii: false,
    tracePropagationTargets: [/^\//, /^https?:\/\/localhost(?::\d+)?\//],
  });
}

export function captureException(error: unknown) {
  if (!initialized || !Sentry.isInitialized()) return;
  Sentry.captureException(error);
}
