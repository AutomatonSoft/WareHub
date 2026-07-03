import type { HighlightText, SofortListRow } from "./sofort-list-types";
import { buildMarketplaceMatrixRows } from "./sofort-list-marketplace-matrix-model";

function displayEan(value: string, placeholder: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === placeholder) return "—";
  return normalized;
}

export function SofortListMarketplaceMatrix(props: {
  siteEans: SofortListRow["siteEans"];
  siteEanStatuses: SofortListRow["siteEanStatuses"];
  query: string;
  placeholderEan: string;
  highlightText: HighlightText;
}) {
  const rows = buildMarketplaceMatrixRows(props.siteEans, props.siteEanStatuses, props.query, props.placeholderEan);

  return (
    <div className="wh-sofort-marketplace-matrix" role="group" aria-label="Marketplace EAN matrix">
      <div className="wh-sofort-marketplace-matrix__head" aria-hidden="true">
        <span />
        <span>JV</span>
        <span>XL</span>
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
              <code
                key={cell.key}
                className={`rounded-lg px-2 py-1 transition ${
                  cell.matches
                    ? "bg-amber-200 text-slate-950 ring-1 ring-amber-400 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.45)]"
                    : cell.status === true
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                }`}
                aria-label={`${row.market} ${cell.key} ${cell.matches ? "matched" : "value"}`}
                title={displayValue === "—" ? undefined : displayValue}
              >
                {props.highlightText(displayValue, props.query) || "—"}
              </code>
            );
          })}
        </div>
      ))}
    </div>
  );
}
