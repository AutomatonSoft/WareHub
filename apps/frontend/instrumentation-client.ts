import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV;
const release = process.env.NEXT_PUBLIC_APP_VERSION;
const tracesSampleRateRaw = process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1";
const replayOnErrorSampleRateRaw =
  process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? "1.0";
const replaySessionSampleRateRaw =
  process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? "0.0";
let globalHandlersInstalled = false;

function parseRate(raw: string, fallback: number): number {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

function installGlobalErrorHandlers() {
  if (typeof window === "undefined" || globalHandlersInstalled) {
    return;
  }
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    const fallback = new Error(event.message || "window.onerror");
    Sentry.captureException(event.error ?? fallback, {
      tags: { source: "window.onerror" },
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const error =
      reason instanceof Error
        ? reason
        : new Error(typeof reason === "string" ? reason : "Unhandled rejection");
    Sentry.captureException(error, {
      tags: { source: "window.onunhandledrejection" },
      extra: {
        reason: typeof reason === "string" ? reason : JSON.stringify(reason ?? null)
      }
    });
  });
}

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: parseRate(tracesSampleRateRaw, 0.1),
    replaysOnErrorSampleRate: parseRate(replayOnErrorSampleRateRaw, 1.0),
    replaysSessionSampleRate: parseRate(replaySessionSampleRateRaw, 0.0)
  });
  installGlobalErrorHandlers();
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
