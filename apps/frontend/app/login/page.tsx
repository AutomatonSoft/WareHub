"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useToast } from "../../components/shared/toast-provider";
import { useLabels } from "../use-labels";
import { DEFAULT_API_BASE, parseError, saveAuth } from "../client-api";
import { syncDatabaseServiceSession } from "../services-session";
import { validateEmail, validateLogin, validatePassword, validatePersonName, validatePhoneNumber } from "./login-validators";
import { translateValidationErrorCode } from "../forms/validation-feedback";

type AuthMode = "login" | "register";
type LoginFieldKey = "email" | "firstName" | "lastName" | "phoneNumber" | "login" | "password" | "confirmPassword";

export default function LoginPage() {
  const t = useLabels();
  const { showToast } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginFieldKey, string>>>({});

  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("mode") === "register") {
      setMode("register");
    }
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setFieldErrors({});

    if (mode === "register") {
      const emailError = validateEmail(email);
      if (emailError) {
        setFieldErrors({ email: translateValidationErrorCode(t, emailError) });
        return;
      }

      const loginError = validateLogin(loginValue);
      if (loginError) {
        setFieldErrors({ login: translateValidationErrorCode(t, loginError) });
        return;
      }

      const firstNameError = validatePersonName(firstName, t.firstName);
      if (firstNameError) {
        setFieldErrors({ firstName: translateValidationErrorCode(t, firstNameError) });
        return;
      }

      const lastNameError = validatePersonName(lastName, t.lastName);
      if (lastNameError) {
        setFieldErrors({ lastName: translateValidationErrorCode(t, lastNameError) });
        return;
      }

      const phoneNumberError = validatePhoneNumber(phoneNumber);
      if (phoneNumberError) {
        setFieldErrors({ phoneNumber: translateValidationErrorCode(t, phoneNumberError) });
        return;
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        setFieldErrors({ password: translateValidationErrorCode(t, passwordError) });
        return;
      }

      if (password !== confirmPassword) {
        setFieldErrors({ confirmPassword: t.passwordsMismatch });
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`${apiBase}/auth/register`, {
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
          const message = parseError(payload, `${t.registrationFailed}: HTTP ${response.status}`);
          setStatus(message);
          showToast(message, "error");
          return;
        }

        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setFirstName("");
        setLastName("");
        setPhoneNumber("");
        setFieldErrors({});
        setStatus(t.registrationSubmittedWaitApprovalLogin);
        showToast(t.registrationSubmittedWaitApprovalLogin, "success");
      } catch (error) {
        const message = `${t.registrationFailed}: ${error instanceof Error ? error.message : t.unknownError}`;
        setStatus(message);
        showToast(message, "error");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginValue.trim(), password })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = parseError(payload, `${t.loginFailed}: HTTP ${response.status}`);
        setStatus(message);
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
    } catch (error) {
      const message = `${t.loginFailed}: ${error instanceof Error ? error.message : t.unknownError}`;
      setStatus(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  const isSubmitDisabled =
    loading ||
    loginValue.trim().length === 0 ||
    password.length === 0 ||
    (mode === "register" &&
      (email.trim().length === 0 ||
        firstName.trim().length === 0 ||
        lastName.trim().length === 0 ||
        phoneNumber.trim().length === 0 ||
        confirmPassword.length === 0));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(80%_56%_at_50%_-8%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_72%),linear-gradient(180deg,color-mix(in_srgb,var(--background)_97%,white),var(--background))] p-4 text-foreground">
      <Card className="w-full max-w-md rounded-xl border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{mode === "login" ? t.welcomeBack : t.createAccount}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? t.signInManageProfileWorkspace
              : t.registerNewAccountToAccessWarehub}
          </CardDescription>
        </CardHeader>
        <CardContent>
        <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">{t.login}</TabsTrigger>
            <TabsTrigger value="register">{t.register}</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          {mode === "register" ? (
            <div>
              <Input
                placeholder={t.email}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                className={fieldErrors.email ? "border-destructive" : undefined}
              />
              {fieldErrors.email ? <p className="mt-1 text-xs text-destructive">{fieldErrors.email}</p> : null}
            </div>
          ) : null}
          {mode === "register" ? (
            <div>
              <Input
                placeholder={t.firstName}
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  setFieldErrors((current) => ({ ...current, firstName: undefined }));
                }}
                className={fieldErrors.firstName ? "border-destructive" : undefined}
              />
              {fieldErrors.firstName ? <p className="mt-1 text-xs text-destructive">{fieldErrors.firstName}</p> : null}
            </div>
          ) : null}
          {mode === "register" ? (
            <div>
              <Input
                placeholder={t.lastName}
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  setFieldErrors((current) => ({ ...current, lastName: undefined }));
                }}
                className={fieldErrors.lastName ? "border-destructive" : undefined}
              />
              {fieldErrors.lastName ? <p className="mt-1 text-xs text-destructive">{fieldErrors.lastName}</p> : null}
            </div>
          ) : null}
          {mode === "register" ? (
            <div>
              <Input
                placeholder={t.phoneNumber}
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setFieldErrors((current) => ({ ...current, phoneNumber: undefined }));
                }}
                className={fieldErrors.phoneNumber ? "border-destructive" : undefined}
              />
              {fieldErrors.phoneNumber ? <p className="mt-1 text-xs text-destructive">{fieldErrors.phoneNumber}</p> : null}
            </div>
          ) : null}
          <div>
            <Input
              placeholder={t.login}
              value={loginValue}
              onChange={(e) => {
                setLoginValue(e.target.value);
                setFieldErrors((current) => ({ ...current, login: undefined }));
              }}
              className={fieldErrors.login ? "border-destructive" : undefined}
            />
            {fieldErrors.login ? <p className="mt-1 text-xs text-destructive">{fieldErrors.login}</p> : null}
          </div>
          <div>
            <Input
              type="password"
              placeholder={t.password}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((current) => ({ ...current, password: undefined }));
              }}
              className={fieldErrors.password ? "border-destructive" : undefined}
            />
            {fieldErrors.password ? <p className="mt-1 text-xs text-destructive">{fieldErrors.password}</p> : null}
          </div>
          {mode === "register" ? (
            <div>
              <Input
                type="password"
                placeholder={t.confirmPassword}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
                }}
                className={fieldErrors.confirmPassword ? "border-destructive" : undefined}
              />
              {fieldErrors.confirmPassword ? (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.confirmPassword}</p>
              ) : null}
            </div>
          ) : null}

          {status ? <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{status}</p> : null}

          <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
            {loading ? t.pleaseWait : mode === "login" ? t.login : t.register}
          </Button>
        </form>
        </CardContent>
      </Card>
    </main>
  );
}
