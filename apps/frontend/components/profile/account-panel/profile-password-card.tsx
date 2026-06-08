"use client";

import type { FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
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
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.changePasswordTitle}</CardTitle>
        <CardDescription>{t.passwordSecurityHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
          <Input type="password" placeholder={t.currentPassword} value={currentPassword} onChange={(event) => onSetCurrentPassword(event.target.value)} className={passwordFieldErrors.currentPassword ? "border-destructive" : undefined} />
          {passwordFieldErrors.currentPassword ? <p className="text-xs text-destructive">{passwordFieldErrors.currentPassword}</p> : null}
          <Input type="password" placeholder={t.newPassword} value={newPassword} onChange={(event) => onSetNewPassword(event.target.value)} className={passwordFieldErrors.newPassword ? "border-destructive" : undefined} />
          {passwordFieldErrors.newPassword ? <p className="text-xs text-destructive">{passwordFieldErrors.newPassword}</p> : null}
          <Input type="password" placeholder={t.confirmPassword} value={confirmPassword} onChange={(event) => onSetConfirmPassword(event.target.value)} className={passwordFieldErrors.confirmPassword ? "border-destructive" : undefined} />
          {passwordFieldErrors.confirmPassword ? <p className="text-xs text-destructive">{passwordFieldErrors.confirmPassword}</p> : null}
          <Button type="submit" disabled={loading}>{t.updatePassword}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

