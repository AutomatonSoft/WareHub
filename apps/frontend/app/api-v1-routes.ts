export const API_V1_ROUTES = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    logout: "/auth/logout",
    refresh: "/auth/refresh",
    me: "/auth/me",
    changePassword: "/auth/me/password",
    requestPasswordChangeCode: "/auth/me/password/request-code",
    confirmPasswordChange: "/auth/me/password/confirm",
    requestPasswordReset: "/auth/password/reset/request",
    confirmPasswordReset: "/auth/password/reset/confirm"
  },
  intakes: {
    list: "/intakes",
    uploads: "/uploads",
    byId: (id: string) => `/intakes/${encodeURIComponent(id)}`
  },
  afterbuy: {
    order: (orderId: string) => `/afterbuy/orders/${encodeURIComponent(orderId)}`,
    kidOrders: (kidNumber: string) => `/afterbuy/kids/${encodeURIComponent(kidNumber)}/orders`
  },
  admin: {
    pendingRegistrations: "/admin/registrations/pending",
    approveRegistration: (userId: string) => `/admin/registrations/${encodeURIComponent(userId)}/approve`,
    rejectRegistration: (userId: string) => `/admin/registrations/${encodeURIComponent(userId)}/reject`,
    users: "/admin/users",
    userRole: (userId: string) => `/admin/users/${encodeURIComponent(userId)}/role`,
    user: (userId: string) => `/admin/users/${encodeURIComponent(userId)}`,
    intakeDeleteAudit: "/admin/audit/intakes/deletions"
  },
  logs: {
    channel: (channel: string) => `/logs/${encodeURIComponent(channel)}`
  }
} as const;

export function buildApiV1Url(apiBase: string, route: string): string {
  const normalizedBase = apiBase.replace(/\/+$/, "");
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  return `${normalizedBase}${normalizedRoute}`;
}
