"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "../../components/layout/app-shell";
import { allMarketplaceSites } from "../../lib/marketplace-sites";
import {
  xljvEnqueueCreateJob,
  xljvGetBatchJob,
  xljvUploadImages,
  type JvBatchJobStatus,
} from "../../components/xljv/xljv-api";
import { Input } from "../../components/ui/input";
import { apiFetch } from "../../lib/api/client";
import { useToast } from "../../components/shared/toast-provider";
import { useLabels } from "../use-labels";
import { CreateProductFormPanel } from "./create-product-form-panel";
import { CreateProductJobPanel } from "./create-product-job-panel";
import { MarketplaceSiteSelectorPanel } from "./marketplace-site-selector-panel";
import { useCreateProductController } from "./use-create-product-controller";

const PAGE_TABS = ["main", "jv", "xl", "hood", "kaufland", "otto", "ebay"] as const;
const JV_RUBRIC_SITE_TABS = [
  { key: "JV_DE", label: "JV DE" },
  { key: "JV_AT", label: "JV AT" },
  { key: "JV_CH", label: "JV CH" },
  { key: "JV_CO_UK", label: "JV UK" },
] as const;
const JV_PUBLIC_BASE_BY_SITE_KEY: Record<string, string> = {
  JV_DE: "https://www.jvmoebel.de",
  JV_AT: "https://www.jvmoebel.at",
  JV_CH: "https://www.jvmoebel.ch",
  JV_CO_UK: "https://www.jvfurniture.co.uk",
};
const ALL_MARKETPLACE_SITE_IDS = allMarketplaceSites.map((site) => site.id);
const XL_MARKETPLACE_SITE_IDS = allMarketplaceSites.filter((site) => site.family === "XL").map((site) => site.id);
const HOOD_MARKETPLACE_SITE_IDS = allMarketplaceSites.filter((site) => site.family === "HOOD").map((site) => site.id);
const KAUFLAND_MARKETPLACE_SITE_IDS = allMarketplaceSites.filter((site) => site.family === "KAUFLAND").map((site) => site.id);
const OTTO_MARKETPLACE_SITE_IDS = allMarketplaceSites.filter((site) => site.family === "OTTO").map((site) => site.id);
const EBAY_MARKETPLACE_SITE_IDS = allMarketplaceSites.filter((site) => site.family === "EBAY").map((site) => site.id);

type JvContentRow = {
  language_code?: string;
  name?: string;
  description?: string;
  bezeichnung?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keyword?: string;
  short_description_real?: string;
  kurzbeschreibung?: string;
};

type GalleryItem = {
  id: string;
  src: string;
  sourcePath?: string;
  file?: File;
  isLocal: boolean;
};

type RubricTreeNode = {
  id: number;
  category_id?: number;
  parent_id?: number;
  name?: string;
  children?: RubricTreeNode[];
};

type DeliveryOption = {
  id: number;
  lieferzeitid?: number;
  label?: string;
  is_default?: boolean;
};

type JvCreateAndPushPayload = {
  ean: string;
  source_model?: string;
  source_sku?: string;
  source_ean_field?: string;
  source_product_id?: number;
  price: string;
  quantity?: number;
  status: boolean;
  manufacturer_id?: number;
  stock_status_id?: number;
  tax_class_id?: number;
  image?: string;
  date_available?: string;
  categories?: Array<{ category_id: number; main_category: boolean }>;
  stores?: Array<{ store_id: number }>;
  images?: Array<{ image: string; sort_order: number }>;
  specials?: Array<{
    customer_group_id: number;
    priority: number;
    price: string;
    date_start?: string | null;
    date_end?: string | null;
  }>;
  translate_texts: boolean;
  translation_source_language: string;
  convert_currency: boolean;
  source_currency: string;
  locale_by_site_key: Record<string, string>;
  jv_fields: Record<string, unknown>;
};

const JV_CREATE_JOB_STORAGE_KEY = "wh:jv-create-active-job";

type RubricTreeCache = Partial<Record<(typeof JV_RUBRIC_SITE_TABS)[number]["key"], RubricTreeNode[]>>;
type ExpandedRubricIdsBySite = Partial<Record<(typeof JV_RUBRIC_SITE_TABS)[number]["key"], Set<number>>>;
type SelectedRubricIdsBySite = Partial<Record<(typeof JV_RUBRIC_SITE_TABS)[number]["key"], Set<number>>>;
type MainRubricIdBySite = Partial<Record<(typeof JV_RUBRIC_SITE_TABS)[number]["key"], number | null>>;
type DeliveryOptionsCache = Partial<Record<(typeof JV_RUBRIC_SITE_TABS)[number]["key"], DeliveryOption[]>>;
type SelectedDeliveryIdsBySite = Partial<Record<(typeof JV_RUBRIC_SITE_TABS)[number]["key"], Set<number>>>;

function pickPrimaryJvContentRow(rows: unknown[]): JvContentRow | null {
  const normalizedRows = rows.map((row) => ((row ?? {}) as JvContentRow));
  const germanRow = normalizedRows.find((row) => String(row.language_code || "").trim().toLowerCase() === "de");
  return germanRow ?? normalizedRows[0] ?? null;
}

function buildUrlKeyFromName(value: string): string {
  return String(value || "").trim().split(/\s+/).filter(Boolean).join("+");
}

function calculateUvpRoundedTo9(price: number): number {
  let value: number;
  if (price > 5000) {
    value = price * 1.1;
  } else if (price >= 2500 && price <= 4999) {
    value = price * 1.18;
  } else if (price >= 1000 && price <= 2499) {
    value = price * 1.25;
  } else {
    value = price * 1.35;
  }

  const rounded = Math.ceil(value);
  const lastDigit = rounded % 10;
  if (lastDigit === 9) {
    return rounded;
  }
  return rounded + (9 - lastDigit);
}

function computeEvpFromPrice(priceRaw: string): string {
  const normalized = String(priceRaw || "").replace(",", ".").trim();
  if (!normalized) {
    return "";
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return String(calculateUvpRoundedTo9(parsed));
}

function splitMetaKeywords(value: string): string[] {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeJvPreviewHtml(html: string, siteKey: string): string {
  const value = String(html || "");
  if (!value) {
    return "";
  }

  const publicBase = JV_PUBLIC_BASE_BY_SITE_KEY[String(siteKey || "").trim().toUpperCase()] || "";
  if (!publicBase) {
    return value;
  }

  return value.replace(
    /\s(src|href)=["']([^"']+)["']/gi,
    (_match, attr: string, rawUrl: string) => {
      const normalized = String(rawUrl || "").trim();
      if (!normalized) {
        return ` ${attr}=""`;
      }
      if (
        normalized.startsWith("http://") ||
        normalized.startsWith("https://") ||
        normalized.startsWith("data:") ||
        normalized.startsWith("blob:") ||
        normalized.startsWith("mailto:") ||
        normalized.startsWith("tel:")
      ) {
        return ` ${attr}="${normalized}"`;
      }

      const absoluteUrl = normalized.startsWith("/")
        ? `${publicBase}${normalized}`
        : `${publicBase}/${normalized}`;
      return ` ${attr}="${absoluteUrl}"`;
    }
  );
}

function collectExpandableRubricIds(nodes: RubricTreeNode[]): number[] {
  return nodes.flatMap((node) => {
    const children = Array.isArray(node.children) ? node.children : [];
    const ownId = children.length > 0 ? [node.id] : [];
    return [...ownId, ...collectExpandableRubricIds(children)];
  });
}

function normalizeDecimalPrice(value: string): string {
  const normalized = String(value || "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return "0.0000";
  }
  return parsed.toFixed(4);
}

function asNumberOrUndefined(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asIntegerOrUndefined(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function normalizeStores(value: unknown): Array<{ store_id: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row) => {
      const record = row as Record<string, unknown>;
      const storeId = asIntegerOrUndefined(record.store_id ?? record.id);
      if (!storeId) {
        return null;
      }
      return { store_id: storeId };
    })
    .filter((row): row is { store_id: number } => Boolean(row));
}

function normalizeSpecials(value: unknown): Array<{
  customer_group_id: number;
  priority: number;
  price: string;
  date_start?: string | null;
  date_end?: string | null;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: Array<{
    customer_group_id: number;
    priority: number;
    price: string;
    date_start?: string | null;
    date_end?: string | null;
  }> = [];

  for (const row of value) {
      const record = row as Record<string, unknown>;
      const price = asTrimmedString(record.price);
      if (!price) {
        continue;
      }
      normalized.push({
        customer_group_id: asIntegerOrUndefined(record.customer_group_id) ?? 1,
        priority: asIntegerOrUndefined(record.priority) ?? 0,
        price: normalizeDecimalPrice(price),
        date_start: asTrimmedString(record.date_start) || null,
        date_end: asTrimmedString(record.date_end) || null,
      });
    }

  return normalized;
}

function guessFileNameFromUrl(url: string, fallbackIndex: number): string {
  try {
    const pathname = new URL(url).pathname;
    const rawName = pathname.split("/").pop() || "";
    if (rawName.trim()) {
      return rawName.trim();
    }
  } catch {
    // ignore malformed URLs and fall back below
  }
  return `gallery-${fallbackIndex + 1}.jpg`;
}

function normalizeSourceImagePath(value: unknown): string {
  const normalized = asTrimmedString(value);
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("blob:") || normalized.startsWith("data:")) {
    return "";
  }
  return normalized;
}

function resolveGallerySourceUrl(item: GalleryItem, sourceSiteKey: string): string {
  const src = asTrimmedString(item.src);
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return src;
  }
  const sourcePath = normalizeSourceImagePath(item.sourcePath || src);
  if (!sourcePath) {
    return "";
  }
  const publicBase = JV_PUBLIC_BASE_BY_SITE_KEY[String(sourceSiteKey || "").trim().toUpperCase()] || "";
  if (!publicBase) {
    return "";
  }
  return sourcePath.startsWith("/") ? `${publicBase}${sourcePath}` : `${publicBase}/${sourcePath}`;
}

// Resolve a source image reference to an absolute URL for display. The backend
// usually returns absolute public URLs, but when its public base is missing it
// falls back to a bare relative path (e.g. "cosmoshop/default/pix/..."). Rendering
// that relative path resolves against the app origin and hits the POST-only
// /api/v1/uploads/images/ route (HTTP 405), so resolve relatives against the JV
// site's public media host instead.
function resolveDisplaySrc(rawSrc: string, sourceSiteKey: string): string {
  const src = asTrimmedString(rawSrc);
  if (!src) {
    return "";
  }
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:") || src.startsWith("data:")) {
    return src;
  }
  const base = JV_PUBLIC_BASE_BY_SITE_KEY[String(sourceSiteKey || "").trim().toUpperCase()] || "";
  if (!base) {
    return src;
  }
  return `${base}/${src.replace(/^\/+/, "")}`;
}

function buildSourceGalleryItems(
  payload: Record<string, unknown>,
  publicUrls: string[],
  sourceSiteKey: string
): GalleryItem[] {
  const items: GalleryItem[] = [];
  // Deduplicate by the underlying source image path (falling back to src) so the
  // same image is never uploaded or stored twice — the source feed often repeats
  // the main image inside the gallery and lists some images more than once.
  const seen = new Set<string>();
  const dedupeKey = (sourcePath: string, src: string) =>
    (normalizeSourceImagePath(sourcePath) || asTrimmedString(src)).toLowerCase();
  const pushUnique = (item: GalleryItem) => {
    const key = dedupeKey(item.sourcePath || "", item.src);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push(item);
  };

  const mainSourcePath = normalizeSourceImagePath(payload.image);
  const mainPublicUrl = asTrimmedString(payload.image_public_url);
  const mainSrc = resolveDisplaySrc(mainPublicUrl || publicUrls[0] || mainSourcePath, sourceSiteKey);

  if (mainSrc) {
    pushUnique({
      id: "remote-main",
      src: mainSrc,
      sourcePath: mainSourcePath || undefined,
      isLocal: false,
    });
  }

  const galleryRows = Array.isArray(payload.images_public_urls) ? payload.images_public_urls : [];
  const fallbackRows = Array.isArray(payload.images) ? payload.images : [];

  galleryRows.forEach((row, index) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const sourcePath = normalizeSourceImagePath(record.image);
    const publicUrl = asTrimmedString(record.public_url);
    const src = resolveDisplaySrc(publicUrl || sourcePath, sourceSiteKey);
    if (!src) {
      return;
    }
    pushUnique({
      id: `remote-gallery-${index}`,
      src,
      sourcePath: sourcePath || undefined,
      isLocal: false,
    });
  });

  if (items.length <= 1 && fallbackRows.length > 0) {
    fallbackRows.forEach((row, index) => {
      const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const sourcePath = normalizeSourceImagePath(record.image);
      if (!sourcePath) {
        return;
      }
      pushUnique({
        id: `remote-fallback-${index}`,
        src: resolveDisplaySrc(sourcePath, sourceSiteKey),
        sourcePath,
        isLocal: false,
      });
    });
  }

  return items;
}

async function galleryItemToFile(item: GalleryItem, index: number): Promise<File> {
  if (item.file instanceof File) {
    return item.file;
  }

  const response = await fetch(item.src);
  if (!response.ok) {
    throw new Error(`Failed to download gallery image ${index + 1}: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const fileName = guessFileNameFromUrl(item.src, index);
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

export default function CreateProductPage() {
  const t = useLabels();
  const { showToast } = useToast();
  const controller = useCreateProductController({ t, showToast });
  const [activeTab, setActiveTab] = useState<(typeof PAGE_TABS)[number]>("main");
  const [jvName, setJvName] = useState("");
  const [jvArtikelnr, setJvArtikelnr] = useState("");
  const [jvPrice, setJvPrice] = useState("");
  const [jvDescription, setJvDescription] = useState("");
  const [jvDescriptionMode, setJvDescriptionMode] = useState<"code" | "preview">("preview");
  const [jvBezeichnung, setJvBezeichnung] = useState("");
  const [jvMetaTitle, setJvMetaTitle] = useState("");
  const [jvMetaDescription, setJvMetaDescription] = useState("");
  const [jvMetaKeyword, setJvMetaKeyword] = useState("");
  const [jvShortDescriptionReal, setJvShortDescriptionReal] = useState("");
  const [jvKurzbeschreibung, setJvKurzbeschreibung] = useState("");
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [activeGalleryImageId, setActiveGalleryImageId] = useState("");
  const [rubricTreesBySite, setRubricTreesBySite] = useState<RubricTreeCache>({});
  const [rubricTreeLoading, setRubricTreeLoading] = useState(false);
  const [rubricTreeError, setRubricTreeError] = useState("");
  const [rubricSearch, setRubricSearch] = useState("");
  const [rubricSiteKey, setRubricSiteKey] = useState<(typeof JV_RUBRIC_SITE_TABS)[number]["key"]>("JV_DE");
  const [showOnlySelectedRubrics, setShowOnlySelectedRubrics] = useState(false);
  const [expandedRubricIdsBySite, setExpandedRubricIdsBySite] = useState<ExpandedRubricIdsBySite>({});
  const [selectedRubricIdsBySite, setSelectedRubricIdsBySite] = useState<SelectedRubricIdsBySite>({});
  const [mainRubricIdBySite, setMainRubricIdBySite] = useState<MainRubricIdBySite>({});
  const [deliveryOptionsBySite, setDeliveryOptionsBySite] = useState<DeliveryOptionsCache>({});
  const [deliveryOptionsLoading, setDeliveryOptionsLoading] = useState(false);
  const [deliveryOptionsError, setDeliveryOptionsError] = useState("");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliverySiteKey, setDeliverySiteKey] = useState<(typeof JV_RUBRIC_SITE_TABS)[number]["key"]>("JV_DE");
  const [showOnlySelectedDelivery, setShowOnlySelectedDelivery] = useState(false);
  const [selectedDeliveryIdsBySite, setSelectedDeliveryIdsBySite] = useState<SelectedDeliveryIdsBySite>({});
  const [sendAllSitesLoading, setSendAllSitesLoading] = useState(false);
  const [sendAllSitesStatus, setSendAllSitesStatus] = useState("");
  const [sendAllSitesLog, setSendAllSitesLog] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localObjectUrlsRef = useRef<string[]>([]);
  // Tracks mount state so the background JV send can safely skip component state
  // updates after the user navigates away (the completion toast still fires via
  // the app-level toast provider).
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  // Holds the id of the create-job currently being polled so we never start
  // two concurrent polling loops for the same job.
  const pollingJobRef = useRef<number | null>(null);
  // Resume polling an in-flight create-job after a full page reload: the job
  // runs server-side, so we just need to reattach and surface the toast.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(JV_CREATE_JOB_STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { jobId?: number; ean?: string };
      const jobId = Number(parsed?.jobId);
      if (Number.isFinite(jobId)) {
        setSendAllSitesLoading(true);
        setSendAllSitesStatus(`Resuming JV create job #${jobId}…`);
        void pollCreateJob(jobId);
      }
    } catch {
      /* ignore malformed storage */
    }
    // pollCreateJob is a stable component-scoped declaration; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isLoading =
    controller.kidContextLoading || controller.sourceSitesLoading || controller.sourceSnapshotLoading;
  const galleryImages = useMemo(() => controller.sourceSnapshot?.imageUrls ?? [], [controller.sourceSnapshot?.imageUrls]);
  const jvUrlKey = useMemo(() => buildUrlKeyFromName(jvName), [jvName]);
  const jvEvp = useMemo(() => computeEvpFromPrice(jvPrice), [jvPrice]);
  const jvMetaKeywordItems = useMemo(() => splitMetaKeywords(jvMetaKeyword), [jvMetaKeyword]);
  const rubricTree = useMemo(() => rubricTreesBySite[rubricSiteKey] ?? [], [rubricSiteKey, rubricTreesBySite]);
  const expandedRubricIds = useMemo(
    () => expandedRubricIdsBySite[rubricSiteKey] ?? new Set<number>(),
    [expandedRubricIdsBySite, rubricSiteKey]
  );
  const selectedRubricIds = useMemo(
    () => selectedRubricIdsBySite[rubricSiteKey] ?? new Set<number>(),
    [rubricSiteKey, selectedRubricIdsBySite]
  );
  const selectedRubricCountBySite = useMemo(
    () =>
      Object.fromEntries(
        JV_RUBRIC_SITE_TABS.map((site) => [site.key, (selectedRubricIdsBySite[site.key] ?? new Set<number>()).size])
      ) as Record<(typeof JV_RUBRIC_SITE_TABS)[number]["key"], number>,
    [selectedRubricIdsBySite]
  );
  const mainRubricId = useMemo(
    () => mainRubricIdBySite[rubricSiteKey] ?? null,
    [mainRubricIdBySite, rubricSiteKey]
  );
  const deliveryOptions = useMemo(() => deliveryOptionsBySite[deliverySiteKey] ?? [], [deliveryOptionsBySite, deliverySiteKey]);
  const selectedDeliveryIds = useMemo(
    () => selectedDeliveryIdsBySite[deliverySiteKey] ?? new Set<number>(),
    [deliverySiteKey, selectedDeliveryIdsBySite]
  );
  const sourcePayload = useMemo(
    () => (controller.sourceSnapshot?.rawPayload && typeof controller.sourceSnapshot.rawPayload === "object"
      ? controller.sourceSnapshot.rawPayload
      : {}) as Record<string, unknown>,
    [controller.sourceSnapshot?.rawPayload]
  );
  const sourceJvFields = useMemo(
    () => (sourcePayload.jv_fields && typeof sourcePayload.jv_fields === "object"
      ? sourcePayload.jv_fields
      : {}) as Record<string, unknown>,
    [sourcePayload]
  );
  const sourceContentRows = useMemo(
    () => (Array.isArray(sourceJvFields.content_by_language) ? sourceJvFields.content_by_language : []) as unknown[],
    [sourceJvFields]
  );
  const sourceGalleryItems = useMemo(
    () => buildSourceGalleryItems(sourcePayload, galleryImages, controller.sourceSnapshot?.siteKey || ""),
    [galleryImages, sourcePayload, controller.sourceSnapshot?.siteKey]
  );
  const primaryContentRow = useMemo(() => pickPrimaryJvContentRow(sourceContentRows), [sourceContentRows]);
  const normalizedDescriptionPreviewHtml = useMemo(
    () => normalizeJvPreviewHtml(jvDescription, controller.sourceSnapshot?.siteKey || ""),
    [controller.sourceSnapshot?.siteKey, jvDescription]
  );
  const filteredRubricTree = useMemo(() => {
    const query = rubricSearch.trim().toLowerCase();
    if (!query && !showOnlySelectedRubrics) {
      return rubricTree;
    }

    function filterNodes(nodes: RubricTreeNode[]): RubricTreeNode[] {
      const next: RubricTreeNode[] = [];
      for (const node of nodes) {
        const label = String(node.name || "").toLowerCase();
        const code = String(node.id || "");
        const children = Array.isArray(node.children) ? filterNodes(node.children) : [];
        const matchesQuery = !query || label.includes(query) || code.includes(query);
        const matchesSelection = !showOnlySelectedRubrics || selectedRubricIds.has(node.id);

        if ((!matchesQuery || !matchesSelection) && children.length === 0) {
          continue;
        }

        next.push({
          ...node,
          children,
        });
      }
      return next;
    }

    return filterNodes(rubricTree);
  }, [rubricSearch, rubricTree, selectedRubricIds, showOnlySelectedRubrics]);
  const filteredDeliveryOptions = useMemo(() => {
    const query = deliverySearch.trim().toLowerCase();

    return deliveryOptions.filter((option) => {
      const label = String(option.label || "").toLowerCase();
      const code = String(option.id ?? option.lieferzeitid ?? "");
      const matchesQuery = !query || label.includes(query) || code.includes(query);
      const matchesSelection = !showOnlySelectedDelivery || selectedDeliveryIds.has(option.id);
      return matchesQuery && matchesSelection;
    });
  }, [deliveryOptions, deliverySearch, selectedDeliveryIds, showOnlySelectedDelivery]);
  const expandableRubricIds = useMemo(() => collectExpandableRubricIds(filteredRubricTree), [filteredRubricTree]);
  const areAllRubricsExpanded = useMemo(
    () => expandableRubricIds.length > 0 && expandableRubricIds.every((id) => expandedRubricIds.has(id)),
    [expandableRubricIds, expandedRubricIds]
  );
  const activeMarketplaceSiteIds = useMemo(() => {
    switch (activeTab) {
      case "main":
        return ALL_MARKETPLACE_SITE_IDS;
      case "xl":
        return XL_MARKETPLACE_SITE_IDS;
      case "hood":
        return HOOD_MARKETPLACE_SITE_IDS;
      case "kaufland":
        return KAUFLAND_MARKETPLACE_SITE_IDS;
      case "otto":
        return OTTO_MARKETPLACE_SITE_IDS;
      case "ebay":
        return EBAY_MARKETPLACE_SITE_IDS;
      default:
        return [];
    }
  }, [activeTab]);
  const activeMarketplaceSites = useMemo(
    () => allMarketplaceSites.filter((site) => activeMarketplaceSiteIds.includes(site.id)),
    [activeMarketplaceSiteIds]
  );
  const canCreateProduct = activeTab === "jv" || activeTab === "main" || activeMarketplaceSiteIds.length > 0;
  const primaryActionLoading = activeTab === "jv" ? sendAllSitesLoading : controller.submitting;
  const primaryActionLabel = primaryActionLoading ? "Creating product..." : "Create product";

  useEffect(() => {
    const jvFields = controller.sourceSnapshot?.rawPayload?.jv_fields;
    const contentByLanguage = Array.isArray((jvFields as { content_by_language?: unknown })?.content_by_language)
      ? ((jvFields as { content_by_language?: unknown[] }).content_by_language as unknown[])
      : [];

    const primaryRow = pickPrimaryJvContentRow(contentByLanguage);
    setJvName(String(primaryRow?.name || ""));
    setJvArtikelnr(String((jvFields as { artikelnr?: unknown })?.artikelnr || ""));
    setJvPrice(String(controller.sourceSnapshot?.rawPayload?.price || ""));
    setJvDescription(String(primaryRow?.description || ""));
    setJvBezeichnung(String(primaryRow?.bezeichnung || ""));
    setJvMetaTitle(String(primaryRow?.meta_title || ""));
    setJvMetaDescription(String(primaryRow?.meta_description || ""));
    setJvMetaKeyword(String(primaryRow?.meta_keyword || ""));
    setJvShortDescriptionReal(String(primaryRow?.short_description_real || ""));
    setJvKurzbeschreibung(String(primaryRow?.kurzbeschreibung || ""));
  }, [controller.sourceSnapshot?.rawPayload]);

  useEffect(() => {
    setGalleryItems((current) => {
      const localItems = current.filter((item) => item.isLocal);
      const remoteItems = sourceGalleryItems;
      return [...remoteItems, ...localItems];
    });
  }, [sourceGalleryItems]);

  useEffect(() => {
    const firstImageId = galleryItems[0]?.id ?? "";
    setActiveGalleryImageId((current) => {
      if (current && galleryItems.some((item) => item.id === current)) {
        return current;
      }
      return firstImageId;
    });
  }, [galleryItems]);

  useEffect(() => {
    return () => {
      localObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localObjectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "jv") {
      return;
    }
    if (JV_RUBRIC_SITE_TABS.every((site) => Array.isArray(rubricTreesBySite[site.key]))) {
      return;
    }

    let active = true;
    setRubricTreeLoading(true);
    setRubricTreeError("");

    void Promise.all(
      JV_RUBRIC_SITE_TABS.map(async (site) => {
        const response = await apiFetch(
          `/api/v1/jv/rubrics/tree/?site=JV&site_key=${encodeURIComponent(site.key)}&language=de`
        );
        if (!response.ok) {
          throw new Error(`Failed to load rubric tree ${site.label}: HTTP ${response.status}`);
        }
        const payload = (await response.json()) as { tree?: RubricTreeNode[] };
        return {
          key: site.key,
          tree: Array.isArray(payload.tree) ? payload.tree : [],
        };
      })
    )
      .then((results) => {
        if (!active) {
          return;
        }

        const nextCache: RubricTreeCache = {};
        const nextExpandedBySite: ExpandedRubricIdsBySite = {};
        for (const result of results) {
          nextCache[result.key] = result.tree;
          nextExpandedBySite[result.key] = new Set(collectExpandableRubricIds(result.tree));
        }
        setRubricTreesBySite(nextCache);
        setExpandedRubricIdsBySite(nextExpandedBySite);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setRubricTreeError(error instanceof Error ? error.message : "Failed to load rubric tree.");
      })
      .finally(() => {
        if (active) {
          setRubricTreeLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeTab, rubricSiteKey, rubricTreesBySite]);

  useEffect(() => {
    if (activeTab !== "jv") {
      return;
    }
    if (JV_RUBRIC_SITE_TABS.every((site) => Array.isArray(deliveryOptionsBySite[site.key]))) {
      return;
    }

    let active = true;
    setDeliveryOptionsLoading(true);
    setDeliveryOptionsError("");

    void Promise.all(
      JV_RUBRIC_SITE_TABS.map(async (site) => {
        const response = await apiFetch(
          `/api/v1/jv/delivery-options/?site=JV&site_key=${encodeURIComponent(site.key)}&language=de`
        );
        if (!response.ok) {
          throw new Error(`Failed to load delivery options ${site.label}: HTTP ${response.status}`);
        }
        const payload = (await response.json()) as { items?: DeliveryOption[] };
        return {
          key: site.key,
          items: Array.isArray(payload.items) ? payload.items : [],
        };
      })
    )
      .then((results) => {
        if (!active) {
          return;
        }

        const nextCache: DeliveryOptionsCache = {};
        for (const result of results) {
          nextCache[result.key] = result.items;
        }
        setDeliveryOptionsBySite(nextCache);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setDeliveryOptionsError(error instanceof Error ? error.message : "Failed to load delivery options.");
      })
      .finally(() => {
        if (active) {
          setDeliveryOptionsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeTab, deliveryOptionsBySite]);

  useEffect(() => {
    const sourceDeliveryId = asIntegerOrUndefined(sourceJvFields.lieferzeitid);
    if (Object.keys(deliveryOptionsBySite).length === 0) {
      return;
    }

    setSelectedDeliveryIdsBySite((current) => {
      let changed = false;
      const next: SelectedDeliveryIdsBySite = { ...current };

      for (const site of JV_RUBRIC_SITE_TABS) {
        if ((current[site.key] ?? new Set<number>()).size > 0) {
          continue;
        }

        const options = deliveryOptionsBySite[site.key] ?? [];
        const preferred =
          options.find((option) => option.id === sourceDeliveryId) ??
          options.find((option) => option.is_default) ??
          options[0];

        if (!preferred) {
          continue;
        }

        next[site.key] = new Set<number>([preferred.id]);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [deliveryOptionsBySite, sourceJvFields]);

  const activeGalleryItem = galleryItems.find((item) => item.id === activeGalleryImageId) ?? null;

  function handleGalleryUpload(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    const nextItems = Array.from(files).map((file, index) => ({
      id: `local-${Date.now()}-${index}-${file.name}`,
      src: URL.createObjectURL(file),
      file,
      isLocal: true,
    }));
    nextItems.forEach((item) => localObjectUrlsRef.current.push(item.src));

    setGalleryItems((current) => [...current, ...nextItems]);
    setActiveGalleryImageId((current) => current || nextItems[0]?.id || "");
  }

  function handleDeleteGalleryItem(itemId: string) {
    setGalleryItems((current) => {
      const target = current.find((item) => item.id === itemId);
      if (target?.isLocal) {
        URL.revokeObjectURL(target.src);
        localObjectUrlsRef.current = localObjectUrlsRef.current.filter((url) => url !== target.src);
      }
      return current.filter((item) => item.id !== itemId);
    });
  }

  function handleMoveGalleryItem(sourceItemId: string, targetItemId: string) {
    if (!sourceItemId || !targetItemId || sourceItemId === targetItemId) {
      return;
    }

    setGalleryItems((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceItemId);
      const targetIndex = current.findIndex((item) => item.id === targetItemId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...current];
      const [movedItem] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      return next;
    });
  }

  function toggleSelectedRubric(rubricId: number) {
    setSelectedRubricIdsBySite((current) => {
      const currentSet = current[rubricSiteKey] ?? new Set<number>();
      const next = new Set(currentSet);
      if (next.has(rubricId)) {
        next.delete(rubricId);
      } else {
        next.add(rubricId);
      }
      return {
        ...current,
        [rubricSiteKey]: next,
      };
    });
    setMainRubricIdBySite((current) => {
      if ((current[rubricSiteKey] ?? null) !== rubricId || selectedRubricIds.has(rubricId)) {
        if (selectedRubricIds.has(rubricId)) {
          return {
            ...current,
            [rubricSiteKey]: null,
          };
        }
      }
      return current;
    });
  }

  function toggleMainRubric(rubricId: number) {
    setMainRubricIdBySite((current) => ({
      ...current,
      [rubricSiteKey]: current[rubricSiteKey] === rubricId ? null : rubricId,
    }));
  }

  function toggleSelectedDelivery(deliveryId: number) {
    setSelectedDeliveryIdsBySite((current) => {
      const currentSet = current[deliverySiteKey] ?? new Set<number>();
      const next = currentSet.has(deliveryId) ? new Set<number>() : new Set<number>([deliveryId]);
      return {
        ...current,
        [deliverySiteKey]: next,
      };
    });
  }

  async function uploadGalleryForSite(siteKey: (typeof JV_RUBRIC_SITE_TABS)[number]["key"], ean: string) {
    if (galleryItems.length === 0) {
      return {
        image: undefined,
        images: [] as Array<{ image: string; sort_order: number }>,
      };
    }

    // cosmoshop serves the gallery from a folder named after the artikelnr (the
    // media key), so the gallery files must land there. Use the same value that
    // buildPayloadForSite writes as the article's artikelnr.
    const artikelnr = (jvArtikelnr || ean).trim();

    const uploadOne = async (index: number, item: (typeof galleryItems)[number]): Promise<string> => {
      // Any non-local (marketplace source) image must be relayed through the backend, which
      // downloads it server-side. Fetching it in the browser fails CORS — the source domains
      // (e.g. jvmoebel.de) don't send Access-Control-Allow-Origin. resolveGallerySourceUrl
      // returns the http(s) src directly, or rebuilds it from the source path.
      if (!item.isLocal) {
        const sourceUrl = resolveGallerySourceUrl(item, controller.sourceSnapshot?.siteKey || "");
        if (!sourceUrl) {
          throw new Error(`Missing source image URL for ${siteKey} image ${index + 1}`);
        }
        const { response, payload } = await xljvUploadImages({
          site: "JV",
          siteKey,
          ean,
          artikelnr,
          files: [],
          sourceUrls: [sourceUrl],
          imageRole: index === 0 ? "main" : "additional",
        });

        const uploadedImage = asTrimmedString(payload.image);
        const uploadedList = Array.isArray(payload.uploaded_image_urls)
          ? payload.uploaded_image_urls.map((value) => asTrimmedString(value)).filter(Boolean)
          : [];
        const uploadedPath = uploadedImage || uploadedList[0] || "";
        if (!response.ok || !uploadedPath) {
          throw new Error(
            asTrimmedString(payload.detail) ||
              `Image relay upload failed for ${siteKey} image ${index + 1}: HTTP ${response.status}`
          );
        }
        return uploadedPath;
      }

      const file = await galleryItemToFile(item, index);
      const { response, payload } = await xljvUploadImages({
        site: "JV",
        siteKey,
        ean,
        artikelnr,
        files: [file],
        imageRole: index === 0 ? "main" : "additional",
      });

      const uploadedImage = asTrimmedString(payload.image);
      const uploadedList = Array.isArray(payload.uploaded_image_urls)
        ? payload.uploaded_image_urls.map((value) => asTrimmedString(value)).filter(Boolean)
        : [];
      const uploadedPath = uploadedImage || uploadedList[0] || "";

      if (!response.ok || !uploadedPath) {
        throw new Error(
          asTrimmedString(payload.detail) ||
            `Image upload failed for ${siteKey} image ${index + 1}: HTTP ${response.status}`
        );
      }

      return uploadedPath;
    };

    // Upload a site's photos with bounded concurrency. Each photo hits the same site FTP
    // host (and itself fans out to a few sequential STOR connections), so cap parallelism to
    // avoid overwhelming the server. Results are written back by index to preserve order
    // (index 0 = main image, the rest = ordered gallery).
    const IMAGE_UPLOAD_CONCURRENCY = 4;
    const uploadedPaths: string[] = new Array(galleryItems.length);
    let cursor = 0;
    const runWorker = async () => {
      for (let index = cursor++; index < galleryItems.length; index = cursor++) {
        uploadedPaths[index] = await uploadOne(index, galleryItems[index]);
      }
    };
    const workerCount = Math.min(IMAGE_UPLOAD_CONCURRENCY, galleryItems.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    return {
      image: uploadedPaths[0] || undefined,
      images: uploadedPaths.slice(1).map((image, index) => ({
        image,
        sort_order: index,
      })),
    };
  }

  function buildPayloadForSite(
    siteKey: (typeof JV_RUBRIC_SITE_TABS)[number]["key"],
    uploadedGallery: { image?: string; images: Array<{ image: string; sort_order: number }> }
  ): JvCreateAndPushPayload {
    const ean = asTrimmedString(controller.kidContext?.mainEan || controller.sourceSnapshot?.ean || sourcePayload.ean);
    const price = normalizeDecimalPrice(jvPrice || asTrimmedString(sourcePayload.price));
    const selectedRubrics = Array.from(selectedRubricIdsBySite[siteKey] ?? new Set<number>());
    const mainRubric = mainRubricIdBySite[siteKey] ?? null;
    const selectedDeliveryId = Array.from(selectedDeliveryIdsBySite[siteKey] ?? new Set<number>())[0];
    const orderedRubrics = selectedRubrics.slice().sort((left, right) => {
      if (left === mainRubric) return -1;
      if (right === mainRubric) return 1;
      return 0;
    });

    return {
      ean,
      source_model: (jvArtikelnr || ean).trim(),
      source_sku: asTrimmedString(sourcePayload.source_sku ?? sourceJvFields.jfsku),
      source_ean_field: asTrimmedString(sourcePayload.source_ean_field ?? sourceJvFields.ean ?? ean),
      price,
      quantity: 1,
      status: true,
      manufacturer_id: asIntegerOrUndefined(sourcePayload.manufacturer_id),
      stock_status_id: asIntegerOrUndefined(sourcePayload.stock_status_id),
      tax_class_id: asIntegerOrUndefined(sourcePayload.tax_class_id),
      image: uploadedGallery.image,
      date_available: asTrimmedString(sourcePayload.date_available) || undefined,
      categories: orderedRubrics.map((categoryId) => ({
        category_id: categoryId,
        main_category: categoryId === mainRubric,
      })),
      stores: normalizeStores(sourcePayload.stores),
      images: uploadedGallery.images,
      specials: normalizeSpecials(sourcePayload.specials),
      translate_texts: siteKey === "JV_CO_UK",
      translation_source_language: "de",
      convert_currency: siteKey === "JV_CH" || siteKey === "JV_CO_UK",
      source_currency: "EUR",
      locale_by_site_key: {
        [siteKey]: siteKey === "JV_CO_UK" ? "en" : "de",
      },
      jv_fields: {
        artikelnr: (jvArtikelnr || ean).trim(),
        jfsku: asTrimmedString(sourceJvFields.jfsku),
        inaktiv: 0,
        ean,
        urlkey: jvUrlKey || undefined,
        mwstid: asTrimmedString(sourceJvFields.mwstid) || "3",
        lieferzeitid: selectedDeliveryId,
        lieferzeit: selectedDeliveryId,
        lieferzeit_id: selectedDeliveryId,
        einheitid: asTrimmedString(sourceJvFields.einheitid) || "6",
        grundeinheit: asTrimmedString(sourceJvFields.grundeinheit) || "6",
        vpe: "1",
        is_sofort: 1,
        preisbasis: asTrimmedString(sourceJvFields.preisbasis) || "brutto",
        preisfilter: asTrimmedString(sourceJvFields.preisfilter) || "default",
        content_by_language: [
            {
            language_code: "de",
            name: jvName.trim(),
            description: jvDescription,
            bezeichnung: jvBezeichnung,
            meta_title: jvMetaTitle,
            meta_description: jvMetaDescription,
            meta_keyword: jvMetaKeyword,
            keywords: jvMetaKeyword,
            short_description_real: jvShortDescriptionReal,
            kurzbeschreibung: jvKurzbeschreibung,
          },
        ],
      },
    };
  }

  async function handleSendToAllJvSites() {
    const ean = asTrimmedString(controller.kidContext?.mainEan || controller.sourceSnapshot?.ean || sourcePayload.ean);
    if (!/^\d{13}$/.test(ean)) {
      showToast("EAN must contain exactly 13 digits.", "error");
      return;
    }
    if (!jvName.trim()) {
      showToast("Name is required before sending.", "error");
      return;
    }
    if (!jvArtikelnr.trim()) {
      showToast("Artikelnr is required before sending.", "error");
      return;
    }

    const validationErrors: string[] = [];
    for (const site of JV_RUBRIC_SITE_TABS) {
      const selectedRubrics = selectedRubricIdsBySite[site.key] ?? new Set<number>();
      const mainRubric = mainRubricIdBySite[site.key] ?? null;
      const selectedDelivery = selectedDeliveryIdsBySite[site.key] ?? new Set<number>();

      if (selectedRubrics.size === 0) {
        validationErrors.push(`${site.label}: select at least one rubric.`);
      }
      if (!mainRubric || !selectedRubrics.has(mainRubric)) {
        validationErrors.push(`${site.label}: select one main rubric.`);
      }
      if (selectedDelivery.size !== 1) {
        validationErrors.push(`${site.label}: select exactly one delivery option.`);
      }
    }

    if (validationErrors.length > 0) {
      const message = validationErrors.join(" ");
      setSendAllSitesStatus(message);
      showToast(message, "error");
      return;
    }

    if (!window.confirm(`Create JV product ${ean} on JV DE, JV AT, JV CH and JV UK?`)) {
      return;
    }

    setSendAllSitesLoading(true);
    setSendAllSitesStatus("Uploading images and queueing the JV create job…");
    setSendAllSitesLog("");
    showToast(
      "JV creation is being queued — you can keep working, you'll get a toast when it's done.",
      "info"
    );

    // Upload galleries + build the per-site payloads on click, then hand the
    // slow create-and-push work to a server-side job (run by the JV batch
    // worker) so it survives page reloads and the user can keep working.
    void (async () => {
      try {
        if (isMountedRef.current) {
          setSendAllSitesStatus(`Uploading images for ${JV_RUBRIC_SITE_TABS.length} sites…`);
        }
        // Upload every site's gallery concurrently — one "worker" per site. Each JV site
        // is a separate FTP host, so parallel uploads hit different servers and don't
        // contend. Promise.all preserves order and fails fast on the first error, matching
        // the previous sequential behaviour.
        const sites: Array<{
          site: string;
          site_key: string;
          domain?: string;
          payload: Record<string, unknown>;
        }> = await Promise.all(
          JV_RUBRIC_SITE_TABS.map(async (site) => {
            const uploadedGallery = await uploadGalleryForSite(site.key, ean);
            const payload = buildPayloadForSite(site.key, uploadedGallery);
            return {
              site: "JV",
              site_key: site.key,
              domain: JV_PUBLIC_BASE_BY_SITE_KEY[site.key] ?? "",
              payload: payload as unknown as Record<string, unknown>,
            };
          })
        );

        const { response, payload: responsePayload } = await xljvEnqueueCreateJob({
          ean,
          name: jvName.trim(),
          sites,
        });

        if (!response.ok) {
          const message =
            asTrimmedString((responsePayload as Record<string, unknown>).detail) ||
            `Failed to queue JV create job (HTTP ${response.status}).`;
          if (isMountedRef.current) {
            setSendAllSitesStatus(message);
            setSendAllSitesLoading(false);
          }
          showToast(message, "error");
          return;
        }

        const job = (responsePayload.job ?? {}) as JvBatchJobStatus;
        const jobId = Number(job.id);
        if (!Number.isFinite(jobId)) {
          const message = "JV create job was accepted but no job id was returned.";
          if (isMountedRef.current) {
            setSendAllSitesStatus(message);
            setSendAllSitesLoading(false);
          }
          showToast(message, "error");
          return;
        }

        persistActiveCreateJob(jobId, ean);
        if (isMountedRef.current) {
          setSendAllSitesStatus(`JV create job #${jobId} queued — creating on 4 sites in the background…`);
        }
        await pollCreateJob(jobId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "JV creation failed in the background.";
        if (isMountedRef.current) {
          setSendAllSitesStatus(message);
          setSendAllSitesLoading(false);
        }
        showToast(message, "error");
      }
    })();
  }

  function persistActiveCreateJob(jobId: number, jobEan: string): void {
    try {
      window.localStorage.setItem(
        JV_CREATE_JOB_STORAGE_KEY,
        JSON.stringify({ jobId, ean: jobEan, startedAt: Date.now() })
      );
    } catch {
      /* ignore storage failures */
    }
  }

  function clearActiveCreateJob(): void {
    try {
      window.localStorage.removeItem(JV_CREATE_JOB_STORAGE_KEY);
    } catch {
      /* ignore storage failures */
    }
  }

  async function pollCreateJob(jobId: number): Promise<void> {
    if (pollingJobRef.current === jobId) return;
    pollingJobRef.current = jobId;
    const deadline = Date.now() + 15 * 60 * 1000;
    try {
      while (Date.now() < deadline) {
        let payload: Record<string, unknown> = {};
        let httpStatus = 0;
        try {
          const res = await xljvGetBatchJob(jobId);
          payload = res.payload;
          httpStatus = res.response.status;
        } catch {
          // transient network error — keep retrying until the deadline
        }
        if (httpStatus === 404) {
          clearActiveCreateJob();
          if (isMountedRef.current) setSendAllSitesLoading(false);
          showToast(`JV create job #${jobId} was not found.`, "error");
          return;
        }

        const job = (payload.job ?? payload) as JvBatchJobStatus | undefined;
        const statusValue = String(job?.status ?? "").toLowerCase();
        const items = Array.isArray(job?.items) ? job!.items! : [];
        const total = items.length || JV_RUBRIC_SITE_TABS.length;
        const appliedCount = items.filter((item) => String(item.status).toLowerCase() === "applied").length;

        if (statusValue === "applied" || statusValue === "failed") {
          clearActiveCreateJob();
          const summary = `JV create finished: ${appliedCount}/${total} sites successful.`;
          if (isMountedRef.current) {
            setSendAllSitesStatus(summary);
            setSendAllSitesLoading(false);
            setSendAllSitesLog(JSON.stringify(job, null, 2));
          }
          showToast(summary, statusValue === "applied" ? "success" : "error");
          return;
        }

        if (isMountedRef.current) {
          setSendAllSitesStatus(`Creating on JV sites… ${appliedCount}/${total} done (job #${jobId}).`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      if (isMountedRef.current) {
        setSendAllSitesStatus(`JV create job #${jobId} is still running — check back later.`);
        setSendAllSitesLoading(false);
      }
    } finally {
      if (pollingJobRef.current === jobId) pollingJobRef.current = null;
    }
  }

  function renderRubricTree(nodes: RubricTreeNode[], level = 0): ReactNode[] {
    return nodes.flatMap((node) => {
      const label = String(node.name || `Rubric ${node.id || ""}`).trim();
      const children = Array.isArray(node.children) ? node.children : [];
      const isExpanded = expandedRubricIds.has(node.id);
      const hasChildren = children.length > 0;
      const isSelected = selectedRubricIds.has(node.id);
      const isMain = mainRubricId === node.id;

      return [
        <div
          key={`${level}-${node.id}`}
          className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm text-foreground"
        >
          <div className="flex w-10 shrink-0 items-center gap-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelectedRubric(node.id)}
              className="size-4 rounded-[4px] border border-[#cfd8e3] bg-white accent-[#1677ff]"
            />
            <input
              type="checkbox"
              checked={isMain}
              onChange={() => toggleMainRubric(node.id)}
              disabled={!isSelected}
              className="size-4 rounded-[4px] border border-[#cfd8e3] bg-white accent-[#1677ff] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Main rubric ${label}`}
            />
          </div>
          <div
            className="flex min-w-0 items-center gap-2"
            style={{ paddingLeft: `${level * 18 + 8}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() =>
                  setExpandedRubricIdsBySite((current) => {
                    const currentSet = current[rubricSiteKey] ?? new Set<number>();
                    const next = new Set(currentSet);
                    if (next.has(node.id)) {
                      next.delete(node.id);
                    } else {
                      next.add(node.id);
                    }
                    return {
                      ...current,
                      [rubricSiteKey]: next,
                    };
                  })
                }
                className="flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-pill)] border border-border/70 bg-background text-xs text-muted-foreground transition hover:text-foreground"
                aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
              >
                {isExpanded ? "-" : "+"}
              </button>
            ) : (
              <span className="inline-block size-5 shrink-0" />
            )}
            <span className="min-w-0">{label}</span>
          </div>
        </div>,
        ...(hasChildren && isExpanded ? renderRubricTree(children, level + 1) : []),
      ];
    });
  }

  function handlePrimaryCreateAction() {
    if (activeTab === "jv") {
      return void handleSendToAllJvSites();
    }

    if (activeTab === "main") {
      return void controller.handleCreateProduct();
    }

    return void controller.handleCreateProductForSiteIds(activeMarketplaceSiteIds);
  }

  return (
    <AppShell
      title={t.createProduct || "Create Product"}
      subtitle="Create product"
    >
      <div className="rounded-[var(--radius-card)] border border-border/70 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {PAGE_TABS.map((tab) => {
              const isActive = tab === activeTab;

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium uppercase transition",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/70 bg-background text-foreground hover:bg-muted/40",
                  ].join(" ")}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          <div className="flex min-h-10 items-center justify-end gap-3">
            <button
              type="button"
              onClick={handlePrimaryCreateAction}
              disabled={primaryActionLoading || !canCreateProduct}
              className="flex min-h-10 items-center justify-center rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                activeTab === "jv"
                  ? "Create product on JV sites"
                  : activeTab === "main"
                    ? "Create product on all selected sites"
                    : `Create product on ${activeTab.toUpperCase()} sites`
              }
            >
              {primaryActionLabel}
            </button>
            {isLoading ? (
              <div
                className="size-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
                aria-label="Loading source data"
              />
            ) : null}
          </div>
        </div>

        {activeTab === "jv" ? (
          <div className="mt-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
              <div className="min-w-0 flex-1 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    NAME
                  </label>
                  <Input
                    value={jvName}
                    onChange={(event) => setJvName(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    URLKEY
                  </label>
                  <Input
                    value={jvUrlKey}
                    readOnly
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      ARTIKELNR
                    </label>
                    <Input
                      value={jvArtikelnr}
                      onChange={(event) => setJvArtikelnr(event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      PRICE
                    </label>
                    <Input
                      value={jvPrice}
                      onChange={(event) => setJvPrice(event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      UVP
                    </label>
                    <Input
                      value={jvEvp}
                      readOnly
                    />
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      BEZEICHNUNG
                    </label>
                    <textarea
                      value={jvBezeichnung}
                      onChange={(event) => setJvBezeichnung(event.target.value)}
                      className="min-h-[110px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      KURZBESCHREIBUNG
                    </label>
                    <textarea
                      value={jvKurzbeschreibung}
                      onChange={(event) => setJvKurzbeschreibung(event.target.value)}
                      className="min-h-[110px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      SHORT DESCRIPTION REAL
                    </label>
                    <textarea
                      value={jvShortDescriptionReal}
                      onChange={(event) => setJvShortDescriptionReal(event.target.value)}
                      className="min-h-[110px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      META TITLE
                    </label>
                    <Input
                      value={jvMetaTitle}
                      onChange={(event) => setJvMetaTitle(event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      META DESCRIPTION
                    </label>
                    <textarea
                      value={jvMetaDescription}
                      onChange={(event) => setJvMetaDescription(event.target.value)}
                      className="min-h-[110px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      META KEYWORD
                    </label>
                    <div className="rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-3">
                      {jvMetaKeywordItems.length > 0 ? (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {jvMetaKeywordItems.map((keyword, index) => (
                            <span
                              key={`${keyword}-${index}`}
                              className="rounded-[var(--radius-pill)] border border-border/70 bg-muted/30 px-3 py-1 text-xs text-foreground"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <textarea
                        value={jvMetaKeyword}
                        onChange={(event) => setJvMetaKeyword(event.target.value)}
                        placeholder="keyword 1, keyword 2, keyword 3"
                        className="min-h-[110px] w-full border-0 bg-transparent p-0 text-sm text-foreground outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        DESCRIPTION
                      </label>
                      <div className="flex gap-1 rounded-[var(--radius-pill)] border border-border/70 bg-background p-1">
                        <button
                          type="button"
                          onClick={() => setJvDescriptionMode("code")}
                          className={[
                            "rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase transition",
                            jvDescriptionMode === "code"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          ].join(" ")}
                        >
                          Code
                        </button>
                        <button
                          type="button"
                          onClick={() => setJvDescriptionMode("preview")}
                          className={[
                            "rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase transition",
                            jvDescriptionMode === "preview"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          ].join(" ")}
                        >
                          Preview
                        </button>
                      </div>
                    </div>

                    {jvDescriptionMode === "code" ? (
                      <textarea
                        value={jvDescription}
                        onChange={(event) => setJvDescription(event.target.value)}
                        className="min-h-[160px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition focus:border-primary"
                      />
                    ) : (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(event) => setJvDescription(event.currentTarget.innerHTML)}
                        dangerouslySetInnerHTML={{ __html: normalizedDescriptionPreviewHtml }}
                        className="min-h-[160px] rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="w-full space-y-3 rounded-[var(--radius-control)] border border-border/70 bg-card p-3 xl:ml-auto xl:w-[520px] xl:flex-none">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    handleGalleryUpload(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] border border-border/70 bg-muted/20">
                  {activeGalleryItem ? (
                    <Image
                      src={activeGalleryItem.src}
                      alt="JV gallery preview"
                      fill
                      className="object-cover"
                      sizes="(max-width: 1280px) 100vw, 360px"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>

                {galleryItems.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {galleryItems.map((item, index) => {
                      const isActive = item.id === activeGalleryImageId;

                      return (
                        <div key={item.id} className="space-y-1">
                          <div className="relative">
                            <div
                              onClick={() => setActiveGalleryImageId(item.id)}
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/gallery-item-id", item.id);
                              }}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                handleMoveGalleryItem(event.dataTransfer.getData("text/gallery-item-id"), item.id);
                              }}
                              className={[
                                "relative aspect-square w-full cursor-grab overflow-hidden rounded-[var(--radius-control)] border transition active:cursor-grabbing",
                                isActive ? "border-primary ring-2 ring-primary/20" : "border-border/70 hover:border-primary/50",
                              ].join(" ")}
                            >
                              <Image
                                src={item.src}
                                alt={`JV gallery thumbnail ${index + 1}`}
                                fill
                                className="pointer-events-none object-cover"
                                sizes="88px"
                                draggable={false}
                                unoptimized
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteGalleryItem(item.id)}
                              className="absolute right-1 top-1 z-10 text-sm font-semibold leading-none text-red-500 transition hover:text-red-600"
                              aria-label={`Delete image ${index + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-control)] border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                    No gallery images
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-14 w-full items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 py-3 text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                >
                  Upload images
                </button>

                <div className="space-y-2 rounded-[var(--radius-control)] border border-border/70 bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Rubrik Tree
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRubricIdsBySite((current) => ({
                          ...current,
                          [rubricSiteKey]: areAllRubricsExpanded ? new Set<number>() : new Set(expandableRubricIds),
                        }))
                      }
                      disabled={expandableRubricIds.length === 0}
                      className="rounded-[var(--radius-pill)] border border-border/70 bg-background px-3 py-1 text-[11px] font-semibold uppercase transition hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {areAllRubricsExpanded ? "Collapse all" : "Expand all"}
                    </button>
                  </div>

                  <Input
                    value={rubricSearch}
                    onChange={(event) => setRubricSearch(event.target.value)}
                    placeholder="Search rubrik"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {JV_RUBRIC_SITE_TABS.map((site) => {
                        const isActive = site.key === rubricSiteKey;
                        const selectedCount = selectedRubricCountBySite[site.key] ?? 0;

                        return (
                          <button
                            key={site.key}
                            type="button"
                            onClick={() => setRubricSiteKey(site.key)}
                            className={[
                              "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold uppercase transition",
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "border border-border/70 bg-background text-foreground hover:bg-muted/40",
                            ].join(" ")}
                          >
                            <span>{site.label}</span>
                            <span
                              className={[
                                "ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                isActive
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : "bg-muted text-muted-foreground",
                              ].join(" ")}
                            >
                              {selectedCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOnlySelectedRubrics((current) => !current)}
                      className={[
                        "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold uppercase transition",
                        showOnlySelectedRubrics
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/70 bg-background text-foreground hover:bg-muted/40",
                      ].join(" ")}
                    >
                      Only selected
                    </button>
                  </div>

                  {rubricTreeLoading ? (
                    <div className="text-sm text-muted-foreground">Loading rubric tree...</div>
                  ) : null}

                  {rubricTreeError ? (
                    <div className="text-sm text-destructive">{rubricTreeError}</div>
                  ) : null}

                  {!rubricTreeLoading && !rubricTreeError && rubricTree.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No rubric tree data.</div>
                  ) : null}

                  {!rubricTreeLoading && !rubricTreeError && rubricTree.length > 0 && filteredRubricTree.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No rubriks found.</div>
                  ) : null}

                  {!rubricTreeLoading && !rubricTreeError && filteredRubricTree.length > 0 ? (
                    <div className="max-h-[320px] overflow-auto rounded-[var(--radius-control)] border border-border/70 bg-card py-2">
                      {renderRubricTree(filteredRubricTree)}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-[var(--radius-control)] border border-border/70 bg-background p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Delivery
                  </div>

                  <Input
                    value={deliverySearch}
                    onChange={(event) => setDeliverySearch(event.target.value)}
                    placeholder="Search delivery"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {JV_RUBRIC_SITE_TABS.map((site) => {
                        const isActive = site.key === deliverySiteKey;

                        return (
                          <button
                            key={site.key}
                            type="button"
                            onClick={() => setDeliverySiteKey(site.key)}
                            className={[
                              "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold uppercase transition",
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "border border-border/70 bg-background text-foreground hover:bg-muted/40",
                            ].join(" ")}
                          >
                            {site.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOnlySelectedDelivery((current) => !current)}
                      className={[
                        "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold uppercase transition",
                        showOnlySelectedDelivery
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/70 bg-background text-foreground hover:bg-muted/40",
                      ].join(" ")}
                    >
                      Only selected
                    </button>
                  </div>

                  {deliveryOptionsLoading ? (
                    <div className="text-sm text-muted-foreground">Loading delivery options...</div>
                  ) : null}

                  {deliveryOptionsError ? (
                    <div className="text-sm text-destructive">{deliveryOptionsError}</div>
                  ) : null}

                  {!deliveryOptionsLoading && !deliveryOptionsError && deliveryOptions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No delivery options.</div>
                  ) : null}

                  {!deliveryOptionsLoading && !deliveryOptionsError && deliveryOptions.length > 0 && filteredDeliveryOptions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No delivery options found.</div>
                  ) : null}

                  {!deliveryOptionsLoading && !deliveryOptionsError && filteredDeliveryOptions.length > 0 ? (
                    <div className="max-h-[280px] overflow-auto rounded-[var(--radius-control)] border border-border/70 bg-card py-2">
                      {filteredDeliveryOptions.map((option) => {
                        const optionId = option.id;
                        const isSelected = selectedDeliveryIds.has(optionId);
                        const label = String(option.label || `Delivery ${optionId}`).trim();

                        return (
                          <label
                            key={`${deliverySiteKey}-${optionId}`}
                            className="flex items-center gap-3 px-3 py-1.5 text-sm text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectedDelivery(optionId)}
                              className="size-4 shrink-0 rounded-[4px] border border-[#cfd8e3] bg-white accent-[#1677ff]"
                            />
                            <span className="min-w-0 flex-1">
                              {label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {sendAllSitesStatus || sendAllSitesLog ? (
                  <div className="space-y-3 rounded-[var(--radius-control)] border border-border/70 bg-background p-3">
                    {sendAllSitesStatus ? (
                      <div className="text-sm text-foreground">{sendAllSitesStatus}</div>
                    ) : null}
                    {sendAllSitesLog ? (
                      <textarea
                        readOnly
                        value={sendAllSitesLog}
                        className="min-h-[180px] w-full rounded-[var(--radius-control)] border border-border/70 bg-card px-3 py-2.5 font-mono text-xs text-foreground outline-none"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab !== "jv" ? (
          <div className="mt-4 space-y-4">
            {(controller.kidContextError || controller.sourceSitesError || controller.sourceSnapshotError) ? (
              <div className="rounded-[var(--radius-control)] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {[controller.kidContextError, controller.sourceSitesError, controller.sourceSnapshotError].filter(Boolean).join(" ")}
              </div>
            ) : null}

            {activeTab === "main" ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_360px]">
                <div className="rounded-[var(--radius-card)] border border-border/70 bg-card p-4">
                  <CreateProductFormPanel
                    t={t}
                    ean={controller.ean}
                    price={controller.price}
                    productName={controller.productName}
                    imagesText={controller.imagesText}
                    fieldErrors={controller.fieldErrors}
                    submitting={controller.submitting}
                    onEanChange={controller.setEan}
                    onPriceChange={controller.setPrice}
                    onProductNameChange={controller.setProductName}
                    onImagesTextChange={controller.setImagesText}
                    onSubmit={controller.handleCreateProduct}
                    onReset={controller.resetFields}
                  />
                  <CreateProductJobPanel
                    t={t}
                    latestJobId={controller.latestJobId}
                    reconciliationSummary={controller.reconciliationSummary}
                    jobStatusDetails={controller.jobStatusDetails}
                    jobStatusJson={controller.jobStatusJson}
                    jobAttemptsJson={controller.jobAttemptsJson}
                    jobEventsJson={controller.jobEventsJson}
                    reconciliationReportId={controller.reconciliationReportId}
                    reconciliationReportsJson={controller.reconciliationReportsJson}
                    reconciliationReportJson={controller.reconciliationReportJson}
                    onLatestJobIdChange={controller.setLatestJobId}
                    onReconciliationReportIdChange={controller.setReconciliationReportId}
                    onLoadJobStatus={controller.loadJobStatus}
                    onLoadReconciliationReports={controller.loadReconciliationReports}
                    onLoadReconciliationReportById={controller.loadReconciliationReportById}
                  />
                </div>

                <MarketplaceSiteSelectorPanel
                  t={t}
                  selectedSitesCount={controller.selectedSites.length}
                  sitesQuery={controller.sitesQuery}
                  showSelectedOnly={controller.showSelectedOnly}
                  visibleSites={controller.visibleSites}
                  selectedSiteIds={controller.selectedSites}
                  onSitesQueryChange={controller.setSitesQuery}
                  onSelectAllSites={controller.selectAllSites}
                  onClearAllSites={controller.clearAllSites}
                  onToggleShowSelectedOnly={() => controller.setShowSelectedOnly((prev) => !prev)}
                  onToggleSite={controller.toggleSite}
                />
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_360px]">
                <div className="rounded-[var(--radius-card)] border border-border/70 bg-card p-4">
                  <div className="mb-4 rounded-[var(--radius-control)] border border-border/70 bg-muted/20 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Target Scope
                    </div>
                    <div className="mt-2 text-sm text-foreground">
                      {activeTab.toUpperCase()} create product will run only for the sites on this tab.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeMarketplaceSites.map((site) => (
                        <span
                          key={site.id}
                          className="rounded-[var(--radius-pill)] border border-border/70 bg-background px-3 py-1 text-xs font-medium text-foreground"
                        >
                          {site.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <CreateProductFormPanel
                    t={t}
                    ean={controller.ean}
                    price={controller.price}
                    productName={controller.productName}
                    imagesText={controller.imagesText}
                    fieldErrors={controller.fieldErrors}
                    submitting={controller.submitting}
                    onEanChange={controller.setEan}
                    onPriceChange={controller.setPrice}
                    onProductNameChange={controller.setProductName}
                    onImagesTextChange={controller.setImagesText}
                    onSubmit={() => void controller.handleCreateProductForSiteIds(activeMarketplaceSiteIds)}
                    onReset={controller.resetFields}
                  />
                  <CreateProductJobPanel
                    t={t}
                    latestJobId={controller.latestJobId}
                    reconciliationSummary={controller.reconciliationSummary}
                    jobStatusDetails={controller.jobStatusDetails}
                    jobStatusJson={controller.jobStatusJson}
                    jobAttemptsJson={controller.jobAttemptsJson}
                    jobEventsJson={controller.jobEventsJson}
                    reconciliationReportId={controller.reconciliationReportId}
                    reconciliationReportsJson={controller.reconciliationReportsJson}
                    reconciliationReportJson={controller.reconciliationReportJson}
                    onLatestJobIdChange={controller.setLatestJobId}
                    onReconciliationReportIdChange={controller.setReconciliationReportId}
                    onLoadJobStatus={controller.loadJobStatus}
                    onLoadReconciliationReports={controller.loadReconciliationReports}
                    onLoadReconciliationReportById={controller.loadReconciliationReportById}
                  />
                </div>

                <div className="rounded-[var(--radius-card)] border border-border/70 bg-card p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Sites On This Page
                  </div>
                  <div className="mt-4 space-y-2">
                    {activeMarketplaceSites.map((site) => (
                      <div
                        key={site.id}
                        className="rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2 text-sm text-foreground"
                      >
                        {site.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
