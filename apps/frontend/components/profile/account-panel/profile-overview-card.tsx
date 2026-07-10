"use client";

import Image from "next/image";
import { useState } from "react";
import { BadgeCheck, Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import { useLabels } from "../../../app/use-labels";
import { Badge } from "../../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import type { AuthUser } from "../../../app/client-api-types";

function AvatarFallback({ letter }: { letter: string }) {
  return (
    <div className="flex size-20 shrink-0 items-center justify-center rounded-[var(--radius-card)] border border-primary/20 bg-primary/10 text-2xl font-semibold text-primary">
      {letter}
    </div>
  );
}

export function ProfileOverviewCard({ user, avatarSrc, avatarPreviewUrl }: { user: AuthUser; avatarSrc: string | null; avatarPreviewUrl: string | null }) {
  const t = useLabels();
  const [hasLoadError, setHasLoadError] = useState(false);
  const resolvedAvatar = avatarPreviewUrl || avatarSrc;
  const letter = (user.username ?? user.login ?? "U").slice(0, 1).toUpperCase();
  const fullName = [user.first_name, user.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
  const normalizedRole = (user.role || "member").replaceAll("_", " ");
  const normalizedStatus = (user.status || "active").replaceAll("_", " ");

  return (
    <Card className="h-full border-border/70">
      <CardHeader className="pb-0">
        <div className="rounded-[calc(var(--radius-card)-0.25rem)] border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t.profileWorkspaceIdentityEyebrow}</p>
              <CardTitle className="mt-2 text-xl">{t.profileAccountIdentityTitle}</CardTitle>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {t.profileAccountIdentityHint}
              </p>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-primary/20 bg-primary/10 text-primary">
              <ShieldCheck data-icon="inline-start" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
          {resolvedAvatar && !hasLoadError ? (
            <Image
              src={resolvedAvatar}
              alt={t.userAvatarAlt}
              width={96}
              height={96}
              unoptimized
              className="size-24 shrink-0 rounded-[calc(var(--radius-card)-0.15rem)] border border-border object-cover shadow-[var(--wh-shadow-card)]"
              onError={() => setHasLoadError(true)}
            />
          ) : (
            <div className="relative">
              <AvatarFallback letter={letter} />
              <span className="absolute -right-1 -top-1 inline-flex size-6 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground shadow-sm">
                <UserCircle2 className="size-3.5" />
              </span>
            </div>
          )}
            <div className="min-w-0 flex-1">
              <div className="min-w-0">
                <p className="truncate text-2xl font-semibold leading-tight text-foreground">{user.username}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">@{user.login}</p>
                <p className="mt-2 truncate text-sm text-foreground/80">{fullName || user.email || t.nameNotProvided}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize">{normalizedRole}</Badge>
                <Badge variant="outline" className="capitalize">{normalizedStatus}</Badge>
                <Badge variant="outline">{t.liveProfile}</Badge>
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[var(--radius-control)] border border-border/70 bg-muted/25 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Mail className="size-3.5" />
                {t.contact}
              </div>
              <p className="mt-3 truncate text-sm font-medium text-foreground">{user.email || t.notSet}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{user.phone_number || t.phoneNotSet}</p>
            </div>
            <div className="rounded-[var(--radius-control)] border border-border/70 bg-muted/25 p-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <BadgeCheck className="size-3.5" />
                {t.accessProfile}
              </div>
              <div className="mt-3 grid gap-2 text-sm text-foreground sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t.login}</p>
                  <p className="mt-1 truncate font-medium">{user.login || t.notSet}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t.handle}</p>
                  <p className="mt-1 truncate font-medium">@{user.login || "user"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

