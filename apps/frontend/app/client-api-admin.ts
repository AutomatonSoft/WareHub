import type {
  AdminUser,
  AdminUsersQueryParams,
  IntakeDeleteAuditEntry,
  IntakeDeleteAuditQueryParams,
  PendingUser
} from "./client-api-types";
import { API_V1_ROUTES, buildApiV1Url } from "./api-v1-routes";
import { authorizedFetch, parseError } from "./client-api-shared";

export async function fetchPendingRegistrations(
  apiBase: string,
  token: string
): Promise<PendingUser[]> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.admin.pendingRegistrations), {}, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Pending registrations failed: HTTP ${response.status}`));
  }
  return (await response.json()) as PendingUser[];
}

export async function approveRegistration(
  apiBase: string,
  token: string,
  userId: string
): Promise<AdminUser> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.admin.approveRegistration(userId)), {
    method: "POST",
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Approve failed: HTTP ${response.status}`));
  }
  return (await response.json()) as AdminUser;
}

export async function rejectRegistration(
  apiBase: string,
  token: string,
  userId: string
): Promise<void> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.admin.rejectRegistration(userId)), {
    method: "POST",
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Reject failed: HTTP ${response.status}`));
  }
}

export async function fetchAdminUsers(
  apiBase: string,
  token: string,
  params?: AdminUsersQueryParams
): Promise<AdminUser[]> {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }
  if (typeof params?.offset === "number") {
    query.set("offset", String(params.offset));
  }
  if (params?.search && params.search.trim().length > 0) {
    query.set("search", params.search.trim());
  }
  if (params?.role && params.role !== "all") {
    query.set("role", params.role);
  }
  if (params?.status && params.status !== "all") {
    query.set("status", params.status);
  }
  if (params?.sort) {
    query.set("sort", params.sort);
  }
  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const response = await authorizedFetch(`${buildApiV1Url(apiBase, API_V1_ROUTES.admin.users)}${suffix}`, {}, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Users request failed: HTTP ${response.status}`));
  }
  return (await response.json()) as AdminUser[];
}

export async function updateUserRole(
  apiBase: string,
  token: string,
  userId: string,
  role: "admin" | "user"
): Promise<AdminUser> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.admin.userRole(userId)), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ role })
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Role update failed: HTTP ${response.status}`));
  }
  return (await response.json()) as AdminUser;
}

export async function deleteUser(
  apiBase: string,
  token: string,
  userId: string
): Promise<void> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.admin.user(userId)), {
    method: "DELETE",
  }, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Delete user failed: HTTP ${response.status}`));
  }
}

export async function fetchIntakeDeleteAuditLogs(
  apiBase: string,
  token: string,
  params?: IntakeDeleteAuditQueryParams
): Promise<IntakeDeleteAuditEntry[]> {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }
  if (params?.actor_login && params.actor_login.trim().length > 0) {
    query.set("actor_login", params.actor_login.trim());
  }
  if (params?.request_id && params.request_id.trim().length > 0) {
    query.set("request_id", params.request_id.trim());
  }
  if (params?.section && params.section.trim().length > 0) {
    query.set("section", params.section.trim());
  }
  if (params?.from && params.from.trim().length > 0) {
    query.set("from", params.from.trim());
  }
  if (params?.to && params.to.trim().length > 0) {
    query.set("to", params.to.trim());
  }
  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const response = await authorizedFetch(`${buildApiV1Url(apiBase, API_V1_ROUTES.admin.intakeDeleteAudit)}${suffix}`, {}, { apiBase, token });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(parseError(body, `Delete audit request failed: HTTP ${response.status}`));
  }
  return (await response.json()) as IntakeDeleteAuditEntry[];
}
