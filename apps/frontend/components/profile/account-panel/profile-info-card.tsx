"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useLabels } from "../../../app/use-labels";
import { ImagePlus, Mail, Phone, Upload, UserRound } from "lucide-react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { FormField } from "../../ui/form-field";
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
    <Card className="h-full border-border/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace profile</p>
            <CardTitle className="mt-2">{t.profileAccess}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep your account details current so marketplace activity, approvals, and notifications stay aligned.
            </p>
          </div>
          {isProfileDirty ? <Badge variant="secondary">Unsaved changes</Badge> : <Badge variant="outline">Synced</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="flex flex-col gap-4">
            <FormField label={t.email} error={profileFieldErrors.email}>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={email} onChange={(event) => onSetEmail(event.target.value)} placeholder={t.email} className={profileFieldErrors.email ? "border-destructive pl-9" : "pl-9"} />
              </div>
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label={t.firstName} error={profileFieldErrors.firstName}>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={firstName} onChange={(event) => onSetFirstName(event.target.value)} placeholder={t.firstName} className={profileFieldErrors.firstName ? "border-destructive pl-9" : "pl-9"} />
                </div>
              </FormField>
              <FormField label={t.lastName} error={profileFieldErrors.lastName}>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={lastName} onChange={(event) => onSetLastName(event.target.value)} placeholder={t.lastName} className={profileFieldErrors.lastName ? "border-destructive pl-9" : "pl-9"} />
                </div>
              </FormField>
            </div>
            <FormField label={t.phoneNumber} error={profileFieldErrors.phoneNumber}>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={phoneNumber} onChange={(event) => onSetPhoneNumber(event.target.value)} placeholder="+7 (777) 123-45-67" className={profileFieldErrors.phoneNumber ? "border-destructive pl-9" : "pl-9"} />
              </div>
            </FormField>
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-[var(--radius-card)] border border-border/70 bg-gradient-to-b from-muted/40 to-background p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-primary/20 bg-primary/10 text-primary">
                  <ImagePlus data-icon="inline-start" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Avatar update</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Upload a clean square photo for a sharper identity across workspace views.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-[var(--radius-control)] border border-dashed border-border/80 bg-background/80 p-3">
                <label className="flex cursor-pointer flex-col gap-3 text-sm text-foreground">
                  <span className="min-w-0">
                    <span className="block font-semibold">{t.chooseFile}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{selectedAvatarFileName ?? t.noFileSelected}</span>
                  </span>
                  <span className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-card px-3 text-xs font-semibold">
                    <Upload data-icon="inline-start" />
                    Upload
                  </span>
                  <input type="file" accept="image/*" onChange={onAvatarChange} className="hidden" disabled={loading} />
                </label>
              </div>
              {profileFieldErrors.avatar ? <p className="mt-2 text-xs text-destructive">{profileFieldErrors.avatar}</p> : null}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={loading || !isProfileDirty}>{t.saveProfile}</Button>
              <Button type="button" variant="secondary" disabled={loading || !selectedAvatarFileName} onClick={onClearAvatarSelection}>{t.clearAvatarSelection}</Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


