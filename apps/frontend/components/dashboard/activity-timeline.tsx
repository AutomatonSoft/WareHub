"use client";

import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { fetchTimelineLogs, ServiceLogEntry } from "./dashboard-api";

type TimelineEvent = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  when: string;
  timestampMs: number;
};

function relativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "just now";
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function pickActor(message: string, context: string | null | undefined): string {
  const actorFromMessage = message.match(/\bactor(?:_login)?\s*[:=]\s*([a-z0-9._-]+)/i)?.[1];
  if (actorFromMessage) {
    return actorFromMessage;
  }

  if (!context) {
    return "system";
  }

  try {
    const parsed = JSON.parse(context) as Record<string, unknown>;
    const actor =
      parsed.actor_login ?? parsed.actor ?? parsed.user ?? parsed.username ?? parsed.login;
    if (typeof actor === "string" && actor.trim()) {
      return actor.trim();
    }
  } catch {
  }

  return "system";
}

function pickEntity(message: string, context: string | null | undefined): string {
  const text = `${message} ${context ?? ""}`;
  const ean = text.match(/\bean\b[^0-9]*([0-9]{8,14})/i)?.[1];
  if (ean) {
    return `EAN ${ean}`;
  }
  const sku = text.match(/\bsku\b[^a-z0-9]*([a-z0-9._-]+)/i)?.[1];
  if (sku) {
    return `SKU ${sku}`;
  }
  return "General";
}

export function ActivityTimeline() {
  const [logs, setLogs] = useState<ServiceLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadLogs() {
      try {
        const entries = await fetchTimelineLogs(80);

        if (active) {
          setLogs(entries);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadLogs();
    const timer = window.setInterval(() => {
      void loadLogs();
    }, 20_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const events = useMemo<TimelineEvent[]>(() => {
    return logs
      .map((entry, index) => {
        const timestampMs = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
        return {
          id: `${entry.timestamp ?? "ts"}-${entry.channel ?? "ch"}-${index}`,
          actor: pickActor(entry.message ?? "", entry.context),
          action: (entry.message ?? "Action").trim(),
          entity: pickEntity(entry.message ?? "", entry.context),
          when: relativeTime(timestampMs),
          timestampMs
        };
      })
      .filter((entry) => entry.timestampMs > 0 && entry.action.length > 0)
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .slice(0, 12);
  }, [logs]);

  return (
    <Card className="wh-section-card wh-dashboard__activity-card min-w-0">
      <CardHeader className="wh-section-card__header">
      <CardTitle className="title-with-icon wh-section-card__title">
        <span className="title-icon-chip"><History size={14} /></span>
        Activity Timeline
      </CardTitle>
      </CardHeader>
      <CardContent className="wh-section-card__body">
      <ul className="wh-activity-list scrollbar-thin">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <li key={`activity-skeleton-${index}`} className="flex items-start gap-3">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[color:var(--primary-container)]" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-full max-w-[280px]" />
                <Skeleton className="mt-3 h-3 w-28" />
              </div>
            </li>
          ))
        ) : events.length === 0 ? (
          <li className="wh-empty-state wh-empty-state--dashboard wh-activity-empty">
            <History className="wh-activity-empty__icon" />
            <p className="wh-activity-empty__title">No recent activity</p>
            <p className="wh-activity-empty__description">Sync events and warehouse actions will appear here after the next operation.</p>
          </li>
        ) : (
          events.map((event) => (
            <li key={event.id} className="flex items-start gap-3">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[color:var(--primary-container)]" />
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground" title={`${event.actor}: ${event.action}`}>
                  <span className="font-semibold">{event.actor}</span> {event.action}
                </p>
                <p className="ui-caption">{event.entity} В· {event.when}</p>
              </div>
            </li>
          ))
        )}
      </ul>
      </CardContent>
    </Card>
  );
}




