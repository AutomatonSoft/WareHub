import type { AuthUser } from "./client-api-types";
import { mapApiErrorCodeToMessage } from "./error-code-map";

type ApiError = {
  code: string;
  message: string;
};

export const DEFAULT_API_BASE = "/api/v1";
export const TOKEN_KEY = "sofortbot_token";
export const USER_KEY = "sofortbot_user";
export const PRODUCT_DRAFTS_KEY = "sofortbot_product_drafts";
const AUTH_COOKIE_KEY = "sofortbot_token";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function setAuthCookie(token: string) {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function clearAuthCookie() {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${AUTH_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function parseError(payload: unknown, fallback: string): string {
  const mapped = mapApiErrorCodeToMessage(payload);
  if (mapped) {
    return mapped;
  }
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as ApiError).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return fallback;
}

function readStorageItem(key: string): string | null {
  const fromSession = sessionStorage.getItem(key);
  if (fromSession) {
    return fromSession;
  }
  // Backward compatibility for older sessions that used localStorage.
  const fromLocal = localStorage.getItem(key);
  if (fromLocal) {
    sessionStorage.setItem(key, fromLocal);
    localStorage.removeItem(key);
    return fromLocal;
  }
  return null;
}

export function readAuth(): { token: string; user: AuthUser } | null {
  const token = readStorageItem(TOKEN_KEY);
  const rawUser = readStorageItem(USER_KEY);
  if (!token || !rawUser) {
    return null;
  }
  try {
    return { token, user: JSON.parse(rawUser) as AuthUser };
  } catch {
    return null;
  }
}

export function saveAuth(token: string, user: AuthUser) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  setAuthCookie(token);
}

export function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearAuthCookie();
}
