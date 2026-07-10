"use client";

import type { FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { KeyRound, LockKeyhole, ShieldEllipsis } from "lucide-react";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { FormField } from "../../ui/form-field";
import { Input } from "../../ui/input";
import type { PasswordFieldKey } from "./profile-account-types";

type Props = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  loading: boolean;
  passwordFieldErrors: Partial<Record<PasswordFieldKey, string>>;
  onSetCurrentPassword: (value: string) => void;
  onSetNewPassword: (value: string) => void;
  onSetConfirmPassword: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function ProfilePasswordCard(props: Props) {
  const t = useLabels();
  const { currentPassword, newPassword, confirmPassword, loading, passwordFieldErrors, onSetCurrentPassword, onSetNewPassword, onSetConfirmPassword, onSubmit } = props;
  return (
    <Card className="h-full border-border/70">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t.profileSecurityPosture}</p>
            <CardTitle className="mt-2 text-base">{t.changePasswordTitle}</CardTitle>
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-primary/20 bg-primary/10 text-primary">
            <ShieldEllipsis data-icon="inline-start" />
          </div>
        </div>
        <CardDescription>{t.passwordSecurityHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          <div className="rounded-[calc(var(--radius-card)-0.2rem)] border border-border/70 bg-muted/20 p-4">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <LockKeyhole className="size-3.5" />
              {t.profileCredentialRotation}
            </div>
            <div className="flex flex-col gap-4">
              <FormField label={t.currentPassword} error={passwordFieldErrors.currentPassword}>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="password" placeholder={t.currentPassword} value={currentPassword} onChange={(event) => onSetCurrentPassword(event.target.value)} className={passwordFieldErrors.currentPassword ? "border-destructive pl-9" : "pl-9"} />
                </div>
              </FormField>
              <FormField label={t.newPassword} error={passwordFieldErrors.newPassword}>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="password" placeholder={t.newPassword} value={newPassword} onChange={(event) => onSetNewPassword(event.target.value)} className={passwordFieldErrors.newPassword ? "border-destructive pl-9" : "pl-9"} />
                </div>
              </FormField>
              <FormField label={t.confirmPassword} error={passwordFieldErrors.confirmPassword}>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="password" placeholder={t.confirmPassword} value={confirmPassword} onChange={(event) => onSetConfirmPassword(event.target.value)} className={passwordFieldErrors.confirmPassword ? "border-destructive pl-9" : "pl-9"} />
                </div>
              </FormField>
            </div>
          </div>
          <Button type="submit" disabled={loading}>{t.updatePassword}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

