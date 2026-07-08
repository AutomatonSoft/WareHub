"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCcw, Search, ShieldCheck, ShieldOff, UserRoundCheck } from "lucide-react";

import { fetchAdminUsers } from "../client-api-admin";
import type { AdminUser, TelegramAccessEntry, TelegramAccessStatus } from "../client-api-types";
import { approveTelegramAccess, fetchTelegramAccessEntries, revokeTelegramAccess } from "../client-api-telegram";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";

type SortValue = "newest" | "oldest";
type StatusFilter = "all" | TelegramAccessStatus;

function SummaryCard({
  title,
  value,
  description,
  icon,
  loading,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card className="wh-section-card border-border/70 shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
          {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-semibold text-foreground">{value}</p>}
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminTelegramAccessPanel({
  apiBase,
  token,
}: {
  apiBase: string;
  token: string;
}) {
  const [rows, setRows] = useState<TelegramAccessEntry[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortValue>("newest");
  const [actionId, setActionId] = useState<number | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [nextRows, nextUsers] = await Promise.all([
        fetchTelegramAccessEntries({
          search: query,
          status: statusFilter,
          sort: sortOrder,
        }),
        fetchAdminUsers(apiBase, token, {
          limit: 250,
          offset: 0,
          sort: "newest",
        }),
      ]);
      setRows(nextRows);
      setUsers(nextUsers);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load Telegram access.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, query, sortOrder, statusFilter, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const formatDate = useCallback((value: string | null) => {
    if (!value) {
      return "-";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString();
  }, []);

  const counts = useMemo(() => {
    return {
      total: rows.length,
      pending: rows.filter((row) => row.status === "pending").length,
      approved: rows.filter((row) => row.status === "approved").length,
      revoked: rows.filter((row) => row.status === "revoked").length,
    };
  }, [rows]);

  const usersByEmail = useMemo(() => {
    const mapping = new Map<string, AdminUser>();
    for (const user of users) {
      const email = user.email?.trim().toLowerCase();
      if (!email || mapping.has(email)) {
        continue;
      }
      mapping.set(email, user);
    }
    return mapping;
  }, [users]);

  const statusVariant = useCallback((value: TelegramAccessStatus) => {
    if (value === "approved") return "success";
    if (value === "pending") return "warning";
    return "error";
  }, []);

  const handleApprove = useCallback(async (bindingId: number, matchedUser?: AdminUser | null) => {
    if (actionId !== null) {
      return;
    }
    setActionId(bindingId);
    setMessage(null);
    try {
      await approveTelegramAccess(bindingId, matchedUser);
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approve failed.");
    } finally {
      setActionId(null);
    }
  }, [actionId, loadRows]);

  const handleRevoke = useCallback(async (bindingId: number) => {
    if (actionId !== null) {
      return;
    }
    setActionId(bindingId);
    setMessage(null);
    try {
      await revokeTelegramAccess(bindingId);
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revoke failed.");
    } finally {
      setActionId(null);
    }
  }, [actionId, loadRows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard title="Total" value={counts.total} description="Loaded Telegram chat approvals." icon={<ShieldCheck size={18} />} loading={loading} />
        <SummaryCard title="Pending" value={counts.pending} description="Waiting for admin decision." icon={<UserRoundCheck size={18} />} loading={loading} />
        <SummaryCard title="Approved" value={counts.approved} description="Can use the bot in the approved chat." icon={<CheckCircle2 size={18} />} loading={loading} />
        <SummaryCard title="Revoked" value={counts.revoked} description="Blocked until admin restores access." icon={<ShieldOff size={18} />} loading={loading} />
      </div>

      <Card className="wh-section-card border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Telegram access</CardTitle>
              <CardDescription>Approve or revoke Telegram bot access per `telegram_user_id + chat_id`.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{counts.total} visible</Badge>
              <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={() => void loadRows()} disabled={loading}>
                <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? "Loading..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)]">
            <div className="space-y-1.5">
              <label htmlFor="telegram-access-search" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Search
              </label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="telegram-access-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search login, display name or email"
                  className="h-10 pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value as StatusFilter) ?? "all")}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Sort</label>
              <Select value={sortOrder} onValueChange={(value) => setSortOrder((value as SortValue) ?? "newest")}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Newest first" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {message ? (
            <Card className="border-destructive/20 bg-destructive/5 shadow-none">
              <CardContent className="p-3 text-sm text-destructive">{message}</CardContent>
            </Card>
          ) : null}

          {loading && rows.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={`telegram-access-skeleton-${index}`} className="h-16 w-full" />
              ))}
            </div>
          ) : null}

          {!loading && rows.length === 0 ? (
            <EmptyState title="No Telegram access rows" description="No entries match the current filters." />
          ) : null}

          {!loading && rows.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="px-4">Identity</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead className="px-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isBusy = actionId === row.id;
                    const matchedUser = row.email ? usersByEmail.get(row.email.trim().toLowerCase()) ?? null : null;
                    return (
                      <TableRow key={row.id} className="align-top">
                        <TableCell className="px-4 py-4 whitespace-normal">
                          <div className="space-y-1">
                            <p className="font-semibold text-foreground">{row.display_name || row.username || "Unknown user"}</p>
                            <p className="text-sm text-muted-foreground">@{row.username || "-"}</p>
                            <p className="break-all text-sm text-muted-foreground">{row.email || "-"}</p>
                            {matchedUser ? (
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                <p className="font-semibold">Matched WareHub user</p>
                                <p>{matchedUser.username} (@{matchedUser.login})</p>
                                <p>{matchedUser.role} / {matchedUser.status}</p>
                              </div>
                            ) : row.email ? (
                              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                <p className="font-semibold">No WareHub user match</p>
                                <p>Check whether this email exists in app users before approving.</p>
                              </div>
                            ) : null}
                            {row.app_user?.id ? (
                              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                                <p className="font-semibold">Linked on approval</p>
                                <p>{row.app_user.username || "-"} (@{row.app_user.login || "-"})</p>
                                <p>{row.app_user.email || "-"}</p>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                          <div className="space-y-1">
                            <p>User ID: {row.telegram_user_id}</p>
                            <p>Chat ID: {row.chat_id}</p>
                            <p>Thread: {row.thread_key || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                        </TableCell>
                        <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                          <div className="space-y-1">
                            <p>{formatDate(row.requested_at)}</p>
                            <p>Approved by: {row.approved_by || "-"}</p>
                            <p>Revoked by: {row.revoked_by || "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                          {formatDate(row.last_seen_at)}
                        </TableCell>
                        <TableCell className="px-4 py-4 whitespace-normal">
                          <div className="flex min-w-[220px] flex-wrap gap-2">
                            {row.status !== "approved" ? (
                              <Button type="button" size="sm" className="h-9" onClick={() => void handleApprove(row.id, matchedUser)} disabled={isBusy}>
                                {isBusy ? "Working..." : "Approve"}
                              </Button>
                            ) : null}
                            {row.status !== "revoked" ? (
                              <Button type="button" variant="outline" size="sm" className="h-9 text-destructive" onClick={() => void handleRevoke(row.id)} disabled={isBusy}>
                                {isBusy ? "Working..." : "Revoke"}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
