"use client";

import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
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

function relativeTime(timestampMs: number, labels: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string }): string {
  const diffMs = Date.now() - timestampMs;
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return labels.justNow;
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return labels.justNow;
  }
  if (minutes < 60) {
    return labels.minutesAgo.replace("{count}", String(minutes));
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return labels.hoursAgo.replace("{count}", String(hours));
  }
  const days = Math.floor(hours / 24);
  return labels.daysAgo.replace("{count}", String(days));
}

function pickActor(message: string, context: string | null | undefined): string {
  const actorFromMessage = message.match(/\bactor(?:_login)?\s*[:=]\s*([a-z0-9._-]+)/i)?.[1];
  if (actorFromMessage) {
    return actorFromMessage;
  }

  if (!context) {
    return "";
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

  return "";
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
  return "";
}

export function ActivityTimeline() {
  const t = useLabels();
  const [logs, setLogs] = useState<ServiceLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadLogs() {
      try {
        setError(null);
        const entries = await fetchTimelineLogs(80);

        if (active) {
          setLogs(entries);
        }
      } catch (loadError) {
        if (active) {
          setLogs([]);
          setError(loadError instanceof Error ? loadError.message : t.unableLoadRecentActivity);
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
          action: (entry.message ?? "").trim() || t.activityActionFallback,
          entity: pickEntity(entry.message ?? "", entry.context) || t.activityEntityFallback,
          when: relativeTime(timestampMs, {
            justNow: t.justNow,
            minutesAgo: t.minutesAgo,
            hoursAgo: t.hoursAgo,
            daysAgo: t.daysAgo,
          }),
          timestampMs
        };
      })
      .filter((entry) => entry.timestampMs > 0 && entry.action.length > 0)
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .slice(0, 12);
  }, [logs, t.daysAgo, t.hoursAgo, t.justNow, t.minutesAgo]);

  return (
    <Card className="wh-section-card wh-dashboard__activity-card min-w-0">
      <CardHeader className="wh-section-card__header">
      <div className="min-w-0">
        <CardTitle className="title-with-icon wh-section-card__title">
          <span className="title-icon-chip"><History aria-hidden="true" size={14} /></span>
          {t.activityTimeline}
        </CardTitle>
        <CardDescription className="wh-section-card__subtitle">{t.recentOrchestrationSyncWarehouse}</CardDescription>
      </div>
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
        ) : error ? (
          <li className="wh-empty-state wh-empty-state--dashboard wh-activity-empty">
            <History className="wh-activity-empty__icon" />
            <p className="wh-activity-empty__title">{t.activityFeedUnavailable}</p>
            <p className="wh-activity-empty__description">{error}</p>
          </li>
        ) : events.length === 0 ? (
          <li className="wh-empty-state wh-empty-state--dashboard wh-activity-empty">
            <History className="wh-activity-empty__icon" />
            <p className="wh-activity-empty__title">{t.noRecentActivity}</p>
            <p className="wh-activity-empty__description">{t.syncEventsAppearAfterNextOperation}</p>
          </li>
        ) : (
          events.map((event) => (
            <li key={event.id} className="flex items-start gap-3">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[color:var(--primary-container)]" />
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground" title={event.actor ? `${event.actor}: ${event.action}` : event.action}>
                  {event.actor ? <span className="font-semibold">{event.actor}</span> : null}
                  {event.actor ? " " : null}
                  {event.action}
                </p>
                <p className="ui-caption">{event.entity} | {event.when}</p>
              </div>
            </li>
          ))
        )}
      </ul>
      </CardContent>
    </Card>
  );
}




