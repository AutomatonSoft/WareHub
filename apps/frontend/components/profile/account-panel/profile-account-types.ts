import type { AuthUser, PendingUser } from "../../../app/client-api-types";

export type ProfileFieldKey = "email" | "firstName" | "lastName" | "phoneNumber" | "avatar";
export type PasswordFieldKey = "currentPassword" | "newPassword" | "confirmPassword";

export type ProfileIdentityProps = {
  user: AuthUser;
  apiBase: string;
  avatarPreviewUrl: string | null;
};

export type PendingApprovalsProps = {
  isAdmin: boolean;
  pendingUsers: PendingUser[];
  filteredPendingUsers: PendingUser[];
  pendingQuery: string;
  pendingActionId: string | null;
  pendingStatus: string | null;
  onSetPendingQuery: (value: string) => void;
  onPendingAction: (action: "approve" | "reject", pendingUserId: string) => Promise<void>;
  t: ReturnType<typeof import("../../../app/use-labels").useLabels>;
};

