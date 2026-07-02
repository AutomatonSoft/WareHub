import * as Sentry from "@sentry/nextjs";

const dsn =
  process.env.FRONTEND_SENTRY_DSN ?? process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.APP_ENV ?? process.env.NODE_ENV;
const release = process.env.APP_VERSION ?? process.env.NEXT_PUBLIC_APP_VERSION;
const tracesSampleRateRaw =
  process.env.FRONTEND_SENTRY_TRACES_SAMPLE_RATE ?? process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1";

function parseRate(raw: string, fallback: number): number {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: parseRate(tracesSampleRateRaw, 0.1)
  });
}
