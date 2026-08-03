import type { HighlightText, SofortListRow } from "./sofort-list-types";
import { buildMarketplaceMatrixRows } from "./sofort-list-marketplace-matrix-model";
import { Checkbox } from "@/components/ui/checkbox";
import { memo, useEffect, useState } from "react";

type MarketplaceStatusKey = keyof SofortListRow["siteEanStatuses"];

function displayEan(value: string, placeholder: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === placeholder) return "";
  return normalized;
}

export const SofortListMarketplaceMatrix = memo(function SofortListMarketplaceMatrix(props: {
  siteEans: SofortListRow["siteEans"];
  siteEanStatuses: SofortListRow["siteEanStatuses"];
  bWare: boolean;
  query: string;
  placeholderEan: string;
  highlightText: HighlightText;
  onStatusChange?: (marketplace: MarketplaceStatusKey, status: boolean) => Promise<void>;
  labels: {
    matrixAria: string;
    jv: string;
    xl: string;
    matched: string;
    value: string;
    empty: string;
  };
}) {
  const [siteEanStatuses, setSiteEanStatuses] = useState(props.siteEanStatuses);
  const [updatingMarketplace, setUpdatingMarketplace] = useState<MarketplaceStatusKey | null>(null);

  useEffect(() => {
    setSiteEanStatuses(props.siteEanStatuses);
  }, [props.siteEanStatuses]);

  const rows = buildMarketplaceMatrixRows(props.siteEans, siteEanStatuses, props.query, props.placeholderEan, props.bWare);

  async function handleStatusChange(marketplace: MarketplaceStatusKey, status: boolean) {
    if (!props.onStatusChange || updatingMarketplace) return;
    setUpdatingMarketplace(marketplace);
    try {
      await props.onStatusChange(marketplace, status);
      setSiteEanStatuses((current) => ({ ...current, [marketplace]: status }));
    } catch {
      // The caller shows the request error; retain the previous local status.
    } finally {
      setUpdatingMarketplace(null);
    }
  }

  return (
    <div className="wh-sofort-marketplace-matrix" role="group" aria-label={props.labels.matrixAria}>
      <div className="wh-sofort-marketplace-matrix__head" aria-hidden="true">
        <span />
        <span>{props.labels.jv}</span>
        <span>{props.labels.xl}</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.market}
          className={`wh-sofort-marketplace-matrix__row rounded-xl transition ${
            row.hasMatch ? "bg-emerald-50/80 ring-1 ring-emerald-200" : ""
          }`}
        >
          <span className="wh-sofort-marketplace-matrix__market" title={row.market}>
            {row.market}
          </span>
          {row.cells.map((cell) => {
            const displayValue = displayEan(cell.value, props.placeholderEan);
            return (
              <div
                key={cell.key}
                className={`wh-sofort-marketplace-matrix__value ${
                  cell.matches
                    ? "wh-sofort-marketplace-matrix__value--matched"
                    : cell.isBWare
                      ? "wh-sofort-marketplace-matrix__value--b-ware"
                      : cell.status === true
                        ? "wh-sofort-marketplace-matrix__value--active"
                        : "wh-sofort-marketplace-matrix__value--inactive"
                }`}
                title={displayValue || undefined}
              >
                <code aria-label={`${row.market} ${cell.key} ${cell.matches ? props.labels.matched : props.labels.value}`}>
                  {props.highlightText(displayValue, props.query)}
                </code>
                <Checkbox
                  className="wh-sofort-marketplace-matrix__checkbox"
                  checked={cell.status === true}
                  disabled={updatingMarketplace === cell.key}
                  aria-label={`${row.market} ${cell.key} status`}
                  onCheckedChange={(value) => void handleStatusChange(cell.key, value === true)}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});
