import type { HighlightText, SofortListRow } from "./sofort-list-types";
import { buildMarketplaceMatrixRows } from "./sofort-list-marketplace-matrix-model";
import { Checkbox } from "@/components/ui/checkbox";

type MarketplaceStatusKey = keyof SofortListRow["siteEanStatuses"];

function displayEan(value: string, placeholder: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === placeholder) return "—";
  return normalized;
}

export function SofortListMarketplaceMatrix(props: {
  siteEans: SofortListRow["siteEans"];
  siteEanStatuses: SofortListRow["siteEanStatuses"];
  bWare: boolean;
  query: string;
  placeholderEan: string;
  highlightText: HighlightText;
  isStatusUpdating?: (marketplace: MarketplaceStatusKey) => boolean;
  onStatusChange?: (marketplace: MarketplaceStatusKey, status: boolean) => void;
  labels: {
    matrixAria: string;
    jv: string;
    xl: string;
    matched: string;
    value: string;
    empty: string;
  };
}) {
  const rows = buildMarketplaceMatrixRows(props.siteEans, props.siteEanStatuses, props.query, props.placeholderEan, props.bWare);

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
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 transition ${
                  cell.matches
                    ? "bg-amber-200 text-slate-950 ring-1 ring-amber-400 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.45)]"
                    : cell.isBWare
                      ? "bg-slate-100 text-slate-700 ring-1 ring-slate-300"
                      : cell.status === true
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                }`}
                title={displayValue === "—" ? undefined : displayValue}
              >
                <code aria-label={`${row.market} ${cell.key} ${cell.matches ? props.labels.matched : props.labels.value}`}>
                  {props.highlightText(displayValue, props.query) || props.labels.empty}
                </code>
                <Checkbox
                  checked={cell.status === true}
                  disabled={props.isStatusUpdating?.(cell.key) ?? false}
                  aria-label={`${row.market} ${cell.key} status`}
                  onCheckedChange={(value) => props.onStatusChange?.(cell.key, value === true)}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
