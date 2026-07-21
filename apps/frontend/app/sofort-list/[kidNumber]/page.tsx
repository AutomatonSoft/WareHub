"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { fetchKidDetailView, patchOrderMemo, type KidDetailViewModel } from "@/components/inventory/inventory-api";
import { useToast } from "@/components/shared/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function parsePositiveNumber(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

const orderDateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatOrderDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : orderDateTimeFormatter.format(date);
}

function joinNonEmpty(values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim() ?? "").filter(Boolean).join(", ");
}

function getInitials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
}

type ChangeLogEntry = KidDetailViewModel["inventoryChangeLog"][number];

const historyFieldLabels: Record<string, string> = {
  "order.memo": "Memo заказа",
  "attributes.company": "Компания",
  "attributes.color": "Цвет",
  "attributes.material": "Материал",
  "attributes.price": "Цена",
  "attributes.quantity": "Количество",
  "attributes.size": "Размер",
  b_ware: "B-Ware",
  commentary: "Комментарий",
  furniture_type: "Тип",
  in_transit: "В пути",
  photo: "Фото",
  place: "Место",
  room: "Комната",
  section: "Секция",
};

function formatHistoryValue(value: unknown): string {
  if (value == null || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Да" : "Нет";
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => String(item)).join(", ") : "—";
  }
  return String(value);
}

function historyDescription(entry: ChangeLogEntry): string {
  const change = entry.changes[0];
  if (!change?.field) {
    if (entry.action === "product_created") {
      return "создал товар";
    }
    if (entry.action === "order_memo_updated") {
      return "изменил Memo заказа";
    }
    return `изменил данные ${historyEntityLabel(entry)}`;
  }

  const field = historyFieldLabels[change.field] ?? change.field;
  return `изменил ${field} с «${formatHistoryValue(change.before)}» на «${formatHistoryValue(change.after)}»`;
}

function historyEntityLabel(entry: ChangeLogEntry): string {
  return entry.metadata.entity === "order" ? "Заказ" : "KID";
}

export default function SofortKidOrderPage() {
  const { showToast } = useToast();
  const params = useParams<{ kidNumber: string }>();
  const searchParams = useSearchParams();
  const kidNumber = decodeURIComponent(params.kidNumber ?? "");
  const kidId = useMemo(() => parsePositiveNumber(searchParams.get("kidId")), [searchParams]);
  const orderDbId = useMemo(() => parsePositiveNumber(searchParams.get("orderDbId")), [searchParams]);
  const [data, setData] = useState<KidDetailViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoError, setMemoError] = useState<string | null>(null);
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!kidId) {
      setLoading(false);
      setError("Не указан идентификатор KID.");
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const detail = await fetchKidDetailView(kidId);
        if (!cancelled) {
          setData(detail);
        }
      } catch (loadError) {
        if (!cancelled) {
          setData(null);
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные заказа.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [kidId]);

  const order = data?.orders.find((item) => item.id === orderDbId) ?? data?.orders[0] ?? null;
  const changeHistory = data?.inventoryChangeLog ?? [];
  const photoUrl = data?.kid.photoUrls[0] ?? null;
  const orderItems = order?.items ?? [];
  const hasOutstandingAmount = Boolean(order?.outstandingAmount && order.outstandingAmount !== "0.00");
  const client = data?.client ?? null;
  const billingName = joinNonEmpty([client?.billingFirstName, client?.billingLastName]);
  const shippingName = joinNonEmpty([client?.shippingFirstName, client?.shippingLastName]);
  const billingAddress = joinNonEmpty([
    client?.billingCompany,
    client?.billingStreet,
    client?.billingStreet2,
    joinNonEmpty([client?.billingPostalCode, client?.billingCity]),
    client?.billingStateOrProvince,
    client?.billingCountry || client?.billingCountryIso,
  ]);
  const customerName = billingName || shippingName;
  const memo = order?.memo?.trim() ?? "";
  const isMemoDirty = memoDraft !== memo;

  useEffect(() => {
    setMemoDraft(memo);
    setMemoError(null);
  }, [memo, order?.id]);

  const saveMemo = async () => {
    if (!order || !isMemoDirty) {
      return;
    }

    setIsSavingMemo(true);
    setMemoError(null);

    try {
      const syncResult = await patchOrderMemo({ orderDbId: order.id, memo: memoDraft });
      const savedMemo = memoDraft.trim() || null;
      if (syncResult.syncStatus === "failed") {
        showToast(
          syncResult.syncErrorType === "afterbuy_operation_not_selectable"
            ? "Memo сохранено локально, но заказ в архиве Afterbuy и не подлежит изменению."
            : "Memo сохранено локально, но не отправлено в Afterbuy.",
          "error",
        );
      } else if (syncResult.syncStatus === "synced") {
        showToast("Memo сохранено и синхронизировано с Afterbuy.", "success");
      }
      setData((current) => current
        ? {
            ...current,
            orders: current.orders.map((item) => (item.id === order.id
              ? {
                  ...item,
                  memo: savedMemo,
                  memoSyncStatus: syncResult.syncStatus,
                  memoSyncError: syncResult.syncError,
                  memoSyncErrorType: syncResult.syncErrorType,
                }
              : item)),
          }
        : current);
    } catch (saveError) {
      setMemoError(saveError instanceof Error ? saveError.message : "Не удалось сохранить memo.");
    } finally {
      setIsSavingMemo(false);
    }
  };

  return (
    <AppShell>
      <section aria-label="Данные заказа">
        {loading ? (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
            <Card>
              <CardContent className="flex gap-2 p-3">
                <Skeleton className="size-40 shrink-0" />
                <div className="flex flex-1 flex-col gap-3">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-3/4" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <Skeleton className="h-36 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : error ? (
          <ErrorState title="Не удалось загрузить заказ" description={error} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
              <Card>
              <CardContent className="p-3">
              <section className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <div className="relative size-28 shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-border bg-muted sm:size-40">
                  {photoUrl ? (
                    <Image
                      src={photoUrl}
                      alt={order?.title || `KID ${kidNumber}`}
                      fill
                      sizes="(min-width: 640px) 160px, 112px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center px-2 text-center text-sm text-muted-foreground">
                      Нет изображения
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-3 py-0">
                  {orderItems.length ? (
                    <>
                      <ul className="flex min-w-0 flex-col">
                        {orderItems.map((item) => (
                          <li key={item.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border py-2 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)_10rem_6rem] sm:items-center">
                            <span className="min-w-0 truncate whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                              {item.afterbuyItemId || "—"}
                            </span>
                            <span className="min-w-0 break-words text-base font-medium leading-snug text-foreground sm:col-start-2 sm:line-clamp-2">
                              {item.quantity ?? "—"} x {item.title || "Без названия"}
                            </span>
                            <span className="hidden truncate whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground sm:col-start-3 sm:block">
                              {item.isMainItem ? formatOrderDateTime(item.itemEndDate) : ""}
                            </span>
                            <span className="text-right text-base font-semibold tabular-nums text-foreground sm:col-start-4">
                              {item.itemPrice || "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="ml-auto w-full max-w-[16rem]">
                        <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 text-right">
                          <dt className="truncate whitespace-nowrap text-sm text-muted-foreground">Already paid</dt>
                          <dd className="whitespace-nowrap text-base font-semibold tabular-nums text-foreground">{order?.alreadyPaid || "—"}</dd>
                          <dt className="truncate whitespace-nowrap text-sm text-muted-foreground">Outstanding amount</dt>
                          <dd className={cn("whitespace-nowrap text-base font-semibold tabular-nums", hasOutstandingAmount ? "text-destructive" : "text-foreground")}>
                            {order?.outstandingAmount || "—"}
                          </dd>
                          <dt className="truncate whitespace-nowrap pt-1 text-sm text-muted-foreground">Full amount</dt>
                          <dd className={cn("whitespace-nowrap pt-1 text-base font-semibold tabular-nums", hasOutstandingAmount ? "text-destructive" : "text-foreground")}>
                            {order?.fullAmount || "—"}
                          </dd>
                        </dl>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Позиции заказа не найдены.</p>
                  )}
                </div>
              </section>
              </CardContent>
              </Card>

              <Card>
              <CardContent className="p-3">
              <aside aria-label="Данные покупателя">
                {client ? (
                  <>
                    <header className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground" aria-hidden="true">
                        {getInitials(customerName)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-foreground">Покупатель</h2>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground" title={customerName}>{customerName || "Не указан"}</p>
                      </div>
                    </header>

                    <dl className="mt-3 grid gap-2 text-sm">
                      <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-3">
                        <dt className="whitespace-nowrap text-muted-foreground">Имя</dt>
                        <dd className="truncate whitespace-nowrap font-medium text-foreground" title={customerName}>{customerName || "—"}</dd>
                      </div>
                      {client.billingPhone ? (
                        <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-3">
                          <dt className="whitespace-nowrap text-muted-foreground">Телефон</dt>
                          <dd className="truncate whitespace-nowrap text-foreground" title={client.billingPhone}>{client.billingPhone}</dd>
                        </div>
                      ) : null}
                      {client.billingEmail ? (
                        <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-3">
                          <dt className="whitespace-nowrap text-muted-foreground">E-mail</dt>
                          <dd className="truncate whitespace-nowrap text-foreground" title={client.billingEmail}>{client.billingEmail}</dd>
                        </div>
                      ) : null}
                      <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-3">
                        <dt className="whitespace-nowrap text-muted-foreground">Адрес</dt>
                        <dd className="truncate whitespace-nowrap text-foreground" title={billingAddress}>{billingAddress || "—"}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Данные покупателя для этого товара не найдены.</p>
                )}
              </aside>
              </CardContent>
              </Card>
            </div>

            {order ? (
              <Card>
                <CardContent className="p-3">
                  <section aria-label="Комментарий к заказу">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-base font-semibold text-foreground">Memo</h2>
                      <Button size="sm" onClick={() => void saveMemo()} disabled={!isMemoDirty || isSavingMemo}>
                        {isSavingMemo ? "Сохранение…" : "Сохранить"}
                      </Button>
                    </div>
                    <Textarea
                      value={memoDraft}
                      onChange={(event) => setMemoDraft(event.target.value)}
                      placeholder="Добавьте комментарий к заказу"
                      aria-label="Memo заказа"
                      className="mt-2 min-h-64 resize-y"
                      disabled={isSavingMemo}
                    />
                    {memoError ? <p className="mt-2 text-sm text-destructive">{memoError}</p> : null}
                    {order.memoSyncStatus === "synced" ? (
                      <p className="mt-2 text-sm text-muted-foreground">Синхронизировано с Afterbuy.</p>
                    ) : order.memoSyncStatus === "pending" ? (
                      <p className="mt-2 text-sm text-muted-foreground">Ожидает синхронизации с Afterbuy.</p>
                    ) : null}
                  </section>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardContent className="p-3">
                <section aria-label="История изменений заказа и KID">
                  <h2 className="text-base font-semibold text-foreground">История изменений</h2>
                  {changeHistory.length ? (
                    <ol className="mt-3 divide-y divide-border">
                      {changeHistory.map((entry) => {
                        const description = historyDescription(entry);
                        const isLongDescription = description.length > 180;
                        const isExpanded = expandedHistoryIds.has(entry.id);
                        const descriptionId = `history-description-${entry.id}`;

                        return (
                          <li key={entry.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start sm:gap-x-3">
                            <time className="whitespace-nowrap text-sm tabular-nums text-muted-foreground" dateTime={entry.occurredAt}>
                              {formatOrderDateTime(entry.occurredAt)}
                            </time>
                            <div className="min-w-0">
                              <p id={descriptionId} className={cn("min-w-0 break-words text-sm text-foreground", isLongDescription && !isExpanded && "line-clamp-2")}>
                                <span className="font-medium">{entry.actor.name || entry.actor.login || "Система"}</span>
                                {" "}
                                {description}
                              </p>
                              {isLongDescription ? (
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  className="mt-1 h-auto px-0"
                                  aria-expanded={isExpanded}
                                  aria-controls={descriptionId}
                                  onClick={() => {
                                    setExpandedHistoryIds((current) => {
                                      const next = new Set(current);
                                      if (next.has(entry.id)) {
                                        next.delete(entry.id);
                                      } else {
                                        next.add(entry.id);
                                      }
                                      return next;
                                    });
                                  }}
                                >
                                  {isExpanded ? "Скрыть" : "Показать полностью"}
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Изменений для этого заказа и KID пока нет.</p>
                  )}
                </section>
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </AppShell>
  );
}
