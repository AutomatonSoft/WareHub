type ErrorPayload = {
  code?: unknown;
};

const UI_ERROR_BY_CODE: Record<string, string> = {
  INVALID_CREDENTIALS: "Invalid login or password.",
  AUTH_INVALID_CREDENTIALS: "Invalid login or password.",
  ACCOUNT_PENDING: "Your account is pending approval.",
  AUTH_ACCOUNT_PENDING: "Your account is pending approval.",
  ACCOUNT_REJECTED: "Your account was rejected. Contact administrator.",
  AUTH_ACCOUNT_REJECTED: "Your account was rejected. Contact administrator.",
  FORBIDDEN: "You do not have enough permissions for this action.",
  AUTH_FORBIDDEN: "You do not have enough permissions for this action.",
  UNAUTHORIZED: "Please login again.",
  AUTH_UNAUTHORIZED: "Please login again.",
  VALIDATION_ERROR: "Please check input fields and try again.",
  BAD_REQUEST: "Please check input fields and try again."
};

function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  if (!code) return null;
  return code.toUpperCase();
}

export function mapApiErrorCodeToMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const code = normalizeCode((payload as ErrorPayload).code);
  if (!code) return null;
  return UI_ERROR_BY_CODE[code] ?? null;
}
