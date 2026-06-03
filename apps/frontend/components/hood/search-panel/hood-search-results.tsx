"use client";

import Image from "next/image";
import { useLabels } from "../../../app/use-labels";
import { HoodItem, buildIframeSrcDoc, containsHtmlMarkup, decodeHtmlEntities, htmlToPlainText, prettyJson } from "../hood-search-utils";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { ScrollArea } from "../../ui/scroll-area";

export function HoodSearchResults({ items, externalPayload }: { items: HoodItem[]; externalPayload: unknown }) {
  const t = useLabels();
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const decodedDescription = decodeHtmlEntities(item.description || "");
        const hasHtmlDescription = containsHtmlMarkup(decodedDescription);
        const plainDescription = hasHtmlDescription ? "" : htmlToPlainText(item.description || "");
        return (
          <Card key={`${item.item_id}-${item.ean}`}>
            <CardHeader>
              <CardTitle>{item.title || "-"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">EAN: {item.ean || "-"} | {t.itemId}: {item.item_id || "-"}</div>
              {hasHtmlDescription ? (
                <iframe title={`hood-description-${item.item_id || item.ean}`} srcDoc={buildIframeSrcDoc(decodedDescription)} sandbox="allow-same-origin allow-popups allow-forms" className="h-[620px] w-full rounded-xl border border-border bg-background" />
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{plainDescription || "-"}</p>
              )}
              {Array.isArray(item.images) && item.images.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {item.images.map((imageUrl, index) => (
                    <a key={`${item.item_id}-${index}-${imageUrl}`} href={imageUrl} target="_blank" rel="noreferrer">
                      <Image src={imageUrl} alt={`${item.title || t.hoodImage} ${index + 1}`} width={240} height={112} unoptimized className="h-28 w-full rounded object-cover" />
                    </a>
                  ))}
                </div>
              ) : item.image ? (
                <a href={item.image} target="_blank" rel="noreferrer" className="inline-block">
                  <Image src={item.image} alt={item.title || t.hoodImage} width={160} height={160} unoptimized className="h-40 w-40 rounded object-cover" />
                </a>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
      {externalPayload ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.allFieldsJson}</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[420px] rounded-xl border border-border p-3">
              <pre className="max-w-full whitespace-pre-wrap break-words text-xs text-muted-foreground">{prettyJson(externalPayload)}</pre>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

