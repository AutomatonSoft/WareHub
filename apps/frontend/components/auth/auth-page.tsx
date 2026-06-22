"use client";

import Link from "next/link";
import { Eye, EyeOff, GalleryVerticalEnd, KeyRound, Lock, Mail, Phone, User, UserRound } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppFooter } from "../layout/app-footer";
import { useToast } from "../shared/toast-provider";
import { Button, buttonVariants } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import {
  confirmPasswordReset,
  DEFAULT_API_BASE,
  parseError,
  requestPasswordReset,
  saveAuth
} from "../../app/client-api";
import { API_V1_ROUTES, buildApiV1Url } from "../../app/api-v1-routes";
import { translateValidationErrorCode } from "../../app/forms/validation-feedback";
import { syncDatabaseServiceSession } from "../../app/services-session";
import { useLabels } from "../../app/use-labels";
import {
  validateEmail,
  validateLogin,
  validatePassword,
  validatePersonName,
  validatePhoneNumber
} from "../../app/login/login-validators";

type AuthPageMode = "login" | "register" | "forgot-password";
type ResetStep = "request" | "confirm";
type RegisterFieldKey = "email" | "firstName" | "lastName" | "phoneNumber" | "login" | "password" | "confirmPassword";
type LoginFieldKey = "login" | "password";
type ResetFieldKey = "email" | "code" | "password" | "confirmPassword";

const GENERIC_AUTH_ERROR_MESSAGE = "Something went wrong. Please try again.";
const RESET_REQUEST_SUCCESS_MESSAGE = "Reset code sent. Check your email.";
const PASSWORD_RESET_SUCCESS_MESSAGE = "Password updated. You can sign in now.";
const RESET_REQUEST_HINT = "Enter your email to receive a reset code.";

function getAuthActionErrorMessage(payload: unknown, fallback: string, status: number): string {
  if (status >= 500) {
    return GENERIC_AUTH_ERROR_MESSAGE;
  }

  const message = parseError(payload, fallback);
  if (/http 5\d\d/i.test(message) || /internal server error/i.test(message)) {
    return GENERIC_AUTH_ERROR_MESSAGE;
  }

  return message;
}

function AuthField({
  label,
  error,
  description,
  labelAction,
  children
}: {
  label: string;
  error?: string;
  description?: string;
  labelAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {labelAction ? <span className="shrink-0">{labelAction}</span> : null}
      </span>
      {children}
      {description ? <p className="text-xs font-normal text-muted-foreground">{description}</p> : null}
      {error ? <p className="text-xs font-normal text-destructive">{error}</p> : null}
    </label>
  );
}

function AuthInput({
  icon,
  rightAction,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { icon: ReactNode; rightAction?: ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center text-muted-foreground [&_svg]:size-4">
        {icon}
      </div>
      {rightAction ? (
        <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center">
          {rightAction}
        </div>
      ) : null}
      <Input
        className={[
          "!pl-8",
          rightAction ? "!pr-10" : "",
          "focus-visible:ring-1 focus-visible:ring-ring/15 focus-visible:ring-offset-0 focus-visible:border-border",
          className
        ].filter(Boolean).join(" ")}
        {...props}
      />
    </div>
  );
}

export function AuthPage({ mode }: { mode: AuthPageMode }) {
  const t = useLabels();
  const { showToast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>("request");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [loginFieldErrors, setLoginFieldErrors] = useState<Partial<Record<LoginFieldKey, string>>>({});
  const [registerFieldErrors, setRegisterFieldErrors] = useState<Partial<Record<RegisterFieldKey, string>>>({});
  const [resetFieldErrors, setResetFieldErrors] = useState<Partial<Record<ResetFieldKey, string>>>({});

  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);

  async function onLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginFieldErrors({});

    setLoading(true);
    try {
      const response = await fetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.login), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: loginValue.trim(), password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = getAuthActionErrorMessage(payload, GENERIC_AUTH_ERROR_MESSAGE, response.status);
        showToast(message, "error");
        return;
      }

      const payload = (await response.json()) as {
        token: string;
        user: {
          id: string;
          username: string;
          login: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone_number?: string | null;
          avatar_url?: string | null;
          role: "admin" | "user";
          status: "pending" | "approved" | "rejected";
        };
      };

      saveAuth(payload.token, payload.user);
      await syncDatabaseServiceSession(payload.token).catch(() => false);
      router.replace("/profile");
    } catch {
      showToast(GENERIC_AUTH_ERROR_MESSAGE, "error");
    } finally {
      setLoading(false);
    }
  }

  async function onRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterFieldErrors({});

    const emailError = validateEmail(email);
    if (emailError) {
      setRegisterFieldErrors({ email: translateValidationErrorCode(t, emailError) });
      return;
    }

    const loginError = validateLogin(loginValue);
    if (loginError) {
      setRegisterFieldErrors({ login: translateValidationErrorCode(t, loginError) });
      return;
    }

    const firstNameError = validatePersonName(firstName, t.firstName);
    if (firstNameError) {
      setRegisterFieldErrors({ firstName: translateValidationErrorCode(t, firstNameError) });
      return;
    }

    const lastNameError = validatePersonName(lastName, t.lastName);
    if (lastNameError) {
      setRegisterFieldErrors({ lastName: translateValidationErrorCode(t, lastNameError) });
      return;
    }

    const phoneNumberError = validatePhoneNumber(phoneNumber);
    if (phoneNumberError) {
      setRegisterFieldErrors({ phoneNumber: translateValidationErrorCode(t, phoneNumberError) });
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setRegisterFieldErrors({ password: translateValidationErrorCode(t, passwordError) });
      return;
    }

    if (password !== confirmPassword) {
      setRegisterFieldErrors({ confirmPassword: t.passwordsMismatch });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(buildApiV1Url(apiBase, API_V1_ROUTES.auth.register), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          login: loginValue.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: phoneNumber.trim(),
          password
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = getAuthActionErrorMessage(payload, GENERIC_AUTH_ERROR_MESSAGE, response.status);
        showToast(message, "error");
        return;
      }

      showToast(t.registrationSubmittedWaitApprovalLogin, "success");
      router.replace("/login");
    } catch {
      showToast(GENERIC_AUTH_ERROR_MESSAGE, "error");
    } finally {
      setLoading(false);
    }
  }

  async function onRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetFieldErrors({});

    const normalizedEmail = resetEmail.trim().toLowerCase();
    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      setResetFieldErrors({ email: translateValidationErrorCode(t, emailError) });
      return;
    }

    setResetLoading(true);
    try {
      await requestPasswordReset(apiBase, normalizedEmail);
      setResetEmail(normalizedEmail);
      setResetStep("confirm");
      showToast(RESET_REQUEST_SUCCESS_MESSAGE, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : GENERIC_AUTH_ERROR_MESSAGE;
      showToast(message, "error");
    } finally {
      setResetLoading(false);
    }
  }

  async function onConfirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetFieldErrors({});

    const nextErrors: Partial<Record<ResetFieldKey, string>> = {};
    const normalizedEmail = resetEmail.trim().toLowerCase();
    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      nextErrors.email = translateValidationErrorCode(t, emailError);
    }

    if (!resetCode.trim()) {
      nextErrors.code = `${t.resetCode} is required.`;
    }

    const passwordError = validatePassword(resetPasswordValue);
    if (passwordError) {
      nextErrors.password = translateValidationErrorCode(t, passwordError);
    }

    if (!resetConfirmPassword) {
      nextErrors.confirmPassword = `${t.confirmPassword} is required.`;
    } else if (resetPasswordValue !== resetConfirmPassword) {
      nextErrors.confirmPassword = t.passwordsMismatch;
    }

    if (Object.keys(nextErrors).length > 0) {
      setResetFieldErrors(nextErrors);
      return;
    }

    setResetLoading(true);
    try {
      await confirmPasswordReset(apiBase, {
        email: normalizedEmail,
        code: resetCode.trim(),
        password: resetPasswordValue
      });
      showToast(PASSWORD_RESET_SUCCESS_MESSAGE, "success");
      router.replace("/login");
    } catch (error) {
      const message = error instanceof Error ? error.message : GENERIC_AUTH_ERROR_MESSAGE;
      showToast(message, "error");
    } finally {
      setResetLoading(false);
    }
  }

  const isLoginSubmitDisabled = loading || loginValue.trim().length === 0 || password.length === 0;
  const isRegisterSubmitDisabled =
    loading ||
    email.trim().length === 0 ||
    firstName.trim().length === 0 ||
    lastName.trim().length === 0 ||
    phoneNumber.trim().length === 0 ||
    loginValue.trim().length === 0 ||
    password.length === 0 ||
    confirmPassword.length === 0;

  const title =
    mode === "login"
      ? t.welcomeBack
      : mode === "register"
        ? t.createAccount
        : t.resetPassword;
  const description =
    mode === "login"
      ? t.signInManageProfileWorkspace
      : mode === "register"
        ? "Enter your details below to create your account"
        : resetStep === "request"
          ? RESET_REQUEST_HINT
          : t.enterCode;

  return (
    <div className="flex min-h-svh flex-col bg-muted p-6 md:p-10">
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex items-center gap-2 self-center font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Automatons Soft.
          </div>

          <Card className="wh-auth-card">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              {mode === "login" ? (
                <form onSubmit={onLoginSubmit} className="flex flex-col gap-4" autoComplete="off">
                  <AuthField label={t.login} error={loginFieldErrors.login}>
                    <AuthInput
                      icon={<User />}
                      aria-label={t.login}
                      autoComplete="off"
                      placeholder={t.login}
                      value={loginValue}
                      onChange={(e) => {
                        setLoginValue(e.target.value);
                        setLoginFieldErrors((current) => ({ ...current, login: undefined }));
                      }}
                      className={loginFieldErrors.login ? "border-destructive" : undefined}
                    />
                  </AuthField>

                  <AuthField
                    label={t.password}
                    error={loginFieldErrors.password}
                    labelAction={
                      <Link href="/forgot-password" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                        {t.forgotPassword}
                      </Link>
                    }
                  >
                    <AuthInput
                      icon={<Lock />}
                      aria-label={t.password}
                      type={showLoginPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={t.password}
                      value={password}
                      rightAction={
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((current) => !current)}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        >
                          {showLoginPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      }
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setLoginFieldErrors((current) => ({ ...current, password: undefined }));
                      }}
                      className={loginFieldErrors.password ? "border-destructive" : undefined}
                    />
                  </AuthField>

                  <Button type="submit" disabled={isLoginSubmitDisabled}>
                    {loading ? t.pleaseWait : t.login}
                  </Button>

                  <CardDescription className="text-center">
                    Don&apos;t have an account?{" "}
                    <Link href="/register" className="underline underline-offset-4">
                      Sign up
                    </Link>
                  </CardDescription>
                </form>
              ) : null}

              {mode === "register" ? (
                <form onSubmit={onRegisterSubmit} className="flex flex-col gap-4" autoComplete="off">
                  <AuthField label="Full Name" error={registerFieldErrors.firstName || registerFieldErrors.lastName}>
                    <div className="grid grid-cols-2 gap-4">
                      <AuthInput
                        icon={<User />}
                        aria-label={t.firstName}
                        autoComplete="off"
                        placeholder={t.firstName}
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          setRegisterFieldErrors((current) => ({ ...current, firstName: undefined }));
                        }}
                        className={registerFieldErrors.firstName ? "border-destructive" : undefined}
                      />
                      <AuthInput
                        icon={<UserRound />}
                        aria-label={t.lastName}
                        autoComplete="off"
                        placeholder={t.lastName}
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          setRegisterFieldErrors((current) => ({ ...current, lastName: undefined }));
                        }}
                        className={registerFieldErrors.lastName ? "border-destructive" : undefined}
                      />
                    </div>
                  </AuthField>

                  <AuthField label={t.email} error={registerFieldErrors.email}>
                    <AuthInput
                      icon={<Mail />}
                      aria-label={t.email}
                      type="email"
                      autoComplete="off"
                      placeholder="m@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setRegisterFieldErrors((current) => ({ ...current, email: undefined }));
                      }}
                      className={registerFieldErrors.email ? "border-destructive" : undefined}
                    />
                  </AuthField>

                  <AuthField label={t.phoneNumber} error={registerFieldErrors.phoneNumber}>
                    <AuthInput
                      icon={<Phone />}
                      aria-label={t.phoneNumber}
                      autoComplete="off"
                      placeholder={t.phoneNumber}
                      value={phoneNumber}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value);
                        setRegisterFieldErrors((current) => ({ ...current, phoneNumber: undefined }));
                      }}
                      className={registerFieldErrors.phoneNumber ? "border-destructive" : undefined}
                    />
                  </AuthField>

                  <AuthField label={t.login} error={registerFieldErrors.login}>
                    <AuthInput
                      icon={<User />}
                      aria-label={t.login}
                      autoComplete="off"
                      placeholder="johndoe"
                      value={loginValue}
                      onChange={(e) => {
                        setLoginValue(e.target.value);
                        setRegisterFieldErrors((current) => ({ ...current, login: undefined }));
                      }}
                      className={registerFieldErrors.login ? "border-destructive" : undefined}
                    />
                  </AuthField>

                  <AuthField
                    label={t.password}
                    error={registerFieldErrors.password || registerFieldErrors.confirmPassword}
                    description="Must be at least 8 characters long."
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <AuthInput
                        icon={<Lock />}
                        aria-label={t.password}
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setRegisterFieldErrors((current) => ({ ...current, password: undefined }));
                        }}
                        className={registerFieldErrors.password ? "border-destructive" : undefined}
                      />
                      <AuthInput
                        icon={<KeyRound />}
                        aria-label={t.confirmPassword}
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setRegisterFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
                        }}
                        className={registerFieldErrors.confirmPassword ? "border-destructive" : undefined}
                      />
                    </div>
                  </AuthField>

                  <Button type="submit" disabled={isRegisterSubmitDisabled}>
                    {loading ? t.pleaseWait : "Create Account"}
                  </Button>

                  <CardDescription className="text-center">
                    Already have an account?{" "}
                    <Link href="/login" className="underline underline-offset-4">
                      Sign in
                    </Link>
                  </CardDescription>
                </form>
              ) : null}

              {mode === "forgot-password" ? (
                <div className="flex flex-col gap-4">
                  {resetStep === "request" ? (
                    <form onSubmit={onRequestReset} className="flex flex-col gap-4" autoComplete="off">
                      <AuthField label={t.email} error={resetFieldErrors.email}>
                        <AuthInput
                          icon={<Mail />}
                          aria-label={t.email}
                          type="email"
                          autoComplete="off"
                          placeholder="m@example.com"
                          value={resetEmail}
                          onChange={(e) => {
                            setResetEmail(e.target.value);
                            setResetFieldErrors((current) => ({ ...current, email: undefined }));
                          }}
                          className={resetFieldErrors.email ? "border-destructive" : undefined}
                        />
                      </AuthField>
                      <Button type="submit" disabled={resetLoading || resetEmail.trim().length === 0}>
                        {resetLoading ? t.sending : t.sendCode}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={onConfirmReset} className="flex flex-col gap-4" autoComplete="off">
                      <AuthField label={t.email} error={resetFieldErrors.email}>
                        <AuthInput icon={<Mail />} type="email" aria-label={t.email} value={resetEmail} readOnly className="bg-muted/30" />
                      </AuthField>
                      <AuthField label={t.resetCode} error={resetFieldErrors.code}>
                        <AuthInput
                          icon={<KeyRound />}
                          aria-label={t.resetCode}
                          autoComplete="off"
                          placeholder={t.resetCode}
                          value={resetCode}
                          onChange={(e) => {
                            setResetCode(e.target.value);
                            setResetFieldErrors((current) => ({ ...current, code: undefined }));
                          }}
                          inputMode="numeric"
                          maxLength={6}
                          className={resetFieldErrors.code ? "border-destructive" : undefined}
                        />
                      </AuthField>
                      <AuthField
                        label={t.newPassword}
                        error={resetFieldErrors.password || resetFieldErrors.confirmPassword}
                        description="Must be at least 8 characters long."
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <AuthInput
                            icon={<Lock />}
                            aria-label={t.newPassword}
                            type="password"
                            autoComplete="new-password"
                            value={resetPasswordValue}
                            onChange={(e) => {
                              setResetPasswordValue(e.target.value);
                              setResetFieldErrors((current) => ({ ...current, password: undefined }));
                            }}
                            className={resetFieldErrors.password ? "border-destructive" : undefined}
                          />
                          <AuthInput
                            icon={<KeyRound />}
                            aria-label={t.confirmPassword}
                            type="password"
                            autoComplete="new-password"
                            value={resetConfirmPassword}
                            onChange={(e) => {
                              setResetConfirmPassword(e.target.value);
                              setResetFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
                            }}
                            className={resetFieldErrors.confirmPassword ? "border-destructive" : undefined}
                          />
                        </div>
                      </AuthField>
                      <Button
                        type="submit"
                        disabled={
                          resetLoading ||
                          resetCode.trim().length === 0 ||
                          resetPasswordValue.length === 0 ||
                          resetConfirmPassword.length === 0
                        }
                      >
                        {resetLoading ? t.saving : t.resetPassword}
                      </Button>
                    </form>
                  )}

                  <Separator />

                  <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                    {t.backToLogin}
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <AppFooter className="h-auto py-2" />
    </div>
  );
}
