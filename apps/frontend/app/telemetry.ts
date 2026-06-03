"use client";

import * as Sentry from "@sentry/nextjs";

type TelemetryPayload = Record<string, string | number | boolean | null | undefined>;

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "unknown";
const appRelease = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

function normalizePayload(payload?: TelemetryPayload): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!payload) return result;
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    result[key] = value;
  }
  return result;
}

function setCommonTelemetryScope(scope: Sentry.Scope) {
  scope.setTag("app_env", appEnv);
  scope.setTag("app_release", appRelease);
  if (typeof window !== "undefined") {
    scope.setTag("route", window.location.pathname || "/");
  }
}

export function trackUiEvent(name: string, payload?: TelemetryPayload) {
  const data = normalizePayload(payload);
  Sentry.withScope((scope) => {
    setCommonTelemetryScope(scope);
    scope.setTag("telemetry_type", "ui_event");
    scope.setTag("ui_event", name);
    scope.setContext("ui_event_payload", data);
    Sentry.captureMessage(`ui_event:${name}`);
  });
}

export function trackUiError(name: string, error: unknown, payload?: TelemetryPayload) {
  const data = normalizePayload(payload);
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  Sentry.withScope((scope) => {
    setCommonTelemetryScope(scope);
    scope.setTag("telemetry_type", "ui_error");
    scope.setTag("ui_error", name);
    scope.setContext("ui_error_payload", data);
    Sentry.captureException(normalizedError);
  });
}

export function trackLatency(name: string, durationMs: number, payload?: TelemetryPayload) {
  const data = normalizePayload(payload);
  Sentry.withScope((scope) => {
    setCommonTelemetryScope(scope);
    scope.setTag("telemetry_type", "latency");
    scope.setTag("latency_name", name);
    scope.setContext("latency_payload", { ...data, duration_ms: Math.round(durationMs) });
    Sentry.captureMessage(`latency:${name}:${Math.round(durationMs)}ms`);
  });
}
