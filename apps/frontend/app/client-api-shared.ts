import type { AuthUser } from "./client-api-types";
import { API_V1_ROUTES, buildApiV1Url } from "./api-v1-routes";
import { mapApiErrorCodeToMessage } from "./error-code-map";

type ApiError = {
  code: string;
  message: string;
};

type AuthRecord = {
  token: string;
  user: AuthUser;
};

export const DEFAULT_API_BASE = "/api/v1";
export const TOKEN_KEY = "sofortbot_token";
export const USER_KEY = "sofortbot_user";
export const PRODUCT_DRAFTS_KEY = "sofortbot_product_drafts";

let accessTokenMemory: string | null = null;
let refreshPromise: Promise<AuthRecord | null> | null = null;
const AUTH_CHANGE_EVENT = "warehub-auth-change";

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

function readSessionStorageItem(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const fromSession = window.sessionStorage.getItem(key);
  if (fromSession) {
    return fromSession;
  }
  const fromLocal = window.localStorage.getItem(key);
  if (fromLocal) {
    window.sessionStorage.setItem(key, fromLocal);
    window.localStorage.removeItem(key);
    return fromLocal;
  }
  return null;
}

function readStoredUser(): AuthUser | null {
  const rawUser = readSessionStorageItem(USER_KEY);
  if (!rawUser) {
    return null;
  }
  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: AuthUser) {
  if (typeof window === "undefined") {
    return;
  }
  const serialized = JSON.stringify(user);
  window.sessionStorage.setItem(USER_KEY, serialized);
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
}

function notifyAuthChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function getAccessToken(): string | null {
  return accessTokenMemory;
}

export function readAuth(): AuthRecord | null {
  const user = readStoredUser();
  if (!accessTokenMemory || !user) {
    return null;
  }
  return { token: accessTokenMemory, user };
}

export function saveAuth(token: string, user: AuthUser) {
  const normalizedToken = token.trim();
  if (accessTokenMemory && normalizedToken && accessTokenMemory !== normalizedToken) {
    writeStoredUser(user);
    notifyAuthChanged();
    return;
  }
  accessTokenMemory = normalizedToken.length > 0 ? normalizedToken : accessTokenMemory;
  writeStoredUser(user);
  notifyAuthChanged();
}

export function clearAuth() {
  accessTokenMemory = null;
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  notifyAuthChanged();
}

export async function refreshAuthSession(apiBase: string = DEFAULT_API_BASE): Promise<AuthRecord | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.refresh), {
        method: "POST",
        cache: "no-store",
        credentials: "include"
      });

      if (!response.ok) {
        clearAuth();
        return null;
      }

      const payload = (await response.json()) as AuthRecord;
      saveAuth(payload.token, payload.user);
      return { token: payload.token, user: payload.user };
    } catch {
      clearAuth();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function bootstrapAuthSession(apiBase: string = DEFAULT_API_BASE): Promise<AuthRecord | null> {
  const current = readAuth();
  if (current) {
    return current;
  }
  return refreshAuthSession(apiBase);
}

export async function authorizedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options?: {
    apiBase?: string;
    token?: string | null;
    retryOnUnauthorized?: boolean;
  }
): Promise<Response> {
  const authApiBase = options?.apiBase ?? DEFAULT_API_BASE;
  const retryOnUnauthorized = options?.retryOnUnauthorized ?? true;

  const performRequest = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(input, {
      ...init,
      headers,
      cache: init.cache ?? "no-store",
      credentials: init.credentials ?? "include"
    });
  };

  let token = getAccessToken() ?? options?.token?.trim() ?? null;
  if (!token) {
    token = (await bootstrapAuthSession(authApiBase))?.token ?? null;
  }

  let response = await performRequest(token);
  if (response.status !== 401 || !retryOnUnauthorized) {
    return response;
  }

  const refreshed = await refreshAuthSession(authApiBase);
  if (!refreshed?.token) {
    clearAuth();
    return response;
  }

  return performRequest(refreshed.token);
}
