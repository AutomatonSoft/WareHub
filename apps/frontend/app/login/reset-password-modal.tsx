import React from "react";
import { Lock, Mail } from "lucide-react";
import type { LoginLabels, ResetStep } from "./login-types";
import { PASSWORD_REQUIREMENTS } from "./login-validators";

type ResetPasswordModalProps = {
  t: LoginLabels;
  resetOpen: boolean;
  resetStep: ResetStep;
  resetLoading: boolean;
  resetMessage: string | null;
  resetEmail: string;
  setResetEmail: (value: string) => void;
  resetCode: string;
  setResetCode: (value: string) => void;
  resetPassword: string;
  setResetPassword: (value: string) => void;
  resetConfirm: string;
  setResetConfirm: (value: string) => void;
  onClose: () => void;
  onRequestReset: React.FormEventHandler<HTMLFormElement>;
  onVerifyResetCode: React.FormEventHandler<HTMLFormElement>;
  onConfirmReset: React.FormEventHandler<HTMLFormElement>;
};

export function ResetPasswordModal(props: ResetPasswordModalProps) {
  const {
    t,
    resetOpen,
    resetStep,
    resetLoading,
    resetMessage,
    resetEmail,
    setResetEmail,
    resetCode,
    setResetCode,
    resetPassword,
    setResetPassword,
    resetConfirm,
    setResetConfirm,
    onClose,
    onRequestReset,
    onVerifyResetCode,
    onConfirmReset
  } = props;

  if (!resetOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-card reset-card">
        <div className="auth-card-head">
          <h2>{t.resetPassword}</h2>
        </div>
        {resetStep === "email" ? (
          <form className="form modal-form" onSubmit={onRequestReset}>
            <div className="field has-icon">
              <span className="field-label">{t.email}</span>
              <div className="field-control">
                <span className="field-icon">
                  <Mail size={16} aria-hidden="true" />
                </span>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder=" "
                  aria-label={t.email}
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <button type="submit" className="primary-button" disabled={resetLoading}>
              {resetLoading ? t.sending : t.sendCode}
            </button>
          </form>
        ) : null}
        {resetStep === "code" ? (
          <form className="form modal-form" onSubmit={onVerifyResetCode}>
            <div className="field has-icon">
              <span className="field-label">{t.code}</span>
              <div className="field-control">
                <span className="field-icon">
                  <Lock size={16} aria-hidden="true" />
                </span>
                <input
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder=" "
                  aria-label="Code"
                  inputMode="numeric"
                  required
                />
              </div>
            </div>
            <button type="submit" className="primary-button">
              {t.continue}
            </button>
          </form>
        ) : null}
        {resetStep === "password" ? (
          <form className="form modal-form" onSubmit={onConfirmReset}>
            <div className="field has-icon has-action">
              <span className="field-label">{t.password}</span>
              <div className="field-control">
                <span className="field-icon">
                  <Lock size={16} aria-hidden="true" />
                </span>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder=" "
                  aria-label={t.password}
                  autoComplete="new-password"
                  required
                />
              </div>
              <p className="field-hint">{PASSWORD_REQUIREMENTS}</p>
            </div>
            <div className="field has-icon has-action">
              <span className="field-label">{t.confirmPassword}</span>
              <div className="field-control">
                <span className="field-icon">
                  <Lock size={16} aria-hidden="true" />
                </span>
                <input
                  type="password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder=" "
                  aria-label={t.confirmPassword}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
            <button type="submit" className="primary-button" disabled={resetLoading}>
              {resetLoading ? t.saving : t.updatePassword}
            </button>
          </form>
        ) : null}
        {resetMessage ? <div className="form-message">{resetMessage}</div> : null}
        <div className="modal-actions">
          <button type="button" className="ghost-action-button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

