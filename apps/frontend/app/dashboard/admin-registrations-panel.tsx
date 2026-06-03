"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminUser,
  approveRegistration,
  deleteUser,
  fetchAdminUsers,
  rejectRegistration,
  updateUserRole
} from "../client-api";
import { dateLocale, labels, Lang } from "../i18n";

type AdminRegistrationsPanelProps = {
  apiBase: string;
  token: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  lang: Lang;
  currentUserId: string;
};

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
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
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

  const hasActiveFilters = useMemo(
    () =>
      query.trim().length > 0 ||
      roleFilter !== "all" ||
      statusFilter !== "all",
    [query, roleFilter, statusFilter]
  );
  const emptyMessage = useMemo(() => {
    if (loading) {
      return t.loading;
    }
    if (hasActiveFilters) {
      return `${t.noMatches} "${query.trim()}".`;
    }
    return t.noUsers;
  }, [loading, hasActiveFilters, query, t.loading, t.noMatches, t.noUsers]);

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
    [apiBase, token, actionId, loadUsers, t.approveFailed]
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
    [apiBase, token, actionId, loadUsers, t.rejectFailed]
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
    [actionId, apiBase, roleDrafts, token, loadUsers, t.roleUpdateFailed]
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
    [actionId, apiBase, currentUserId, token, loadUsers, t.deleteUserConfirm, t.deleteUserConfirmTail, t.deleteUserFailed]
  );

  if (!canRender) {
    return null;
  }

  return (
    <section className="card admin-panel">
      <header className="admin-panel-header">
        <div>
          <h2>{t.adminTitle}</h2>
          <p>{t.adminSubtitle}</p>
        </div>
        <button type="button" className="ghost-action-button" onClick={loadUsers} disabled={loading}>
          {loading ? t.loading : t.refresh}
        </button>
      </header>

        <div className="admin-panel-toolbar">
          <div className="admin-counts admin-toolbar-total">
            <span>{t.totalUsers}</span>
            <b>{users.length}</b>
          </div>
          <div className="admin-counts admin-toolbar-pending">
            <span>{t.pending}</span>
            <b>{users.filter((item) => item.status === "pending").length}</b>
          </div>
          <div className="admin-counts admin-toolbar-visible">
            <span>{t.visible}</span>
            <b>{users.length}</b>
          </div>
          <div className="admin-search admin-toolbar-search">
            <label htmlFor="pending-search">{t.search}</label>
            <input
              id="pending-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchAdminPlaceholder}
            />
          </div>
          <div className="admin-sort admin-toolbar-sort">
            <label htmlFor="pending-sort">{t.sort}</label>
            <select
              className="ui-select admin-select"
              id="pending-sort"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as "newest" | "oldest")}
            >
              <option value="newest">{t.newestFirst}</option>
              <option value="oldest">{t.oldestFirst}</option>
            </select>
          </div>
          <div className="admin-filter admin-toolbar-role">
            <label htmlFor="pending-role-filter">{t.role}</label>
            <select
              className="ui-select admin-select"
              id="pending-role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as "all" | "admin" | "user")}
            >
              <option value="all">{t.allRoles}</option>
              <option value="admin">{t.adminTitle}</option>
              <option value="user">{t.user}</option>
            </select>
          </div>
          <div className="admin-filter admin-toolbar-status">
            <label htmlFor="pending-status-filter">{t.status}</label>
            <select
              className="ui-select admin-select"
              id="pending-status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as "all" | "pending" | "approved" | "rejected"
                )
              }
            >
              <option value="all">{t.allStatuses}</option>
              <option value="pending">{t.pending}</option>
              <option value="approved">{t.approved}</option>
              <option value="rejected">{t.rejected}</option>
            </select>
          </div>
        </div>

      {message ? <div className="form-message">{message}</div> : null}

      {users.length === 0 ? (
        <p className="admin-panel-empty">{emptyMessage}</p>
      ) : (
        <div className="admin-user-list">
          {users.map((user) => (
            <div className="admin-user-card" key={user.id}>
              <div className="admin-user-meta">
                <b>{user.username}</b>
                <span>{user.login}</span>
                <span>{user.email ?? "-"}</span>
                <span className="admin-badge-row">
                  <span className={`admin-badge admin-badge-role-${user.role}`}>{roleName(user.role)}</span>
                  <span className={`admin-badge admin-badge-status-${user.status}`}>{statusName(user.status)}</span>
                </span>
                <span>{t.created} {formatDate(user.created_at)}</span>
              </div>
              <div className="admin-actions">
                {user.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      className="admin-action-button admin-approve"
                      onClick={() => void handleApprove(user.id)}
                      disabled={actionId === user.id}
                    >
                      {actionId === user.id ? t.working : t.approve}
                    </button>
                    <button
                      type="button"
                      className="admin-action-button admin-reject"
                      onClick={() => openRejectModal(user)}
                      disabled={actionId === user.id}
                    >
                      {t.reject}
                    </button>
                  </>
                ) : null}
                <div className="admin-role-controls">
                  <select
                    className="ui-select admin-select admin-role-select"
                    value={roleDrafts[user.id] ?? user.role}
                    onChange={(event) =>
                      handleRoleChange(user.id, event.target.value as "admin" | "user")
                    }
                    disabled={actionId === user.id}
                  >
                    <option value="user">{t.user}</option>
                    <option value="admin">{t.adminTitle}</option>
                  </select>
                  <button
                    type="button"
                    className="admin-action-button"
                    onClick={() => void handleRoleSave(user)}
                    disabled={
                      actionId === user.id ||
                      (roleDrafts[user.id] ?? user.role) === user.role ||
                      (user.id === currentUserId && (roleDrafts[user.id] ?? user.role) !== "admin")
                    }
                  >
                    {actionId === user.id ? t.working : t.saveRole}
                  </button>
                  <button
                    type="button"
                    className="admin-action-button admin-delete"
                    onClick={() => void handleDeleteUser(user)}
                    disabled={actionId === user.id || user.id === currentUserId}
                    title={user.id === currentUserId ? t.cannotDeleteSelf : t.deleteUser}
                  >
                    {actionId === user.id ? t.working : t.deleteUser}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmTarget ? (
        <div className="modal-backdrop">
          <section className="modal-card admin-confirm-card">
            <h2>{t.rejectRegistrationTitle}</h2>
            <p>
              {t.rejectRegistrationTextStart} <b>{confirmTarget.username}</b> (
              {confirmTarget.login}){t.rejectRegistrationTextEnd}
            </p>
            <label className="admin-confirm-checkbox">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(event) => setConfirmChecked(event.target.checked)}
              />
              <span>{t.rejectConfirmCheckbox}</span>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="admin-action-button admin-reject"
                onClick={() => void handleReject(confirmTarget.id)}
                disabled={actionId === confirmTarget.id || !confirmChecked}
              >
                {actionId === confirmTarget.id ? t.working : t.reject}
              </button>
              <button
                type="button"
                className="ghost-action-button"
                onClick={() => setConfirmTarget(null)}
                disabled={Boolean(actionId)}
              >
                {t.cancel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
