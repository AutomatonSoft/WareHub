"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { xljvGetDeliveryOptions, xljvGetRubricsTree } from "../../components/xljv/xljv-api";
import { Input } from "../../components/ui/input";
import { useLabels } from "../use-labels";

const SITES = [
  { key: "JV_DE", label: "JV DE" },
  { key: "JV_AT", label: "JV AT" },
  { key: "JV_CH", label: "JV CH" },
  { key: "JV_CO_UK", label: "JV UK" },
] as const;

type SiteKey = (typeof SITES)[number]["key"];
type RubricNode = { id: number; parent_id?: number; name?: string; children?: RubricNode[] };
type DeliveryOption = { id: number; lieferzeitid?: number; label?: string; is_default?: boolean };

export type JvPublishingSelections = {
  rubricIdsBySite: Partial<Record<SiteKey, number[]>>;
  mainRubricIdBySite: Partial<Record<SiteKey, number | null>>;
  deliveryIdsBySite: Partial<Record<SiteKey, number[]>>;
};

type Props = {
  sourceSiteKey?: string;
  sourceCategories: Array<{ category_id: number; main_category: boolean }>;
  sourceDeliveryId?: number;
  initialSelections?: JvPublishingSelections;
  initialSelectionKey?: string;
  onSelectionsChange: (selections: JvPublishingSelections) => void;
};

function normalizeTree(payload: unknown): RubricNode[] {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(record.items) ? record.items : Array.isArray(record.tree) ? record.tree : Array.isArray(payload) ? payload : [];
  const nodes: RubricNode[] = rows.map((row): RubricNode | null => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const id = Number(item.id ?? item.category_id);
    return Number.isFinite(id) && id > 0 ? { id, parent_id: Number(item.parent_id ?? 0), name: String(item.name ?? `Category ${id}`), children: [] } : null;
  }).filter((node): node is RubricNode => node !== null);
  if (nodes.some((node) => node.parent_id)) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const childIds = new Set<number>();
    for (const node of nodes) {
      const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
      if (parent && parent !== node) { parent.children?.push(node); childIds.add(node.id); }
    }
    return nodes.filter((node) => !childIds.has(node.id));
  }
  return nodes;
}

function filterTree(nodes: RubricNode[], query: string, selectedOnly: boolean, selected: Set<number>): RubricNode[] {
  if (selectedOnly) {
    const byId = new Map<number, RubricNode>();
    const visit = (items: RubricNode[]) => items.forEach((item) => { byId.set(item.id, item); visit(item.children ?? []); });
    visit(nodes);
    return Array.from(selected).map((id) => byId.get(id) ?? { id, name: `Category ${id}` }).filter((node) => !query || String(node.name).toLowerCase().includes(query) || String(node.id).includes(query)).map((node) => ({ ...node, children: [] }));
  }
  if (!query) return nodes;
  return nodes.flatMap((node) => {
    const children = filterTree(node.children ?? [], query, false, selected);
    const matches = String(node.name).toLowerCase().includes(query) || String(node.id).includes(query);
    return matches || children.length ? [{ ...node, children }] : [];
  });
}

export function JvPublishingOptionsPanel({ sourceSiteKey, sourceCategories, sourceDeliveryId, initialSelections, initialSelectionKey, onSelectionsChange }: Props) {
  const t = useLabels();
  const callbackRef = useRef(onSelectionsChange);
  const [trees, setTrees] = useState<Partial<Record<SiteKey, RubricNode[]>>>({});
  const [deliveries, setDeliveries] = useState<Partial<Record<SiteKey, DeliveryOption[]>>>({});
  const [rubricSite, setRubricSite] = useState<SiteKey>("JV_DE");
  const [deliverySite, setDeliverySite] = useState<SiteKey>("JV_DE");
  const [expanded, setExpanded] = useState<Partial<Record<SiteKey, Set<number>>>>({});
  const [rubricIds, setRubricIds] = useState<Partial<Record<SiteKey, Set<number>>>>({});
  const [mainIds, setMainIds] = useState<Partial<Record<SiteKey, number | null>>>({});
  const [deliveryIds, setDeliveryIds] = useState<Partial<Record<SiteKey, Set<number>>>>({});
  const [rubricQuery, setRubricQuery] = useState("");
  const [deliveryQuery, setDeliveryQuery] = useState("");
  const [selectedRubricsOnly, setSelectedRubricsOnly] = useState(false);
  const [selectedDeliveryOnly, setSelectedDeliveryOnly] = useState(false);
  const [isSelectionInitialized, setIsSelectionInitialized] = useState(false);
  const initializedSelectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    callbackRef.current = onSelectionsChange;
  }, [onSelectionsChange]);

  useEffect(() => {
    void Promise.allSettled(SITES.map(async (site) => {
      const result = await xljvGetRubricsTree({ site: "JV", siteKey: site.key, language: "de" });
      if (!result.response.ok) throw new Error(String(result.response.status));
      return [site.key, normalizeTree(result.payload)] as const;
    })).then((results) => setTrees((current) => ({ ...current, ...Object.fromEntries(results.filter((result): result is PromiseFulfilledResult<readonly [SiteKey, RubricNode[]]> => result.status === "fulfilled").map((result) => result.value)) })));
    void Promise.allSettled(SITES.map(async (site) => {
      const result = await xljvGetDeliveryOptions({ site: "JV", siteKey: site.key, language: "de" });
      if (!result.response.ok) throw new Error(String(result.response.status));
      return [site.key, Array.isArray(result.payload.items) ? result.payload.items as DeliveryOption[] : []] as const;
    })).then((results) => setDeliveries((current) => ({ ...current, ...Object.fromEntries(results.filter((result): result is PromiseFulfilledResult<readonly [SiteKey, DeliveryOption[]]> => result.status === "fulfilled").map((result) => result.value)) })));
  }, []);

  useEffect(() => {
    const site = SITES.find((item) => item.key === String(sourceSiteKey ?? "").trim().toUpperCase());
    if (!site) return;
    if (initialSelections) {
      if (initializedSelectionKeyRef.current === initialSelectionKey) return;
      initializedSelectionKeyRef.current = initialSelectionKey ?? null;
      setRubricIds(Object.fromEntries(SITES.map((item) => [item.key, new Set(initialSelections.rubricIdsBySite[item.key] ?? [])])));
      setMainIds(Object.fromEntries(SITES.map((item) => [item.key, initialSelections.mainRubricIdBySite[item.key] ?? null])));
      setDeliveryIds(Object.fromEntries(SITES.map((item) => [item.key, new Set(initialSelections.deliveryIdsBySite[item.key] ?? [])])));
      setRubricSite(site.key);
      setDeliverySite(site.key);
      setIsSelectionInitialized(true);
      return;
    }
    const ids = sourceCategories.map((item) => item.category_id);
    setRubricIds((current) => ({ ...current, [site.key]: new Set(ids) }));
    setMainIds((current) => ({ ...current, [site.key]: sourceCategories.find((item) => item.main_category)?.category_id ?? ids[0] ?? null }));
    setRubricSite(site.key);
    setIsSelectionInitialized(true);
  }, [initialSelectionKey, initialSelections, sourceCategories, sourceSiteKey]);

  useEffect(() => {
    if (!Object.keys(deliveries).length) return;
    setDeliveryIds((current) => {
      const next = { ...current };
      for (const site of SITES) {
        if ((next[site.key]?.size ?? 0) > 0) continue;
        const options = deliveries[site.key] ?? [];
        const preferred = options.find((item) => item.id === sourceDeliveryId) ?? options.find((item) => item.is_default) ?? options[0];
        if (preferred) next[site.key] = new Set([preferred.id]);
      }
      return next;
    });
  }, [deliveries, sourceDeliveryId]);

  useEffect(() => {
    if (!isSelectionInitialized) return;
    callbackRef.current({
      rubricIdsBySite: Object.fromEntries(SITES.map((site) => [site.key, Array.from(rubricIds[site.key] ?? [])])),
      mainRubricIdBySite: mainIds,
      deliveryIdsBySite: Object.fromEntries(SITES.map((site) => [site.key, Array.from(deliveryIds[site.key] ?? [])])),
    });
  }, [deliveryIds, isSelectionInitialized, mainIds, rubricIds]);

  const selectedRubrics = useMemo(() => rubricIds[rubricSite] ?? new Set<number>(), [rubricIds, rubricSite]);
  const filteredTree = useMemo(() => filterTree(trees[rubricSite] ?? [], rubricQuery.trim().toLowerCase(), selectedRubricsOnly, selectedRubrics), [rubricQuery, rubricSite, selectedRubrics, selectedRubricsOnly, trees]);
  const shownDelivery = useMemo(() => (deliveries[deliverySite] ?? []).filter((item) => (!deliveryQuery || String(item.label ?? "").toLowerCase().includes(deliveryQuery.toLowerCase())) && (!selectedDeliveryOnly || (deliveryIds[deliverySite] ?? new Set()).has(item.id))), [deliveries, deliveryIds, deliveryQuery, deliverySite, selectedDeliveryOnly]);
  const toggleRubric = (id: number) => setRubricIds((current) => { const next = new Set(current[rubricSite] ?? []); next.has(id) ? next.delete(id) : next.add(id); return { ...current, [rubricSite]: next }; });
  const toggleDelivery = (id: number) => setDeliveryIds((current) => {
    const selected = current[deliverySite] ?? new Set<number>();
    return {
      ...current,
      [deliverySite]: selected.has(id) ? new Set<number>() : new Set([id]),
    };
  });
  const renderTree = (nodes: RubricNode[], level = 0): ReactNode[] => nodes.flatMap((node) => {
    const children = node.children ?? []; const isExpanded = (expanded[rubricSite] ?? new Set()).has(node.id); const isSelected = selectedRubrics.has(node.id);
    return [<div key={node.id} className="flex items-center gap-2 px-2 py-1.5 text-sm"><div className="flex w-10 gap-1"><input type="checkbox" checked={isSelected} onChange={() => toggleRubric(node.id)} /><input type="checkbox" checked={mainIds[rubricSite] === node.id} disabled={!isSelected} onChange={() => setMainIds((current) => ({ ...current, [rubricSite]: current[rubricSite] === node.id ? null : node.id }))} /></div><div className="flex items-center gap-2" style={{ paddingLeft: level * 18 }} >{children.length ? <button type="button" onClick={() => setExpanded((current) => { const next = new Set(current[rubricSite] ?? []); next.has(node.id) ? next.delete(node.id) : next.add(node.id); return { ...current, [rubricSite]: next }; })} className="size-5 rounded-full border">{isExpanded ? "−" : "+"}</button> : <span className="inline-block size-5" />}<span>{node.name}</span></div></div>, ...(isExpanded ? renderTree(children, level + 1) : [])];
  });

  return <div className="space-y-3"><section className="space-y-2 rounded-[var(--radius-control)] border border-border/70 bg-background p-3"><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.createProductRubricTree}</div><Input value={rubricQuery} onChange={(event) => setRubricQuery(event.target.value)} placeholder={t.createProductSearchRubric} /><div className="flex flex-wrap justify-between gap-2"><div className="flex flex-wrap gap-2">{SITES.map((site) => <button key={site.key} type="button" onClick={() => setRubricSite(site.key)} className={["rounded-full px-3 py-1.5 text-xs font-semibold", rubricSite === site.key ? "bg-primary text-primary-foreground" : "border"].join(" ")}>{site.label} <span className="ml-1">{rubricIds[site.key]?.size ?? 0}</span></button>)}</div><button type="button" onClick={() => setSelectedRubricsOnly((value) => !value)} className="rounded-full border px-3 py-1.5 text-xs font-semibold">{t.xljvSelectedOnly}</button></div><div className="max-h-[320px] overflow-auto rounded-[var(--radius-control)] border border-border/70 py-2">{renderTree(filteredTree)}</div></section><section className="space-y-2 rounded-[var(--radius-control)] border border-border/70 bg-background p-3"><div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.xljvAvailabilityDeliveryTime}</div><Input value={deliveryQuery} onChange={(event) => setDeliveryQuery(event.target.value)} placeholder={t.createProductSearchDelivery} /><div className="flex flex-wrap justify-between gap-2"><div className="flex flex-wrap gap-2">{SITES.map((site) => <button key={site.key} type="button" onClick={() => setDeliverySite(site.key)} className={["rounded-full px-3 py-1.5 text-xs font-semibold", deliverySite === site.key ? "bg-primary text-primary-foreground" : "border"].join(" ")}>{site.label}</button>)}</div><button type="button" onClick={() => setSelectedDeliveryOnly((value) => !value)} className="rounded-full border px-3 py-1.5 text-xs font-semibold">{t.xljvSelectedOnly}</button></div><div className="max-h-[280px] overflow-auto rounded-[var(--radius-control)] border border-border/70 py-2">{shownDelivery.map((item) => <label key={item.id} className="flex items-center gap-3 px-3 py-1.5 text-sm"><input type="checkbox" checked={(deliveryIds[deliverySite] ?? new Set()).has(item.id)} onChange={() => toggleDelivery(item.id)} />{item.label}</label>)}</div></section></div>;
}
