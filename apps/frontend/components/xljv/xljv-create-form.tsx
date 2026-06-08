"use client";

import { useRef } from "react";
import { useLabels } from "../../app/use-labels";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { XLJVCreateImages } from "./xljv-create-images";
import { XLJVRubricSelector } from "./xljv-rubric-selector";
import { RubricTreeNode, Site, XLJVCreateFormState } from "./xljv-search-utils";

type XLJVCreateFormProps = {
  site: Site;
  createForm: XLJVCreateFormState;
  createProductSendLoading: boolean;
  createImageUploadLoading: boolean;
  createAllSitesLoading: boolean;
  rubricsLoading: boolean;
  rubrics: RubricTreeNode[];
  selectedRubricIds: number[];
  mainRubricId: number | null;
  deliveryOptions: Array<{ id: number; label: string; is_default?: boolean }>;
  deliveryOptionsLoading: boolean;
  onLoadRubrics: () => Promise<void>;
  onToggleRubric: (id: number) => void;
  onSetMainRubric: (id: number) => void;
  onLoadDeliveryOptions: () => Promise<void>;
  onSetCreateForm: (updater: (prev: XLJVCreateFormState | null) => XLJVCreateFormState | null) => void;
  onCreateImageUpload: (files: FileList | null) => Promise<void>;
  onSendCreatedProduct: () => Promise<void>;
  onSendCreatedProductToAllSites: () => Promise<void>;
};

export function XLJVCreateForm(props: XLJVCreateFormProps) {
  const t = useLabels();
  const {
    site,
    createForm,
    createProductSendLoading,
    createImageUploadLoading,
    createAllSitesLoading,
    rubricsLoading,
    rubrics,
    selectedRubricIds,
    mainRubricId,
    deliveryOptions,
    deliveryOptionsLoading,
    onLoadRubrics,
    onToggleRubric,
    onSetMainRubric,
    onLoadDeliveryOptions,
    onSetCreateForm,
    onCreateImageUpload,
    onSendCreatedProduct,
    onSendCreatedProductToAllSites
  } = props;

  const htmlEditorRef = useRef<HTMLDivElement | null>(null);

  function applyHtmlCommand(command: string, value?: string) {
    if (!htmlEditorRef.current) return;
    htmlEditorRef.current.focus();
    document.execCommand(command, false, value);
    const nextHtml = htmlEditorRef.current.innerHTML || "";
    onSetCreateForm((prev) => (prev ? { ...prev, description_html: nextHtml } : prev));
  }

  function computeJvUvpFromPrice(rawPrice: string): string {
    const price = Number(String(rawPrice || "").replace(",", "."));
    if (!Number.isFinite(price)) return "0.00";
    let value = 0;
    if (price > 5000) value = price * 1.1;
    else if (price >= 2500 && price <= 4999) value = price * 1.18;
    else if (price >= 1000 && price <= 2499) value = price * 1.25;
    else value = price * 1.35;
    return value.toFixed(2);
  }

  const computedJvUvp = site === "JV" ? computeJvUvpFromPrice(createForm.price) : "";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{t.createNewProduct.replace("{site}", site)}</div>
        <Badge variant="secondary">{t.fastCreate}</Badge>
      </div>

      <div className="mb-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.core}</div>
        <div className="grid gap-2 md:grid-cols-2">
          <div><div className="mb-1 text-xs font-semibold">{t.eanFromPool}</div><Input value={createForm.ean} readOnly /></div>
          {site === "JV" ? (
            <div><div className="mb-1 text-xs font-semibold">{t.sourceProductIdHint}</div><Input value={createForm.source_product_id} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, source_product_id: event.target.value } : prev)} /></div>
          ) : (
            <div><div className="mb-1 text-xs font-semibold">OpenCart product_id</div><Input value="auto after send" readOnly /></div>
          )}
          <div>
            <div className="mb-1 text-xs font-semibold">{site === "JV" ? "UVP Price" : t.price}</div>
            <Input
              value={site === "JV" ? computedJvUvp : createForm.price}
              onChange={(event) =>
                onSetCreateForm((prev) =>
                  prev
                    ? site === "JV"
                      ? prev
                      : { ...prev, price: event.target.value }
                    : prev
                )
              }
              readOnly={site === "JV"}
            />
          </div>
          <div><div className="mb-1 text-xs font-semibold">{t.quantity} ({site === "JV" ? t.optional : t.requiredForXl})</div><Input value={createForm.quantity} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, quantity: event.target.value } : prev)} /></div>
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-border bg-card p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.content}</div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="md:col-span-2"><div className="mb-1 text-xs font-semibold">{t.name}</div><Input value={createForm.name} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, name: event.target.value } : prev)} /></div>
          <div className="md:col-span-2">
            <div className="mb-1 text-xs font-semibold">{t.description}</div>
            <Textarea className="min-h-[110px]" value={createForm.description} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, description: event.target.value } : prev)} />
          </div>
          {site === "JV" ? (
            <>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-semibold">Beschreibung (Admin)</div>
                <Textarea
                  className="min-h-[90px]"
                  value={createForm.short_description}
                  onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, short_description: event.target.value } : prev)}
                />
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-semibold">Kurzbeschreibung</div>
                <Textarea
                  className="min-h-[90px]"
                  value={createForm.short_description_real}
                  onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, short_description_real: event.target.value } : prev)}
                />
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-semibold">WYSIWYG Beschreibung (Detailansicht, HTML)</div>
                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap gap-1 border-b border-border p-2">
                    <Button type="button" variant="ghost" onClick={() => applyHtmlCommand("bold")}>B</Button>
                    <Button type="button" variant="ghost" onClick={() => applyHtmlCommand("italic")}>I</Button>
                    <Button type="button" variant="ghost" onClick={() => applyHtmlCommand("underline")}>U</Button>
                    <Button type="button" variant="ghost" onClick={() => applyHtmlCommand("insertUnorderedList")}>- List</Button>
                    <Button type="button" variant="ghost" onClick={() => applyHtmlCommand("insertOrderedList")}>1. List</Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        const url = window.prompt("URL");
                        if (url) applyHtmlCommand("createLink", url);
                      }}
                    >
                      Link
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => applyHtmlCommand("removeFormat")}>Clear</Button>
                  </div>
                  <div
                    ref={htmlEditorRef}
                    className="min-h-[180px] w-full px-3 py-2 text-sm outline-none"
                    contentEditable
                    suppressContentEditableWarning
                    onInput={() =>
                      onSetCreateForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              description_html: htmlEditorRef.current?.innerHTML ?? prev.description_html,
                            }
                          : prev
                      )
                    }
                    dangerouslySetInnerHTML={{ __html: createForm.description_html || "" }}
                  />
                </div>
                <Textarea
                  className="mt-2 min-h-[90px] font-mono text-xs"
                  value={createForm.description_html}
                  onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, description_html: event.target.value } : prev)}
                  placeholder="HTML preview/source"
                />
              </div>
            </>
          ) : null}
          <div><div className="mb-1 text-xs font-semibold">{t.tagSku}</div><Input value={createForm.tag} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, tag: event.target.value } : prev)} /></div>
          <label className="inline-flex items-center gap-2 self-end pb-1 text-sm"><Checkbox checked={createForm.status} onCheckedChange={(value) => onSetCreateForm((prev) => prev ? { ...prev, status: Boolean(value) } : prev)} /><span>{t.statusActive}</span></label>
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-border bg-card p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.seo}</div>
        <div className="grid gap-2 md:grid-cols-2">
          <div><div className="mb-1 text-xs font-semibold">{t.metaTitle}</div><Input value={createForm.meta_title} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, meta_title: event.target.value } : prev)} /></div>
          <div><div className="mb-1 text-xs font-semibold">{t.metaDescription}</div><Input value={createForm.meta_description} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, meta_description: event.target.value } : prev)} /></div>
          <div><div className="mb-1 text-xs font-semibold">{t.metaKeyword}</div><Input value={createForm.meta_keyword} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, meta_keyword: event.target.value } : prev)} /></div>
        </div>
      </div>

      <div className="md:col-span-2 rounded-xl border border-border bg-card p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.advancedFields}</div>
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="source_model" value={createForm.source_model} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, source_model: event.target.value } : prev)} />
          <Input placeholder="source_sku" value={createForm.source_sku} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, source_sku: event.target.value } : prev)} />
          <Input placeholder="source_ean_field" value={createForm.source_ean_field} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, source_ean_field: event.target.value } : prev)} />
          <Input placeholder="date_available YYYY-MM-DD" value={createForm.date_available} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, date_available: event.target.value } : prev)} />
          <Input placeholder="manufacturer_id" value={createForm.manufacturer_id} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, manufacturer_id: event.target.value } : prev)} />
          <Input placeholder="stock_status_id" value={createForm.stock_status_id} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, stock_status_id: event.target.value } : prev)} />
          <Input placeholder="tax_class_id" value={createForm.tax_class_id} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, tax_class_id: event.target.value } : prev)} />
          {site === "XL" ? (
            <>
              <Input placeholder="minimum" value={createForm.minimum} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, minimum: event.target.value } : prev)} />
              <Input placeholder="Konto / points" value={createForm.points} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, points: event.target.value } : prev)} />
              <Input placeholder="sort_order" value={createForm.sort_order} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, sort_order: event.target.value } : prev)} />
              <Input placeholder="SEO-URL" value={createForm.seo_url} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, seo_url: event.target.value } : prev)} />
              <label className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs">
                <Checkbox checked={createForm.shipping} onCheckedChange={(value) => onSetCreateForm((prev) => prev ? { ...prev, shipping: Boolean(value) } : prev)} />
                <span>Lieferung erforderlich</span>
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs">
                <Checkbox checked={createForm.subtract} onCheckedChange={(value) => onSetCreateForm((prev) => prev ? { ...prev, subtract: Boolean(value) } : prev)} />
                <span>Vom Lager abziehen</span>
              </label>
            </>
          ) : null}
          {site === "JV" ? (
            <>
              <Input placeholder="JV URL-Key" value={createForm.jv_urlkey} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, jv_urlkey: event.target.value } : prev)} />
              <Input
                placeholder="JV Price"
                value={createForm.price}
                onChange={(event) =>
                  onSetCreateForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          price: event.target.value,
                          jv_uvp: computeJvUvpFromPrice(event.target.value),
                        }
                      : prev
                  )
                }
              />
              <Input placeholder="JV MwSt-Satz ID (mwstid)" value={createForm.jv_mwstid} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, jv_mwstid: event.target.value } : prev)} />
              <div className="md:col-span-2 rounded-xl border border-border bg-card px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold">Verfugbarkeit (Lieferzeit)</span>
                  <Button type="button" variant="ghost" onClick={() => void onLoadDeliveryOptions()} disabled={deliveryOptionsLoading}>
                    {deliveryOptionsLoading ? "Loading..." : "Refresh"}
                  </Button>
                </div>
                <select
                  className="ui-select w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
                  value={createForm.jv_lieferzeitid || ""}
                  onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, jv_lieferzeitid: event.target.value } : prev)}
                >
                  <option value="">Select delivery option</option>
                  {deliveryOptions.map((option) => (
                    <option key={option.id} value={String(option.id)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <Input placeholder="JV Einheit ID (einheitid)" value={createForm.jv_einheitid} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, jv_einheitid: event.target.value } : prev)} />
              <Input placeholder="JV Grundeinheit ID" value={createForm.jv_grundeinheit} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, jv_grundeinheit: event.target.value } : prev)} />
              <Input placeholder="JV VPE" value={createForm.jv_vpe} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, jv_vpe: event.target.value } : prev)} />
              <Input placeholder="JV Preisbasis (z.B. brutto)" value={createForm.jv_preisbasis} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, jv_preisbasis: event.target.value } : prev)} />
              <Input placeholder="JV Preisfilter (z.B. default)" value={createForm.jv_preisfilter} onChange={(event) => onSetCreateForm((prev) => prev ? { ...prev, jv_preisfilter: event.target.value } : prev)} />
              <label className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs">
                <Checkbox
                  checked={Boolean(createForm.jv_is_sofort)}
                  onCheckedChange={(value) =>
                    onSetCreateForm((prev) => (prev ? { ...prev, jv_is_sofort: Boolean(value) } : prev))
                  }
                />
                <span>is sofort</span>
              </label>
            </>
          ) : null}
          <XLJVCreateImages
            site={site}
            createForm={createForm}
            createImageUploadLoading={createImageUploadLoading}
            labels={{
              uploadImageToFtp: t.uploadImageToFtp,
              uploading: t.uploading,
              uploadedUrlsAutoAdded: t.uploadedUrlsAutoAdded
            }}
            onCreateImageUpload={onCreateImageUpload}
          />
        </div>
        <XLJVRubricSelector
          site={site}
          rubricsLoading={rubricsLoading}
          rubrics={rubrics}
          selectedRubricIds={selectedRubricIds}
          mainRubricId={mainRubricId}
          onLoadRubrics={onLoadRubrics}
          onToggleRubric={onToggleRubric}
          onSetMainRubric={onSetMainRubric}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button type="button" onClick={() => void onSendCreatedProduct()} disabled={createProductSendLoading || createAllSitesLoading || !createForm.name.trim()}>{createProductSendLoading ? t.sending : t.send}</Button>
        <Button type="button" variant="ghost" onClick={() => void onSendCreatedProductToAllSites()} disabled={createProductSendLoading || createAllSitesLoading || !createForm.name.trim()}>{createAllSitesLoading ? t.sendingAll : t.sendToAllSites}</Button>
      </div>
    </div>
  );
}
