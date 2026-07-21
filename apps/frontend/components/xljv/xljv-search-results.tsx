"use client";

import Image from "next/image";
import { useLabels } from "../../app/use-labels";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Textarea } from "../ui/textarea";
import {
  Site,
  SiteLanguageMapPreview,
  XLAllSitesResult,
  XLJVResponse,
  decodeBasicHtmlEntities,
  display,
  looksLikeHtml
} from "./xljv-search-utils";
import { toXljvImageUrl } from "./xljv-image-utils";

type XLJVSearchResultsProps = {
  site: Site;
  allXlResult: XLAllSitesResult | null;
  selectedSiteKeys: string[];
  templateSiteKey: string;
  createOrderLoading: boolean;
  sendSelectedLoading: boolean;
  batchLanguageMapsAttempted: boolean;
  batchLanguageMaps: SiteLanguageMapPreview[];
  orderDraft: {
    name: string;
    description: string;
    tag: string;
    meta_title: string;
    meta_description: string;
    meta_keyword: string;
    default_price: string;
  } | null;
  item: XLJVResponse | null;
  onToggleSelectedSite: (siteKey: string) => void;
  onSetTemplateSiteKey: (siteKey: string) => void;
  onCreateOrder: () => void;
  onCreateOrderDraft: () => Promise<void>;
  onSendToSelectedSites: () => Promise<void>;
  onSetOrderDraft: (next: XLJVSearchResultsProps["orderDraft"]) => void;
};

export function XLJVSearchResults(props: XLJVSearchResultsProps) {
  const t = useLabels();
  const {
    site,
    allXlResult,
    selectedSiteKeys,
    templateSiteKey,
    createOrderLoading,
    sendSelectedLoading,
    batchLanguageMapsAttempted,
    batchLanguageMaps,
    orderDraft,
    item,
    onToggleSelectedSite,
    onSetTemplateSiteKey,
    onCreateOrder,
    onCreateOrderDraft,
    onSendToSelectedSites,
    onSetOrderDraft
  } = props;
  const itemImageUrl = item?.image ? toXljvImageUrl(site, templateSiteKey, item.image) : "";

  return (
    <>
      {allXlResult ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.xljvAllSitesTitle}</CardTitle>
            <CardDescription>
            {t.xljvAllSitesDescription
              .replace("{ean}", allXlResult.query_ean)
              .replace("{foundLabel}", t.found)
              .replace("{foundCount}", String(allXlResult.found_count))
              .replace("{missingLabel}", t.missing)
              .replace("{missingCount}", String(allXlResult.missing_count))}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

          <div className="space-y-2">
            <div className="text-sm font-semibold">{t.found}</div>
            {allXlResult.found.length === 0 ? (
              <div className="text-sm text-slate-500">{t.noMatchesInConfiguredSites}</div>
            ) : (
              <div className="rounded-xl border border-border">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.use}</TableHead>
                      <TableHead>{t.template}</TableHead>
                      <TableHead>{t.site}</TableHead>
                      <TableHead>{t.siteKey}</TableHead>
                      <TableHead>{t.productId}</TableHead>
                      <TableHead>{t.ean}</TableHead>
                      <TableHead>{t.price}</TableHead>
                      <TableHead>{t.currency}</TableHead>
                      <TableHead>{t.title}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allXlResult.found.map((row) => (
                      <TableRow key={`${row.site_key}-${row.product_id}`}>
                        <TableCell>
                          <Checkbox checked={selectedSiteKeys.includes(row.site_key)} onCheckedChange={() => onToggleSelectedSite(row.site_key)} aria-label={t.xljvUseSiteKeyAria.replace("{siteKey}", row.site_key)} />
                        </TableCell>
                        <TableCell>
                          <input className="ui-radio focus-ring" type="radio" name="template-site" checked={templateSiteKey === row.site_key} onChange={() => onSetTemplateSiteKey(row.site_key)} />
                        </TableCell>
                        <TableCell>{row.domain}</TableCell>
                        <TableCell>{row.site_key}</TableCell>
                        <TableCell>{row.product_id}</TableCell>
                        <TableCell>{row.ean}</TableCell>
                        <TableCell>{display(row.price)}</TableCell>
                        <TableCell>{row.currency_code || "-"}</TableCell>
                        <TableCell>{row.title || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">{t.notFoundOrNotConfigured}</div>
            {allXlResult.missing.length === 0 ? (
              <div className="text-sm text-slate-500">{t.allConfiguredSitesHaveProduct}</div>
            ) : (
              <div className="rounded-xl border border-border">
                <Table className="min-w-[620px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.site}</TableHead>
                      <TableHead>{t.siteKey}</TableHead>
                      <TableHead>{t.reason}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allXlResult.missing.map((row) => (
                      <TableRow key={`${row.site_key}-${row.reason}`}>
                        <TableCell>{row.domain}</TableCell>
                        <TableCell>{row.site_key}</TableCell>
                        <TableCell>{row.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onCreateOrder} disabled={allXlResult.found.length === 0 || !templateSiteKey}>{t.createOrder}</Button>
            <Button type="button" variant="ghost" onClick={() => void onCreateOrderDraft()} disabled={createOrderLoading || allXlResult.found.length === 0}>
              {createOrderLoading ? t.creating : t.createBatchDraft}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void onSendToSelectedSites()} disabled={sendSelectedLoading || !orderDraft}>
              {sendSelectedLoading ? t.sending : t.sendToSelectedSites}
            </Button>
            <Badge variant="secondary" className="self-center">{t.selected}: {selectedSiteKeys.length} | {t.template}: {templateSiteKey || "-"}</Badge>
          </div>
          {batchLanguageMapsAttempted ? (
            <div className="rounded-xl border p-3">
              <div className="mb-2 text-sm font-semibold">{t.languageMappingBySite}</div>
              {batchLanguageMaps.length === 0 ? (
                <div className="text-sm text-[color:var(--text-muted)]">{t.mappingNotReturned}</div>
              ) : (
                <div className="space-y-3">
                  {batchLanguageMaps.map((row) => (
                    <div key={`lang-map-search-${row.siteKey || row.domain}`} className="rounded-xl border p-2">
                      <div className="text-sm font-semibold">{row.siteKey || row.domain}{row.domain ? ` (${row.domain})` : ""}</div>
                      <div className="text-xs text-[color:var(--text-muted)]">{t.targetLocale}: {row.targetLocale || "-"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          </CardContent>
        </Card>
      ) : null}

      {orderDraft ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.orderDraft}</CardTitle>
            <CardDescription>{t.template}: {templateSiteKey || "-"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div><div className="mb-1 text-xs font-medium">{t.defaultPrice}</div><Input value={orderDraft.default_price} onChange={(event) => onSetOrderDraft({ ...orderDraft, default_price: event.target.value })} /></div>
            <div><div className="mb-1 text-xs font-medium">{t.name}</div><Input value={orderDraft.name} onChange={(event) => onSetOrderDraft({ ...orderDraft, name: event.target.value })} /></div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs font-medium">{t.description}</div>
              <Textarea className="min-h-[140px]" value={orderDraft.description} onChange={(event) => onSetOrderDraft({ ...orderDraft, description: event.target.value })} />
            </div>
          </div>
          </CardContent>
        </Card>
      ) : null}

      {item ? (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t.main}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid min-w-0 gap-2 text-sm md:grid-cols-2">
              <div><span className="font-semibold">{t.id}:</span> {display(item.id)}</div>
              <div><span className="font-semibold">{t.site}:</span> {display(item.site)}</div>
              <div><span className="font-semibold">{t.ean}:</span> {display(item.ean)}</div>
              <div><span className="font-semibold">{t.sourceProductId}:</span> {display(item.source_product_id)}</div>
            </div>
            {itemImageUrl ? (
              <Image src={itemImageUrl} alt={t.productMainImage} width={512} height={256} unoptimized className="max-h-64 rounded-xl border" />
            ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.descriptions} ({item.descriptions?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
            {(item.descriptions ?? []).map((desc, index) => (
              <div key={`${desc.language_id ?? "lang"}-${index}`} className="rounded-xl border p-3 text-sm space-y-1">
                <div><span className="font-semibold">{t.languageId}:</span> {display(desc.language_id)}</div>
                <div><span className="font-semibold">{t.name}:</span> {display(desc.name)}</div>
                <div className="space-y-1">
                  <span className="font-semibold">{t.description}:</span>
                  {(() => {
                    const decoded = decodeBasicHtmlEntities(String(desc.description ?? ""));
                    if (!decoded) return <div className="text-slate-500">-</div>;
                    if (!looksLikeHtml(decoded)) return <div className="whitespace-pre-wrap break-words">{decoded}</div>;
                    return <ScrollArea className="max-h-64 w-full rounded-xl border p-2 text-sm"><div dangerouslySetInnerHTML={{ __html: decoded }} /></ScrollArea>;
                  })()}
                </div>
              </div>
            ))}
            </CardContent>
          </Card>
          {site === "JV" && item.jv_fields ? (
            <Card>
              <CardHeader><CardTitle>{t.jvFields}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
              <div className="grid min-w-0 gap-2 text-sm md:grid-cols-2">
                <div><span className="font-semibold">{t.articleId}:</span> {display(item.jv_fields.artikelid)}</div>
                <div><span className="font-semibold">{t.articleNumber}:</span> {display(item.jv_fields.artikelnr)}</div>
              </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
