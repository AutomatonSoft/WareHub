"use client";

import React, { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import {
  AuthUser,
  changeCurrentUserPassword,
  fetchCurrentUser,
  resolvePhotoUrl,
  updateCurrentUser,
  uploadImage
} from "../client-api";
import { labels, Lang } from "../i18n";

type AccountPanelProps = {
  apiBase: string;
  token: string;
  lang: Lang;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
};

const FINGERPRINT_PREF_KEY = "sofortbot_fingerprint_enabled";

export function AccountPanel({ apiBase, token, lang, user, onUserUpdated }: AccountPanelProps) {
  const t = labels[lang];
  const [email, setEmail] = useState(user.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fingerprintEnabled, setFingerprintEnabled] = useState(false);

  useEffect(() => {
    setEmail(user.email ?? "");
    setAvatarUrl(user.avatar_url ?? "");
  }, [user.email, user.avatar_url]);

  useEffect(() => {
    const raw = localStorage.getItem(FINGERPRINT_PREF_KEY);
    setFingerprintEnabled(raw === "1");
  }, []);

  async function refreshProfile() {
    setLoadingProfile(true);
    setMessage(null);
    try {
      const profile = await fetchCurrentUser(apiBase, token);
      onUserUpdated(profile);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.failedLoadProfile);
    } finally {
      setLoadingProfile(false);
    }
  }

  async function onSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setMessage(null);
    try {
      const updated = await updateCurrentUser(apiBase, token, {
        email: email.trim()
      });
      onUserUpdated(updated);
      setMessage(t.accountSaved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.accountSaveFailed);
    } finally {
      setSavingProfile(false);
    }
  }

  async function onUploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setUploadingAvatar(true);
    setMessage(null);
    try {
      const uploadedUrl = await uploadImage(apiBase, token, file, "avatar");
      setAvatarUrl(uploadedUrl);
      const updated = await updateCurrentUser(apiBase, token, { avatar_url: uploadedUrl });
      onUserUpdated(updated);
      setMessage(t.accountSaved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.accountSaveFailed);
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setMessage(null);
    try {
      await changeCurrentUserPassword(apiBase, token, {
        current_password: currentPassword,
        new_password: newPassword
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage(t.passwordChanged);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.passwordChangeFailed);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <section className="card dashboard-card">
      <header className="admin-panel-header">
        <div>
          <h1>{t.accountTitle}</h1>
          <p>{t.accountSubtitle}</p>
        </div>
        <button type="button" onClick={() => void refreshProfile()} disabled={loadingProfile}>
          {loadingProfile ? t.loading : t.refresh}
        </button>
      </header>

      <section className="account-grid">
        <article className="account-card">
          <h2>{t.profile}</h2>
          <p className="subtitle">{t.profileHint}</p>
          <div className="account-avatar-row">
            <div className="account-avatar">
              {avatarUrl ? (
                <Image
                  src={resolvePhotoUrl(apiBase, avatarUrl)}
                  alt={t.userAvatarAlt}
                  width={72}
                  height={72}
                  unoptimized
                />
              ) : (
                <span>{(user.username || user.login || "?").slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <label className="link-button">
              {uploadingAvatar ? t.working : t.uploadAvatar}
              <input type="file" accept="image/*" onChange={onUploadAvatar} hidden />
            </label>
          </div>
          <form className="form" onSubmit={onSaveProfile}>
            <label>
              {t.login}
              <input value={user.login} readOnly />
            </label>
            <label>
              {t.email}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={fingerprintEnabled}
                onChange={(event) => {
                  const next = event.target.checked;
                  setFingerprintEnabled(next);
                  localStorage.setItem(FINGERPRINT_PREF_KEY, next ? "1" : "0");
                }}
              />
              <span>{t.enableFingerprint}</span>
            </label>
            <button type="submit" disabled={savingProfile || uploadingAvatar}>
              {savingProfile ? t.saving : t.saveProfile}
            </button>
          </form>
        </article>

        <article className="account-card">
          <h2>{t.passwordSettings}</h2>
          <p className="subtitle">{t.passwordHint}</p>
          <form className="form" onSubmit={onChangePassword}>
            <label>
              {t.currentPassword}
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <label>
              {t.newPassword}
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <button type="submit" disabled={savingPassword}>
              {savingPassword ? t.saving : t.changePassword}
            </button>
          </form>
        </article>
      </section>

      {message ? <div className="form-message">{message}</div> : null}
    </section>
  );
}
