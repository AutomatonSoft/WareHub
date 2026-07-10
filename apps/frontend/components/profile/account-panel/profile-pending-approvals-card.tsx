"use client";

import { Check, Search, X } from "lucide-react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { EmptyState } from "../../ui/empty-state";
import { Input } from "../../ui/input";
import { PendingApprovalsProps } from "./profile-account-types";

export function ProfilePendingApprovalsCard(props: PendingApprovalsProps) {
  const {
    isAdmin, pendingUsers, filteredPendingUsers, pendingQuery, pendingActionId, pendingStatus, onSetPendingQuery, onPendingAction, t
  } = props;
  if (!isAdmin) return null;

  return (
    <Card className="border-border/70">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t.approvalQueue}</p>
            <CardTitle className="mt-2">{t.pendingRegistrations}</CardTitle>
            <CardDescription>{t.approveOrRejectFromProfile}</CardDescription>
          </div>
          <Badge variant="secondary">{filteredPendingUsers.length}/{pendingUsers.length} {t.pending.toLowerCase()}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={pendingQuery} onChange={(event) => onSetPendingQuery(event.target.value)} placeholder={t.searchPendingUsers} className="pl-9" />
        </div>
        {filteredPendingUsers.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={pendingUsers.length === 0 ? t.noPendingRegistrations : t.noMatchesForSearch} description={t.pendingRegistrationRequestsAppearHere} />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {filteredPendingUsers.map((pending) => (
              <div key={pending.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border/70 bg-gradient-to-r from-muted/35 via-background to-background px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{pending.username}</p>
                    <Badge variant="outline" className="max-w-full truncate">@{pending.login}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{pending.email ?? t.noEmail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" aria-label={t.approveUser.replace("{user}", pending.username)} title={t.approve} disabled={pendingActionId === pending.id} onClick={() => void onPendingAction("approve", pending.id)}>
                    <Check data-icon="inline-start" />
                    {t.approve}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" aria-label={t.rejectUser.replace("{user}", pending.username)} title={t.reject} disabled={pendingActionId === pending.id} onClick={() => void onPendingAction("reject", pending.id)}>
                    <X data-icon="inline-start" />
                    {t.reject}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {pendingStatus ? <p className="mt-3 text-sm text-destructive">{pendingStatus}</p> : null}
      </CardContent>
    </Card>
  );
}


