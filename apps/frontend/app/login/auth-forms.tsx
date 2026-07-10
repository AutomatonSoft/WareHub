import React from "react";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import type { AuthMode, LoginLabels } from "./login-types";
type RegisterFormProps = {
  t: LoginLabels;
  regEmail: string;
  setRegEmail: (value: string) => void;
  regLogin: string;
  setRegLogin: (value: string) => void;
  regPassword: string;
  setRegPassword: (value: string) => void;
  regPasswordConfirm: string;
  setRegPasswordConfirm: (value: string) => void;
  registerPasswordVisible: boolean;
  setRegisterPasswordVisible: React.Dispatch<React.SetStateAction<boolean>>;
  registerLoading: boolean;
  showMessage: boolean;
  status: string;
  onRegister: React.FormEventHandler<HTMLFormElement>;
};

function RegisterForm(props: RegisterFormProps) {
  const {
    t,
    regEmail,
    setRegEmail,
    regLogin,
    setRegLogin,
    regPassword,
    setRegPassword,
    regPasswordConfirm,
    setRegPasswordConfirm,
    registerPasswordVisible,
    setRegisterPasswordVisible,
    registerLoading,
    showMessage,
    status,
    onRegister
  } = props;

  return (
    <form className="form auth-form" onSubmit={onRegister}>
      <div className="field has-icon">
        <span className="field-label">{t.email}</span>
        <div className="field-control">
          <span className="field-icon">
            <Mail size={16} aria-hidden="true" />
          </span>
          <input
            type="email"
            value={regEmail}
            onChange={(e) => setRegEmail(e.target.value)}
            placeholder=" "
            aria-label={t.email}
            autoComplete="email"
            required
          />
        </div>
      </div>
      <div className="field has-icon">
        <span className="field-label">{t.login}</span>
        <div className="field-control">
          <span className="field-icon">
            <User size={16} aria-hidden="true" />
          </span>
          <input
            value={regLogin}
            onChange={(e) => setRegLogin(e.target.value)}
            placeholder=" "
            aria-label={t.login}
            autoComplete="username"
            required
          />
        </div>
      </div>
      <div className="field has-icon has-action">
        <span className="field-label">{t.password}</span>
        <div className="field-control">
          <span className="field-icon">
            <Lock size={16} aria-hidden="true" />
          </span>
          <input
            type={registerPasswordVisible ? "text" : "password"}
            value={regPassword}
            onChange={(e) => setRegPassword(e.target.value)}
            placeholder=" "
            aria-label={t.password}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            className="field-action"
            onClick={() => setRegisterPasswordVisible((prev) => !prev)}
            aria-label={registerPasswordVisible ? t.hidePassword : t.showPassword}
          >
            {registerPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="field-hint">{t.passwordRequirements}</p>
      </div>
      <div className="field has-icon has-action">
        <span className="field-label">{t.confirmPassword}</span>
        <div className="field-control">
          <span className="field-icon">
            <Lock size={16} aria-hidden="true" />
          </span>
          <input
            type={registerPasswordVisible ? "text" : "password"}
            value={regPasswordConfirm}
            onChange={(e) => setRegPasswordConfirm(e.target.value)}
            placeholder=" "
            aria-label={t.confirmPassword}
            autoComplete="new-password"
            required
          />
          <button
            type="button"
            className="field-action"
            onClick={() => setRegisterPasswordVisible((prev) => !prev)}
            aria-label={registerPasswordVisible ? t.hidePassword : t.showPassword}
          >
            {registerPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <button type="submit" className="primary-button" disabled={registerLoading}>
        {registerLoading ? t.submitting : t.register}
      </button>
      {showMessage ? <div className="form-message">{status}</div> : null}
    </form>
  );
}

type LoginFormProps = {
  t: LoginLabels;
  loginLogin: string;
  setLoginLogin: (value: string) => void;
  loginPassword: string;
  setLoginPassword: (value: string) => void;
  loginPasswordVisible: boolean;
  setLoginPasswordVisible: React.Dispatch<React.SetStateAction<boolean>>;
  loginLoading: boolean;
  showMessage: boolean;
  status: string;
  onLogin: React.FormEventHandler<HTMLFormElement>;
  onOpenReset: () => void;
};

function LoginForm(props: LoginFormProps) {
  const {
    t,
    loginLogin,
    setLoginLogin,
    loginPassword,
    setLoginPassword,
    loginPasswordVisible,
    setLoginPasswordVisible,
    loginLoading,
    showMessage,
    status,
    onLogin,
    onOpenReset
  } = props;

  return (
    <form className="form auth-form" onSubmit={onLogin}>
      <div className="field has-icon">
        <span className="field-label">{t.login}</span>
        <div className="field-control">
          <span className="field-icon">
            <User size={16} aria-hidden="true" />
          </span>
          <input
            value={loginLogin}
            onChange={(e) => setLoginLogin(e.target.value)}
            placeholder=" "
            aria-label={t.login}
            autoComplete="username"
            required
          />
        </div>
      </div>
      <div className="field has-icon has-action">
        <span className="field-label">{t.password}</span>
        <div className="field-control">
          <span className="field-icon">
            <Lock size={16} aria-hidden="true" />
          </span>
          <input
            type={loginPasswordVisible ? "text" : "password"}
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder=" "
            aria-label={t.password}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="field-action"
            onClick={() => setLoginPasswordVisible((prev) => !prev)}
            aria-label={loginPasswordVisible ? t.hidePassword : t.showPassword}
          >
            {loginPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <button type="button" className="text-link" onClick={onOpenReset}>
        {t.forgotPassword}
      </button>
      <button type="submit" className="primary-button" disabled={loginLoading}>
        {loginLoading ? t.loggingIn : t.login}
      </button>
      {showMessage ? <div className="form-message">{status}</div> : null}
    </form>
  );
}

type AuthFormsProps = {
  mode: AuthMode;
  setMode: (value: AuthMode) => void;
  registerForm: RegisterFormProps;
  loginForm: LoginFormProps;
  t: LoginLabels;
};

export function AuthForms({ mode, setMode, registerForm, loginForm, t }: AuthFormsProps) {
  return (
    <>
      <div className="tabs auth-tabs">
        <button
          type="button"
          className={mode === "login" ? "tab active" : "tab"}
          onClick={() => setMode("login")}
        >
          {t.login}
        </button>
        <button
          type="button"
          className={mode === "register" ? "tab active" : "tab"}
          onClick={() => setMode("register")}
        >
          {t.register}
        </button>
      </div>
      {mode === "register" ? <RegisterForm {...registerForm} /> : <LoginForm {...loginForm} />}
    </>
  );
}

