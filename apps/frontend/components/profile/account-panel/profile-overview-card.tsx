"use client";

import Image from "next/image";
import { useState } from "react";
import { Badge } from "../../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import type { AuthUser } from "../../../app/client-api-types";

function AvatarFallback({ letter }: { letter: string }) {
  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-primary/15 text-3xl font-bold text-primary">
      {letter}
    </div>
  );
}

export function ProfileOverviewCard({ user, avatarSrc, avatarPreviewUrl }: { user: AuthUser; avatarSrc: string | null; avatarPreviewUrl: string | null }) {
  const [hasLoadError, setHasLoadError] = useState(false);
  const resolvedAvatar = avatarPreviewUrl || avatarSrc;
  const letter = (user.username ?? user.login ?? "U").slice(0, 1).toUpperCase();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-xl">{user.username}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {resolvedAvatar && !hasLoadError ? (
            <Image src={resolvedAvatar} alt="User avatar" width={96} height={96} unoptimized className="h-24 w-24 rounded-xl object-cover" onError={() => setHasLoadError(true)} />
          ) : (
            <AvatarFallback letter={letter} />
          )}
          <div>
            <p className="text-sm text-muted-foreground">@{user.login}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">Role: {user.role}</Badge>
              <Badge variant="outline">Status: {user.status}</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

