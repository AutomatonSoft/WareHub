import { Badge } from "../../shared/badge";
import { Button } from "../../shared/button";
import { Card, CardHeader, CardTitle } from "../../ui/card";
import type { ChildOrderRow, ParentOrderRow } from "./kid-details-types";

function buildMergedChildren(order: ParentOrderRow): ChildOrderRow[] {
  const childrenFromSnapshot: ChildOrderRow[] = order.additionalItems.map((child) => ({
    orderId: String(child.order_id || "").trim(),
    platform: String(child.platform || "-").trim() || "-",
    buyer: String(child.buyer || "-").trim() || "-",
    title: String(child.title || "-").trim() || "-",
    sku: String(child.sku || "-").trim() || "-",
    memo: String(child.memo || "-").trim() || "-",
    orderDate: String(child.verkaufsdatum || "-").trim() || "-",
    payment: String(child.zahlungssumme || "-").trim() || "-",
    invoice: String(child.rechnungssumme || "-").trim() || "-"
  }));

  const fallbackIds =
    order.additionalOrderIdsText && order.additionalOrderIdsText !== "-"
      ? order.additionalOrderIdsText
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : [];

  const existingIds = new Set(childrenFromSnapshot.map((item) => item.orderId));
  const mergedChildren: ChildOrderRow[] = [...childrenFromSnapshot];
  for (const fallbackId of fallbackIds) {
    if (!existingIds.has(fallbackId)) {
      mergedChildren.push({
        orderId: fallbackId,
        platform: "-",
        buyer: "-",
        title: "-",
        sku: "-",
        memo: "-",
        orderDate: "-",
        payment: "-",
        invoice: "-"
      });
    }
  }
  return mergedChildren;
}

export function KidDetailsOrdersCard(props: {
  t: Record<string, string>;
  loading: boolean;
  parentOrders: ParentOrderRow[];
  deletingOrderDbId: number | null;
  deletingChildKey: string | null;
  formatPriceWithoutDots: (value: string) => string;
  statusTone: (value: string) => "success" | "warning";
  onDeleteParentOrder: (orderDbId: number, parentOrderId: string) => Promise<void>;
  onDeleteChildOrder: (parent: ParentOrderRow, childOrderId: string) => Promise<void>;
}) {
  const {
    t,
    loading,
    parentOrders,
    deletingOrderDbId,
    deletingChildKey,
    formatPriceWithoutDots,
    statusTone,
    onDeleteParentOrder,
    onDeleteChildOrder
  } = props;

  return (
    <Card className="overflow-hidden p-0">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-3">
        <CardTitle className="text-base">{t.orders}</CardTitle>
        {!loading ? <div className="text-xs text-muted-foreground">{t.total}: {parentOrders.length}</div> : null}
      </CardHeader>
      <div className="space-y-3 p-4">
        {loading ? <div className="text-sm text-muted-foreground">{t.loading}</div> : null}
        {!loading && parentOrders.length === 0 ? <div className="text-sm text-muted-foreground">{t.noOrdersForKid}</div> : null}
        {parentOrders.map((order) => (
          <div key={order.id} className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">
                {t.parentOrderId}: <span className="font-bold">{order.parentOrderId}</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-10 px-4 text-sm"
                onClick={() => void onDeleteParentOrder(order.orderDbId, order.parentOrderId)}
                disabled={deletingOrderDbId === order.orderDbId || deletingChildKey !== null}
              >
                {deletingOrderDbId === order.orderDbId ? t.deleting : t.deleteParent}
              </Button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{t.platform}: <span className="font-semibold text-foreground">{order.platform}</span></div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{t.quantity}: <span className="font-semibold text-foreground">{order.quantity}</span></div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{t.sku}: <span className="font-semibold text-foreground">{order.sku}</span></div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{t.price}: <span className="font-semibold text-foreground">{formatPriceWithoutDots(order.globalPrice)}</span></div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{t.date}: <span className="font-semibold text-foreground">{order.date}</span></div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{t.status}: <Badge tone={statusTone(order.status)}>{order.status}</Badge></div>
            </div>

            <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground">
              <span className="font-semibold text-foreground">{t.title}:</span> {order.title}
            </div>
            <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm leading-6 text-muted-foreground">
              <span className="font-semibold text-foreground">{t.memo}:</span>
              <div className="mt-1 max-h-24 overflow-auto pr-1">{order.memo}</div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span>{t.additionalOrders}</span>
                <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                  {t.additionalOrders}: {Math.max(
                    order.additionalItems.length,
                    order.additionalOrderIdsText && order.additionalOrderIdsText !== "-"
                      ? order.additionalOrderIdsText.split(",").map((id) => id.trim()).filter((id) => id.length > 0).length
                      : 0
                  )}
                </span>
              </div>
              {(() => {
                const mergedChildren = buildMergedChildren(order);
                if (mergedChildren.length === 0) {
                  return <div className="text-xs text-muted-foreground">{t.noChildOrders}</div>;
                }
                return mergedChildren.map((child, index) => {
                  const childOrderId = child.orderId || `child-${index + 1}`;
                  const childKey = `${order.orderDbId}:${childOrderId}`;
                  return (
                    <div key={childKey} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-foreground">
                          {t.childOrderId}: {childOrderId}
                        </div>
                        {child.orderId ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-9 px-3 text-xs"
                            onClick={() => void onDeleteChildOrder(order, child.orderId)}
                            disabled={deletingChildKey === childKey || deletingOrderDbId !== null}
                          >
                            {deletingChildKey === childKey ? t.deleting : t.deleteChild}
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                        <div>{t.platform}: {child.platform}</div>
                        <div>{t.buyer}: {child.buyer}</div>
                        <div>{t.sku}: {child.sku}</div>
                        <div>{t.orderDate}: {child.orderDate}</div>
                        <div>{t.payment}: {formatPriceWithoutDots(child.payment)}</div>
                        <div>{t.invoice}: {formatPriceWithoutDots(child.invoice)}</div>
                      </div>
                      <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 px-2 py-1 text-xs leading-5 text-muted-foreground">
                        {t.title}: {child.title}
                      </div>
                      <details className="mt-1 rounded-xl border border-border/60 bg-muted/20 px-2 py-1 text-xs leading-5 text-muted-foreground">
                        <summary className="cursor-pointer font-medium text-foreground">{t.memo}</summary>
                        <div className="mt-1 max-h-20 overflow-auto pr-1">{child.memo}</div>
                      </details>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}


