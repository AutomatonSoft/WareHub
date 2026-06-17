"use client";

export type {
  AdminUser,
  AdminUsersQueryParams,
  AfterbuyKidOrderMatch,
  AfterbuyKidOrdersData,
  AfterbuyOrderData,
  AuthUser,
  ChangePasswordPayload,
  ChangePasswordCodeConfirmPayload,
  CreateIntakePayload,
  IntakeDeleteAuditEntry,
  IntakeDeleteAuditQueryParams,
  IntakeDto,
  IntakesQueryParams,
  PendingUser,
  ProductDraft,
  UpdateProfilePayload
} from "./client-api-types";

export {
  clearAuth,
  DEFAULT_API_BASE,
  parseError,
  PRODUCT_DRAFTS_KEY,
  readAuth,
  saveAuth,
  TOKEN_KEY,
  USER_KEY
} from "./client-api-shared";

export {
  confirmPasswordReset,
  changeCurrentUserPassword,
  confirmCurrentUserPasswordChange,
  fetchCurrentUser,
  logout,
  requestCurrentUserPasswordChangeCode,
  requestPasswordReset,
  updateCurrentUser
} from "./client-api-auth";

export {
  approveRegistration,
  deleteUser,
  fetchAdminUsers,
  fetchIntakeDeleteAuditLogs,
  fetchPendingRegistrations,
  rejectRegistration,
  updateUserRole
} from "./client-api-admin";

export { createIntake, fetchIntakes, uploadImage } from "./client-api-intakes";

export {
  fetchAfterbuyOrder,
  fetchAfterbuyOrdersByKid,
  parseOrderIdFromQr,
  parsePhotoUrls,
  resolvePhotoUrl
} from "./client-api-afterbuy";

export { readProductDraft, saveProductDraft } from "./client-api-drafts";

export { sendServiceLog } from "./client-api-logs";
