"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchIntakeDeleteAuditLogs,
  IntakeDeleteAuditEntry,
  IntakeDeleteAuditQueryParams
} from "../client-api";
import { dateLocale, labels, Lang } from "../i18n";

type AdminDeleteAuditPanelProps = {
  apiBase: string;
  token: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  lang: Lang;
};

function toIsoOrEmpty(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function toDatetimeLocalInput(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function escapeCsv(value: string): string {
  if (/[",\n;]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

export function AdminDeleteAuditPanel({
  apiBase,
  token,
  role,
  status,
  lang
}: AdminDeleteAuditPanelProps) {
  const canRender = role === "admin" && status === "approved" && token.length > 0;
  const t = labels[lang];
  const locale = useMemo(() => dateLocale[lang] ?? "en-US", [lang]);
  const [entries, setEntries] = useState<IntakeDeleteAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [limit, setLimit] = useState("100");
  const [actorLogin, setActorLogin] = useState("");
  const [requestId, setRequestId] = useState("");
  const [section, setSection] = useState<"all" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "M">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<IntakeDeleteAuditEntry | null>(null);

  const formatTimestamp = useCallback(
    (value: string) => {
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) {
        return value;
      }
      return dt.toLocaleString(locale);
    },
    [locale]
  );

  const applyPreset = useCallback((preset: "today" | "7d" | "30d") => {
    const now = new Date();
    if (preset === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      setFrom(toDatetimeLocalInput(start));
      setTo(toDatetimeLocalInput(now));
      return;
    }
    const days = preset === "7d" ? 7 : 30;
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    setFrom(toDatetimeLocalInput(start));
    setTo(toDatetimeLocalInput(now));
  }, []);

  const buildQuery = useCallback((overrides?: Partial<IntakeDeleteAuditQueryParams>): IntakeDeleteAuditQueryParams => {
    const parsedLimit = Number.parseInt(limit.trim(), 10);
    const query: IntakeDeleteAuditQueryParams = {
      limit: Number.isFinite(parsedLimit) ? Math.max(1, Math.min(500, parsedLimit)) : 100
    };
    if (actorLogin.trim().length > 0) {
      query.actor_login = actorLogin.trim();
    }
    if (requestId.trim().length > 0) {
      query.request_id = requestId.trim();
    }
    if (section !== "all") {
      query.section = section;
    }
    const fromIso = toIsoOrEmpty(from);
    if (fromIso) {
      query.from = fromIso;
    }
    const toIso = toIsoOrEmpty(to);
    if (toIso) {
      query.to = toIso;
    }
    if (overrides) {
      return { ...query, ...overrides };
    }
    return query;
  }, [actorLogin, from, limit, requestId, section, to]);

  const loadAudit = useCallback(async (overrides?: Partial<IntakeDeleteAuditQueryParams>) => {
    if (!canRender) {
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const data = await fetchIntakeDeleteAuditLogs(apiBase, token, buildQuery(overrides));
      setEntries(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.loading);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token, canRender, buildQuery, t.loading]);

  const applyRequestIdFilter = useCallback((value: string) => {
    const nextRequestId = value.trim();
    if (!nextRequestId) {
      return;
    }
    setRequestId(nextRequestId);
    void loadAudit({ request_id: nextRequestId });
  }, [loadAudit]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAudit();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loadAudit]);

  const exportCsv = useCallback(() => {
    if (entries.length === 0) {
      return;
    }
    const header = [
      "timestamp",
      "event",
      "request_id",
      "actor_login",
      "section",
      "slot_number",
      "warehouse_location",
      "intake_id",
      "mode",
      "removed_count"
    ];
    const lines = [header.join(";")];
    for (const row of entries) {
      const values = [
        row.timestamp ?? "",
        row.event ?? "",
        row.request_id ?? "",
        row.actor_login ?? "",
        row.section ?? "",
        row.slot_number != null ? String(row.slot_number) : "",
        row.warehouse_location ?? "",
        row.intake_id ?? "",
        row.mode ?? "",
        row.removed_count != null ? String(row.removed_count) : ""
      ];
      lines.push(values.map(escapeCsv).join(";"));
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const dateTag = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = href;
    link.download = `intake-delete-audit-${dateTag}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }, [entries]);

  if (!canRender) {
    return null;
  }

  return (
    <section className="card admin-panel">
      <header className="admin-panel-header">
        <div>
          <h2>{t.auditDeleteTitle}</h2>
          <p>{t.auditDeleteSubtitle}</p>
        </div>
        <div className="admin-audit-header-actions">
          <button type="button" className="ghost-action-button" onClick={exportCsv} disabled={entries.length === 0}>
            {t.auditExportCsv}
          </button>
          <button type="button" className="ghost-action-button" onClick={() => void loadAudit()} disabled={loading}>
            {loading ? t.loading : t.refresh}
          </button>
        </div>
      </header>

      <div className="admin-audit-presets">
        <span>{t.auditPresets}</span>
        <button type="button" className="ghost-action-button" onClick={() => applyPreset("today")}>
          {t.auditPresetToday}
        </button>
        <button type="button" className="ghost-action-button" onClick={() => applyPreset("7d")}>
          {t.auditPreset7d}
        </button>
        <button type="button" className="ghost-action-button" onClick={() => applyPreset("30d")}>
          {t.auditPreset30d}
        </button>
      </div>

      <div className="admin-panel-toolbar admin-audit-toolbar">
        <div className="admin-filter">
          <label htmlFor="audit-limit">{t.auditLimit}</label>
          <input id="audit-limit" className="admin-audit-input" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <div className="admin-filter">
          <label htmlFor="audit-actor">{t.auditActor}</label>
          <input id="audit-actor" className="admin-audit-input" value={actorLogin} onChange={(e) => setActorLogin(e.target.value)} />
        </div>
        <div className="admin-filter">
          <label htmlFor="audit-request-id">{t.auditRequestId}</label>
          <input
            id="audit-request-id"
            className="admin-audit-input"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder={t.auditRequestIdPlaceholder}
          />
        </div>
        <div className="admin-filter">
          <label htmlFor="audit-section">{t.section}</label>
          <select
            id="audit-section"
            className="ui-select admin-select"
            value={section}
            onChange={(e) => setSection(e.target.value as typeof section)}
          >
            <option value="all">{t.allSections}</option>
            {["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter">
          <label htmlFor="audit-from">{t.auditFrom}</label>
          <input id="audit-from" type="datetime-local" className="admin-audit-input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="admin-filter">
          <label htmlFor="audit-to">{t.auditTo}</label>
          <input id="audit-to" type="datetime-local" className="admin-audit-input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {message ? <div className="form-message">{message}</div> : null}

      {entries.length === 0 ? (
        <p className="admin-panel-empty">{loading ? t.loading : t.auditNoData}</p>
      ) : (
        <div className="admin-audit-table-wrap">
          <table className="admin-audit-table">
            <thead>
              <tr>
                <th>{t.createdAt}</th>
                <th>{t.auditEvent}</th>
                <th>{t.auditActor}</th>
                <th>{t.sectionSlot}</th>
                <th>{t.warehouse}</th>
                <th>{t.auditMode}</th>
                <th>{t.count}</th>
                <th>{t.auditRequestId}</th>
                <th>{t.auditDetails}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={`${entry.request_id}-${entry.timestamp}-${entry.event}-${entry.intake_id ?? "none"}`}>
                  <td>{formatTimestamp(entry.timestamp)}</td>
                  <td>{entry.event}</td>
                  <td>{entry.actor_login || "-"}</td>
                  <td>{entry.section && entry.slot_number != null ? `${entry.section}/${entry.slot_number}` : "-"}</td>
                  <td>{entry.warehouse_location ?? "-"}</td>
                  <td>{entry.mode ?? "-"}</td>
                  <td>{entry.removed_count ?? (entry.intake_id ? "1" : "-")}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost-action-button"
                      onClick={() => applyRequestIdFilter(entry.request_id)}
                    >
                      {entry.request_id}
                    </button>
                  </td>
                  <td>
                    <button type="button" className="ghost-action-button admin-audit-details-button" onClick={() => setSelectedEntry(entry)}>
                      {t.auditDetails}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedEntry ? (
        <div className="modal-backdrop">
          <section className="modal-card admin-audit-modal">
            <h2>{t.auditDetails}</h2>
            <div className="admin-audit-modal-grid">
              <div><b>{t.createdAt}:</b> {formatTimestamp(selectedEntry.timestamp)}</div>
              <div><b>{t.auditEvent}:</b> {selectedEntry.event}</div>
              <div><b>{t.auditActor}:</b> {selectedEntry.actor_login || "-"}</div>
              <div><b>{t.sectionSlot}:</b> {selectedEntry.section && selectedEntry.slot_number != null ? `${selectedEntry.section}/${selectedEntry.slot_number}` : "-"}</div>
              <div><b>{t.warehouse}:</b> {selectedEntry.warehouse_location ?? "-"}</div>
              <div><b>{t.auditMode}:</b> {selectedEntry.mode ?? "-"}</div>
              <div><b>{t.count}:</b> {selectedEntry.removed_count ?? (selectedEntry.intake_id ? "1" : "-")}</div>
              <div><b>{t.auditRequestId}:</b> {selectedEntry.request_id}</div>
              <div><b>{t.auditIntakeId}:</b> {selectedEntry.intake_id ?? "-"}</div>
            </div>
            <pre className="admin-audit-json">{JSON.stringify(selectedEntry, null, 2)}</pre>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-action-button"
                onClick={() => void navigator.clipboard?.writeText(selectedEntry.request_id)}
              >
                {t.auditCopyRequestId}
              </button>
              <button type="button" className="ghost-action-button" onClick={() => setSelectedEntry(null)}>
                {t.cancel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
