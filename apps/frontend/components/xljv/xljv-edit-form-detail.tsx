"use client";

import { Dispatch, SetStateAction, useMemo, useState } from "react";
import { Bold, Italic, Link, List, Redo2, Table, Undo2 } from "lucide-react";
import { Card } from "../shared/card";
import { Button } from "../shared/button";
import { FormField } from "../shared/form-field";
import { Input } from "../shared/input";
import { Textarea } from "../shared/textarea";
import { RubricTreeNode, Site, XLJVProduct, toNumberOrNull } from "./xljv-edit-utils";
import {
  JvContent,
  SectionHeader,
  ToggleField,
  toggleInactive,
  toggleIsSofort,
  updateJvField
} from "./xljv-edit-form-shared";

type CommonProps = {
  form: XLJVProduct;
  site: Site;
  setForm: Dispatch<SetStateAction<XLJVProduct | null>>;
  computedUvp: string;
  getJvContent: (languageCode: string) => JvContent;
  setJvContentField: (languageCode: string, field: string, value: string) => void;
};

type DeliveryProps = {
  deliveryOptions: Array<{ id: number; label: string; is_default?: boolean }>;
  deliveryOptionsLoading: boolean;
};

function toIntegerDigits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function normalizePreviewHtml(html: string): string {
  if (!html) return "";
  const fallbackHost = "https://varvara.de";
  return html
    .replace(/%HOST%/g, fallbackHost)
    .replace(/\s(src|href)=["']\/(?!\/)/gi, ` $1="${fallbackHost}/`);
}

export function JVFieldsCard({ t, form, setForm, deliveryOptions, deliveryOptionsLoading }: CommonProps & DeliveryProps & { t: Record<string, string> }) {
  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <SectionHeader title={t.xljvJvFieldsTitle} badge={t.xljvJvMarketplaceBadge} description={t.xljvJvFieldsHint} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FormField label={t.xljvDeliveryTimeShort}>
            {(p) => (
              <select {...p} className="ui-select h-11 w-full rounded-xl border border-[color:var(--outline)] bg-[color:var(--panel)] px-3 text-sm" value={String(form.jv_fields?.lieferzeitid ?? "")} onChange={(event) => updateJvField(setForm, "lieferzeitid", event.target.value)}>
                <option value="">{t.xljvSelectDeliveryTime}</option>
                {deliveryOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            )}
          </FormField>
        </div>
        <ToggleField label={t.xljvIsSofort} checked={Boolean(form.jv_fields?.is_sofort)} onChange={() => toggleIsSofort(setForm)} />
        <ToggleField label={t.xljvInActive} checked={Number(form.jv_fields?.inaktiv ?? 0) !== 1} onChange={() => toggleInactive(setForm)} />
        {deliveryOptionsLoading ? <div className="text-xs text-[color:var(--text-muted)]">{t.xljvLoadingDeliveryOptions}</div> : null}
      </div>
    </Card>
  );
}

export function MainFieldsCard({ t, form, site, setForm, computedUvp, getJvContent, setJvContentField }: CommonProps & { t: Record<string, string> }) {
  const isJv = site === "JV";
  const primaryDescription = (form.descriptions || [])[0] || {};
  function updateXlDescription(field: "name" | "description" | "tag" | "meta_title" | "meta_description" | "meta_keyword", value: string) {
    setForm((current) => {
      if (!current) return current;
      const rows = [...(current.descriptions || [])];
      const first = rows[0] || { language_id: 1 };
      rows[0] = { ...first, [field]: value };
      return { ...current, descriptions: rows };
    });
  }
  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <SectionHeader title={t.mainFields} badge={t.core} description={t.xljvMainFieldsHint} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FormField label={isJv ? t.xljvNameDe : t.name}>
            {(p) => (
              <Input
                {...p}
                value={isJv ? (getJvContent("de").name || "") : (primaryDescription.name || "")}
                onChange={(event) =>
                  isJv
                    ? setJvContentField("de", "name", event.target.value)
                    : updateXlDescription("name", event.target.value)
                }
              />
            )}
          </FormField>
        </div>
        <FormField label={t.price}>
          {(p) => (
            <Input
              {...p}
              inputMode={isJv ? "numeric" : "decimal"}
              pattern={isJv ? "[0-9]*" : undefined}
              value={String(form.price ?? "")}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? { ...current, price: isJv ? toIntegerDigits(event.target.value) : event.target.value.replace(",", ".") }
                    : current
                )
              }
            />
          )}
        </FormField>
        {isJv ? <FormField label={t.xljvUvpPrice}>{(p) => <Input {...p} value={computedUvp} readOnly disabled />}</FormField> : null}
        <FormField label={t.ean}>{(p) => <Input {...p} value={isJv ? (form.jv_fields?.ean || form.ean || "") : (form.source_ean_field || form.ean || "")} readOnly />}</FormField>
        {isJv ? (
          <FormField label={t.articleNumber}>{(p) => <Input {...p} value={form.jv_fields?.artikelnr || ""} onChange={(event) => updateJvField(setForm, "artikelnr", event.target.value)} />}</FormField>
        ) : null}
        <FormField label={isJv ? t.sku : t.sourceSku}>{(p) => <Input {...p} value={form.source_sku || ""} onChange={(event) => setForm((current) => current ? { ...current, source_sku: event.target.value } : current)} />}</FormField>
        <FormField label={t.xljvManufacturerId}>{(p) => <Input {...p} value={String(form.manufacturer_id ?? "")} onChange={(event) => setForm((current) => current ? { ...current, manufacturer_id: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
        <FormField label={isJv ? t.xljvModel : t.xljvOpenCartModel}>{(p) => <Input {...p} value={form.source_model || ""} onChange={(event) => setForm((current) => current ? { ...current, source_model: event.target.value } : current)} />}</FormField>
        {isJv ? <FormField label={t.sourceSku}>{(p) => <Input {...p} value={form.source_sku || ""} onChange={(event) => setForm((current) => current ? { ...current, source_sku: event.target.value } : current)} />}</FormField> : null}
        {!isJv ? (
          <>
            <FormField label={t.sourceEanField}>{(p) => <Input {...p} value={form.source_ean_field || ""} onChange={(event) => setForm((current) => current ? { ...current, source_ean_field: event.target.value } : current)} />}</FormField>
            <FormField label={t.quantity}>{(p) => <Input {...p} value={String(form.quantity ?? "")} onChange={(event) => setForm((current) => current ? { ...current, quantity: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
            <FormField label={t.stockStatusId}>{(p) => <Input {...p} value={String(form.stock_status_id ?? "")} onChange={(event) => setForm((current) => current ? { ...current, stock_status_id: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
            <FormField label={t.taxClassId}>{(p) => <Input {...p} value={String(form.tax_class_id ?? "")} onChange={(event) => setForm((current) => current ? { ...current, tax_class_id: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
            <FormField label={t.xljvMinimum}>{(p) => <Input {...p} value={String(form.minimum ?? "")} onChange={(event) => setForm((current) => current ? { ...current, minimum: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
            <FormField label={t.xljvPoints}>{(p) => <Input {...p} value={String(form.points ?? "")} onChange={(event) => setForm((current) => current ? { ...current, points: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
            <FormField label={t.xljvSortOrder}>{(p) => <Input {...p} value={String(form.sort_order ?? "")} onChange={(event) => setForm((current) => current ? { ...current, sort_order: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
            <FormField label={t.xljvSeoUrl}>{(p) => <Input {...p} value={form.seo_url || ""} onChange={(event) => setForm((current) => current ? { ...current, seo_url: event.target.value } : current)} />}</FormField>
            <FormField label={t.dateAvailable}>{(p) => <Input {...p} value={form.date_available || ""} onChange={(event) => setForm((current) => current ? { ...current, date_available: event.target.value } : current)} />}</FormField>
            <FormField label={t.updateUser}>{(p) => <Input {...p} value={form.update_user || ""} onChange={(event) => setForm((current) => current ? { ...current, update_user: event.target.value } : current)} />}</FormField>
            <ToggleField label={t.xljvDeliveryRequired} checked={form.shipping ?? true} onChange={() => setForm((current) => current ? { ...current, shipping: !(current.shipping ?? true) } : current)} />
            <ToggleField label={t.xljvSubtractFromStock} checked={form.subtract ?? true} onChange={() => setForm((current) => current ? { ...current, subtract: !(current.subtract ?? true) } : current)} />
            <ToggleField label={t.status} checked={Boolean(form.status)} onChange={() => setForm((current) => current ? { ...current, status: !Boolean(current.status) } : current)} />
          </>
        ) : null}
      </div>
    </Card>
  );
}

export function DescriptionsCard({
  t,
  form,
  site,
  setForm,
  getJvContent,
  setJvContentField
}: {
  t: Record<string, string>;
  form: XLJVProduct;
  site: Site;
  setForm: Dispatch<SetStateAction<XLJVProduct | null>>;
  getJvContent: (languageCode: string) => JvContent;
  setJvContentField: (languageCode: string, field: string, value: string) => void;
}) {
  const [contentMode, setContentMode] = useState<"html" | "preview">("preview");
  const isJv = site === "JV";
  const languageCode = "de";
  const content = getJvContent(languageCode);
  const primaryDescription = (form.descriptions || [])[0] || { language_id: 1 };
  function updateXlDescription(field: "name" | "description" | "tag" | "meta_title" | "meta_description" | "meta_keyword", value: string) {
    setForm((current) => {
      if (!current) return current;
      const rows = [...(current.descriptions || [])];
      const first = rows[0] || { language_id: 1 };
      rows[0] = { ...first, [field]: value };
      return { ...current, descriptions: rows };
    });
  }
  const toolbar = [Bold, Italic, List, Link, Table, Undo2, Redo2];
  if (!isJv) {
    return (
      <Card className="rounded-xl p-5 shadow-sm">
        <SectionHeader title={t.xljvOpenCartDescriptionsTitle} badge={t.xljvXlContentBadge} description={t.xljvOpenCartDescriptionsHint} />
        <div className="space-y-4">
          <FormField label={t.languageId}>{(p) => <Input {...p} value={String(primaryDescription.language_id ?? 1)} readOnly />}</FormField>
          <FormField label={t.name}>{(p) => <Input {...p} value={primaryDescription.name || ""} onChange={(event) => updateXlDescription("name", event.target.value)} />}</FormField>
          <FormField label={t.description}>
            {(p) => <Textarea {...p} className="min-h-[280px] font-mono text-xs" value={primaryDescription.description || ""} onChange={(event) => updateXlDescription("description", event.target.value)} />}
          </FormField>
          <FormField label={t.tagSku}>{(p) => <Input {...p} value={primaryDescription.tag || ""} onChange={(event) => updateXlDescription("tag", event.target.value)} />}</FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label={t.metaTitle}>{(p) => <Input {...p} value={primaryDescription.meta_title || ""} onChange={(event) => updateXlDescription("meta_title", event.target.value)} />}</FormField>
            <FormField label={t.metaDescription}>{(p) => <Input {...p} value={primaryDescription.meta_description || ""} onChange={(event) => updateXlDescription("meta_description", event.target.value)} />}</FormField>
            <FormField label={t.metaKeyword}>{(p) => <Input {...p} value={primaryDescription.meta_keyword || ""} onChange={(event) => updateXlDescription("meta_keyword", event.target.value)} />}</FormField>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <SectionHeader title={t.xljvDescriptionsTitle} badge={t.xljvContentBadge} description={t.xljvDescriptionsHint} />
      <div className="mb-4 inline-flex rounded-xl border border-[color:var(--outline)] p-1">
        <button
          type="button"
          className={`rounded-xl px-3 py-1.5 text-sm ${contentMode === "html" ? "bg-[color:rgba(129,135,255,0.14)] text-[color:var(--primary)]" : "text-[color:var(--text-secondary)]"}`}
          onClick={() => setContentMode("html")}
        >
          {t.html}
        </button>
        <button
          type="button"
          className={`rounded-xl px-3 py-1.5 text-sm ${contentMode === "preview" ? "bg-[color:rgba(129,135,255,0.14)] text-[color:var(--primary)]" : "text-[color:var(--text-secondary)]"}`}
          onClick={() => setContentMode("preview")}
        >
          {t.xljvPreviewTab}
        </button>
      </div>
      <div className="space-y-4">
        <FormField label={t.xljvUrlKey}>
          {(p) => (
            <Input
              {...p}
              value={form.jv_fields?.urlkey || ""}
              onChange={(event) => updateJvField(setForm, "urlkey", event.target.value)}
            />
          )}
        </FormField>
        <FormField label={t.xljvShortDescriptionDe}>{(p) => <Textarea {...p} className="min-h-[120px]" value={content.kurzbeschreibung || content.short_description_real || ""} onChange={(event) => { setJvContentField(languageCode, "kurzbeschreibung", event.target.value); setJvContentField(languageCode, "short_description_real", event.target.value); }} />}</FormField>
        <FormField label={t.xljvDescriptionLong}>
          {(p) => (
            contentMode === "html" ? (
              <Textarea
                {...p}
                className="min-h-[320px] font-mono text-xs"
                value={content.bezeichnung || content.short_description || ""}
                onChange={(event) => { setJvContentField(languageCode, "bezeichnung", event.target.value); setJvContentField(languageCode, "short_description", event.target.value); }}
              />
            ) : (
              <div className="min-h-[320px] rounded-xl border border-[color:var(--outline)] bg-[color:var(--panel)] p-4 text-sm leading-6">
                {(content.bezeichnung || content.short_description) ? (
                  <div dangerouslySetInnerHTML={{ __html: normalizePreviewHtml(content.bezeichnung || content.short_description || "") }} />
                ) : (
                  <span className="text-[color:var(--text-muted)]">{t.xljvNoPreviewContent}</span>
                )}
              </div>
            )
          )}
        </FormField>
        <FormField label={t.xljvWysiwygDetailView}>
          {(p) => (
            <div className="overflow-hidden rounded-xl border border-[color:var(--outline)] bg-[color:var(--panel)]">
              <div className="flex flex-wrap gap-1 border-b border-[color:var(--outline)] px-3 py-2">
                {toolbar.map((Icon, index) => (
                  <button key={index} type="button" className="rounded-xl p-2 text-[color:var(--text-secondary)] hover:bg-[color:rgba(129,135,255,0.1)]" aria-label={t.xljvEditorToolAria.replace("{index}", String(index + 1))} disabled>
                    <Icon size={15} aria-hidden="true" />
                  </button>
                ))}
              </div>
              {contentMode === "html" ? (
                <Textarea
                  {...p}
                  className="min-h-[280px] rounded-none border-0 font-mono text-xs"
                  value={content.description || ""}
                  onChange={(event) => setJvContentField(languageCode, "description", event.target.value)}
                />
              ) : (
                <div className="min-h-[280px] overflow-auto p-4 text-sm leading-6">
                  {content.description ? (
                    <div dangerouslySetInnerHTML={{ __html: normalizePreviewHtml(content.description) }} />
                  ) : (
                    <span className="text-[color:var(--text-muted)]">{t.xljvNoPreviewContent}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </FormField>
      </div>
    </Card>
  );
}

export function RubricAssignmentCard({
  t,
  rubricsLoading,
  onReloadRubrics,
  rubricsTree,
  selectedRubricIds,
  mainRubricId,
  onToggleRubric,
  onSetMainRubric
}: {
  t: Record<string, string>;
  rubricsLoading: boolean;
  onReloadRubrics: () => Promise<void>;
  rubricsTree: RubricTreeNode[];
  selectedRubricIds: number[];
  mainRubricId: number | null | undefined;
  onToggleRubric: (id: number) => void;
  onSetMainRubric: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredTree = useMemo(() => {
    function matchNode(node: RubricTreeNode): RubricTreeNode | null {
      const name = String(node.name || "").toLowerCase();
      const code = String(node.id || "");
      const isSelected = selectedRubricIds.includes(node.id);
      const searchMatch =
        !normalizedSearch || name.includes(normalizedSearch) || code.includes(normalizedSearch);

      const children = (node.children || [])
        .map((child) => matchNode(child))
        .filter(Boolean) as RubricTreeNode[];

      const shouldIncludeBySearch = searchMatch || children.length > 0;
      const shouldIncludeBySelection = !selectedOnly || isSelected || children.length > 0;
      if (!shouldIncludeBySearch || !shouldIncludeBySelection) return null;
      return { ...node, children };
    }

    return rubricsTree
      .map((node) => matchNode(node))
      .filter(Boolean) as RubricTreeNode[];
  }, [normalizedSearch, selectedOnly, rubricsTree, selectedRubricIds]);

  const matchedCount = useMemo(() => {
    let count = 0;
    function walk(nodes: RubricTreeNode[]) {
      for (const node of nodes) {
        count += 1;
        if (node.children?.length) walk(node.children);
      }
    }
    walk(filteredTree);
    return count;
  }, [filteredTree]);

  function renderNode(node: RubricTreeNode, level = 0) {
    const checked = selectedRubricIds.includes(node.id);
    return (
      <div key={node.id}>
        <label className="mb-1 flex items-center gap-2 text-sm" style={{ paddingLeft: `${level * 18}px` }}>
          <input type="checkbox" checked={checked} onChange={() => onToggleRubric(node.id)} />
          <span className="truncate">{node.name}</span>
          <span className="text-[10px] text-[color:var(--text-muted)]">({node.id})</span>
          {checked ? <input type="radio" name="main-rubric-edit" checked={Number(mainRubricId) === node.id} onChange={() => onSetMainRubric(node.id)} title={t.xljvMainRubric} /> : null}
        </label>
        {node.children?.length ? node.children.map((child) => renderNode(child, level + 1)) : null}
      </div>
    );
  }

  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <SectionHeader title={t.xljvRubricAssignmentTitle} badge={t.xljvCategoriesBadge} description={t.xljvRubricAssignmentHint} />
      <div className="mb-3 space-y-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.xljvSearchCategoryPlaceholder}
          className="h-10 w-full"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" className="h-10 whitespace-nowrap px-4" onClick={() => void onReloadRubrics()} disabled={rubricsLoading}>
            {rubricsLoading ? t.loading : t.xljvLoadRubrics}
          </Button>
          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--outline)] px-3 text-sm">
            <input type="checkbox" checked={selectedOnly} onChange={() => setSelectedOnly((v) => !v)} />
            {t.xljvSelectedOnly}
          </label>
          <div className="h-10 rounded-xl border border-[color:var(--outline)] px-3 text-sm leading-10 text-[color:var(--text-secondary)]">
            {t.xljvItemsCount.replace("{count}", String(matchedCount))}
          </div>
        </div>
      </div>
      {rubricsLoading ? <div className="text-sm text-[color:var(--text-muted)]">{t.xljvLoadingRubrics}</div> : null}
      {!rubricsLoading && rubricsTree.length === 0 ? <div className="text-sm text-[color:var(--text-muted)]">{t.xljvNoRubricsLoaded}</div> : null}
      {!rubricsLoading && rubricsTree.length > 0 && filteredTree.length === 0 ? (
        <div className="text-sm text-[color:var(--text-muted)]">{t.xljvNoCategoriesMatchFilter}</div>
      ) : null}
      {!rubricsLoading ? <div className="max-h-[520px] overflow-auto rounded-xl border border-[color:var(--outline)] p-3">{filteredTree.map((node) => renderNode(node))}</div> : null}
    </Card>
  );
}
