"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import type { ProfileFieldKey } from "./profile-account-types";

type Props = {
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  loading: boolean;
  isProfileDirty: boolean;
  selectedAvatarFileName: string | null;
  profileFieldErrors: Partial<Record<ProfileFieldKey, string>>;
  onSetEmail: (value: string) => void;
  onSetFirstName: (value: string) => void;
  onSetLastName: (value: string) => void;
  onSetPhoneNumber: (value: string) => void;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearAvatarSelection: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function ProfileInfoCard(props: Props) {
  const t = useLabels();
  const {
    email, firstName, lastName, phoneNumber, loading, isProfileDirty, selectedAvatarFileName, profileFieldErrors,
    onSetEmail, onSetFirstName, onSetLastName, onSetPhoneNumber, onAvatarChange, onClearAvatarSelection, onSubmit
  } = props;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t.profileAccess}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
          <Input value={email} onChange={(event) => onSetEmail(event.target.value)} placeholder={t.email} className={profileFieldErrors.email ? "border-destructive" : undefined} />
          {profileFieldErrors.email ? <p className="text-xs text-destructive">{profileFieldErrors.email}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Input value={firstName} onChange={(event) => onSetFirstName(event.target.value)} placeholder={t.firstName} className={profileFieldErrors.firstName ? "border-destructive" : undefined} />
              {profileFieldErrors.firstName ? <p className="text-xs text-destructive">{profileFieldErrors.firstName}</p> : null}
            </div>
            <div>
              <Input value={lastName} onChange={(event) => onSetLastName(event.target.value)} placeholder={t.lastName} className={profileFieldErrors.lastName ? "border-destructive" : undefined} />
              {profileFieldErrors.lastName ? <p className="text-xs text-destructive">{profileFieldErrors.lastName}</p> : null}
            </div>
          </div>
          <Input value={phoneNumber} onChange={(event) => onSetPhoneNumber(event.target.value)} placeholder="+7 (777) 123-45-67" className={profileFieldErrors.phoneNumber ? "border-destructive" : undefined} />
          {profileFieldErrors.phoneNumber ? <p className="text-xs text-destructive">{profileFieldErrors.phoneNumber}</p> : null}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-2">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">
              {t.chooseFile}
              <input type="file" accept="image/*" onChange={onAvatarChange} className="hidden" disabled={loading} />
            </label>
            <span className="ml-3 text-sm text-muted-foreground">{selectedAvatarFileName ?? t.noFileSelected}</span>
            {profileFieldErrors.avatar ? <p className="mt-1 text-xs text-destructive">{profileFieldErrors.avatar}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || !isProfileDirty}>{t.saveProfile}</Button>
            <Button type="button" variant="secondary" disabled={loading || !selectedAvatarFileName} onClick={onClearAvatarSelection}>{t.clearAvatarSelection}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


