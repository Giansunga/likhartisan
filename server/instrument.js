import 'dotenv/config';
import * as Sentry from '@sentry/node';

function sampleRate(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

const dsn = process.env.SENTRY_DSN?.trim();
export const SENTRY_ENABLED = Boolean(dsn);

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    sendDefaultPii: false,
  });
}

export { Sentry };
