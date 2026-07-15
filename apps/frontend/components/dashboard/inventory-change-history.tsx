"use client";

import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { de, enGB, ru } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";

import { useLabels, useLanguage } from "../../app/use-labels";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { fetchInventoryChangeHistory, type InventoryChangeHistoryActorDto, type InventoryChangeHistoryEntryDto } from "./dashboard-api";

const ALL_PARTICIPANTS = "__all_participants__";
const HISTORY_PAGE_SIZE = 8;
const FIELD_LABELS: Record<string, string> = {
  photo: "inventoryFieldPhoto",
  place: "inventoryFieldPlace",
  room: "inventoryFieldRoom",
  furniture_type: "inventoryFieldType",
  "attributes.price": "inventoryFieldPrice",
  "attributes.quantity": "inventoryFieldQuantity",
  "attributes.company": "inventoryFieldCompany",
  "attributes.color": "inventoryFieldColor",
  "attributes.size": "inventoryFieldSize",
  "attributes.material": "inventoryFieldMaterial"
};

function toDateInputValue(value: Date | undefined): string | undefined {
  if (!value) return undefined;
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function imageUrls(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string" && /^https?:\/\//i.test(item));
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function PhotoGroup({ urls, alt }: { urls: string[]; alt: string }) {
  const [visibleUrls, setVisibleUrls] = useState(urls.slice(0, 3));

  if (visibleUrls.length === 0) return <span>-</span>;

  return (
    <>
      {visibleUrls.map((url) => (
        // Audit entries may contain runtime-configured media origins, which cannot safely be allowlisted at build time.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt={alt} loading="lazy" onError={() => setVisibleUrls((current) => current.filter((currentUrl) => currentUrl !== url))} />
      ))}
    </>
  );
}

function PhotoChangePreview({ before, after }: { before: unknown; after: unknown }) {
  return (
    <div className="wh-dashboard-history__photo-change" aria-label="Photo changed">
      <div className="wh-dashboard-history__photo-group"><PhotoGroup urls={imageUrls(before)} alt="Previous product photo" /></div>
      <span aria-hidden="true">→</span>
      <div className="wh-dashboard-history__photo-group"><PhotoGroup urls={imageUrls(after)} alt="Updated product photo" /></div>
    </div>
  );
}

function HistoryDateRangePicker({
  value,
  onChange,
  locale,
  calendarLocale,
  labels,
}: {
  value: DateRange | undefined;
  onChange: (nextValue: DateRange | undefined) => void;
  locale: string;
  calendarLocale: typeof enGB;
  labels: {
    allDates: string;
    today: string;
    thisWeek: string;
    thisMonth: string;
    yesterday: string;
    lastWeek: string;
    lastMonth: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const formatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" });
  const dateLabel = !value?.from
    ? labels.allDates
    : !value.to || isSameCalendarDay(value.from, value.to)
      ? formatter.format(value.from)
      : `${formatter.format(value.from)} – ${formatter.format(value.to)}`;
  const applyPreset = (nextValue: DateRange) => {
    onChange(nextValue);
    setOpen(false);
  };
  const now = new Date();
  const presets = [
    { label: labels.today, range: { from: now, to: now } },
    { label: labels.thisWeek, range: { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) } },
    { label: labels.thisMonth, range: { from: startOfMonth(now), to: endOfMonth(now) } },
    { label: labels.yesterday, range: { from: subDays(now, 1), to: subDays(now, 1) } },
    { label: labels.lastWeek, range: (() => { const previousWeek = subWeeks(now, 1); return { from: startOfWeek(previousWeek, { weekStartsOn: 1 }), to: endOfWeek(previousWeek, { weekStartsOn: 1 }) }; })() },
    { label: labels.lastMonth, range: (() => { const previousMonth = subMonths(now, 1); return { from: startOfMonth(previousMonth), to: endOfMonth(previousMonth) }; })() },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" className="wh-dashboard-history__date-trigger" aria-label={dateLabel}><CalendarDays data-icon="inline-start" aria-hidden="true" />{dateLabel}</Button>} />
      <PopoverContent align="end" className="wh-dashboard-history__calendar-popover">
        <Calendar
          mode="range"
          selected={value}
          onSelect={(nextValue) => {
            onChange(nextValue);
            if (nextValue?.from && nextValue.to) setOpen(false);
          }}
          numberOfMonths={2}
          defaultMonth={value?.from}
          locale={calendarLocale}
          weekStartsOn={1}
        />
        <div className="wh-dashboard-history__date-presets">
          {presets.map((preset) => <Button key={preset.label} type="button" variant="secondary" size="xs" onClick={() => applyPreset(preset.range)}>{preset.label}</Button>)}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function InventoryChangeHistory() {
  const t = useLabels();
  const lang = useLanguage();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [entries, setEntries] = useState<InventoryChangeHistoryEntryDto[]>([]);
  const [actors, setActors] = useState<InventoryChangeHistoryActorDto[]>([]);
  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    setPage(1);
  }, [actor, dateRange?.from, dateRange?.to, search]);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (page === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      void fetchInventoryChangeHistory({ limit: HISTORY_PAGE_SIZE, page, search, actor, dateFrom: toDateInputValue(dateRange?.from), dateTo: toDateInputValue(dateRange?.to) })
        .then((payload) => {
          if (!active) return;
          setEntries((current) => page === 1 ? payload.results : [...current, ...payload.results]);
          setActors(payload.actors);
          setTotal(payload.total);
        })
        .catch((error) => console.error("INVENTORY_CHANGE_HISTORY_LOAD_ERROR", error))
        .finally(() => {
          if (!active) return;
          setLoading(false);
          setLoadingMore(false);
        });
    }, search ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [actor, dateRange?.from, dateRange?.to, page, search]);

  useEffect(() => {
    const updateHeight = () => {
      const element = cardRef.current;
      if (!element) return;
      const nextHeight = Math.max(360, Math.floor(window.innerHeight - element.getBoundingClientRect().top - 12));
      setMaxHeight((current) => current === nextHeight ? current : nextHeight);
    };

    updateHeight();
    const frameId = window.requestAnimationFrame(updateHeight);
    window.addEventListener("resize", updateHeight);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateHeight);
    };
  }, [entries.length, loading, total]);

  const locale = lang === "ru" ? "ru-RU" : lang === "de" ? "de-DE" : "en-GB";
  const calendarLocale = lang === "ru" ? ru : lang === "de" ? de : enGB;
  const selectedActorLabel = actor
    ? actors.find((option) => option.value === actor)?.label ?? actor
    : t.inventoryHistoryAllParticipants;
  const hasMore = entries.length < total;
  const actionLabel = (entry: InventoryChangeHistoryEntryDto) => {
    if (entry.action === "product_created") return t.inventoryChangeCreated;
    if (entry.action === "product_updated") return t.inventoryChangeUpdated;
    const channel = entry.metadata.channel ? ` ${entry.metadata.channel}` : "";
    return entry.action === "marketplace_activated"
      ? `${t.inventoryChangeActivated}${channel}`
      : `${t.inventoryChangeDeactivated}${channel}`;
  };

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;

    const element = contentRef.current;
    if (!element) return;

    if (element.scrollHeight <= element.clientHeight + 8) {
      setPage((current) => current + 1);
    }
  }, [entries.length, hasMore, loading, loadingMore]);

  const handleScroll = () => {
    const element = contentRef.current;
    if (!element || loading || loadingMore || !hasMore) return;

    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= 80) {
      setPage((current) => current + 1);
    }
  };

  return (
    <Card ref={cardRef} className="wh-section-card wh-dashboard__history-card" style={maxHeight ? { height: `${maxHeight}px` } : undefined}>
      <CardContent className="wh-section-card__body">
        <div className="wh-dashboard-history__filters">
          <Input aria-label={t.inventoryHistorySearchPlaceholder} placeholder={t.inventoryHistorySearchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={actor || ALL_PARTICIPANTS} onValueChange={(value) => setActor(!value || value === ALL_PARTICIPANTS ? "" : value)}>
            <SelectTrigger aria-label={t.inventoryHistoryParticipant}><span>{selectedActorLabel}</span></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value={ALL_PARTICIPANTS}>{t.inventoryHistoryAllParticipants}</SelectItem>
              {actors.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
          <HistoryDateRangePicker
            value={dateRange}
            onChange={setDateRange}
            locale={locale}
            calendarLocale={calendarLocale}
            labels={{
              allDates: t.inventoryHistoryAllDates,
              today: t.inventoryHistoryToday,
              thisWeek: t.inventoryHistoryThisWeek,
              thisMonth: t.inventoryHistoryThisMonth,
              yesterday: t.inventoryHistoryYesterday,
              lastWeek: t.inventoryHistoryLastWeek,
              lastMonth: t.inventoryHistoryLastMonth,
            }}
          />
        </div>
        <div ref={contentRef} className="wh-dashboard-history__content" onScroll={handleScroll}>
          {loading ? (
            <div className="wh-dashboard-history__skeleton">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
          ) : entries.length === 0 ? (
            <p className="wh-dashboard-history__empty">{t.noInventoryChanges}</p>
          ) : (
            <ol className="wh-dashboard-history">
              {entries.map((entry) => (
                <li key={entry.id} className="wh-dashboard-history__item">
                  <time dateTime={entry.occurred_at}>{new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(entry.occurred_at))}</time>
                  <div><strong>{entry.actor.name}</strong><span>{actionLabel(entry)}</span></div>
                  <div className="wh-dashboard-history__product">KID {entry.product.kid_number || "-"}{entry.product.place ? ` · ${entry.product.place}` : ""}</div>
                  {entry.changes.length > 0 && (
                    <div className="wh-dashboard-history__changes">
                      {entry.changes.map((change, index) => (
                        <div key={`${change.field}-${index}`} className="wh-dashboard-history__change">
                          <span>{t[FIELD_LABELS[change.field] as keyof typeof t] ?? change.field}:</span>
                          {change.field === "photo" ? <PhotoChangePreview before={change.before} after={change.after} /> : <span>{valueText(change.before)} → {valueText(change.after)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {!loading && loadingMore ? (
            <div className="wh-dashboard-history__loading-more">
              {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
