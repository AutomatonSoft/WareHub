import type {
  AuthUser,
  ChangePasswordCodeConfirmPayload,
  ChangePasswordPayload,
  UpdateProfilePayload
} from "./client-api-types";
import { API_V1_ROUTES, buildApiV1Url } from "./api-v1-routes";
import { authorizedFetch, parseError } from "./client-api-shared";

type PasswordResetConfirmPayload = {
  email: string;
  code: string;
  password: string;
};

const GENERIC_AUTH_ERROR_MESSAGE = "Something went wrong. Please try again.";

function sanitizeResetFetchError(error: unknown): Error {
  if (
    error instanceof Error &&
    (/Failed to fetch/i.test(error.message) || /Unable to reach the password reset API/i.test(error.message))
  ) {
    return new Error(GENERIC_AUTH_ERROR_MESSAGE);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(GENERIC_AUTH_ERROR_MESSAGE);
}

function parseAuthApiError(payload: unknown, fallback: string, status: number): string {
  if (status >= 500) {
    return GENERIC_AUTH_ERROR_MESSAGE;
  }

  return parseError(payload, fallback);
}

export async function logout(apiBase: string, token: string): Promise<void> {
  await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.logout), {
    method: "POST",
  }, {
    apiBase,
    token,
    retryOnUnauthorized: false
  }).catch(() => null);
}

export async function fetchCurrentUser(apiBase: string, token: string): Promise<AuthUser> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.me), {}, { apiBase, token });
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
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.me), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, { apiBase, token });
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
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.changePassword), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Password change failed: HTTP ${response.status}`));
  }
}

export async function requestCurrentUserPasswordChangeCode(
  apiBase: string,
  token: string,
  payload: ChangePasswordPayload
): Promise<void> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.requestPasswordChangeCode), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Password code request failed: HTTP ${response.status}`));
  }
}

export async function confirmCurrentUserPasswordChange(
  apiBase: string,
  token: string,
  payload: ChangePasswordCodeConfirmPayload
): Promise<void> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.confirmPasswordChange), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Password confirmation failed: HTTP ${response.status}`));
  }
}

export async function requestPasswordReset(apiBase: string, email: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.requestPasswordReset), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });
  } catch (error) {
    throw sanitizeResetFetchError(error);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseAuthApiError(body, GENERIC_AUTH_ERROR_MESSAGE, response.status));
  }
}

export async function confirmPasswordReset(
  apiBase: string,
  payload: PasswordResetConfirmPayload
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.confirmPasswordReset), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw sanitizeResetFetchError(error);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseAuthApiError(body, GENERIC_AUTH_ERROR_MESSAGE, response.status));
  }
}

