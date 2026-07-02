"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, LockKeyhole } from "lucide-react";
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

function ProfileAvatar({
  user,
  apiBase,
  uploading,
  onPickAvatar
}: {
  user: AuthUser | null;
  apiBase: string;
  uploading: boolean;
  onPickAvatar: () => void;
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
        aria-label="Change avatar"
        title="Change avatar"
      >
        <Image
          src={avatarSrc}
          alt="User avatar"
          width={80}
          height={80}
          unoptimized
          className="size-20 rounded-[var(--radius-card)] object-cover shadow-[var(--wh-shadow-card)]"
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
      className="group relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-border bg-primary/10 text-xl font-semibold text-primary shadow-[var(--wh-shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      aria-label="Change avatar"
      title="Change avatar"
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
<<<<<<< HEAD
    <label className="flex flex-col gap-2">
=======
    <label className="space-y-2">
>>>>>>> origin/main
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={readOnly ? "bg-muted/35 text-muted-foreground" : ""}
      />
    </label>
  );
}

function mapProfileValidationError(errorCode: string): string {
  if (errorCode.startsWith("First name:") || errorCode.startsWith("Last name:")) {
    return "Name must be between 1 and 64 characters.";
  }
  if (errorCode.startsWith("phone_")) {
    return "Phone must be 7-24 characters and contain only digits or + - ( ).";
  }
  return "Enter a valid email address.";
}

function ProfileHistoryPanel() {
  return (
<<<<<<< HEAD
    <section className="wh-content-card w-full">
=======
    <section className="w-full rounded-[var(--radius-card)] border border-border bg-card p-6 shadow-[var(--wh-shadow-card)] sm:p-8">
>>>>>>> origin/main
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Change History</h2>
        <p className="text-sm text-muted-foreground">
          Profile and security updates will appear here with date, time, and change details.
        </p>
      </div>

<<<<<<< HEAD
      <div className="mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-border">
        <div className="grid min-w-[720px] grid-cols-[140px_120px_minmax(180px,1fr)_minmax(260px,1.4fr)] gap-4 border-b border-border bg-muted/20 px-5 py-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
=======
      <div className="mt-6 overflow-hidden rounded-[var(--radius-card)] border border-border">
        <div className="grid grid-cols-[140px_120px_minmax(180px,1fr)_minmax(260px,1.4fr)] gap-4 border-b border-border bg-muted/20 px-5 py-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
>>>>>>> origin/main
          <div>Date</div>
          <div>Time</div>
          <div>Changed</div>
          <div>Details</div>
        </div>
<<<<<<< HEAD
        <div className="grid min-h-36 min-w-[720px] place-items-center px-6 py-10 text-center">
=======
        <div className="grid min-h-36 place-items-center px-6 py-10 text-center">
>>>>>>> origin/main
          <div className="max-w-xl">
            <p className="text-sm font-medium text-foreground">No profile history available yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This block is ready, but the current profile API does not return audit entries for name,
              email, phone, avatar, or password changes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);
  const { showToast } = useToast();
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
  const roleLabel = user?.role ? user.role[0].toUpperCase() + user.role.slice(1) : "User";
  const statusLabel = user?.status ? user.status[0].toUpperCase() + user.status.slice(1) : "Unknown";
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
      showToast("Login again to change your avatar.", "error");
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
      showToast("Login again to change your avatar.", "error");
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
      showToast("Avatar updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update avatar.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const auth = readAuth();
    if (!auth?.token || !user) {
      showToast("Login again to update your profile.", "error");
      return;
    }

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    if (trimmedFirstName && validatePersonName(trimmedFirstName, "First name")) {
      showToast("First name must be between 1 and 64 characters.", "error");
      return;
    }
    if (trimmedLastName && validatePersonName(trimmedLastName, "Last name")) {
      showToast("Last name must be between 1 and 64 characters.", "error");
      return;
    }
    if (trimmedEmail) {
      const emailError = validateEmail(trimmedEmail);
      if (emailError) {
        showToast(mapProfileValidationError(emailError), "error");
        return;
      }
    }
    if (trimmedPhoneNumber) {
      const phoneError = validatePhoneNumber(trimmedPhoneNumber);
      if (phoneError) {
        showToast(mapProfileValidationError(phoneError), "error");
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
      showToast("Profile updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update profile.", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSecuritySave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const auth = readAuth();
    if (!auth?.token || !user) {
      showToast("Login again to change your password.", "error");
      return;
    }
    if (!user.email?.trim()) {
      showToast("Add an email to your profile before changing password.", "error");
      return;
    }
    if (!currentPassword) {
      showToast("Enter your current password.", "error");
      return;
    }
    const nextPassword = newPassword.trim();
    if (!nextPassword) {
      showToast("Enter a new password.", "error");
      return;
    }
    const passwordError = validatePassword(nextPassword);
    if (passwordError) {
      showToast(passwordError, "error");
      return;
    }
    if (nextPassword !== confirmNewPassword) {
      showToast("New password confirmation does not match.", "error");
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
      showToast("Verification code sent to your email.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to send verification code.", "error");
    } finally {
      setRequestingPasswordCode(false);
    }
  }

  async function handlePasswordCodeConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const auth = readAuth();
    if (!auth?.token || !user) {
      showToast("Login again to change your password.", "error");
      return;
    }
    const code = passwordCode.trim();
    if (code.length !== 6) {
      showToast("Code must be 6 digits.", "error");
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
      showToast("Password changed. Sign in again with your new password.", "success");
      router.replace("/login");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to confirm password change.", "error");
    } finally {
      setConfirmingPasswordCode(false);
    }
  }

  return (
    <AppShell title="Profile" subtitle="Account settings workspace">
<<<<<<< HEAD
      <div className="wh-page-stack w-full">
        <section className="wh-content-card">
=======
      <div className="min-h-[calc(100vh-24px)] w-full rounded-[var(--radius-card)] border border-border bg-card p-6 shadow-[var(--wh-shadow-card)] sm:p-8">
        <div className="flex flex-col gap-5">
>>>>>>> origin/main
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ProfileAvatar
              user={user}
              apiBase={apiBase}
              uploading={uploading}
              onPickAvatar={() => fileInputRef.current?.click()}
            />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div className="min-w-0">
<<<<<<< HEAD
              <h2 className="truncate text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {displayName || user?.username || "Profile"}
              </h2>
=======
              <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {displayName || user?.username || "Profile"}
              </h1>
>>>>>>> origin/main
              <p className="mt-2 text-base text-muted-foreground">
                Manage your account settings and preferences
              </p>
            </div>
          </div>
<<<<<<< HEAD
        </section>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
            <form
              onSubmit={(event) => void handleProfileSave(event)}
              className="wh-content-card w-full"
=======

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
            <form
              onSubmit={(event) => void handleProfileSave(event)}
              className="w-full rounded-[var(--radius-card)] border border-border bg-card p-6 shadow-[var(--wh-shadow-card)] sm:p-8"
>>>>>>> origin/main
            >
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Login</div>
                  <div className="mt-1 font-medium text-foreground">{user?.login || "not set"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Status</div>
                  <div className="mt-1 font-medium text-foreground">{statusLabel}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Role</div>
                  <div className="mt-1 font-medium text-foreground">{roleLabel}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">User</div>
                  <div className="mt-1 truncate font-medium text-foreground">{displayName || user?.username || "Profile"}</div>
                </div>
              </div>

              <div className="mt-8 border-t border-border pt-8">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Profile Details</h2>
                <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <ProfileField label="First name" value={firstName} onChange={setFirstName} />
                  <ProfileField label="Last name" value={lastName} onChange={setLastName} />
                  <ProfileField label="Username" value={user?.username || ""} readOnly />
                  <ProfileField label="Email" value={email} onChange={setEmail} type="email" />
                  <ProfileField label="Phone" value={phoneNumber} onChange={setPhoneNumber} />
                  <ProfileField label="Role" value={roleLabel} readOnly />
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <Button type="submit" disabled={savingProfile || !isProfileDirty} className="sm:min-w-[160px]">
                  {savingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>

            <form
              onSubmit={(event) => void handleSecuritySave(event)}
<<<<<<< HEAD
              className="wh-content-card w-full"
=======
              className="w-full rounded-[var(--radius-card)] border border-border bg-card p-6 shadow-[var(--wh-shadow-card)] sm:p-8"
>>>>>>> origin/main
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
                  <LockKeyhole className="size-4" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Change Password</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Confirm with the emailed code after entering your current and new password.
                  </p>
                </div>
              </div>

              <div className="mt-8 grid gap-5">
                <ProfileField label="Current password" value={currentPassword} onChange={setCurrentPassword} type="password" />
                <ProfileField label="New password" value={newPassword} onChange={setNewPassword} type="password" />
                <ProfileField label="Confirm new password" value={confirmNewPassword} onChange={setConfirmNewPassword} type="password" />
              </div>

              <div className="mt-8 flex justify-end">
                <Button
                  type="submit"
                  disabled={requestingPasswordCode || confirmingPasswordCode}
                  className="sm:min-w-[160px]"
                >
                  {requestingPasswordCode ? "Sending Code..." : "Save Password"}
                </Button>
              </div>
            </form>
          </div>

          <ProfileHistoryPanel />
<<<<<<< HEAD
=======
        </div>
>>>>>>> origin/main

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
              <DialogTitle>Confirm Password Change</DialogTitle>
              <DialogDescription>
                Enter the 6-digit code sent to your email address to confirm your new password.
              </DialogDescription>
            </DialogHeader>
<<<<<<< HEAD
            <form onSubmit={(event) => void handlePasswordCodeConfirm(event)} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
=======
            <form onSubmit={(event) => void handlePasswordCodeConfirm(event)} className="space-y-4">
              <label className="space-y-2">
>>>>>>> origin/main
                <span className="text-sm font-medium text-foreground">Verification code</span>
                <Input
                  value={passwordCode}
                  onChange={(event) => setPasswordCode(event.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                />
              </label>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPasswordCodeDialogOpen(false)}
                  disabled={confirmingPasswordCode}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={confirmingPasswordCode}>
                  {confirmingPasswordCode ? "Confirming..." : "Confirm Code"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
