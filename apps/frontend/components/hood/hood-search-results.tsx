"use client";

import Image from "next/image";
import { useLabels } from "../../app/use-labels";
import { Card } from "../shared/card";
import {
  HoodItem,
  buildIframeSrcDoc,
  containsHtmlMarkup,
  decodeHtmlEntities,
  htmlToPlainText,
  prettyJson
} from "./hood-search-utils";

type HoodSearchResultsProps = {
  items: HoodItem[];
  externalPayload: unknown;
};

export function HoodSearchResults({ items, externalPayload }: HoodSearchResultsProps) {
  const t = useLabels();
  return (
    <div className="grid gap-4">
      {items.map((item) => {
        const decodedDescription = decodeHtmlEntities(item.description || "");
        const hasHtmlDescription = containsHtmlMarkup(decodedDescription);
        const plainDescription = hasHtmlDescription ? "" : htmlToPlainText(item.description || "");
        return (
          <Card key={`${item.item_id}-${item.ean}`} className="min-w-0 space-y-3 overflow-hidden">
            <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
              EAN: {item.ean || "-"} | {t.itemId}: {item.item_id || "-"}
            </div>
            <h3 className="text-base font-semibold text-[color:var(--text-primary)]">{item.title || "-"}</h3>

            {hasHtmlDescription ? (
              <iframe
                title={`hood-description-${item.item_id || item.ean}`}
                srcDoc={buildIframeSrcDoc(decodedDescription)}
                sandbox="allow-same-origin allow-popups allow-forms"
                className="h-[620px] w-full max-w-full rounded border border-border bg-card"
              />
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm text-[color:var(--text-secondary)]">
                {plainDescription || "-"}
              </p>
            )}

            {Array.isArray(item.images) && item.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {item.images.map((imageUrl, index) => (
                  <a key={`${item.item_id}-${index}-${imageUrl}`} href={imageUrl} target="_blank" rel="noreferrer">
                    <Image
                      src={imageUrl}
                      alt={`${item.title || t.hoodImage} ${index + 1}`}
                      width={240}
                      height={112}
                      unoptimized
                      className="h-28 w-full rounded object-cover"
                    />
                  </a>
                ))}
              </div>
            ) : item.image ? (
              <a href={item.image} target="_blank" rel="noreferrer" className="inline-block">
                <Image
                  src={item.image}
                  alt={item.title || t.hoodImage}
                  width={160}
                  height={160}
                  unoptimized
                  className="h-40 w-40 rounded object-cover"
                />
              </a>
            ) : null}
          </Card>
        );
      })}

      {externalPayload ? (
        <Card className="space-y-2">
          <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.allFieldsJson}</div>
          <pre className="max-h-[420px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded bg-[color:var(--surface-container)] p-3 text-xs text-[color:var(--text-secondary)]">
            {prettyJson(externalPayload)}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
