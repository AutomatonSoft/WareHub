import type { HighlightText, SofortListRow } from "./sofort-list-types";
import { buildMarketplaceMatrixRows } from "./sofort-list-marketplace-matrix-model";

function displayEan(value: string, placeholder: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === placeholder) return "—";
  return normalized;
}

export function SofortListMarketplaceMatrix(props: {
  siteEans: SofortListRow["siteEans"];
  query: string;
  placeholderEan: string;
  highlightText: HighlightText;
}) {
  const rows = buildMarketplaceMatrixRows(props.siteEans, props.query, props.placeholderEan);

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
          <span className="wh-sofort-marketplace-matrix__market flex items-center gap-2">
            <span>{row.market}</span>
            {row.hasMatch ? (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                FOUND
              </span>
            ) : null}
          </span>
          {row.cells.map((cell) => (
            <code
              key={cell.key}
              className={`rounded-lg px-2 py-1 transition ${
                cell.matches
                  ? "bg-amber-200 text-slate-950 ring-1 ring-amber-400 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.45)]"
                  : cell.isEmpty
                    ? "text-slate-400"
                    : ""
              }`}
              aria-label={`${row.market} ${cell.key} ${cell.matches ? "matched" : "value"}`}
            >
              {props.highlightText(displayEan(cell.value, props.placeholderEan), props.query) || "—"}
            </code>
          ))}
        </div>
      ))}
    </div>
  );
}
