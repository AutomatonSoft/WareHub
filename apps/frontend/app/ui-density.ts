"use client";

export const UI_DENSITY_KEY = "sofortbot_ui_density";
export const UI_DENSITY_EVENT = "sofortbot:ui-density-change";

export type UiDensity = "comfortable" | "compact";

function isUiDensity(value: string): value is UiDensity {
  return value === "comfortable" || value === "compact";
}

export function readStoredUiDensity(): UiDensity {
  if (typeof window === "undefined") {
    return "comfortable";
  }
  const raw = window.localStorage.getItem(UI_DENSITY_KEY);
  if (!raw || !isUiDensity(raw)) {
    return "comfortable";
  }
  return raw;
}

export function writeStoredUiDensity(next: UiDensity) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(UI_DENSITY_KEY, next);
  document.documentElement.setAttribute("data-density", next);
  window.dispatchEvent(new Event(UI_DENSITY_EVENT));
}

export function applyStoredUiDensity() {
  if (typeof window === "undefined") {
    return;
  }
  const next = readStoredUiDensity();
  document.documentElement.setAttribute("data-density", next);
}
