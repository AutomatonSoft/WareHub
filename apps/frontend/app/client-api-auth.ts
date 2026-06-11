import type { AuthUser, ChangePasswordPayload, UpdateProfilePayload } from "./client-api-types";
import { parseError } from "./client-api-shared";

type PasswordResetConfirmPayload = {
  email: string;
  code: string;
  password: string;
};

function sanitizeResetFetchError(error: unknown, apiBase: string): Error {
  if (error instanceof Error && /Failed to fetch/i.test(error.message)) {
    return new Error(
      `Unable to reach the password reset API at ${apiBase}. Check NEXT_PUBLIC_API_BASE_URL and confirm the backend is reachable.`
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Unexpected password reset error.");
}

export async function logout(apiBase: string, token: string): Promise<void> {
  await fetch(`${apiBase}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }).catch(() => null);
}

export async function fetchCurrentUser(apiBase: string, token: string): Promise<AuthUser> {
  const response = await fetch(`${apiBase}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Profile request failed: HTTP ${response.status}`));
  }
  return (await response.json()) as AuthUser;
}

export async function updateCurrentUser(
  apiBase: string,
  token: string,
  payload: UpdateProfilePayload
): Promise<AuthUser> {
  const response = await fetch(`${apiBase}/auth/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Profile update failed: HTTP ${response.status}`));
  }
  return (await response.json()) as AuthUser;
}

export async function changeCurrentUserPassword(
  apiBase: string,
  token: string,
  payload: ChangePasswordPayload
): Promise<void> {
  const response = await fetch(`${apiBase}/auth/me/password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Password change failed: HTTP ${response.status}`));
  }
}

export async function requestPasswordReset(apiBase: string, email: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/password/reset/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });
  } catch (error) {
    throw sanitizeResetFetchError(error, apiBase);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Password reset request failed: HTTP ${response.status}`));
  }
}

export async function confirmPasswordReset(
  apiBase: string,
  payload: PasswordResetConfirmPayload
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/auth/password/reset/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw sanitizeResetFetchError(error, apiBase);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Password reset failed: HTTP ${response.status}`));
  }
}

