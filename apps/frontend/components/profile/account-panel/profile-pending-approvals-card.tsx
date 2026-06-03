"use client";

import { Check, X } from "lucide-react";
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{t.pendingRegistrations}</CardTitle>
            <CardDescription>{t.approveOrRejectFromProfile}</CardDescription>
          </div>
          <Badge variant="secondary">{filteredPendingUsers.length}/{pendingUsers.length} {t.pending.toLowerCase()}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Input value={pendingQuery} onChange={(event) => onSetPendingQuery(event.target.value)} placeholder={t.searchPendingUsers} />
        {filteredPendingUsers.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={pendingUsers.length === 0 ? t.noPendingRegistrations : t.noMatchesForSearch} description="Pending registration requests will appear here for review." />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {filteredPendingUsers.map((pending) => (
              <div key={pending.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{pending.username}</p>
                  <p className="text-xs text-muted-foreground">{pending.email ?? t.noEmail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="icon" aria-label={`Approve ${pending.username}`} title={t.approve} disabled={pendingActionId === pending.id} onClick={() => void onPendingAction("approve", pending.id)}>
                    <Check size={16} />
                  </Button>
                  <Button type="button" variant="destructive" size="icon" aria-label={`Reject ${pending.username}`} title={t.reject} disabled={pendingActionId === pending.id} onClick={() => void onPendingAction("reject", pending.id)}>
                    <X size={16} />
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


