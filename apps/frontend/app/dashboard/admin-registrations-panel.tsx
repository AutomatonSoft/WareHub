"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  CircleAlert,
  Clock3,
  Filter,
  Mail,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X
} from "lucide-react";

import {
  AdminUser,
  approveRegistration,
  deleteUser,
  fetchAdminUsers,
  rejectRegistration,
  resolvePhotoUrl,
  updateUserRole
} from "../client-api";
import { dateLocale, labels, Lang } from "../i18n";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { EmptyState } from "../../components/ui/empty-state";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../components/ui/table";

type AdminRegistrationsPanelProps = {
  apiBase: string;
  token: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  lang: Lang;
  currentUserId: string;
};

type RoleValue = "all" | "admin" | "user";
type StatusValue = "all" | "pending" | "approved" | "rejected";
type SortValue = "newest" | "oldest";
const USERS_PAGE_SIZE = 50;

function SummaryCard({
  title,
  value,
  description,
  icon,
  accentClass,
  loading
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  accentClass: string;
  loading: boolean;
}) {
  return (
    <Card className="wh-section-card group relative overflow-hidden border-border/70 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accentClass}`} />
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </p>
          {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>}
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-muted-foreground transition-colors duration-200 group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function UserAvatar({
  initials,
  status,
  avatarUrl,
  apiBase
}: {
  initials: string;
  status: AdminUser["status"];
  avatarUrl?: string | null;
  apiBase: string;
}) {
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const statusClass = status === "approved"
    ? "bg-emerald-500"
    : status === "pending"
      ? "bg-amber-500"
      : "bg-destructive";
  const avatarSrc = avatarUrl && !avatarLoadError ? resolvePhotoUrl(apiBase, avatarUrl) : null;

  useEffect(() => {
    setAvatarLoadError(false);
  }, [avatarUrl]);

  return (
    <div className="relative shrink-0" aria-hidden="true">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary text-sm font-bold tracking-wide text-primary-foreground shadow-sm ring-4 ring-primary/[0.07]">
        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt=""
            width={56}
            height={56}
            unoptimized
            className="size-full rounded-[inherit] object-cover"
            onError={() => setAvatarLoadError(true)}
          />
        ) : initials}
      </div>
      <span className={`absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-[3px] border-card ${statusClass}`} />
    </div>
  );
}

export function AdminRegistrationsPanel({
  apiBase,
  token,
  role,
  status,
  lang,
  currentUserId
}: AdminRegistrationsPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleValue>("all");
  const [statusFilter, setStatusFilter] = useState<StatusValue>("all");
  const [sortOrder, setSortOrder] = useState<SortValue>("newest");
  const [confirmTarget, setConfirmTarget] = useState<AdminUser | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, "admin" | "user">>({});
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const requestVersionRef = useRef(0);

  const canRender = role === "admin" && status === "approved" && token.length > 0;
  const locale = useMemo(() => dateLocale[lang] ?? "en-US", [lang]);
  const t = labels[lang];

  const roleName = useCallback(
    (value: "admin" | "user") => (value === "admin" ? t.adminTitle : t.user),
    [t.adminTitle, t.user]
  );
  const statusName = useCallback(
    (value: "pending" | "approved" | "rejected") => {
      if (value === "pending") return t.pending;
      if (value === "approved") return t.approved;
      return t.rejected;
    },
    [t.approved, t.pending, t.rejected]
  );

  const roleBadgeVariant = useCallback((value: "admin" | "user") => {
    return value === "admin" ? "info" : "outline";
  }, []);
  const statusBadgeVariant = useCallback((value: "pending" | "approved" | "rejected") => {
    if (value === "approved") return "success";
    if (value === "pending") return "warning";
    return "error";
  }, []);

  const loadUsers = useCallback(async ({ append = false, offset = 0 }: { append?: boolean; offset?: number } = {}) => {
    if (!canRender) {
      return;
    }
    const requestVersion = ++requestVersionRef.current;
    if (!append) {
      setHasMoreUsers(false);
    }
    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchAdminUsers(apiBase, token, {
        limit: USERS_PAGE_SIZE,
        offset,
        search: query,
        role: roleFilter,
        status: statusFilter,
        sort: sortOrder
      });
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      const nextUsers = Array.isArray(data) ? data : [];
      setUsers((current) => append
        ? [...current, ...nextUsers.filter((user) => !current.some((currentUser) => currentUser.id === user.id))]
        : nextUsers);
      setRoleDrafts((current) => {
        const next: Record<string, "admin" | "user"> = append ? { ...current } : {};
        for (const user of nextUsers) {
          if (!append || !next[user.id]) {
            next[user.id] = user.role;
          }
        }
        return next;
      });
      setHasMoreUsers(nextUsers.length === USERS_PAGE_SIZE);
    } catch (error) {
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      setMessage(error instanceof Error ? error.message : t.deleteFailed);
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [apiBase, token, canRender, query, roleFilter, statusFilter, sortOrder, t.deleteFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers({ offset: 0 });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  const loadMoreUsers = useCallback(() => {
    void loadUsers({ append: true, offset: users.length });
  }, [loadUsers, users.length]);

  const formatDate = useCallback(
    (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return date.toLocaleString(locale);
    },
    [locale]
  );

  const formatFullName = useCallback((user: AdminUser) => {
    const value = [user.first_name?.trim(), user.last_name?.trim()].filter(Boolean).join(" ");
    return value.length > 0 ? value : null;
  }, []);

  const initialsFor = useCallback((user: AdminUser, fullName: string | null) => {
    const source = fullName ?? user.username ?? user.login;
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, []);

  const formatApprover = useCallback((user: AdminUser) => {
    if (user.approved_by_login && user.approved_by_login.trim().length > 0) {
      return `@${user.approved_by_login}`;
    }
    if (user.approved_by && user.approved_by.trim().length > 0) {
      return user.approved_by;
    }
    return null;
  }, []);

  const totalUsers = users.length;
  const pendingCount = useMemo(
    () => users.filter((item) => item.status === "pending").length,
    [users]
  );
  const approvedCount = useMemo(
    () => users.filter((item) => item.status === "approved").length,
    [users]
  );
  const hasActiveFilters = useMemo(
    () => query.trim().length > 0 || roleFilter !== "all" || statusFilter !== "all",
    [query, roleFilter, statusFilter]
  );

  const emptyMessage = useMemo(() => {
    if (loading) {
      return t.loading;
    }
    if (hasActiveFilters && query.trim().length > 0) {
      return `${t.noMatches} "${query.trim()}".`;
    }
    if (hasActiveFilters) {
      return t.noUsers;
    }
    return t.noUsers;
  }, [hasActiveFilters, loading, query, t.loading, t.noMatches, t.noUsers]);

  const openRejectModal = useCallback((user: AdminUser) => {
    setConfirmTarget(user);
    setConfirmChecked(false);
  }, []);

  const handleApprove = useCallback(
    async (userId: string) => {
      if (actionId) {
        return;
      }
      setActionId(userId);
      setMessage(null);
      try {
        await approveRegistration(apiBase, token, userId);
        await loadUsers();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t.approveFailed);
      } finally {
        setActionId(null);
      }
    },
    [actionId, apiBase, loadUsers, t.approveFailed, token]
  );

  const handleReject = useCallback(
    async (userId: string) => {
      if (actionId) {
        return;
      }
      setActionId(userId);
      setMessage(null);
      try {
        await rejectRegistration(apiBase, token, userId);
        await loadUsers();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t.rejectFailed);
      } finally {
        setActionId(null);
        setConfirmTarget(null);
        setConfirmChecked(false);
      }
    },
    [actionId, apiBase, loadUsers, t.rejectFailed, token]
  );

  const handleRoleChange = useCallback((userId: string, nextRole: "admin" | "user") => {
    setRoleDrafts((prev) => ({ ...prev, [userId]: nextRole }));
  }, []);

  const handleRoleSave = useCallback(
    async (user: AdminUser) => {
      const draft = roleDrafts[user.id] ?? user.role;
      if (draft === user.role || actionId) {
        return;
      }
      setActionId(user.id);
      setMessage(null);
      try {
        await updateUserRole(apiBase, token, user.id, draft);
        await loadUsers();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t.roleUpdateFailed);
      } finally {
        setActionId(null);
      }
    },
    [actionId, apiBase, loadUsers, roleDrafts, t.roleUpdateFailed, token]
  );

  const handleDeleteUser = useCallback(
    async (user: AdminUser) => {
      if (actionId || user.id === currentUserId) {
        return;
      }
      const confirmed = window.confirm(
        `${t.deleteUserConfirm} ${user.username} (${user.login})? ${t.deleteUserConfirmTail}`
      );
      if (!confirmed) {
        return;
      }
      setActionId(user.id);
      setMessage(null);
      try {
        await deleteUser(apiBase, token, user.id);
        await loadUsers();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t.deleteUserFailed);
      } finally {
        setActionId(null);
      }
    },
    [
      actionId,
      apiBase,
      currentUserId,
      loadUsers,
      t.deleteUserConfirm,
      t.deleteUserConfirmTail,
      t.deleteUserFailed,
      token
    ]
  );

  if (!canRender) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          title={t.totalUsers}
          value={totalUsers}
          description={t.allLoadedApplicationUsers}
          icon={<Users size={18} />}
          accentClass="bg-primary"
          loading={loading}
        />
        <SummaryCard
          title={t.pending}
          value={pendingCount}
          description={t.accountsWaitingForApproval}
          icon={<ShieldCheck size={18} />}
          accentClass="bg-amber-500"
          loading={loading}
        />
        <SummaryCard
          title={t.approved}
          value={approvedCount}
          description={t.usersWithActiveAccess}
          icon={<UserCheck size={18} />}
          accentClass="bg-emerald-500"
          loading={loading}
        />
      </div>

      <div>
      <Card className="wh-section-card overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/[0.12] pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Users size={17} /></span>
                <div>
                  <CardTitle className="text-base">{t.navAdminUsers}</CardTitle>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" />{t.visibleCount.replace("{count}", String(totalUsers))}</div>
                </div>
              </div>
              <CardDescription className="pl-11">{t.adminUsersSubtitle}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-10 gap-2 transition-colors" onClick={() => void loadUsers()} disabled={loading}>
                <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? t.loading : t.refresh}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-3.5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <Filter size={14} /> {t.filters}
            </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)]">
            <div className="space-y-1.5">
              <label htmlFor="admin-users-search" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t.search}
              </label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="admin-users-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t.searchAdminPlaceholder}
                  className="h-10 border-border/70 bg-background/80 !pl-11 shadow-sm transition-shadow focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-users-role" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t.role}
              </label>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter((value as RoleValue) ?? "all")}>
                <SelectTrigger id="admin-users-role" className="h-10 w-full border-border/70 bg-background/80 shadow-sm">
                  <SelectValue placeholder={t.allRoles} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allRoles}</SelectItem>
                  <SelectItem value="admin">{t.adminTitle}</SelectItem>
                  <SelectItem value="user">{t.user}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-users-status" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t.status}
              </label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value as StatusValue) ?? "all")}>
                <SelectTrigger id="admin-users-status" className="h-10 w-full border-border/70 bg-background/80 shadow-sm">
                  <SelectValue placeholder={t.allStatuses} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.allStatuses}</SelectItem>
                  <SelectItem value="pending">{t.pending}</SelectItem>
                  <SelectItem value="approved">{t.approved}</SelectItem>
                  <SelectItem value="rejected">{t.rejected}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-users-sort" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t.sort}
              </label>
              <Select value={sortOrder} onValueChange={(value) => setSortOrder((value as SortValue) ?? "newest")}>
                <SelectTrigger id="admin-users-sort" className="h-10 w-full border-border/70 bg-background/80 shadow-sm">
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

          {loading && users.length === 0 ? (
            <>
              <div className="hidden lg:block">
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-white">
                  <div className="grid grid-cols-[minmax(260px,1.8fr)_120px_120px_140px_140px_160px_minmax(300px,1.4fr)] gap-0 border-b border-border/70 bg-muted/30 px-4 py-3">
                    {Array.from({ length: 7 }).map((_, index) => (
                      <Skeleton key={`admin-head-${index}`} className="h-4 w-20" />
                    ))}
                  </div>
                  <div className="space-y-0">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={`admin-row-${index}`} className="grid grid-cols-[minmax(260px,1.8fr)_120px_120px_140px_140px_160px_minmax(300px,1.4fr)] items-center gap-4 border-b border-border/60 px-4 py-4 last:border-b-0">
                        {Array.from({ length: 7 }).map((__, cellIndex) => (
                          <Skeleton key={`admin-row-${index}-${cellIndex}`} className="h-5 w-full max-w-[140px]" />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid gap-3 lg:hidden">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={`admin-mobile-skeleton-${index}`} className="border-border/70 shadow-sm">
                    <CardContent className="space-y-3 p-4">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-9 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : null}

          {!loading && users.length === 0 ? (
            <EmptyState
              title={t.noUsers}
              description={emptyMessage}
            />
          ) : null}

          {!loading && users.length > 0 ? (
            <>
              <div className="hidden lg:block">
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="px-4 text-[11px] font-bold uppercase tracking-[0.08em]">{t.user}</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-[0.08em]">{t.role}</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-[0.08em]">{t.status}</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-[0.08em]">{t.created}</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-[0.08em]">{t.approved}</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-[0.08em]">{t.adminTelegramApprovedBy}</TableHead>
                        <TableHead className="px-4 text-[11px] font-bold uppercase tracking-[0.08em]">{t.adminTelegramActions}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => {
                        const draftRole = roleDrafts[user.id] ?? user.role;
                        const fullName = formatFullName(user);
                        const approver = formatApprover(user);
                        const isBusy = actionId === user.id;
                        const roleChanged = draftRole !== user.role;
                        const selfRoleDowngrade = user.id === currentUserId && draftRole !== "admin";

                        return (
                          <TableRow key={user.id} className="align-top transition-colors hover:bg-primary/[0.025]">
                            <TableCell className="px-4 py-4 whitespace-normal">
                              <div className="flex gap-3">
                                <UserAvatar initials={initialsFor(user, fullName)} status={user.status} avatarUrl={user.avatar_url} apiBase={apiBase} />
                                <div className="min-w-0 space-y-1">
                                <p className="font-semibold text-foreground">{fullName ?? user.username}</p>
                                <p className="text-sm text-muted-foreground">@{user.login}</p>
                                <p className="flex items-center gap-1.5 break-all text-sm text-muted-foreground"><Mail size={13} className="shrink-0" />{user.email ?? "-"}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge variant={roleBadgeVariant(user.role)}>{roleName(user.role)}</Badge>
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge variant={statusBadgeVariant(user.status)}>{statusName(user.status)}</Badge>
                            </TableCell>
                            <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5"><Clock3 size={14} />{formatDate(user.created_at)}</span>
                            </TableCell>
                            <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                              {user.approved_at ? formatDate(user.approved_at) : "-"}
                            </TableCell>
                            <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                              {approver ?? "-"}
                            </TableCell>
                            <TableCell className="px-4 py-4 whitespace-normal">
                              <div className="min-w-[280px] space-y-2 rounded-xl border border-border/60 bg-muted/[0.16] p-2">
                                {user.status === "pending" ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-9"
                                      onClick={() => void handleApprove(user.id)}
                                      disabled={isBusy}
                                    >
                                      <Check size={14} />{isBusy ? t.working : t.approve}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-9 text-destructive"
                                      onClick={() => openRejectModal(user)}
                                      disabled={isBusy}
                                    >
                                      <X size={14} />{t.reject}
                                    </Button>
                                  </div>
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                  <Select
                                    value={draftRole}
                                    onValueChange={(value) => handleRoleChange(user.id, (value as "admin" | "user") ?? user.role)}
                                    disabled={isBusy}
                                  >
                                    <SelectTrigger className="h-9 min-w-[140px] border-border/70 bg-background shadow-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="user">{t.user}</SelectItem>
                                      <SelectItem value="admin">{t.adminTitle}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9"
                                    onClick={() => void handleRoleSave(user)}
                                    disabled={isBusy || !roleChanged || selfRoleDowngrade}
                                  >
                                    <Save size={14} />{isBusy ? t.working : t.saveRole}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    className="h-9"
                                    onClick={() => void handleDeleteUser(user)}
                                    disabled={isBusy || user.id === currentUserId}
                                    title={user.id === currentUserId ? t.cannotDeleteSelf : t.deleteUser}
                                  >
                                    <Trash2 size={14} />{isBusy ? t.working : t.deleteUser}
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="grid gap-3 lg:hidden">
                {users.map((user) => {
                  const draftRole = roleDrafts[user.id] ?? user.role;
                  const fullName = formatFullName(user);
                  const approver = formatApprover(user);
                  const isBusy = actionId === user.id;
                  const roleChanged = draftRole !== user.role;
                  const selfRoleDowngrade = user.id === currentUserId && draftRole !== "admin";

                  return (
                    <Card key={user.id} className="border-border/70 shadow-sm">
                      <CardContent className="space-y-4 p-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex min-w-0 gap-3">
                              <UserAvatar initials={initialsFor(user, fullName)} status={user.status} avatarUrl={user.avatar_url} apiBase={apiBase} />
                              <div className="min-w-0 space-y-1">
                              <p className="font-semibold text-foreground">{fullName ?? user.username}</p>
                              <p className="text-sm text-muted-foreground">@{user.login}</p>
                              <p className="flex items-center gap-1.5 break-all text-sm text-muted-foreground"><Mail size={13} className="shrink-0" />{user.email ?? "-"}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={roleBadgeVariant(user.role)}>{roleName(user.role)}</Badge>
                              <Badge variant={statusBadgeVariant(user.status)}>{statusName(user.status)}</Badge>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t.created}</span>
                            <span className="text-right text-foreground">{formatDate(user.created_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t.approved}</span>
                            <span className="text-right text-foreground">
                              {user.approved_at ? formatDate(user.approved_at) : "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t.adminTelegramApprovedBy}</span>
                            <span className="text-right text-foreground">{approver ?? "-"}</span>
                          </div>
                        </div>

                        {user.status === "pending" ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              size="sm"
                              className="h-10"
                              onClick={() => void handleApprove(user.id)}
                              disabled={isBusy}
                            >
                              <Check size={14} />{isBusy ? t.working : t.approve}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-10 text-destructive"
                              onClick={() => openRejectModal(user)}
                              disabled={isBusy}
                            >
                              <X size={14} />{t.reject}
                            </Button>
                          </div>
                        ) : null}

                        <div className="grid gap-2">
                          <Select
                            value={draftRole}
                            onValueChange={(value) => handleRoleChange(user.id, (value as "admin" | "user") ?? user.role)}
                            disabled={isBusy}
                          >
                            <SelectTrigger className="h-10 w-full border-border/70 bg-background shadow-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">{t.user}</SelectItem>
                              <SelectItem value="admin">{t.adminTitle}</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-10"
                              onClick={() => void handleRoleSave(user)}
                              disabled={isBusy || !roleChanged || selfRoleDowngrade}
                            >
                              <Save size={14} />{isBusy ? t.working : t.saveRole}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-10"
                              onClick={() => void handleDeleteUser(user)}
                              disabled={isBusy || user.id === currentUserId}
                              title={user.id === currentUserId ? t.cannotDeleteSelf : t.deleteUser}
                            >
                              <Trash2 size={14} />{isBusy ? t.working : t.deleteUser}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : null}

          {hasMoreUsers ? (
            <div className="flex justify-center border-t border-border/60 pt-4">
              <Button type="button" variant="outline" size="sm" className="min-w-36" onClick={loadMoreUsers} disabled={loading}>
                {loading ? t.loading : t.loadMore}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      </div>

      {confirmTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border-border/70 shadow-2xl">
            <CardHeader>
              <CardTitle>{t.rejectRegistrationTitle}</CardTitle>
              <CardDescription>
                {t.rejectRegistrationTextStart} <span className="font-semibold text-foreground">{confirmTarget.username}</span> (@
                {confirmTarget.login}){t.rejectRegistrationTextEnd}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                <Checkbox
                  checked={confirmChecked}
                  onCheckedChange={(checked) => setConfirmChecked(Boolean(checked))}
                />
                <span>{t.rejectConfirmCheckbox}</span>
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmTarget(null)}
                  disabled={Boolean(actionId)}
                >
                  {t.cancel}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleReject(confirmTarget.id)}
                  disabled={actionId === confirmTarget.id || !confirmChecked}
                >
                  {actionId === confirmTarget.id ? t.working : t.reject}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
