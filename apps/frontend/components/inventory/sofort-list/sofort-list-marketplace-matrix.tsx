import type { HighlightText, SofortListRow } from "./sofort-list-types";
import { buildMarketplaceMatrixRows } from "./sofort-list-marketplace-matrix-model";
import { Checkbox } from "@/components/ui/checkbox";
import { memo, useEffect, useState } from "react";
import { useLanguage } from "../../../app/use-labels";

type MarketplaceStatusKey = keyof SofortListRow["siteEanStatuses"];

function displayEan(value: string, placeholder: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === placeholder) return "";
  return normalized;
}

export const SofortListMarketplaceMatrix = memo(function SofortListMarketplaceMatrix(props: {
  siteEans: SofortListRow["siteEans"];
  siteEanStatuses: SofortListRow["siteEanStatuses"];
  ottoPublications?: SofortListRow["ottoPublications"];
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
  const language = useLanguage();
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
        <span>DEP</span>
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
            const publication = cell.key === "ottoJv" || cell.key === "ottoXl" ? props.ottoPublications?.[cell.key] : undefined;
            const active = publication ? publication.online === true : cell.status === true;
            const publicationLabels = language === "ru"
              ? { pending: "На проверке OTTO", processed: "Ожидает публикации", rejected: "Отклонён OTTO", unknown: "Не подтверждён", online: "Опубликован", offline: "Деактивирован" }
              : language === "de"
                ? { pending: "OTTO prüft", processed: "Wartet auf Veröffentlichung", rejected: "Von OTTO abgelehnt", unknown: "Nicht bestätigt", online: "Veröffentlicht", offline: "Deaktiviert" }
                : { pending: "OTTO validation pending", processed: "Awaiting publication", rejected: "Rejected by OTTO", unknown: "Unconfirmed", online: "Published", offline: "Deactivated" };
            const publicationLabel = publication ? publicationLabels[publication.state as keyof typeof publicationLabels] ?? publicationLabels.unknown : "";
            const errorText = publication && Array.isArray(publication.errors) ? publication.errors.map((error) => [error.code, error.title, error.jsonPath].filter(Boolean).join(": ")).join("\n") : "";
            return (
              <div
                key={cell.key}
                className={`wh-sofort-marketplace-matrix__value ${
                  row.cells.length === 1 ? "wh-sofort-marketplace-matrix__value--single " : ""
                }${
                  cell.matches
                    ? "wh-sofort-marketplace-matrix__value--matched"
                    : cell.isBWare
                      ? "wh-sofort-marketplace-matrix__value--b-ware"
                      : active
                        ? "wh-sofort-marketplace-matrix__value--active"
                        : "wh-sofort-marketplace-matrix__value--inactive"
                }`}
                title={[displayValue, publicationLabel, errorText].filter(Boolean).join("\n") || undefined}
              >
                <code aria-label={`${row.market} ${cell.key} ${cell.matches ? props.labels.matched : props.labels.value}`}>
                  {props.highlightText(displayValue, props.query)}
                  {publicationLabel ? <span className="block whitespace-normal text-[10px] font-sans" role="status">{publicationLabel}</span> : null}
                </code>
                <Checkbox
                  className="wh-sofort-marketplace-matrix__checkbox"
                  checked={active}
                  disabled={Boolean(publication) || updatingMarketplace === cell.key}
                  aria-label={`${row.market} ${cell.key} status`}
                  onCheckedChange={(value) => void handleStatusChange(cell.key as MarketplaceStatusKey, value === true)}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});
