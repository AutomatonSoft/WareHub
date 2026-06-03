"use client";

import { useEffect } from "react";
import { sendServiceLog } from "../client-api";

export function useFrontendErrorLogging(params: {
  apiBase: string;
  token: string;
  isEnabled: boolean;
}) {
  const { apiBase, token, isEnabled } = params;

  useEffect(() => {
    if (!isEnabled || !token) {
      return;
    }

    void sendServiceLog(apiBase, "frontend", "info", "frontend session started", undefined, token);

    const onError = (event: ErrorEvent) => {
      const message = event.message || "window.onerror";
      const context = [event.filename, event.lineno, event.colno]
        .filter(Boolean)
        .join(":");
      void sendServiceLog(apiBase, "frontend", "error", message, context, token);
    };

    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason =
        typeof event.reason === "string"
          ? event.reason
          : JSON.stringify(event.reason ?? {});
      void sendServiceLog(
        apiBase,
        "frontend",
        "error",
        "Unhandled promise rejection",
        reason,
        token
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, [apiBase, token, isEnabled]);
}
