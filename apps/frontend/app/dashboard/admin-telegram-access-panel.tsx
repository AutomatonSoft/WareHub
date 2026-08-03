"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { BadgeCheck, CheckCircle2, CircleAlert, Clock3, Filter, Link2, Mail, MessageCircle, RefreshCcw, Search, ShieldCheck, ShieldOff, Trash2, UserRoundCheck, UserX } from "lucide-react";
import { useLabels } from "../use-labels";

import { fetchAdminUsers } from "../client-api-admin";
import { resolvePhotoUrl } from "../client-api";
import type { AdminUser, TelegramAccessEntry, TelegramAccessStatus } from "../client-api-types";
import { approveTelegramAccess, deleteTelegramAccess, fetchTelegramAccessEntries, revokeTelegramAccess } from "../client-api-telegram";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";

type SortValue = "newest" | "oldest";
type StatusFilter = "all" | TelegramAccessStatus;

function TelegramAccessAvatar({
  user,
  name,
  status,
  apiBase,
}: {
  user: AdminUser | null;
  name: string;
  status: TelegramAccessStatus;
  apiBase: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name.trim().slice(0, 1).toUpperCase() || "?";
  const avatarSrc = user?.avatar_url && !imageFailed ? resolvePhotoUrl(apiBase, user.avatar_url) : null;
  const statusClass = status === "approved" ? "bg-emerald-500" : status === "pending" ? "bg-amber-500" : "bg-destructive";

  useEffect(() => setImageFailed(false), [user?.avatar_url]);

  return (
    <div className="relative shrink-0" aria-hidden="true">
      <div className="flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-primary text-sm font-bold tracking-wide text-primary-foreground shadow-sm ring-4 ring-primary/[0.07]">
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt=""
            width={56}
            height={56}
            unoptimized
            className="size-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : initials}
      </div>
      <span className={`absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-[3px] border-card ${statusClass}`} />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon,
  loading,
  accentClass,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  loading: boolean;
  accentClass: string;
}) {
  return (
    <Card className="wh-section-card group relative overflow-hidden border-border/70 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accentClass}`} />
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
          {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-semibold text-foreground">{value}</p>}
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground transition-colors duration-200 group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary">
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
  const t = useLabels();
  const [rows, setRows] = useState<TelegramAccessEntry[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortValue>("newest");
  const [actionId, setActionId] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const nextRows = await fetchTelegramAccessEntries({
        search: query,
        status: statusFilter,
        sort: sortOrder,
      });
      setRows(nextRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.adminTelegramFailedLoad);
    } finally {
      setLoading(false);
    }
  }, [query, sortOrder, statusFilter, t.adminTelegramFailedLoad]);

  const loadUsers = useCallback(async () => {
    try {
      const nextUsers = await fetchAdminUsers(apiBase, token, {
        limit: 250,
        offset: 0,
        sort: "newest",
      });
      setUsers(nextUsers);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.adminTelegramFailedLoad);
    }
  }, [apiBase, t.adminTelegramFailedLoad, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
      setMessage(error instanceof Error ? error.message : t.adminTelegramApproveFailed);
    } finally {
      setActionId(null);
    }
  }, [actionId, loadRows, t.adminTelegramApproveFailed]);

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
      setMessage(error instanceof Error ? error.message : t.adminTelegramRevokeFailed);
    } finally {
      setActionId(null);
    }
  }, [actionId, loadRows, t.adminTelegramRevokeFailed]);

  const handleDelete = useCallback(async (bindingId: number) => {
    if (actionId !== null || !window.confirm(t.adminTelegramDeleteConfirm)) {
      return;
    }
    setActionId(bindingId);
    setMessage(null);
    try {
      await deleteTelegramAccess(bindingId);
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.adminTelegramDeleteFailed);
    } finally {
      setActionId(null);
    }
  }, [actionId, loadRows, t.adminTelegramDeleteConfirm, t.adminTelegramDeleteFailed]);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="space-y-4"
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: prefersReducedMotion ? 0 : 0.05, ease: "easeOut" }}
        className="grid gap-3 md:grid-cols-4"
      >
        <SummaryCard title={t.adminTelegramTotal} value={counts.total} description={t.adminTelegramLoadedApprovals} icon={<ShieldCheck size={18} />} accentClass="bg-primary" loading={loading} />
        <SummaryCard title={t.adminTelegramPending} value={counts.pending} description={t.adminTelegramWaitingDecision} icon={<UserRoundCheck size={18} />} accentClass="bg-amber-500" loading={loading} />
        <SummaryCard title={t.adminTelegramApproved} value={counts.approved} description={t.adminTelegramApprovedHint} icon={<CheckCircle2 size={18} />} accentClass="bg-emerald-500" loading={loading} />
        <SummaryCard title={t.adminTelegramRevoked} value={counts.revoked} description={t.adminTelegramRevokedHint} icon={<ShieldOff size={18} />} accentClass="bg-destructive" loading={loading} />
      </motion.div>

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : 0.1, ease: "easeOut" }}
      >
      <Card className="wh-section-card overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/[0.12] pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><MessageCircle size={17} /></span>
                <div>
                  <CardTitle className="text-base">{t.telegramAccessTitle}</CardTitle>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" />{t.adminTelegramVisibleCount.replace("{count}", String(counts.total))}</div>
                </div>
              </div>
              <CardDescription className="pl-11">{t.telegramAccessSubtitle}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={() => void loadRows()} disabled={loading}>
                <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? t.loading : t.refresh}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"><Filter size={14} /> {t.filters}</div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)]">
            <div className="space-y-1.5">
              <label htmlFor="telegram-access-search" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t.search}
              </label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="telegram-access-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.adminTelegramSearchPlaceholder} className="h-10 border-border/70 bg-background/80 !pl-11 shadow-sm transition-shadow focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.status}</label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value as StatusFilter) ?? "all")}>
                <SelectTrigger className="h-10 w-full border-border/70 bg-background/80 shadow-sm">
                  <SelectValue placeholder={t.allStatuses} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allStatuses}</SelectItem>
                  <SelectItem value="pending">{t.pending}</SelectItem>
                  <SelectItem value="approved">{t.approved}</SelectItem>
                  <SelectItem value="revoked">{t.adminTelegramRevoked}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.sort}</label>
              <Select value={sortOrder} onValueChange={(value) => setSortOrder((value as SortValue) ?? "newest")}>
                <SelectTrigger className="h-10 w-full border-border/70 bg-background/80 shadow-sm">
                  <SelectValue placeholder={t.newestFirst} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t.newestFirst}</SelectItem>
                  <SelectItem value="oldest">{t.oldestFirst}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          </div>

          {message ? (
            <Card className="border-destructive/20 bg-destructive/5 shadow-none">
              <CardContent className="flex items-start gap-2 p-3 text-sm text-destructive"><CircleAlert className="mt-0.5 shrink-0" size={16} />{message}</CardContent>
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
            <EmptyState title={t.adminTelegramNoRowsTitle} description={t.adminTelegramNoRowsDescription} />
          ) : null}

          {!loading && rows.length > 0 ? (
            <div className="space-y-3">
              {rows.map((row) => {
                    const isBusy = actionId === row.id;
                    const matchedUser = row.email ? usersByEmail.get(row.email.trim().toLowerCase()) ?? null : null;
                    const statusTone = row.status === "approved"
                      ? "from-emerald-500 via-emerald-400 to-transparent"
                      : row.status === "pending"
                        ? "from-amber-500 via-amber-400 to-transparent"
                        : "from-destructive via-rose-400 to-transparent";
                    return (
                      <article key={row.id} className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md motion-reduce:transform-none">
                        <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${statusTone}`} />
                        <div className="grid gap-0 xl:grid-cols-[minmax(330px,1.5fr)_minmax(250px,1.05fr)_minmax(250px,1.05fr)_minmax(205px,.8fr)_minmax(210px,.85fr)]">
                          <section className="p-4 xl:border-r xl:border-border/55">
                            <div className="flex gap-3">
                            <TelegramAccessAvatar
                              user={matchedUser}
                              name={row.display_name || row.username || t.adminTelegramUnknownUser}
                              status={row.status}
                              apiBase={apiBase}
                            />
                            <div className="min-w-0 space-y-1">
                            <p className="truncate font-semibold text-foreground">{row.display_name || row.username || t.adminTelegramUnknownUser}</p>
                            <p className="text-sm text-muted-foreground">@{row.username || "-"}</p>
                            <p className="flex items-center gap-1.5 break-all text-sm text-muted-foreground"><Mail size={13} className="shrink-0" />{row.email || "-"}</p>
                            </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                            {matchedUser ? (
                              <Badge variant="success"><Link2 size={12} />{t.adminTelegramMatchedUser}</Badge>
                            ) : row.email ? (
                              <Badge variant="warning"><UserX size={12} />{t.adminTelegramNoMatchedUser}</Badge>
                            ) : null}
                            {row.app_user?.id ? (
                              <Badge variant="outline"><BadgeCheck size={12} />{t.adminTelegramLinkedOnApproval}</Badge>
                            ) : null}
                            </div>
                          </section>
                          <section className="border-t border-border/55 p-4 xl:border-r xl:border-t-0">
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/65">{t.adminTelegramScope}</p>
                            <p className="flex items-center gap-1.5 text-base font-semibold text-foreground"><MessageCircle size={16} className="text-primary" />Telegram</p>
                            <div className="mt-2 space-y-1 text-sm leading-5 text-foreground/70">
                              <p>{t.adminTelegramUserId}: {row.telegram_user_id}</p>
                              <p>{t.adminTelegramChatId}: {row.chat_id}</p>
                              <p>{t.adminTelegramThread}: {row.thread_key || "-"}</p>
                            </div>
                          </section>
                          <section className="border-t border-border/55 p-4 xl:border-r xl:border-t-0">
                            <div>
                              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/65">{t.status}</p>
                              <Badge variant={statusVariant(row.status)} className="h-7 px-2.5 text-sm capitalize">{row.status}</Badge>
                              <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/65">{t.adminTelegramLastSeen}</p>
                              <p className="mt-1 text-sm font-medium text-foreground/80">{formatDate(row.last_seen_at)}</p>
                            </div>
                          </section>
                          <section className="border-t border-border/55 p-4 xl:border-r xl:border-t-0">
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/65">{t.adminTelegramRequested}</p>
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Clock3 size={15} className="text-primary" />{formatDate(row.requested_at)}</p>
                            <div className="mt-2 space-y-1 text-sm leading-5 text-foreground/70">
                            <p>{t.adminTelegramApprovedBy}: {row.approved_by || "-"}</p>
                            <p>{t.adminTelegramRevokedBy}: {row.revoked_by || "-"}</p>
                            </div>
                          </section>
                          <section className="flex border-t border-border/55 p-4 xl:items-center xl:justify-center xl:border-t-0">
                            <div>
                              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-foreground/65">{t.adminTelegramActions}</p>
                              <div className="flex flex-wrap gap-2">
                            {row.status !== "approved" ? (
                              <Button type="button" size="sm" className="h-9" onClick={() => void handleApprove(row.id, matchedUser)} disabled={isBusy}>
                                {isBusy ? t.working : t.adminTelegramApprove}
                              </Button>
                            ) : null}
                            {row.status !== "revoked" ? (
                              <Button type="button" variant="outline" size="sm" className="h-9 text-destructive" onClick={() => void handleRevoke(row.id)} disabled={isBusy}>
                                {isBusy ? t.working : t.adminTelegramRevoke}
                              </Button>
                            ) : null}
                            <Button type="button" variant="ghost" size="sm" className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void handleDelete(row.id)} disabled={isBusy}>
                              <Trash2 size={14} />{isBusy ? t.working : t.adminTelegramDelete}
                            </Button>
                              </div>
                            </div>
                          </section>
                        </div>
                      </article>
                    );
                  })}
            </div>
          ) : null}
        </CardContent>
      </Card>
      </motion.div>
    </motion.div>
  );
}
