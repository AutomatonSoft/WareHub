"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search, Users, UserCheck, ShieldCheck } from "lucide-react";

import {
  AdminUser,
  approveRegistration,
  deleteUser,
  fetchAdminUsers,
  rejectRegistration,
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

function SummaryCard({
  title,
  value,
  description,
  icon,
  loading
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </p>
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

  const loadUsers = useCallback(async () => {
    if (!canRender) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchAdminUsers(apiBase, token, {
        limit: 250,
        offset: 0,
        search: query,
        role: roleFilter,
        status: statusFilter,
        sort: sortOrder
      });
      const nextUsers = Array.isArray(data) ? data : [];
      setUsers(nextUsers);
      setRoleDrafts(() => {
        const next: Record<string, "admin" | "user"> = {};
        for (const user of nextUsers) {
          next[user.id] = user.role;
        }
        return next;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.deleteFailed);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token, canRender, query, roleFilter, statusFilter, sortOrder, t.deleteFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [loadUsers]);

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
      return "No users match the current filters.";
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
          title="Total users"
          value={totalUsers}
          description="All loaded application users."
          icon={<Users size={18} />}
          loading={loading}
        />
        <SummaryCard
          title="Pending"
          value={pendingCount}
          description="Accounts waiting for approval."
          icon={<ShieldCheck size={18} />}
          loading={loading}
        />
        <SummaryCard
          title="Approved"
          value={approvedCount}
          description="Users with active access."
          icon={<UserCheck size={18} />}
          loading={loading}
        />
      </div>

      <Card className="wh-section-card border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Admin users</CardTitle>
              <CardDescription>Manage user approvals and roles.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{totalUsers} visible</Badge>
              <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={() => void loadUsers()} disabled={loading}>
                <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? t.loading : t.refresh}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  className="h-10 pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t.role}
              </label>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter((value as RoleValue) ?? "all")}>
                <SelectTrigger className="h-10 w-full">
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
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t.status}
              </label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value as StatusValue) ?? "all")}>
                <SelectTrigger className="h-10 w-full">
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
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t.sort}
              </label>
              <Select value={sortOrder} onValueChange={(value) => setSortOrder((value as SortValue) ?? "newest")}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder={t.newestFirst} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t.newestFirst}</SelectItem>
                  <SelectItem value="oldest">{t.oldestFirst}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {message ? (
            <Card className="border-destructive/20 bg-destructive/5 shadow-none">
              <CardContent className="p-3 text-sm text-destructive">{message}</CardContent>
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
              title="No users found"
              description={emptyMessage}
            />
          ) : null}

          {!loading && users.length > 0 ? (
            <>
              <div className="hidden lg:block">
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="px-4">User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Approved</TableHead>
                        <TableHead>Approved by</TableHead>
                        <TableHead className="px-4">Actions</TableHead>
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
                          <TableRow key={user.id} className="align-top">
                            <TableCell className="px-4 py-4 whitespace-normal">
                              <div className="space-y-1">
                                <p className="font-semibold text-foreground">{user.username}</p>
                                {fullName ? <p className="text-sm text-foreground/80">{fullName}</p> : null}
                                <p className="text-sm text-muted-foreground">@{user.login}</p>
                                <p className="break-all text-sm text-muted-foreground">{user.email ?? "-"}</p>
                              </div>
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge variant={roleBadgeVariant(user.role)}>{roleName(user.role)}</Badge>
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge variant={statusBadgeVariant(user.status)}>{statusName(user.status)}</Badge>
                            </TableCell>
                            <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                              {formatDate(user.created_at)}
                            </TableCell>
                            <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                              {user.approved_at ? formatDate(user.approved_at) : "-"}
                            </TableCell>
                            <TableCell className="py-4 whitespace-normal text-sm text-muted-foreground">
                              {approver ?? "-"}
                            </TableCell>
                            <TableCell className="px-4 py-4 whitespace-normal">
                              <div className="flex min-w-[280px] flex-col gap-2">
                                {user.status === "pending" ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-9"
                                      onClick={() => void handleApprove(user.id)}
                                      disabled={isBusy}
                                    >
                                      {isBusy ? t.working : t.approve}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-9 text-destructive"
                                      onClick={() => openRejectModal(user)}
                                      disabled={isBusy}
                                    >
                                      {t.reject}
                                    </Button>
                                  </div>
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                  <Select
                                    value={draftRole}
                                    onValueChange={(value) => handleRoleChange(user.id, (value as "admin" | "user") ?? user.role)}
                                    disabled={isBusy}
                                  >
                                    <SelectTrigger className="h-9 min-w-[140px]">
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
                                    {isBusy ? t.working : t.saveRole}
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
                                    {isBusy ? t.working : t.deleteUser}
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
                            <div className="space-y-1">
                              <p className="font-semibold text-foreground">{user.username}</p>
                              {fullName ? <p className="text-sm text-foreground/80">{fullName}</p> : null}
                              <p className="text-sm text-muted-foreground">@{user.login}</p>
                              <p className="break-all text-sm text-muted-foreground">{user.email ?? "-"}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={roleBadgeVariant(user.role)}>{roleName(user.role)}</Badge>
                              <Badge variant={statusBadgeVariant(user.status)}>{statusName(user.status)}</Badge>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 rounded-2xl border border-border/60 bg-muted/20 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Created</span>
                            <span className="text-right text-foreground">{formatDate(user.created_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Approved</span>
                            <span className="text-right text-foreground">
                              {user.approved_at ? formatDate(user.approved_at) : "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Approved by</span>
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
                              {isBusy ? t.working : t.approve}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-10 text-destructive"
                              onClick={() => openRejectModal(user)}
                              disabled={isBusy}
                            >
                              {t.reject}
                            </Button>
                          </div>
                        ) : null}

                        <div className="grid gap-2">
                          <Select
                            value={draftRole}
                            onValueChange={(value) => handleRoleChange(user.id, (value as "admin" | "user") ?? user.role)}
                            disabled={isBusy}
                          >
                            <SelectTrigger className="h-10 w-full">
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
                              {isBusy ? t.working : t.saveRole}
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
                              {isBusy ? t.working : t.deleteUser}
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
        </CardContent>
      </Card>

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
