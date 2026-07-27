"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { BadgeCheck, Camera, Clock3, KeyRound, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import {
  clearAuth,
  confirmCurrentUserPasswordChange,
  DEFAULT_API_BASE,
  readAuth,
  requestCurrentUserPasswordChangeCode,
  resolvePhotoUrl,
  saveAuth,
  updateCurrentUser,
  uploadImage
} from "../../app/client-api";
import type { AuthUser } from "../../app/client-api-types";
import { validateEmail, validatePassword, validatePersonName, validatePhoneNumber } from "../../app/login/login-validators";
import { normalizeEmail, validateAvatarFile } from "../../app/profile/profile-form-logic";
import { AppShell } from "../../components/layout/app-shell";
import { ProfileAvatarCropDialog } from "../../components/profile/profile-avatar-crop-dialog";
import { useToast } from "../../components/shared/toast-provider";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useLabels } from "../use-labels";

function ProfileAvatar({
  user,
  apiBase,
  uploading,
  onPickAvatar,
  actionLabel,
  avatarAlt
}: {
  user: AuthUser | null;
  apiBase: string;
  uploading: boolean;
  onPickAvatar: () => void;
  actionLabel: string;
  avatarAlt: string;
}) {
  const [hasLoadError, setHasLoadError] = useState(false);
  const avatarSrc = user?.avatar_url && !hasLoadError ? resolvePhotoUrl(apiBase, user.avatar_url) : null;
  const initials = `${user?.first_name?.[0] ?? user?.username?.[0] ?? "U"}${user?.last_name?.[0] ?? ""}`.toUpperCase();

  if (avatarSrc) {
    return (
      <button
        type="button"
        onClick={onPickAvatar}
        disabled={uploading}
        className="group relative shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label={actionLabel}
        title={actionLabel}
      >
        <Image
          src={avatarSrc}
          alt={avatarAlt}
          width={104}
          height={104}
          unoptimized
          className="size-[104px] rounded-[calc(var(--radius-card)-0.15rem)] object-cover shadow-[var(--wh-shadow-card)]"
          onError={() => setHasLoadError(true)}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-transparent transition-all group-hover:bg-foreground/45 group-hover:text-background">
          <Camera className="size-4" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onPickAvatar}
      disabled={uploading}
      className="group relative flex size-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[calc(var(--radius-card)-0.15rem)] border border-primary/20 bg-primary text-2xl font-bold text-primary-foreground shadow-[var(--wh-shadow-card)] ring-4 ring-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      aria-label={actionLabel}
      title={actionLabel}
    >
      {initials}
      <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-transparent transition-all group-hover:bg-foreground/45 group-hover:text-background">
        <Camera className="size-4" />
      </span>
    </button>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  readOnly = false,
  type = "text"
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  type?: React.HTMLInputTypeAttribute;
}) {
  return (
    <label className="group flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{label}</span>
      <Input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={readOnly ? "h-11 bg-muted/35 text-muted-foreground" : "h-11 border-border/75 bg-background/80 shadow-sm transition-shadow focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"}
      />
    </label>
  );
}

function mapProfileValidationError(errorCode: string, messages: { name: string; phone: string; email: string }): string {
  if (errorCode.startsWith("First name:") || errorCode.startsWith("Last name:")) {
    return messages.name;
  }
  if (errorCode.startsWith("phone_")) {
    return messages.phone;
  }
  return messages.email;
}

function ProfileHistoryPanel({ t }: { t: Record<string, string> }) {
  return (
    <section className="wh-content-card w-full overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><Clock3 size={17} /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{t.auditDetails}</p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{t.changeHistory}</h2>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
          {t.profileHistoryHint}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground"><Clock3 size={13} />{t.noProfileHistoryYet}</span>
      </div>

      <div className="mt-5 grid min-h-32 place-items-center rounded-2xl border border-dashed border-border/80 bg-muted/[0.14] px-6 py-8 text-center">
        <div className="max-w-xl">
          <span className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-background text-muted-foreground shadow-sm"><Clock3 size={18} /></span>
          <p className="mt-3 text-sm font-semibold text-foreground">{t.noProfileHistoryYet}</p>
          <p className="mt-1.5 text-sm text-muted-foreground">{t.profileHistoryApiMissing}</p>
        </div>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);
  const { showToast } = useToast();
  const t = useLabels();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [requestingPasswordCode, setRequestingPasswordCode] = useState(false);
  const [confirmingPasswordCode, setConfirmingPasswordCode] = useState(false);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [passwordCodeDialogOpen, setPasswordCodeDialogOpen] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordCode, setPasswordCode] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const authUser = readAuth()?.user ?? null;
    setUser(authUser);
    setFirstName(authUser?.first_name ?? "");
    setLastName(authUser?.last_name ?? "");
    setEmail(authUser?.email ?? "");
    setPhoneNumber(authUser?.phone_number ?? "");
  }, []);

  useEffect(() => {
    return () => {
      if (selectedAvatarUrl) {
        URL.revokeObjectURL(selectedAvatarUrl);
      }
    };
  }, [selectedAvatarUrl]);

  const displayName = [firstName, lastName].map((value) => value.trim()).filter(Boolean).join(" ");
  const roleLabel = user?.role === "admin" ? t.adminTitle : t.user;
  const statusLabel =
    user?.status === "approved"
      ? t.approved
      : user?.status === "rejected"
        ? t.rejected
        : user?.status === "pending"
          ? t.pending
          : t.status;
  const isProfileDirty =
    !!user &&
    (
      firstName.trim() !== (user.first_name ?? "").trim() ||
      lastName.trim() !== (user.last_name ?? "").trim() ||
      email.trim() !== (user.email ?? "").trim() ||
      phoneNumber.trim() !== (user.phone_number ?? "").trim()
    );

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const auth = readAuth();
    if (!auth?.token || !auth.user) {
      showToast(t.loginAgainChangeAvatar, "error");
      return;
    }

    const fileError = validateAvatarFile(file);
    if (fileError) {
      showToast(fileError, "error");
      return;
    }

    if (selectedAvatarUrl) {
      URL.revokeObjectURL(selectedAvatarUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedAvatarFile(file);
    setSelectedAvatarUrl(objectUrl);
    setAvatarEditorOpen(true);
  }

  function resetAvatarEditor() {
    setAvatarEditorOpen(false);
    setSelectedAvatarFile(null);
    if (selectedAvatarUrl) {
      URL.revokeObjectURL(selectedAvatarUrl);
      setSelectedAvatarUrl(null);
    }
  }

  async function handleAvatarSave(blob: Blob) {
    const auth = readAuth();
    if (!auth?.token || !auth.user || !selectedAvatarFile) {
      showToast(t.loginAgainChangeAvatar, "error");
      return;
    }

    setUploading(true);
    try {
      const uploadFile = new File(
        [blob],
        `${selectedAvatarFile.name.replace(/\.[^.]+$/, "") || "avatar"}-cropped.png`,
        { type: "image/png" }
      );

      const avatarUrl = await uploadImage(apiBase, auth.token, uploadFile, "avatar");
      const updatedUser = await updateCurrentUser(apiBase, auth.token, { avatar_url: avatarUrl });
      saveAuth(auth.token, updatedUser);
      setUser(updatedUser);
      setFirstName(updatedUser.first_name ?? "");
      setLastName(updatedUser.last_name ?? "");
      setEmail(updatedUser.email ?? "");
      setPhoneNumber(updatedUser.phone_number ?? "");
      resetAvatarEditor();
      showToast(t.avatarUpdated, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.failedUpdateAvatar, "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const auth = readAuth();
    if (!auth?.token || !user) {
      showToast(t.loginAgainUpdateProfile, "error");
      return;
    }

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    if (trimmedFirstName && validatePersonName(trimmedFirstName, "First name")) {
      showToast(t.firstNameValidation, "error");
      return;
    }
    if (trimmedLastName && validatePersonName(trimmedLastName, "Last name")) {
      showToast(t.lastNameValidation, "error");
      return;
    }
    if (trimmedEmail) {
      const emailError = validateEmail(trimmedEmail);
      if (emailError) {
        showToast(mapProfileValidationError(emailError, { name: t.firstNameValidation, phone: t.phoneValidation, email: t.validEmailRequired }), "error");
        return;
      }
    }
    if (trimmedPhoneNumber) {
      const phoneError = validatePhoneNumber(trimmedPhoneNumber);
      if (phoneError) {
        showToast(mapProfileValidationError(phoneError, { name: t.firstNameValidation, phone: t.phoneValidation, email: t.validEmailRequired }), "error");
        return;
      }
    }

    setSavingProfile(true);
    try {
      const updatedUser = await updateCurrentUser(apiBase, auth.token, {
        email: trimmedEmail ? normalizeEmail(trimmedEmail) : "",
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        phone_number: trimmedPhoneNumber
      });
      saveAuth(auth.token, updatedUser);
      setUser(updatedUser);
      setFirstName(updatedUser.first_name ?? "");
      setLastName(updatedUser.last_name ?? "");
      setEmail(updatedUser.email ?? "");
      setPhoneNumber(updatedUser.phone_number ?? "");
      showToast(t.accountSaved, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.accountSaveFailed, "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSecuritySave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const auth = readAuth();
    if (!auth?.token || !user) {
      showToast(t.loginAgainChangeAvatar, "error");
      return;
    }
    if (!user.email?.trim()) {
      showToast(t.addEmailBeforePasswordChange, "error");
      return;
    }
    if (!currentPassword) {
      showToast(t.enterCurrentPassword, "error");
      return;
    }
    const nextPassword = newPassword.trim();
    if (!nextPassword) {
      showToast(t.enterNewPassword, "error");
      return;
    }
    const passwordError = validatePassword(nextPassword);
    if (passwordError) {
      showToast(passwordError, "error");
      return;
    }
    if (nextPassword !== confirmNewPassword) {
      showToast(t.newPasswordConfirmationMismatch, "error");
      return;
    }

    setRequestingPasswordCode(true);
    try {
      await requestCurrentUserPasswordChangeCode(apiBase, auth.token, {
        current_password: currentPassword,
        new_password: nextPassword
      });
      setPasswordCode("");
      setPasswordCodeDialogOpen(true);
      showToast(t.verificationCodeSent, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.failedSendVerificationCode, "error");
    } finally {
      setRequestingPasswordCode(false);
    }
  }

  async function handlePasswordCodeConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const auth = readAuth();
    if (!auth?.token || !user) {
      showToast(t.loginAgainChangeAvatar, "error");
      return;
    }
    const code = passwordCode.trim();
    if (code.length !== 6) {
      showToast(t.verificationCodeMustBe6Digits, "error");
      return;
    }

    setConfirmingPasswordCode(true);
    try {
      await confirmCurrentUserPasswordChange(apiBase, auth.token, {
        current_password: currentPassword,
        new_password: newPassword.trim(),
        code
      });
      clearAuth();
      setPasswordCodeDialogOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordCode("");
      showToast(t.passwordChangedSignInAgain, "success");
      router.replace("/login");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.failedConfirmPasswordChange, "error");
    } finally {
      setConfirmingPasswordCode(false);
    }
  }

  return (
    <AppShell title={t.profile} subtitle={t.profileWorkspaceSubtitle}>
      <div className="wh-page-stack w-full">
        <section className="wh-content-card relative overflow-hidden">
          <div className="absolute -right-16 -top-20 size-64 rounded-full bg-primary/[0.07] blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <ProfileAvatar
                user={user}
                apiBase={apiBase}
                uploading={uploading}
                onPickAvatar={() => fileInputRef.current?.click()}
                actionLabel={t.changeAvatarAction}
                avatarAlt={t.userAvatarAlt}
              />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/65">{t.profile}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"><BadgeCheck size={12} />{statusLabel}</span>
                </div>
                <h2 className="mt-2 truncate text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {displayName || user?.username || t.profile}
                </h2>
                <p className="mt-1.5 truncate text-sm text-muted-foreground">@{user?.login || t.notSet}</p>
                <p className="mt-3 text-sm text-muted-foreground">{t.manageAccountPreferences}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/75 px-3 py-2 text-sm font-medium text-foreground shadow-sm"><ShieldCheck size={16} className="text-primary" />{roleLabel}</span>
            </div>
          </div>
        </section>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
            <form
              onSubmit={(event) => void handleProfileSave(event)}
              className="wh-content-card w-full"
            >
              <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex size-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary"><UserRound size={17} /></span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{t.profile}</p>
                      <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{t.profileDetailsTitle}</h2>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{t.manageAccountPreferences}</p>
                </div>
                <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${isProfileDirty ? "border-amber-300 bg-amber-100 text-amber-900" : "border-emerald-300 bg-emerald-100 text-emerald-900"}`}>
                  {isProfileDirty ? t.profileUnsavedChanges : t.profileSynced}
                </span>
              </div>

              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl border border-border/65 bg-muted/[0.14] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{t.login}</div>
                  <div className="mt-1 font-semibold text-foreground">{user?.login || t.notSet}</div>
                </div>
                <div className="rounded-xl border border-border/65 bg-muted/[0.14] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{t.status}</div>
                  <div className="mt-1 font-semibold text-foreground">{statusLabel}</div>
                </div>
                <div className="rounded-xl border border-border/65 bg-muted/[0.14] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{t.role}</div>
                  <div className="mt-1 font-semibold text-foreground">{roleLabel}</div>
                </div>
              </div>

              <div className="mt-6">
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <ProfileField label={t.firstName} value={firstName} onChange={setFirstName} />
                  <ProfileField label={t.lastName} value={lastName} onChange={setLastName} />
                  <ProfileField label={t.username} value={user?.username || ""} readOnly />
                  <ProfileField label={t.email} value={email} onChange={setEmail} type="email" />
                  <ProfileField label={t.phoneNumber} value={phoneNumber} onChange={setPhoneNumber} />
                  <ProfileField label={t.role} value={roleLabel} readOnly />
                </div>
              </div>

              <div className="mt-6 flex justify-end border-t border-border/70 pt-5">
                <Button type="submit" disabled={savingProfile || !isProfileDirty} className="sm:min-w-[160px]">
                  {savingProfile ? t.saving : t.saveChanges}
                </Button>
              </div>
            </form>

            <form
              onSubmit={(event) => void handleSecuritySave(event)}
              className="wh-content-card relative w-full overflow-hidden"
            >
              <div className="absolute -right-12 -top-10 size-44 rounded-full bg-primary/[0.06] blur-3xl" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                  <LockKeyhole className="size-[18px]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{t.profileSecurityPosture}</p>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{t.changePasswordTitle}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t.changePasswordHint}
                  </p>
                </div>
              </div>

              <div className="relative mt-6 rounded-2xl border border-border/65 bg-muted/[0.13] p-4">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-foreground/65"><KeyRound size={14} />{t.profileCredentialRotation}</div>
              <div className="grid gap-4">
                <ProfileField label={t.currentPassword} value={currentPassword} onChange={setCurrentPassword} type="password" />
                <ProfileField label={t.newPassword} value={newPassword} onChange={setNewPassword} type="password" />
                <ProfileField label={t.confirmPassword} value={confirmNewPassword} onChange={setConfirmNewPassword} type="password" />
              </div>
              </div>

              <div className="relative mt-5 flex justify-end">
                <Button
                  type="submit"
                  disabled={requestingPasswordCode || confirmingPasswordCode}
                  className="sm:min-w-[160px]"
                >
                  {requestingPasswordCode ? t.sendingCode : t.savePassword}
                </Button>
              </div>
            </form>
          </div>

          <ProfileHistoryPanel t={t} />

        <ProfileAvatarCropDialog
          open={avatarEditorOpen}
          uploading={uploading}
          imageUrl={selectedAvatarUrl}
          onOpenChange={(open) => {
            if (!open) {
              resetAvatarEditor();
              return;
            }
            setAvatarEditorOpen(true);
          }}
          onCancel={resetAvatarEditor}
          onSave={handleAvatarSave}
        />

        <Dialog open={passwordCodeDialogOpen} onOpenChange={(open) => {
          if (confirmingPasswordCode) return;
          setPasswordCodeDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t.confirmPasswordChangeTitle}</DialogTitle>
              <DialogDescription>
                {t.confirmPasswordChangeDescription}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void handlePasswordCodeConfirm(event)} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">{t.verificationCodeLabel}</span>
                <Input
                  value={passwordCode}
                  onChange={(event) => setPasswordCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t.verificationCodePlaceholder}
                />
              </label>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPasswordCodeDialogOpen(false)}
                  disabled={confirmingPasswordCode}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={confirmingPasswordCode}>
                  {confirmingPasswordCode ? t.confirming : t.confirmCode}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
