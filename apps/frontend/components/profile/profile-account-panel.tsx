"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import {
  approveRegistration,
  changeCurrentUserPassword,
  clearAuth,
  DEFAULT_API_BASE,
  fetchPendingRegistrations,
  fetchCurrentUser,
  readAuth,
  rejectRegistration,
  resolvePhotoUrl,
  saveAuth,
  updateCurrentUser,
  uploadImage
} from "../../app/client-api";
import { Card } from "../ui/card";
import { useToast } from "../shared/toast-provider";
import { normalizeEmail, validateAvatarFile, validateNewPassword } from "../../app/profile/profile-form-logic";
import type { AuthUser, PendingUser } from "../../app/client-api-types";
import { validateEmail, validatePersonName, validatePhoneNumber } from "../../app/login/login-validators";
import { translateValidationErrorCode } from "../../app/forms/validation-feedback";
import { useLabels } from "../../app/use-labels";
import { ProfileFieldKey, PasswordFieldKey } from "./account-panel/profile-account-types";
import { ProfileAuthRequiredCard } from "./account-panel/profile-auth-required-card";
import { ProfileOverviewCard } from "./account-panel/profile-overview-card";
import { ProfileInfoCard } from "./account-panel/profile-info-card";
import { ProfilePasswordCard } from "./account-panel/profile-password-card";
import { ProfilePendingApprovalsCard } from "./account-panel/profile-pending-approvals-card";
import { ProfileStatusCard } from "./account-panel/profile-status-card";
import { ProfileLoadingState } from "./account-panel/profile-loading-state";

export function ProfileAccountPanel() {
  const t = useLabels();
  const { showToast } = useToast();
  const router = useRouter();
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [profileFieldErrors, setProfileFieldErrors] = useState<Partial<Record<ProfileFieldKey, string>>>({});
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Partial<Record<PasswordFieldKey, string>>>({});
  const [loading, setLoading] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [pendingQuery, setPendingQuery] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const avatarSrc = useMemo(() => (user?.avatar_url ? resolvePhotoUrl(apiBase, user.avatar_url) : null), [apiBase, user?.avatar_url]);
  const isAdmin = (user?.role ?? "").toLowerCase() === "admin";
  const isProfileDirty =
    !!user &&
    (
      email.trim() !== (user.email ?? "").trim() ||
      firstName.trim() !== (user.first_name ?? "").trim() ||
      lastName.trim() !== (user.last_name ?? "").trim() ||
      phoneNumber.trim() !== (user.phone_number ?? "").trim() ||
      selectedAvatarFile !== null
    );

  const handleAuthorizationError = useCallback(
    (message: string) => {
      const normalized = message.toLowerCase();
      if (normalized.includes("authorization required") || normalized.includes("invalid token")) {
        clearAuth();
        setToken(null);
        setUser(null);
        router.replace("/login");
        return true;
      }
      return false;
    },
    [router]
  );

  useEffect(() => {
    const auth = readAuth();
    if (!auth) {
      setProfileStatus(t.sessionNotFound);
      return;
    }

    setToken(auth.token);
    setUser(auth.user);
    setEmail(auth.user.email ?? "");
    setFirstName(auth.user.first_name ?? "");
    setLastName(auth.user.last_name ?? "");
    setPhoneNumber(auth.user.phone_number ?? "");

    void fetchCurrentUser(apiBase, auth.token)
      .then((freshUser) => {
        setUser(freshUser);
        setEmail(freshUser.email ?? "");
        setFirstName(freshUser.first_name ?? "");
        setLastName(freshUser.last_name ?? "");
        setPhoneNumber(freshUser.phone_number ?? "");
        saveAuth(auth.token, freshUser);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : t.failedLoadProfile;
        if (!handleAuthorizationError(message)) {
          setProfileStatus(message);
          showToast(message, "error");
        }
      });
  }, [apiBase, handleAuthorizationError]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const reloadPendingRegistrations = useCallback(async () => {
    if (!token || !isAdmin) {
      setPendingUsers([]);
      return;
    }
    try {
      const pending = await fetchPendingRegistrations(apiBase, token);
      setPendingUsers(pending);
      setPendingStatus(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.failedLoadPending;
      if (!handleAuthorizationError(message)) {
        setPendingStatus(message);
        showToast(message, "error");
      }
    }
  }, [apiBase, handleAuthorizationError, isAdmin, showToast, token]);

  useEffect(() => {
    void reloadPendingRegistrations();
  }, [reloadPendingRegistrations]);

  const filteredPendingUsers = useMemo(() => {
    const query = pendingQuery.trim().toLowerCase();
    if (query.length === 0) {
      return pendingUsers;
    }
    return pendingUsers.filter((pending) => {
      const username = pending.username.toLowerCase();
      const login = pending.login.toLowerCase();
      const email = (pending.email ?? "").toLowerCase();
      return username.includes(query) || login.includes(query) || email.includes(query);
    });
  }, [pendingUsers, pendingQuery]);

  async function onSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileFieldErrors({});
    if (!token || !user) {
      setProfileStatus(t.pleaseLoginFirst);
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedPhoneNumber = phoneNumber.trim();
    if (trimmedEmail.length > 0) {
      const emailError = validateEmail(trimmedEmail);
      if (emailError) {
        setProfileFieldErrors({ email: translateValidationErrorCode(t, emailError) });
        return;
      }
    }
      const firstNameError = validatePersonName(trimmedFirstName, t.firstName);
    if (firstNameError) {
      setProfileFieldErrors({ firstName: translateValidationErrorCode(t, firstNameError) });
      return;
    }
    const lastNameError = validatePersonName(trimmedLastName, t.lastName);
    if (lastNameError) {
      setProfileFieldErrors({ lastName: translateValidationErrorCode(t, lastNameError) });
      return;
    }
    const phoneNumberError = validatePhoneNumber(trimmedPhoneNumber);
    if (phoneNumberError) {
      setProfileFieldErrors({ phoneNumber: translateValidationErrorCode(t, phoneNumberError) });
      return;
    }

    setLoading(true);
    setProfileStatus(null);
    try {
      let avatarUrl = user.avatar_url ?? null;
      if (selectedAvatarFile) {
        avatarUrl = await uploadImage(apiBase, token, selectedAvatarFile, "avatar");
      }

      const payload = {
        ...(trimmedEmail.length > 0 ? { email: normalizeEmail(trimmedEmail) } : {}),
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        phone_number: trimmedPhoneNumber,
        avatar_url: avatarUrl
      };

      const updated = await updateCurrentUser(apiBase, token, payload);
      setUser(updated);
      setEmail(updated.email ?? "");
      setFirstName(updated.first_name ?? "");
      setLastName(updated.last_name ?? "");
      setPhoneNumber(updated.phone_number ?? "");
      saveAuth(token, updated);
      setSelectedAvatarFile(null);
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarPreviewUrl(null);
      const message = selectedAvatarFile ? t.profileAndAvatarUpdated : t.accountSaved;
      setProfileStatus(message);
      showToast(message, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : t.accountSaveFailed;
      if (!handleAuthorizationError(message)) {
        setProfileStatus(message);
        showToast(message, "error");
      }
    } finally {
      setLoading(false);
    }
  }

  function onAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const fileError = validateAvatarFile(file);
    if (fileError) {
      setProfileFieldErrors({ avatar: fileError });
      setSelectedAvatarFile(null);
      event.target.value = "";
      return;
    }

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }

    setSelectedAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setProfileFieldErrors((current) => ({ ...current, avatar: undefined }));
    setProfileStatus(null);
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFieldErrors({});
    if (!token) {
      setPasswordStatus(t.pleaseLoginFirst);
      return;
    }

    const passwordError = validateNewPassword(newPassword, confirmPassword);
    if (passwordError) {
      if (passwordError === t.passwordsMismatch) {
        setPasswordFieldErrors({ confirmPassword: passwordError });
      } else {
        setPasswordFieldErrors({ newPassword: passwordError });
      }
      return;
    }
    if (currentPassword.trim().length === 0) {
      setPasswordFieldErrors({ currentPassword: t.currentPasswordRequired });
      return;
    }

    setLoading(true);
    setPasswordStatus(null);
    try {
      await changeCurrentUserPassword(apiBase, token, {
        current_password: currentPassword,
        new_password: newPassword
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus(t.passwordChanged);
      showToast(t.passwordChanged, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : t.passwordChangeFailed;
      if (!handleAuthorizationError(message)) {
        setPasswordStatus(message);
        showToast(message, "error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onPendingAction(action: "approve" | "reject", pendingUserId: string) {
    if (!token) {
      return;
    }
    setPendingActionId(pendingUserId);
    setPendingStatus(null);
    try {
      if (action === "approve") {
        await approveRegistration(apiBase, token, pendingUserId);
      } else {
        await rejectRegistration(apiBase, token, pendingUserId);
      }
      await reloadPendingRegistrations();
    } catch (error) {
      const message = error instanceof Error ? error.message : t.failedUpdateRegistrationStatus;
      if (!handleAuthorizationError(message)) {
        setPendingStatus(message);
        showToast(message, "error");
      }
    } finally {
      setPendingActionId(null);
    }
  }

  if (!token || !user) {
    return <ProfileAuthRequiredCard profileStatus={profileStatus} onLogin={() => router.push("/login")} onRegister={() => router.push("/register")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? <ProfileLoadingState /> : null}
      <Card className="border-border/70 bg-gradient-to-r from-primary/8 via-background to-background">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-card)] border border-primary/20 bg-primary/10 text-primary">
              <Sparkles data-icon="inline-start" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t.premiumWorkspaceProfile}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{t.manageIdentityAccessTrust}</p>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                {t.keepOperatorProfileSharp}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-center">
            <div className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground">
              <ShieldCheck data-icon="inline-start" />
              <span className="font-medium">{t.role}: {user.role}</span>
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <ProfileOverviewCard user={user} avatarSrc={avatarSrc} avatarPreviewUrl={avatarPreviewUrl} />
        <ProfilePasswordCard
          currentPassword={currentPassword}
          newPassword={newPassword}
          confirmPassword={confirmPassword}
          loading={loading}
          passwordFieldErrors={passwordFieldErrors}
          onSetCurrentPassword={(value) => {
            setCurrentPassword(value);
            setPasswordFieldErrors((current) => ({ ...current, currentPassword: undefined }));
          }}
          onSetNewPassword={(value) => {
            setNewPassword(value);
            setPasswordFieldErrors((current) => ({ ...current, newPassword: undefined }));
          }}
          onSetConfirmPassword={(value) => {
            setConfirmPassword(value);
            setPasswordFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
          }}
          onSubmit={onChangePassword}
        />
      </div>
      <ProfileInfoCard
        email={email}
        firstName={firstName}
        lastName={lastName}
        phoneNumber={phoneNumber}
        loading={loading}
        isProfileDirty={isProfileDirty}
        selectedAvatarFileName={selectedAvatarFile?.name ?? null}
        profileFieldErrors={profileFieldErrors}
        onSetEmail={(value) => {
          setEmail(value);
          setProfileFieldErrors((current) => ({ ...current, email: undefined }));
        }}
        onSetFirstName={(value) => {
          setFirstName(value);
          setProfileFieldErrors((current) => ({ ...current, firstName: undefined }));
        }}
        onSetLastName={(value) => {
          setLastName(value);
          setProfileFieldErrors((current) => ({ ...current, lastName: undefined }));
        }}
        onSetPhoneNumber={(value) => {
          setPhoneNumber(value);
          setProfileFieldErrors((current) => ({ ...current, phoneNumber: undefined }));
        }}
        onAvatarChange={onAvatarChange}
        onClearAvatarSelection={() => {
          setSelectedAvatarFile(null);
          if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
          setAvatarPreviewUrl(null);
        }}
        onSubmit={onSaveProfile}
      />
      <ProfileStatusCard title={t.profileStatus} message={profileStatus} />
      <ProfileStatusCard title={t.passwordStatus} message={passwordStatus} />
      <ProfilePendingApprovalsCard
        isAdmin={isAdmin}
        pendingUsers={pendingUsers}
        filteredPendingUsers={filteredPendingUsers}
        pendingQuery={pendingQuery}
        pendingActionId={pendingActionId}
        pendingStatus={pendingStatus}
        onSetPendingQuery={setPendingQuery}
        onPendingAction={onPendingAction}
        t={t}
      />
      {!isAdmin ? (
        <Card className="border-border/70">
          <div className="p-4 text-sm text-muted-foreground">{t.adminOnlyPendingApprovalsHidden}</div>
        </Card>
      ) : null}
    </div>
  );
}
