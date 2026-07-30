"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { AppShell } from "../../components/layout/app-shell";
import { allMarketplaceSites, type SiteFamily } from "../../lib/marketplace-sites";
import {
  xljvEnqueueCreateJob,
  xljvGetBatchJob,
  xljvGetDeliveryOptions,
  xljvGetRubricsTree,
  xljvUploadImages,
  type JvBatchJobStatus,
} from "../../components/xljv/xljv-api";
import { Input } from "../../components/ui/input";
import { Slider } from "../../components/ui/slider";
import { apiFetch } from "../../lib/api/client";
import { useToast } from "../../components/shared/toast-provider";
import { toXljvImageUrl } from "../../components/xljv/xljv-image-utils";
import { makeHoodDescriptionPreviewEditableDocument } from "../../components/product-editor/product-editor-hood-description-preview";
import { decodeHtmlEntities } from "../../components/hood/hood-search-utils";
import { useLabels } from "../use-labels";
import { CreateProductEanPoolPanel } from "./create-product-ean-pool-panel";
import type { CreateProductGalleryItem } from "./create-product-image-gallery";
import { CREATE_PRODUCT_XL_DEFAULT_SITE_KEY } from "./create-product-source-api";
import { useCreateProductController } from "./use-create-product-controller";
import { PublishSitesDialog, type PublishSiteOption } from "./publish-sites-dialog";
import type { JvCreateProductFields } from "./jv-create-product-panel";
import { JvPublishingOptionsPanel, type JvPublishingSelections } from "./jv-publishing-options-panel";
import type { XlCreateProductDraft } from "./xl-create-product-panel";
import type { HoodCreateProductDraft } from "./hood-create-product-panel";
import type { KauflandCreateProductDraft } from "./kaufland-create-product-panel";
import { EMPTY_OTTO_CREATE_PRODUCT_DRAFT, type OttoCreateProductDraft } from "./otto-create-product-panel";
import type { MainKauflandCreateFields } from "./create-product-model";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";
import { KauflandProductFields } from "../../components/product-forms/kaufland-product-fields";
import { fetchOttoProductBySku, type OttoProfile } from "../../components/channels/otto-api";
import { OttoCategoriesPanel } from "./otto-categories-panel";

const CreateProductImageGallery = dynamic(
  () => import("../../components/product-forms").then((module) => module.CreateProductImageGallery),
  {
    ssr: false,
    loading: () => <div className="min-h-[20rem] rounded-[var(--radius-control)] border border-border/70 bg-muted/20" />,
  },
);
const HoodCreateProductPanel = dynamic(
  () => import("../../components/product-forms").then((module) => module.HoodCreateProductPanel),
  { ssr: false, loading: () => <div className="min-h-[32rem] rounded-[var(--radius-control)] border border-border/70 bg-muted/20" /> },
);
const HoodProductPropertiesPanel = dynamic(
  () => import("./hood-product-properties-panel").then((module) => module.HoodProductPropertiesPanel),
  { ssr: false, loading: () => <div className="min-h-32 rounded-[var(--radius-control)] border border-border/70 bg-muted/20" /> },
);
const KauflandProductDetailsPanel = dynamic(
  () => import("../../components/product-forms").then((module) => module.KauflandProductDetailsPanel),
  { ssr: false, loading: () => <div className="min-h-[32rem] rounded-[var(--radius-control)] border border-border/70 bg-muted/20" /> },
);
const XlCreateProductPanel = dynamic(
  () => import("../../components/product-forms").then((module) => module.XlCreateProductPanel),
  { ssr: false, loading: () => <div className="min-h-[32rem] rounded-[var(--radius-control)] border border-border/70 bg-muted/20" /> },
);
const JvCreateProductPanel = dynamic(
  () => import("../../components/product-forms").then((module) => module.JvCreateProductPanel),
  { ssr: false, loading: () => <div className="min-h-[32rem] rounded-[var(--radius-control)] border border-border/70 bg-muted/20" /> },
);
const OttoCreateProductPanel = dynamic(
  () => import("./otto-create-product-panel").then((module) => module.OttoCreateProductPanel),
  { ssr: false, loading: () => <div className="min-h-48 rounded-[var(--radius-control)] border border-border/70 bg-muted/20" /> },
);

const PAGE_TABS = [
  "jv",
  "xl",
  "hood_jv",
  "hood_xl",
  "kaufland_jv",
  "kaufland_xl",
  "otto_jv",
  "otto_xl",
  "ebay_jv",
  "ebay_xl",
] as const;
type CreateProductTab = "main" | (typeof PAGE_TABS)[number];
type MarketplaceAccount = "JV" | "XL";
type CreateProductTabMeta = {
  label: string;
  sourceSite: "JV" | "XL" | "HOOD" | "KAUFLAND";
  sourceSiteKey?: string;
  targetSiteIds: string[];
  marketplace?: "HOOD" | "KAUFLAND" | "OTTO" | "EBAY";
  account?: MarketplaceAccount;
};
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
const XL_MARKETPLACE_SITE_IDS = ["xlmoebel_de"];
const PUBLISHABLE_SITE_FAMILIES = new Set<SiteFamily>(["JVMOEBEL", "XL", "HOOD", "KAUFLAND", "OTTO"]);
const PUBLISHABLE_XL_SITE_ID = "xlmoebel_de";
const JV_SITE_KEY_BY_MARKETPLACE_SITE_ID = {
  "jvmoebel-de": "JV_DE",
  "jvmoebel-at": "JV_AT",
  "jvmoebel-ch": "JV_CH",
  "jvmoebel-uk": "JV_CO_UK",
} as const;

function getSiteIdsByFamilyAndKind(family: "HOOD" | "KAUFLAND" | "OTTO" | "EBAY", kind: MarketplaceAccount): string[] {
  return allMarketplaceSites
    .filter((site) => site.family === family && site.kind === kind)
    .map((site) => site.id);
}

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

type GalleryItem = CreateProductGalleryItem;
const EMPTY_GALLERY_ITEMS: GalleryItem[] = [];
type LocalDraftSnapshot<TDraft> = {
  sourceKey: string;
  draft: TDraft;
};

function readOttoText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOttoTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readOttoText).filter(Boolean)
    : [];
}

function readOttoProductAttributes(product: Record<string, unknown> | undefined): unknown {
  if (!product) return undefined;
  const description = product.productDescription;
  if (description && typeof description === "object" && !Array.isArray(description)) {
    return (description as Record<string, unknown>).attributes ?? product.attributes;
  }
  return product.attributes;
}

function buildOttoDraft(product: Record<string, unknown>, fallback: OttoCreateProductDraft): OttoCreateProductDraft {
  const description = product.productDescription && typeof product.productDescription === "object" && !Array.isArray(product.productDescription)
    ? product.productDescription as Record<string, unknown>
    : {};
  const bulletPoints = readOttoTextList(description.bulletPoints);

  return {
    ...fallback,
    productReference: readOttoText(product.productReference) || fallback.productReference,
    sku: readOttoText(product.sku) || fallback.sku,
    ean: readOttoText(product.ean) || fallback.ean,
    price: readOttoText((product.pricing as Record<string, unknown> | undefined)?.standardPrice && ((product.pricing as Record<string, unknown>).standardPrice as Record<string, unknown>).amount) || fallback.price,
    deliveryTime: readOttoText((product.delivery as Record<string, unknown> | undefined)?.deliveryTime) || fallback.deliveryTime,
    category: readOttoText(product.category) || readOttoText(description.category) || fallback.category,
    productLine: readOttoText(description.productLine) || readOttoText(description.title) || fallback.productLine,
    description: readOttoText(description.description) || readOttoText(description.text) || fallback.description,
    bulletPoints: bulletPoints.length > 0 ? bulletPoints : fallback.bulletPoints,
  };
}

type XlDescriptionFields = {
  name: string;
  seo_url: string;
  ean: string;
  price: string;
  uvp: string;
  manufacturer_id: string;
  description: string;
  tag: string;
  meta_title: string;
  meta_description: string;
  meta_keyword: string;
};

type KauflandDescriptionFields = {
  shortDescription: string;
  description: string;
};

type KauflandDisplayField = {
  label: string;
  value: string;
  path: string[];
};

const HIDDEN_KAUFLAND_FIELD_LABELS = new Set([
  "Manufacturer",
  "Mpn",
  "Parts Of Animal Origin",
  "Abnehmbarer Bezug",
  "Material Composition",
  "Price",
  "Location",
  "Condition",
  "Amount",
  "Id Product",
  "Id Unit",
  "Note",
  "Shipping Rate",
  "Shipping Group",
  "Warehouse",
  "Date Inserted",
  "Reference Price",
  "Date Lastchange",
  "Seller · Pseudonym",
]);

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

function getCreateProductTabLabel(
  tab: CreateProductTab,
  t: ReturnType<typeof useLabels>
): string {
  switch (tab) {
    case "main":
      return t.createProductTabMain;
    case "jv":
      return t.channelJv;
    case "xl":
      return t.channelXl;
    case "hood_jv":
      return `${t.channelHood} JV`;
    case "hood_xl":
      return `${t.channelHood} XL`;
    case "kaufland_jv":
      return `${t.channelKaufland} JV`;
    case "kaufland_xl":
      return `${t.channelKaufland} XL`;
    case "otto_jv":
      return `${t.channelOtto} JV`;
    case "otto_xl":
      return `${t.channelOtto} XL`;
    case "ebay_jv":
      return `${t.channelEbay} JV`;
    case "ebay_xl":
      return `${t.channelEbay} XL`;
    default:
      return tab;
  }
}

function getCreateProductTabMeta(tab: CreateProductTab, t: ReturnType<typeof useLabels>): CreateProductTabMeta {
  switch (tab) {
    case "main":
      return {
        label: t.createProductTabMain,
        sourceSite: "JV",
        targetSiteIds: ALL_MARKETPLACE_SITE_IDS,
      };
    case "jv":
      return {
        label: t.channelJv,
        sourceSite: "JV",
        targetSiteIds: allMarketplaceSites.filter((site) => site.family === "JVMOEBEL").map((site) => site.id),
      };
    case "xl":
      return {
        label: t.channelXl,
        sourceSite: "XL",
        sourceSiteKey: CREATE_PRODUCT_XL_DEFAULT_SITE_KEY,
        targetSiteIds: XL_MARKETPLACE_SITE_IDS,
      };
    case "hood_jv":
      return {
        label: `${t.channelHood} JV`,
        sourceSite: "HOOD",
        sourceSiteKey: "HOOD_JV",
        targetSiteIds: getSiteIdsByFamilyAndKind("HOOD", "JV"),
        marketplace: "HOOD",
        account: "JV",
      };
    case "hood_xl":
      return {
        label: `${t.channelHood} XL`,
        sourceSite: "HOOD",
        sourceSiteKey: "HOOD_XL",
        targetSiteIds: getSiteIdsByFamilyAndKind("HOOD", "XL"),
        marketplace: "HOOD",
        account: "XL",
      };
    case "kaufland_jv":
      return {
        label: `${t.channelKaufland} JV`,
        sourceSite: "KAUFLAND",
        sourceSiteKey: "KAUFLAND_JV",
        targetSiteIds: getSiteIdsByFamilyAndKind("KAUFLAND", "JV"),
        marketplace: "KAUFLAND",
        account: "JV",
      };
    case "kaufland_xl":
      return {
        label: `${t.channelKaufland} XL`,
        sourceSite: "KAUFLAND",
        sourceSiteKey: "KAUFLAND_XL",
        targetSiteIds: getSiteIdsByFamilyAndKind("KAUFLAND", "XL"),
        marketplace: "KAUFLAND",
        account: "XL",
      };
    case "otto_jv":
      return {
        label: `${t.channelOtto} JV`,
        sourceSite: "JV",
        targetSiteIds: getSiteIdsByFamilyAndKind("OTTO", "JV"),
        marketplace: "OTTO",
        account: "JV",
      };
    case "otto_xl":
      return {
        label: `${t.channelOtto} XL`,
        sourceSite: "XL",
        sourceSiteKey: CREATE_PRODUCT_XL_DEFAULT_SITE_KEY,
        targetSiteIds: getSiteIdsByFamilyAndKind("OTTO", "XL"),
        marketplace: "OTTO",
        account: "XL",
      };
    case "ebay_jv":
      return {
        label: `${t.channelEbay} JV`,
        sourceSite: "JV",
        targetSiteIds: getSiteIdsByFamilyAndKind("EBAY", "JV"),
        marketplace: "EBAY",
        account: "JV",
      };
    case "ebay_xl":
      return {
        label: `${t.channelEbay} XL`,
        sourceSite: "XL",
        sourceSiteKey: CREATE_PRODUCT_XL_DEFAULT_SITE_KEY,
        targetSiteIds: getSiteIdsByFamilyAndKind("EBAY", "XL"),
        marketplace: "EBAY",
        account: "XL",
      };
    default:
      return {
        label: String(tab),
        sourceSite: "JV",
        targetSiteIds: [],
      };
  }
}

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

function formatKauflandFieldLabel(path: string[]): string {
  const displayPath = path[0]?.toLowerCase() === "units" && /^\d+$/.test(path[1] || "")
    ? path.slice(2)
    : path;
  return displayPath
    .map((segment) => segment.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .join(" · ");
}

function flattenKauflandFields(value: unknown, path: string[] = []): KauflandDisplayField[] {
  if (value === null || value === undefined) {
    return [{ label: formatKauflandFieldLabel(path), value: "", path }];
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [{ label: formatKauflandFieldLabel(path), value: String(value), path }];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ label: formatKauflandFieldLabel(path), value: "", path }];
    if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
      return [{ label: formatKauflandFieldLabel(path), value: value.map((item) => String(item ?? "")).join("\n"), path }];
    }
    return value.flatMap((item, index) => flattenKauflandFields(item, [...path, String(index + 1)]));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [{ label: formatKauflandFieldLabel(path), value: "", path }];
    return entries.flatMap(([key, item]) => flattenKauflandFields(item, [...path, key]));
  }
  return [{ label: formatKauflandFieldLabel(path), value: String(value), path }];
}

function firstKauflandText(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value == null ? "" : String(value);
}

function kauflandDraftFieldText(product: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = product[key];
    if (Array.isArray(value)) {
      const values = value.map((item) => String(item ?? "").trim()).filter(Boolean);
      if (values.length > 0) return values.join(", ");
      continue;
    }
    const normalized = firstKauflandText(value).trim();
    if (normalized) return normalized;
  }
  return "";
}

function buildKauflandFieldsFromDraft(product: Record<string, unknown>): MainKauflandCreateFields {
  return {
    size: kauflandDraftFieldText(product, "size"),
    color: kauflandDraftFieldText(product, "color"),
    material: kauflandDraftFieldText(product, "material"),
    delivery: kauflandDraftFieldText(product, "delivery"),
    height: kauflandDraftFieldText(product, "height"),
    length: kauflandDraftFieldText(product, "length"),
    width: kauflandDraftFieldText(product, "width"),
    amount: kauflandDraftFieldText(product, "amount") || "20",
    idOffer: kauflandDraftFieldText(product, "id_offer") || kauflandDraftFieldText(product, "ean"),
    storefronts: kauflandDraftFieldText(product, "storefronts", "storefront") || "de, cz, sk, pl, at, fr, it",
  };
}

function sanitizeKauflandDraftProduct(product: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(product).filter(([key]) => !["undefined", "null"].includes(key.toLowerCase())),
  );
}

function formatKauflandPrice(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  return `${padded.slice(0, -2)},${padded.slice(-2)}`;
}

function buildKauflandDescriptionFields(product: Record<string, unknown>): KauflandDescriptionFields {
  return {
    shortDescription: firstKauflandText(product.short_description),
    description: firstKauflandText(product.description),
  };
}

function injectHoodPreviewBaseHref(html: string, baseHref: string): string {
  if (/<base\b/i.test(html)) {
    return html.replace(/<base\b[^>]*>/i, `<base href="${baseHref}" target="_blank" />`);
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}<base href="${baseHref}" target="_blank" />`);
  }
  return html;
}

function buildHoodDescriptionPreviewDocument(description: string, account: MarketplaceAccount | undefined): string {
  const baseHref = account === "XL" ? "https://www.xlmoebel.de/" : "https://www.jvmoebel.de/";
  const decoded = decodeHtmlEntities(description || "").trim();
  if (!decoded) return "";

  const withBaseHref = injectHoodPreviewBaseHref(decoded, baseHref);
  if (/<html[\s>]/i.test(withBaseHref)) return withBaseHref;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><base href="${baseHref}" target="_blank" /><style>html,body{margin:0;padding:0}img{max-width:100%;height:auto}</style></head><body>${withBaseHref}</body></html>`;
}

function buildKauflandDescriptionPreviewDocument(description: string): string {
  const source = String(description || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .trim();
  if (!source) return "";

  const headMatch = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch?.[1] ?? "";
  const bodyContent = source.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, "");

  return `<!doctype html><html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><base href="https://www.jvmoebel.de/" target="_blank" />${headContent}<style>html,body{margin:0;padding:0}img{max-width:100%;height:auto}</style></head><body>${bodyContent}</body></html>`;
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

function collectRubricTreeIds(nodes: RubricTreeNode[]): Set<number> {
  const ids = new Set<number>();

  function visit(items: RubricTreeNode[]) {
    for (const item of items) {
      ids.add(item.id);
      const children = Array.isArray(item.children) ? item.children : [];
      if (children.length > 0) {
        visit(children);
      }
    }
  }

  visit(nodes);
  return ids;
}

function updateKauflandProductField(product: Record<string, unknown>, path: string[], value: string): Record<string, unknown> {
  const next = structuredClone(product) as Record<string, unknown>;
  let target: Record<string, unknown> | unknown[] = next;
  for (const segment of path.slice(0, -1)) {
    const key = Array.isArray(target) ? Number(segment) - 1 : segment;
    const child = target[key as never];
    if (!child || typeof child !== "object") return product;
    target = child as Record<string, unknown> | unknown[];
  }
  const finalKey = Array.isArray(target) ? Number(path.at(-1)) - 1 : path.at(-1)!;
  const targetRecord = target as Record<string, unknown>;
  const original = targetRecord[String(finalKey)];
  targetRecord[String(finalKey)] = Array.isArray(original)
    ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : typeof original === "number" ? Number(value) : typeof original === "boolean" ? value === "true" : value;
  return next;
}

function KauflandDeliveryTimeRange({ product, onProductChange }: {
  product: Record<string, unknown>;
  onProductChange: (product: Record<string, unknown>) => void;
}) {
  const deliveryFields = flattenKauflandFields(product)
    .filter((field) => field.label === "Delivery Time Min" || field.label === "Delivery Time Max");
  const minField = deliveryFields.find((field) => field.label === "Delivery Time Min");
  const maxField = deliveryFields.find((field) => field.label === "Delivery Time Max");
  const sourceMin = Math.min(30, Math.max(1, Number(minField?.value) || 1));
  const sourceMax = Math.min(30, Math.max(sourceMin, Number(maxField?.value) || sourceMin));
  const [range, setRange] = useState<[number, number]>([sourceMin, sourceMax]);
  useEffect(() => {
    const next: [number, number] = [sourceMin, sourceMax];
    setRange(next);
  }, [sourceMin, sourceMax]);
  if (!minField || !maxField) return null;

  const updateRange = (next: [number, number]) => {
    const normalized: [number, number] = [Math.min(30, Math.max(1, next[0])), Math.min(30, Math.max(Math.min(30, Math.max(1, next[0])), next[1]))];
    setRange(normalized);
    const withMin = updateKauflandProductField(product, minField.path, String(normalized[0]));
    onProductChange(updateKauflandProductField(withMin, maxField.path, String(normalized[1])));
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Delivery time (days)</div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Min
          <Input type="number" min={1} max={30} value={range[0]} onChange={(event) => {
            const nextMin = Math.min(30, Math.max(1, Number(event.target.value) || 1));
            updateRange([nextMin, Math.max(nextMin, range[1])]);
          }} />
        </label>
        <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Max
          <Input type="number" min={range[0]} max={30} value={range[1]} onChange={(event) => updateRange([range[0], Math.min(30, Math.max(range[0], Number(event.target.value) || range[0]))])} />
        </label>
      </div>
      <Slider value={range} min={1} max={30} step={1} onValueChange={(values) => {
        const nextValues = Array.isArray(values) ? values : [values];
        const minValue = nextValues[0] ?? 0;
        updateRange([minValue, Math.max(minValue, nextValues[1] ?? minValue)]);
      }} />
    </section>
  );
}

function collectRubricNodesById(nodes: RubricTreeNode[]): Map<number, RubricTreeNode> {
  const nodesById = new Map<number, RubricTreeNode>();

  function visit(items: RubricTreeNode[]) {
    for (const item of items) {
      nodesById.set(item.id, item);
      const children = Array.isArray(item.children) ? item.children : [];
      if (children.length > 0) {
        visit(children);
      }
    }
  }

  visit(nodes);
  return nodesById;
}

function normalizeRubricTreeNodes(value: unknown): RubricTreeNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((row): RubricTreeNode | null => {
      const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const id = asIntegerOrUndefined(record.id ?? record.category_id);
      if (!id) {
        return null;
      }
      return {
        ...record,
        id,
        category_id: asIntegerOrUndefined(record.category_id) ?? id,
        parent_id: asIntegerOrUndefined(record.parent_id) ?? 0,
        name: asTrimmedString(record.name) || `Category ${id}`,
        children: normalizeRubricTreeNodes(record.children),
      };
    })
    .filter((node): node is RubricTreeNode => Boolean(node));
}

function buildRubricTreeFromFlatNodes(nodes: RubricTreeNode[]): RubricTreeNode[] {
  if (nodes.length === 0) {
    return [];
  }

  const byId = new Map<number, RubricTreeNode>();
  const childIds = new Set<number>();

  for (const node of nodes) {
    byId.set(node.id, {
      ...node,
      children: [],
    });
  }

  for (const node of byId.values()) {
    if (!node.parent_id || !byId.has(node.parent_id)) {
      continue;
    }
    byId.get(node.parent_id)?.children?.push(node);
    childIds.add(node.id);
  }

  const roots = Array.from(byId.values()).filter((node) => !childIds.has(node.id));
  return roots.length > 0 ? roots : Array.from(byId.values());
}

function normalizeRubricTreePayload(payload: unknown): RubricTreeNode[] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const flatTree = buildRubricTreeFromFlatNodes(normalizeRubricTreeNodes(record.items));
  if (flatTree.length > 0) {
    // `tree` contains only branches reachable from a root category. XL can return
    // an active category whose parent is unavailable, while keeping that category
    // in `items`. Building from the complete list preserves its real name.
    return flatTree;
  }

  return normalizeRubricTreeNodes(Array.isArray(payload) ? payload : record.tree);
}

function extractSourceCategories(payload: Record<string, unknown>): Array<{ category_id: number; main_category: boolean }> {
  const rows = Array.isArray(payload.categories) ? payload.categories : [];
  return rows
    .map((row) => {
      const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const categoryId = asIntegerOrUndefined(record.category_id);
      if (!categoryId) {
        return null;
      }
      return {
        category_id: categoryId,
        main_category: Boolean(Number(record.main_category)),
      };
    })
    .filter((row): row is { category_id: number; main_category: boolean } => Boolean(row));
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

function buildXlSourceGalleryItems(payload: Record<string, unknown>, sourceSiteKey: string): GalleryItem[] {
  const rows = Array.isArray(payload.images) ? payload.images : [];
  const items: Array<GalleryItem & { sortOrder: number }> = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const sourcePath = normalizeSourceImagePath(record.image);
    if (!sourcePath) {
      return;
    }
    const dedupeKey = sourcePath.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    const sortOrderRaw = Number(record.sort_order);
    const sortOrder = Number.isFinite(sortOrderRaw) ? sortOrderRaw : index + 1;
    items.push({
      id: `xl-gallery-${items.length}-${sortOrder}-${sourcePath}`,
      src: toXljvImageUrl("XL", sourceSiteKey || CREATE_PRODUCT_XL_DEFAULT_SITE_KEY, sourcePath),
      sourcePath,
      isLocal: false,
      sortOrder,
    });
  });

  return items
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ sortOrder: _sortOrder, ...item }) => item);
}

function buildKauflandSourceGalleryItems(imageUrls: string[]): GalleryItem[] {
  const seen = new Set<string>();
  return imageUrls.flatMap((url, index) => {
    const sourceUrl = asTrimmedString(url);
    if (!sourceUrl || seen.has(sourceUrl)) return [];
    seen.add(sourceUrl);
    return [{
      id: `kaufland-gallery-${index}`,
      src: sourceUrl,
      sourcePath: sourceUrl,
      isLocal: false,
    }];
  });
}

function pickPrimaryDescriptionRecord(payload: Record<string, unknown>): Record<string, unknown> {
  const descriptions = Array.isArray(payload.descriptions) ? payload.descriptions : [];
  const records = descriptions.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
  return (
    records.find((row) => asTrimmedString(row.language_code).toLowerCase() === "de") ??
    records.find((row) => Number(row.language_id) === 1) ??
    records[0] ??
    {}
  );
}

function buildXlDescriptionFields(payload: Record<string, unknown>): XlDescriptionFields {
  const primaryDescription = pickPrimaryDescriptionRecord(payload);
  const specials = Array.isArray(payload.specials) ? payload.specials : [];
  const primarySpecial = specials.find((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
  const price = asTrimmedString(primarySpecial?.price);
  const name = asTrimmedString(primaryDescription.name);
  return {
    name,
    seo_url:
      asTrimmedString(primaryDescription.seo_url) ||
      asTrimmedString(payload.seo_url) ||
      buildUrlKeyFromName(name),
    ean: asTrimmedString(payload.ean),
    price,
    uvp: asTrimmedString(payload.price) || computeEvpFromPrice(price),
    manufacturer_id: asTrimmedString(payload.manufacturer_id),
    description: asTrimmedString(primaryDescription.description),
    tag: asTrimmedString(primaryDescription.tag),
    meta_title: asTrimmedString(primaryDescription.meta_title),
    meta_description: asTrimmedString(primaryDescription.meta_description),
    meta_keyword: asTrimmedString(primaryDescription.meta_keyword),
  };
}

async function galleryItemToFile(item: GalleryItem, index: number, t: Record<string, string>): Promise<File> {
  if (item.file instanceof File) {
    return item.file;
  }

  const response = await fetch(item.src);
  if (!response.ok) {
    throw new Error(
      t.createProductFailedDownloadGalleryImage
        .replace("{index}", String(index + 1))
        .replace("{status}", String(response.status))
    );
  }

  const blob = await response.blob();
  const fileName = guessFileNameFromUrl(item.src, index);
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

export default function CreateProductPage() {
  const t = useLabels();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<CreateProductTab>("jv");
  const [isPublishSitesDialogOpen, setIsPublishSitesDialogOpen] = useState(false);
  const [selectedPublishSiteIds, setSelectedPublishSiteIds] = useState<Set<string>>(new Set());
  const activeTabMeta = getCreateProductTabMeta(activeTab, t);
  const controller = useCreateProductController({
    t,
    showToast,
    sourceSite: activeTabMeta.sourceSite,
    preferredSourceSiteKey: activeTabMeta.sourceSiteKey,
  });
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
  const jvDraftRef = useRef<JvCreateProductFields>({
    name: "", urlKey: "", artikelnr: "", price: "", evp: "", bezeichnung: "", kurzbeschreibung: "", shortDescriptionReal: "", metaTitle: "", metaDescription: "", metaKeyword: "", description: "",
  });
  const jvPublishingSelectionsRef = useRef<JvPublishingSelections>({
    rubricIdsBySite: {},
    mainRubricIdBySite: {},
    deliveryIdsBySite: {},
  });
  const xlDraftRefByTab = useRef<Partial<Record<CreateProductTab, LocalDraftSnapshot<XlCreateProductDraft>>>>({});
  const hoodDraftRefByTab = useRef<Partial<Record<CreateProductTab, LocalDraftSnapshot<HoodCreateProductDraft>>>>({});
  const hoodPublishDraftRef = useRef<{ draftKey: string; draft: HoodCreateProductDraft } | null>(null);
  const kauflandDraftRefByTab = useRef<Partial<Record<CreateProductTab, LocalDraftSnapshot<KauflandCreateProductDraft>>>>({});
  const ottoDraftRefByTab = useRef<Partial<Record<CreateProductTab, LocalDraftSnapshot<OttoCreateProductDraft>>>>({});
  const [ottoCategoryByTab, setOttoCategoryByTab] = useState<Partial<Record<CreateProductTab, string>>>({});
  const [ottoCategoryNameByTab, setOttoCategoryNameByTab] = useState<Partial<Record<CreateProductTab, string>>>({});
  const [ottoProductsByProfile, setOttoProductsByProfile] = useState<Partial<Record<OttoProfile, Record<string, unknown>>>>({});
  const [ottoSearchErrors, setOttoSearchErrors] = useState<Partial<Record<OttoProfile, string>>>({});
  const [ottoSearchLoading, setOttoSearchLoading] = useState(false);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [activeGalleryImageId, setActiveGalleryImageId] = useState("");
  const [tabGalleryItemsByTab, setTabGalleryItemsByTab] = useState<Partial<Record<CreateProductTab, GalleryItem[]>>>({});
  const [activeTabGalleryImageIdByTab, setActiveTabGalleryImageIdByTab] = useState<Partial<Record<CreateProductTab, string>>>({});
  const mainLocalImageFilesRef = useRef<File[]>([]);
  const [rubricTreesBySite, setRubricTreesBySite] = useState<RubricTreeCache>({});
  const [rubricTreeLoading, setRubricTreeLoading] = useState(false);
  const [rubricTreeError, setRubricTreeError] = useState("");
  const [rubricSearch, setRubricSearch] = useState("");
  const [rubricSiteKey, setRubricSiteKey] = useState<(typeof JV_RUBRIC_SITE_TABS)[number]["key"]>("JV_DE");
  const [showOnlySelectedRubrics, setShowOnlySelectedRubrics] = useState(false);
  const [expandedRubricIdsBySite, setExpandedRubricIdsBySite] = useState<ExpandedRubricIdsBySite>({});
  const [selectedRubricIdsBySite, setSelectedRubricIdsBySite] = useState<SelectedRubricIdsBySite>({});
  const [mainRubricIdBySite, setMainRubricIdBySite] = useState<MainRubricIdBySite>({});
  const [jvRubricSelectionSourceKey, setJvRubricSelectionSourceKey] = useState("");
  const [xlRubricTree, setXlRubricTree] = useState<RubricTreeNode[]>([]);
  const [xlRubricTreeSourceKey, setXlRubricTreeSourceKey] = useState("");
  const [xlRubricTreeLoading, setXlRubricTreeLoading] = useState(false);
  const [xlRubricTreeError, setXlRubricTreeError] = useState("");
  const [xlRubricSearch, setXlRubricSearch] = useState("");
  const [showOnlySelectedXlRubrics, setShowOnlySelectedXlRubrics] = useState(false);
  const [expandedXlRubricIds, setExpandedXlRubricIds] = useState<Set<number>>(new Set());
  const [selectedXlRubricIds, setSelectedXlRubricIds] = useState<Set<number>>(new Set());
  const [mainXlRubricId, setMainXlRubricId] = useState<number | null>(null);
  const [xlRubricSelectionSourceKey, setXlRubricSelectionSourceKey] = useState("");
  const [deliveryOptionsBySite, setDeliveryOptionsBySite] = useState<DeliveryOptionsCache>({});
  const [deliveryOptionsLoading, setDeliveryOptionsLoading] = useState(false);
  const [deliveryOptionsError, setDeliveryOptionsError] = useState("");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliverySiteKey, setDeliverySiteKey] = useState<(typeof JV_RUBRIC_SITE_TABS)[number]["key"]>("JV_DE");
  const [showOnlySelectedDelivery, setShowOnlySelectedDelivery] = useState(false);
  const [selectedDeliveryIdsBySite, setSelectedDeliveryIdsBySite] = useState<SelectedDeliveryIdsBySite>({});
  const [sendAllSitesLoading, setSendAllSitesLoading] = useState(false);
  const [, setSendAllSitesStatus] = useState("");
  const [, setSendAllSitesLog] = useState("");
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
        setSendAllSitesStatus(t.createProductResumeJvJob.replace("{jobId}", String(jobId)));
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
  useEffect(() => {
    const sku = controller.kidContext?.mainEan.trim() || "";
    if (!sku) {
      setOttoProductsByProfile({});
      setOttoSearchErrors({});
      setOttoSearchLoading(false);
      return;
    }

    let active = true;
    setOttoSearchLoading(true);
    setOttoProductsByProfile({});
    setOttoSearchErrors({});

    void Promise.allSettled((['jv', 'xl'] as OttoProfile[]).map(async (profile) => {
      try {
        const product = await fetchOttoProductBySku(profile, sku);
        if (active) {
          setOttoProductsByProfile((current) => ({ ...current, [profile]: product }));
        }
      } catch (error) {
        if (active) {
          setOttoSearchErrors((current) => ({
            ...current,
            [profile]: error instanceof Error ? error.message : "OTTO product search failed.",
          }));
        }
      }
    })).finally(() => {
      if (active) setOttoSearchLoading(false);
    });

    return () => {
      active = false;
    };
  }, [controller.kidContext?.mainEan]);
  const galleryImages = useMemo(() => controller.sourceSnapshot?.imageUrls ?? [], [controller.sourceSnapshot?.imageUrls]);
  const jvUrlKey = useMemo(() => buildUrlKeyFromName(jvName), [jvName]);
  const jvEvp = useMemo(() => computeEvpFromPrice(jvPrice), [jvPrice]);
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
  const kauflandProduct = useMemo(
    () => (sourcePayload.response_data && typeof sourcePayload.response_data === "object" && !Array.isArray(sourcePayload.response_data)
      ? sourcePayload.response_data
      : {}) as Record<string, unknown>,
    [sourcePayload],
  );
  const sourceCategories = useMemo(() => extractSourceCategories(sourcePayload), [sourcePayload]);
  const sourceContentRows = useMemo(
    () => (Array.isArray(sourceJvFields.content_by_language) ? sourceJvFields.content_by_language : []) as unknown[],
    [sourceJvFields]
  );
  const sourceGalleryItems = useMemo(
    () => buildSourceGalleryItems(sourcePayload, galleryImages, controller.sourceSnapshot?.siteKey || ""),
    [galleryImages, sourcePayload, controller.sourceSnapshot?.siteKey]
  );
  const xlSourceGalleryItems = useMemo(
    () => buildXlSourceGalleryItems(sourcePayload, controller.sourceSnapshot?.siteKey || CREATE_PRODUCT_XL_DEFAULT_SITE_KEY),
    [sourcePayload, controller.sourceSnapshot?.siteKey]
  );
  const kauflandSourceGalleryItems = useMemo(
    () => buildKauflandSourceGalleryItems(galleryImages),
    [galleryImages],
  );
  const activeTabSourceGalleryItems = useMemo(
    () => {
      if (activeTabMeta.sourceSite === "XL") return xlSourceGalleryItems;
      if (activeTabMeta.sourceSite === "KAUFLAND") return kauflandSourceGalleryItems;
      return sourceGalleryItems;
    },
    [activeTabMeta.sourceSite, kauflandSourceGalleryItems, sourceGalleryItems, xlSourceGalleryItems]
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

    // The selected-only view is intentionally flat. Re-walking a full JV
    // taxonomy (and recreating every branch) on a simple toggle made the UI
    // freeze for large storefront trees.
    if (showOnlySelectedRubrics) {
      const nodesById = collectRubricNodesById(rubricTree);
      return Array.from(selectedRubricIds)
        .map((id) => nodesById.get(id) ?? { id, name: `Category ${id}`, children: [] })
        .filter((node) => {
          const label = String(node.name || "").toLowerCase();
          return !query || label.includes(query) || String(node.id).includes(query);
        })
        .map((node) => ({ ...node, children: [] }));
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
  const filteredXlRubricTree = useMemo(() => {
    const query = xlRubricSearch.trim().toLowerCase();
    if (!query && !showOnlySelectedXlRubrics) {
      return xlRubricTree;
    }

    function filterNodes(nodes: RubricTreeNode[]): RubricTreeNode[] {
      const next: RubricTreeNode[] = [];
      for (const node of nodes) {
        const label = String(node.name || "").toLowerCase();
        const code = String(node.id || "");
        const children = Array.isArray(node.children) ? filterNodes(node.children) : [];
        const matchesQuery = !query || label.includes(query) || code.includes(query);
        const matchesSelection = !showOnlySelectedXlRubrics || selectedXlRubricIds.has(node.id);

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

    const filtered = filterNodes(xlRubricTree);
    if (!showOnlySelectedXlRubrics || selectedXlRubricIds.size === 0) {
      return filtered;
    }

    const allTreeIds = collectRubricTreeIds(xlRubricTree);
    const filteredIds = collectRubricTreeIds(filtered);
    const fallbackNodes = Array.from(selectedXlRubricIds)
      .filter((id) => !allTreeIds.has(id) && !filteredIds.has(id))
      .filter((id) => !query || String(id).includes(query))
      .map((id) => ({
        id,
        category_id: id,
        name: "Sonstige",
        children: [],
      }));

    return [...filtered, ...fallbackNodes];
  }, [showOnlySelectedXlRubrics, selectedXlRubricIds, xlRubricSearch, xlRubricTree]);
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
  const expandableXlRubricIds = useMemo(() => collectExpandableRubricIds(filteredXlRubricTree), [filteredXlRubricTree]);
  const areAllXlRubricsExpanded = useMemo(
    () => expandableXlRubricIds.length > 0 && expandableXlRubricIds.every((id) => expandedXlRubricIds.has(id)),
    [expandableXlRubricIds, expandedXlRubricIds]
  );
  const activeMarketplaceSiteIds = activeTabMeta.targetSiteIds;
  const publishSiteOptions: PublishSiteOption[] = allMarketplaceSites
    .filter((site) => PUBLISHABLE_SITE_FAMILIES.has(site.family) && (site.family !== "XL" || site.id === PUBLISHABLE_XL_SITE_ID))
    .map((site) => ({ id: site.id, label: site.name, family: site.family as PublishSiteOption["family"] }));
  const isComingSoonMarketplace = activeTabMeta.marketplace === "EBAY";
  const canCreateProduct = !isComingSoonMarketplace && (activeTab === "jv" || activeTab === "main" || activeMarketplaceSiteIds.length > 0);
  const primaryActionLoading = activeTab === "jv" ? sendAllSitesLoading : controller.submitting;
  const primaryActionLabel = primaryActionLoading ? t.createProductCreatingAction : t.createProductCreateAction;
  const tabGalleryItems = useMemo(
    () => tabGalleryItemsByTab[activeTab] ?? EMPTY_GALLERY_ITEMS,
    [activeTab, tabGalleryItemsByTab],
  );
  const activeTabGalleryImageId = activeTabGalleryImageIdByTab[activeTab] ?? "";
  const activeXlDescriptionFields = useMemo(
    () => buildXlDescriptionFields(sourcePayload),
    [sourcePayload],
  );
  const activeXlSeoUrl = buildUrlKeyFromName(activeXlDescriptionFields.name) || activeXlDescriptionFields.seo_url;
  const activeXlSourceKey = [
    controller.sourceSnapshot?.siteKey || CREATE_PRODUCT_XL_DEFAULT_SITE_KEY,
    controller.sourceSnapshot?.ean || "",
    controller.sourceSnapshot?.sourceProductId || "",
  ].join(":");
  const activeJvSourceKey = [
    controller.sourceSnapshot?.siteKey || "",
    controller.sourceSnapshot?.ean || "",
    controller.sourceSnapshot?.sourceProductId || "",
  ].join(":");
  const activeHoodSourceKey = [
    controller.sourceSnapshot?.siteKey || "",
    controller.sourceSnapshot?.ean || "",
    controller.sourceSnapshot?.sourceProductId || "",
  ].join(":");
  const activeKauflandSourceKey = [
    controller.sourceSnapshot?.siteKey || "",
    controller.sourceSnapshot?.ean || "",
    controller.sourceSnapshot?.sourceProductId || "",
  ].join(":");
  const activeKauflandDescriptionFields = useMemo(
    () => buildKauflandDescriptionFields(kauflandProduct),
    [kauflandProduct],
  );
  const sourceKauflandDraft = useMemo<KauflandCreateProductDraft>(() => ({
    title: firstKauflandText(kauflandProduct.title),
    ean: firstKauflandText(kauflandProduct.ean),
    price: formatKauflandPrice(firstKauflandText(kauflandProduct.price)),
    product: kauflandProduct,
    ...activeKauflandDescriptionFields,
  }), [activeKauflandDescriptionFields, kauflandProduct]);
  const activeXlInitialDraft = xlDraftRefByTab.current[activeTab]?.sourceKey === activeXlSourceKey
    ? xlDraftRefByTab.current[activeTab].draft
    : activeXlDescriptionFields;
  const activeHoodInitialDraft = hoodDraftRefByTab.current[activeTab]?.sourceKey === activeHoodSourceKey
    ? hoodDraftRefByTab.current[activeTab].draft
    : { name: controller.productName, ean: controller.ean, price: controller.price, ...controller.hoodFields };
  const activeKauflandInitialDraft = kauflandDraftRefByTab.current[activeTab]?.sourceKey === activeKauflandSourceKey
    ? kauflandDraftRefByTab.current[activeTab].draft
    : sourceKauflandDraft;
  const activeOttoProfile: OttoProfile | null = activeTabMeta.marketplace === "OTTO"
    ? (activeTabMeta.account === "XL" ? "xl" : "jv")
    : null;
  const activeOttoProduct = activeOttoProfile ? ottoProductsByProfile[activeOttoProfile] : undefined;
  const activeOttoSourceKey = activeTabMeta.sourceSite === "XL"
    ? activeXlSourceKey
    : activeJvSourceKey;
  const activeOttoInitialDraft = ottoDraftRefByTab.current[activeTab]?.sourceKey === activeOttoSourceKey
    ? ottoDraftRefByTab.current[activeTab].draft
    : buildOttoDraft(activeOttoProduct ?? {}, {
      ...EMPTY_OTTO_CREATE_PRODUCT_DRAFT,
      productLine: activeTabMeta.sourceSite === "XL" ? activeXlDescriptionFields.name : jvName,
      ean: activeTabMeta.sourceSite === "XL" ? activeXlDescriptionFields.ean : String(controller.sourceSnapshot?.ean || ""),
      sku: activeTabMeta.sourceSite === "XL" ? activeXlDescriptionFields.ean : String(controller.sourceSnapshot?.ean || ""),
      productReference: activeTabMeta.sourceSite === "XL" ? activeXlDescriptionFields.ean : String(controller.sourceSnapshot?.ean || ""),
      category: ottoCategoryNameByTab[activeTab] ?? "",
    });

  useEffect(() => {
    const jvFields = controller.sourceSnapshot?.rawPayload?.jv_fields;
    const contentByLanguage = Array.isArray((jvFields as { content_by_language?: unknown })?.content_by_language)
      ? ((jvFields as { content_by_language?: unknown[] }).content_by_language as unknown[])
      : [];

    const primaryRow = pickPrimaryJvContentRow(contentByLanguage);
    const nextJvFields = {
      name: String(primaryRow?.name || ""),
      artikelnr: String((jvFields as { artikelnr?: unknown })?.artikelnr || ""),
      price: String(controller.sourceSnapshot?.rawPayload?.price || ""),
      description: String(primaryRow?.description || ""),
      bezeichnung: String(primaryRow?.bezeichnung || ""),
      metaTitle: String(primaryRow?.meta_title || ""),
      metaDescription: String(primaryRow?.meta_description || ""),
      metaKeyword: String(primaryRow?.meta_keyword || ""),
      shortDescriptionReal: String(primaryRow?.short_description_real || ""),
      kurzbeschreibung: String(primaryRow?.kurzbeschreibung || ""),
    };
    jvDraftRef.current = { ...nextJvFields, urlKey: buildUrlKeyFromName(nextJvFields.name), evp: computeEvpFromPrice(nextJvFields.price) };
    setJvName(nextJvFields.name);
    setJvArtikelnr(nextJvFields.artikelnr);
    setJvPrice(nextJvFields.price);
    setJvDescription(nextJvFields.description);
    setJvBezeichnung(nextJvFields.bezeichnung);
    setJvMetaTitle(nextJvFields.metaTitle);
    setJvMetaDescription(nextJvFields.metaDescription);
    setJvMetaKeyword(nextJvFields.metaKeyword);
    setJvShortDescriptionReal(nextJvFields.shortDescriptionReal);
    setJvKurzbeschreibung(nextJvFields.kurzbeschreibung);
  }, [controller.sourceSnapshot?.rawPayload]);

  useEffect(() => {
    setGalleryItems((current) => {
      if (activeTab !== "jv") {
        return current;
      }
      const localItems = current.filter((item) => item.isLocal);
      const remoteItems = sourceGalleryItems;
      return [...remoteItems, ...localItems];
    });
  }, [activeTab, sourceGalleryItems]);

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
    const firstImageId = tabGalleryItems[0]?.id ?? "";
    setActiveTabGalleryImageIdByTab((current) => {
      const currentImageId = current[activeTab] ?? "";
      const nextImageId =
        currentImageId && tabGalleryItems.some((item) => item.id === currentImageId)
          ? currentImageId
          : firstImageId;
      if ((current[activeTab] ?? "") === nextImageId) {
        return current;
      }
      return {
        ...current,
        [activeTab]: nextImageId,
      };
    });
  }, [activeTab, tabGalleryItems]);

  useEffect(() => {
    if (activeTab === "jv") {
      return;
    }
    setTabGalleryItemsByTab((current) => {
      const currentItems = current[activeTab] ?? [];
      const localItems = currentItems.filter((item) => item.isLocal);
      return {
        ...current,
        [activeTab]: [...activeTabSourceGalleryItems, ...localItems],
      };
    });
  }, [activeTab, activeTabSourceGalleryItems]);

  useEffect(() => {
    const sourceSiteKey = String(controller.sourceSnapshot?.siteKey || CREATE_PRODUCT_XL_DEFAULT_SITE_KEY).trim();
    const normalizedSourceSiteKey = (sourceSiteKey || CREATE_PRODUCT_XL_DEFAULT_SITE_KEY).toLowerCase();
    if (activeTabMeta.sourceSite !== "XL" || xlRubricTreeSourceKey === normalizedSourceSiteKey) {
      return;
    }

    let active = true;
    setXlRubricTreeLoading(true);
    setXlRubricTreeError("");

    const rubricTreeUrl =
      `/api/v1/xl/rubrics/tree/?site=XL&site_key=${encodeURIComponent(normalizedSourceSiteKey)}&language=de`;

    void apiFetch(rubricTreeUrl)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(`Failed to load XL rubric tree: HTTP ${response.status}`);
        }
        const tree = normalizeRubricTreePayload(payload);
        if (!active) {
          return;
        }
        setXlRubricTree(tree);
        setXlRubricTreeSourceKey(normalizedSourceSiteKey);
        setExpandedXlRubricIds(new Set(collectExpandableRubricIds(tree)));
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setXlRubricTreeError(error instanceof Error ? error.message : "Failed to load XL rubric tree.");
      })
      .finally(() => {
        if (active) {
          setXlRubricTreeLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeTabMeta.sourceSite, controller.sourceSnapshot?.siteKey, xlRubricTreeSourceKey]);

  useEffect(() => {
    if (activeTabMeta.sourceSite !== "XL" || xlRubricSelectionSourceKey === activeXlSourceKey) {
      return;
    }

    const selectedCategoryIds = sourceCategories.map((category) => category.category_id);
    const mainCategoryId =
      sourceCategories.find((category) => category.main_category)?.category_id ??
      selectedCategoryIds[0] ??
      null;

    setSelectedXlRubricIds(new Set(selectedCategoryIds));
    setMainXlRubricId(mainCategoryId);
    setXlRubricSelectionSourceKey(activeXlSourceKey);
  }, [activeTabMeta.sourceSite, activeXlSourceKey, sourceCategories, xlRubricSelectionSourceKey]);

  useEffect(() => {
    if (activeTabMeta.sourceSite !== "JV" || jvRubricSelectionSourceKey === activeJvSourceKey) {
      return;
    }

    const sourceSiteKey = String(controller.sourceSnapshot?.siteKey || "").trim().toUpperCase();
    const sourceSite = JV_RUBRIC_SITE_TABS.find((site) => site.key === sourceSiteKey);
    if (!sourceSite) {
      return;
    }

    const selectedCategoryIds = sourceCategories.map((category) => category.category_id);
    const mainCategoryId =
      sourceCategories.find((category) => category.main_category)?.category_id ??
      selectedCategoryIds[0] ??
      null;

    setSelectedRubricIdsBySite((current) => ({
      ...current,
      [sourceSite.key]: new Set(selectedCategoryIds),
    }));
    setMainRubricIdBySite((current) => ({
      ...current,
      [sourceSite.key]: mainCategoryId,
    }));
    setRubricSiteKey(sourceSite.key);
    setJvRubricSelectionSourceKey(activeJvSourceKey);
  }, [
    activeJvSourceKey,
    activeTabMeta.sourceSite,
    controller.sourceSnapshot?.siteKey,
    jvRubricSelectionSourceKey,
    sourceCategories,
  ]);

  useEffect(() => {
    return () => {
      localObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localObjectUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "main") {
      return;
    }
    setRubricSiteKey("JV_DE");
    setDeliverySiteKey("JV_DE");
  }, [activeTab]);



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

  function handleTabGalleryUpload(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    const nextItems = Array.from(files).map((file, index) => ({
      id: `${activeTab}-local-${Date.now()}-${index}-${file.name}`,
      src: URL.createObjectURL(file),
      file,
      isLocal: true,
    }));
    if (activeTab === "main") {
      mainLocalImageFilesRef.current = [
        ...mainLocalImageFilesRef.current,
        ...nextItems.flatMap((item) => item.file instanceof File ? [item.file] : []),
      ];
    }
    nextItems.forEach((item) => localObjectUrlsRef.current.push(item.src));

    setTabGalleryItemsByTab((current) => ({
      ...current,
      [activeTab]: [...(current[activeTab] ?? []), ...nextItems],
    }));
    setActiveTabGalleryImageIdByTab((current) => ({
      ...current,
      [activeTab]: current[activeTab] || nextItems[0]?.id || "",
    }));
  }

  function getLocalImageFiles(items: GalleryItem[]): File[] {
    return items
      .flatMap((item) => item.isLocal && item.file instanceof File ? [item.file] : []);
  }

  function getActiveTabLocalImageFiles(): File[] {
    if (activeTab === "main") {
      return mainLocalImageFilesRef.current;
    }
    const items = activeTab === "jv"
      ? galleryItems
      : tabGalleryItemsByTab[activeTab] ?? [];
    return getLocalImageFiles(items);
  }

  function handleDeleteTabGalleryItem(itemId: string) {
    setTabGalleryItemsByTab((current) => {
      const currentItems = current[activeTab] ?? [];
      const target = currentItems.find((item) => item.id === itemId);
      if (activeTab === "main" && target?.file instanceof File) {
        mainLocalImageFilesRef.current = mainLocalImageFilesRef.current.filter((file) => file !== target.file);
      }
      if (target?.isLocal) {
        URL.revokeObjectURL(target.src);
        localObjectUrlsRef.current = localObjectUrlsRef.current.filter((url) => url !== target.src);
      }
      return {
        ...current,
        [activeTab]: currentItems.filter((item) => item.id !== itemId),
      };
    });
  }

  function handleMoveTabGalleryItem(sourceItemId: string, targetItemId: string) {
    if (!sourceItemId || !targetItemId || sourceItemId === targetItemId) {
      return;
    }

    setTabGalleryItemsByTab((current) => {
      const currentItems = current[activeTab] ?? [];
      const sourceIndex = currentItems.findIndex((item) => item.id === sourceItemId);
      const targetIndex = currentItems.findIndex((item) => item.id === targetItemId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...currentItems];
      const [movedItem] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      return {
        ...current,
        [activeTab]: next,
      };
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

  function toggleSelectedXlRubric(rubricId: number) {
    setSelectedXlRubricIds((current) => {
      const next = new Set(current);
      if (next.has(rubricId)) {
        next.delete(rubricId);
      } else {
        next.add(rubricId);
      }
      return next;
    });
    setMainXlRubricId((current) => {
      if (current !== rubricId) {
        return current;
      }
      return selectedXlRubricIds.has(rubricId) ? null : current;
    });
  }

  function toggleMainXlRubric(rubricId: number) {
    setMainXlRubricId((current) => (current === rubricId ? null : rubricId));
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

  async function uploadGalleryForSite(siteKey: (typeof JV_RUBRIC_SITE_TABS)[number]["key"], ean: string, jvFields: JvCreateProductFields) {
    if (galleryItems.length === 0) {
      return {
        image: undefined,
        images: [] as Array<{ image: string; sort_order: number }>,
      };
    }

    // cosmoshop serves the gallery from a folder named after the artikelnr (the
    // media key), so the gallery files must land there. Use the same value that
    // buildPayloadForSite writes as the article's artikelnr.
    const artikelnr = (jvFields.artikelnr || ean).trim();

    const uploadOne = async (index: number, item: (typeof galleryItems)[number]): Promise<string> => {
      // Any non-local (marketplace source) image must be relayed through the backend, which
      // downloads it server-side. Fetching it in the browser fails CORS — the source domains
      // (e.g. jvmoebel.de) don't send Access-Control-Allow-Origin. resolveGallerySourceUrl
      // returns the http(s) src directly, or rebuilds it from the source path.
      if (!item.isLocal) {
        const sourceUrl = resolveGallerySourceUrl(item, controller.sourceSnapshot?.siteKey || "");
        if (!sourceUrl) {
          throw new Error(
            t.createProductMissingSourceImageUrl
              .replace("{site}", siteKey)
              .replace("{index}", String(index + 1))
          );
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
              t.createProductImageRelayUploadFailed
                .replace("{site}", siteKey)
                .replace("{index}", String(index + 1))
                .replace("{status}", String(response.status))
          );
        }
        return uploadedPath;
      }

      const file = await galleryItemToFile(item, index, t);
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
            t.createProductImageUploadFailed
              .replace("{site}", siteKey)
              .replace("{index}", String(index + 1))
              .replace("{status}", String(response.status))
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
    uploadedGallery: { image?: string; images: Array<{ image: string; sort_order: number }> },
    jvFields: JvCreateProductFields,
  ): JvCreateAndPushPayload {
    const ean = asTrimmedString(controller.kidContext?.mainEan || controller.sourceSnapshot?.ean || sourcePayload.ean);
    const price = normalizeDecimalPrice(jvFields.price || asTrimmedString(sourcePayload.price));
    const selectedRubrics = jvPublishingSelectionsRef.current.rubricIdsBySite[siteKey] ?? [];
    const mainRubric = jvPublishingSelectionsRef.current.mainRubricIdBySite[siteKey] ?? null;
    const selectedDeliveryId = jvPublishingSelectionsRef.current.deliveryIdsBySite[siteKey]?.[0];
    const orderedRubrics = selectedRubrics.slice().sort((left, right) => {
      if (left === mainRubric) return -1;
      if (right === mainRubric) return 1;
      return 0;
    });

    return {
      ean,
      source_model: (jvFields.artikelnr || ean).trim(),
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
        artikelnr: (jvFields.artikelnr || ean).trim(),
        jfsku: asTrimmedString(sourceJvFields.jfsku),
        inaktiv: 0,
        ean,
        urlkey: buildUrlKeyFromName(jvFields.name) || undefined,
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
            name: jvFields.name.trim(),
            description: jvFields.description,
            bezeichnung: jvFields.bezeichnung,
            meta_title: jvFields.metaTitle,
            meta_description: jvFields.metaDescription,
            meta_keyword: jvFields.metaKeyword,
            keywords: jvFields.metaKeyword,
            short_description_real: jvFields.shortDescriptionReal,
            kurzbeschreibung: jvFields.kurzbeschreibung,
          },
        ],
      },
    };
  }

  async function handleSendToAllJvSites(targetSiteKeys = JV_RUBRIC_SITE_TABS.map((site) => site.key)) {
    const jvFields = jvDraftRef.current;
    const ean = asTrimmedString(controller.kidContext?.mainEan || controller.sourceSnapshot?.ean || sourcePayload.ean);
    if (!/^\d{13}$/.test(ean)) {
      showToast(t.validationEanExact13Digits, "error");
      return;
    }
    if (!jvFields.name.trim()) {
      showToast(t.createProductNameRequiredBeforeSend, "error");
      return;
    }
    if (!jvFields.artikelnr.trim()) {
      showToast(t.createProductArtikelnrRequiredBeforeSend, "error");
      return;
    }

    const validationErrors: string[] = [];
    const targetSites = JV_RUBRIC_SITE_TABS.filter((site) => targetSiteKeys.includes(site.key));
    for (const site of targetSites) {
      const selectedRubrics = jvPublishingSelectionsRef.current.rubricIdsBySite[site.key] ?? [];
      const mainRubric = jvPublishingSelectionsRef.current.mainRubricIdBySite[site.key] ?? null;
      const selectedDelivery = jvPublishingSelectionsRef.current.deliveryIdsBySite[site.key] ?? [];

      if (selectedRubrics.length === 0) {
        validationErrors.push(t.createProductSelectAtLeastOneRubric.replace("{site}", site.label));
      }
      if (!mainRubric || !selectedRubrics.includes(mainRubric)) {
        validationErrors.push(t.createProductSelectMainRubric.replace("{site}", site.label));
      }
      if (selectedDelivery.length !== 1) {
        validationErrors.push(t.createProductSelectExactlyOneDelivery.replace("{site}", site.label));
      }
    }

    if (validationErrors.length > 0) {
      const message = validationErrors.join(" ");
      setSendAllSitesStatus(message);
      showToast(message, "error");
      return;
    }

    if (!window.confirm(t.createProductConfirmJvCreate.replace("{ean}", ean))) {
      return;
    }

    setSendAllSitesLoading(true);
    setSendAllSitesStatus(t.createProductQueueingJvJob);
    setSendAllSitesLog("");
    showToast(
      t.createProductJvQueuedToast,
      "info"
    );

    // Upload galleries + build the per-site payloads on click, then hand the
    // slow create-and-push work to a server-side job (run by the JV batch
    // worker) so it survives page reloads and the user can keep working.
    void (async () => {
      try {
        if (isMountedRef.current) {
          setSendAllSitesStatus(t.createProductUploadingImagesForSites.replace("{count}", String(targetSites.length)));
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
          targetSites.map(async (site) => {
            const uploadedGallery = await uploadGalleryForSite(site.key, ean, jvFields);
            const payload = buildPayloadForSite(site.key, uploadedGallery, jvFields);
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
          name: jvFields.name.trim(),
          sites,
        });

        if (!response.ok) {
          const message =
            asTrimmedString((responsePayload as Record<string, unknown>).detail) ||
            t.createProductFailedQueueJob.replace("{status}", String(response.status));
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
          const message = t.createProductQueueAcceptedNoJobId;
          if (isMountedRef.current) {
            setSendAllSitesStatus(message);
            setSendAllSitesLoading(false);
          }
          showToast(message, "error");
          return;
        }

        persistActiveCreateJob(jobId, ean);
        if (isMountedRef.current) {
          setSendAllSitesStatus(
            t.createProductJvJobQueuedBackground
              .replace("{jobId}", String(jobId))
              .replace("{count}", String(targetSites.length))
          );
        }
        await pollCreateJob(jobId);
      } catch (error) {
        const message = error instanceof Error ? error.message : t.createProductJvBackgroundFailed;
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
          showToast(t.createProductJvJobNotFound.replace("{jobId}", String(jobId)), "error");
          return;
        }

        const job = (payload.job ?? payload) as JvBatchJobStatus | undefined;
        const statusValue = String(job?.status ?? "").toLowerCase();
        const items = Array.isArray(job?.items) ? job!.items! : [];
        const total = items.length || JV_RUBRIC_SITE_TABS.length;
        const appliedCount = items.filter((item) => String(item.status).toLowerCase() === "applied").length;

        if (statusValue === "applied" || statusValue === "failed") {
          clearActiveCreateJob();
          const summary = t.createProductJvCreateFinished
            .replace("{applied}", String(appliedCount))
            .replace("{total}", String(total));
          if (isMountedRef.current) {
            setSendAllSitesStatus(summary);
            setSendAllSitesLoading(false);
            setSendAllSitesLog(JSON.stringify(job, null, 2));
          }
          showToast(summary, statusValue === "applied" ? "success" : "error");
          return;
        }

        if (isMountedRef.current) {
          setSendAllSitesStatus(
            t.createProductJvCreateProgress
              .replace("{applied}", String(appliedCount))
              .replace("{total}", String(total))
              .replace("{jobId}", String(jobId))
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      if (isMountedRef.current) {
        setSendAllSitesStatus(t.createProductJvJobStillRunning.replace("{jobId}", String(jobId)));
        setSendAllSitesLoading(false);
      }
    } finally {
      if (pollingJobRef.current === jobId) pollingJobRef.current = null;
    }
  }

  function renderRubricTree(nodes: RubricTreeNode[], level = 0): ReactNode[] {
    return nodes.flatMap((node) => {
      const label = String(
        node.name || t.createProductRubricLabel.replace("{id}", String(node.id || ""))
      ).trim();
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
              aria-label={t.createProductMainRubricAria.replace("{label}", label)}
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
                aria-label={
                  isExpanded
                    ? t.createProductCollapseRubricAria.replace("{label}", label)
                    : t.createProductExpandRubricAria.replace("{label}", label)
                }
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

  function renderXlRubricTree(nodes: RubricTreeNode[], level = 0): ReactNode[] {
    return nodes.flatMap((node) => {
      const label = String(
        node.name || t.createProductRubricLabel.replace("{id}", String(node.id || ""))
      ).trim();
      const children = Array.isArray(node.children) ? node.children : [];
      const isExpanded = expandedXlRubricIds.has(node.id);
      const hasChildren = children.length > 0;
      const isSelected = selectedXlRubricIds.has(node.id);
      const isMain = mainXlRubricId === node.id;

      return [
        <div
          key={`xl-${level}-${node.id}`}
          className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm text-foreground"
        >
          <div className="flex w-10 shrink-0 items-center gap-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelectedXlRubric(node.id)}
              className="size-4 rounded-[4px] border border-[#cfd8e3] bg-white accent-[#1677ff]"
            />
            <input
              type="checkbox"
              checked={isMain}
              onChange={() => toggleMainXlRubric(node.id)}
              disabled={!isSelected}
              className="size-4 rounded-[4px] border border-[#cfd8e3] bg-white accent-[#1677ff] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t.createProductMainRubricAria.replace("{label}", label)}
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
                  setExpandedXlRubricIds((current) => {
                    const next = new Set(current);
                    if (next.has(node.id)) {
                      next.delete(node.id);
                    } else {
                      next.add(node.id);
                    }
                    return next;
                  })
                }
                className="flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-pill)] border border-border/70 bg-background text-xs text-muted-foreground transition hover:text-foreground"
                aria-label={
                  isExpanded
                    ? t.createProductCollapseRubricAria.replace("{label}", label)
                    : t.createProductExpandRubricAria.replace("{label}", label)
                }
              >
                {isExpanded ? "-" : "+"}
              </button>
            ) : (
              <span className="inline-block size-5 shrink-0" />
            )}
            <span className="min-w-0">{label}</span>
          </div>
        </div>,
        ...(hasChildren && isExpanded ? renderXlRubricTree(children, level + 1) : []),
      ];
    });
  }

  function submitKauflandCreate(siteIds: string[]) {
    const draft = kauflandDraftRefByTab.current[activeTab]?.sourceKey === activeKauflandSourceKey
      ? kauflandDraftRefByTab.current[activeTab].draft
      : sourceKauflandDraft;
    return controller.handleCreateProduct({}, siteIds, {
      kauflandDescription: draft.description,
      kauflandShortDescription: draft.shortDescription,
      kauflandTitle: draft.title,
      kauflandEan: draft.ean,
      kauflandPrice: draft.price,
      kauflandFields: buildKauflandFieldsFromDraft(draft.product),
      kauflandOverrides: {
        ...sanitizeKauflandDraftProduct(draft.product),
        title: draft.title,
        ean: draft.ean,
        price: draft.price,
      },
    }, getActiveTabLocalImageFiles());
  }

  function submitOttoCreate(siteIds: string[]) {
    const draft = ottoDraftRefByTab.current[activeTab]?.sourceKey === activeOttoSourceKey
      ? ottoDraftRefByTab.current[activeTab].draft
      : activeOttoInitialDraft;
    const imageUrls = tabGalleryItems.map((item) => item.src.trim()).filter(Boolean);
    const productReference = draft.productReference.trim() || draft.sku.trim() || draft.ean.trim();
    const ean = draft.ean.trim() || controller.ean.trim();
    const deliveryTime = Number(draft.deliveryTime);
    if (!Number.isInteger(deliveryTime) || deliveryTime < 1) {
      showToast("Enter a delivery time in whole days for OTTO.", "error");
      return;
    }
    const shippingProfileId = draft.shippingProfileId?.trim() ?? "";
    if (!shippingProfileId) {
      showToast("Select a shipping profile for OTTO.", "error");
      return;
    }
    const attributeNames = draft.attributeNames ?? {};
    const attributeEntries = Object.entries({ ...draft.additionalAttributes, ...draft.attributeOverrides })
      .filter(([, value]) => value.trim());
    const unresolvedAttributeIds = attributeEntries
      .map(([attributeId]) => attributeId)
      .filter((attributeId) => !attributeNames[attributeId]);
    if (unresolvedAttributeIds.length > 0) {
      showToast("OTTO attribute names are not loaded yet. Reopen the category and try again.", "error");
      return;
    }
    const attributes = attributeEntries
      .map(([attributeId, value]) => ({ name: attributeNames[attributeId], values: [value] }));
    return controller.handleCreateProduct({}, siteIds, {
      ottoEan: ean,
      ottoTitle: draft.productLine.trim(),
      ottoPrice: draft.price.trim() || controller.price.trim(),
      ottoImageUrls: imageUrls,
      ottoPayload: {
        productReference,
        sku: draft.sku.trim() || productReference,
        ean,
        shippingProfileId,
        productDescription: {
          category: draft.category.trim(),
          productLine: draft.productLine.trim(),
          description: draft.description.trim(),
          bulletPoints: draft.bulletPoints.map((value) => value.trim()).filter(Boolean),
          attributes,
        },
        mediaAssets: imageUrls.map((location) => ({
          type: "IMAGE",
          location,
          filename: location.split("/").pop() || productReference,
        })),
        pricing: { standardPrice: { amount: Number(draft.price || controller.price), currency: "EUR" }, vat: "FULL" },
        delivery: { type: "PARCEL", deliveryTime },
        order: { maxOrderQuantity: 1 },
        compliance: { productSafety: {} },
      },
    }, getActiveTabLocalImageFiles());
  }

  function handlePrimaryCreateAction() {
    if (activeTab === "jv") {
      return void handleSendToAllJvSites();
    }

    if (activeTab === "xl") {
      const draft = xlDraftRefByTab.current[activeTab]?.sourceKey === activeXlSourceKey
        ? xlDraftRefByTab.current[activeTab].draft
        : activeXlDescriptionFields;
      return void controller.handleCreateProductForXlDefaultSite(draft, getActiveTabLocalImageFiles());
    }

    if (activeTab === "main") {
      return void handleMainCreate();
    }

    if (activeTabMeta.marketplace === "HOOD") {
      const draft = hoodPublishDraftRef.current?.draftKey === activeHoodSourceKey
        ? hoodPublishDraftRef.current.draft
        : hoodDraftRefByTab.current[activeTab]?.sourceKey === activeHoodSourceKey
        ? hoodDraftRefByTab.current[activeTab].draft
        : activeHoodInitialDraft;
      return void controller.handleCreateProductForHoodSiteIds(activeMarketplaceSiteIds, {
        name: draft.name,
        ean: draft.ean,
        price: draft.price,
        fields: {
          description: draft.description,
          quantity: draft.quantity,
          condition: draft.condition,
          itemMode: draft.itemMode,
          itemNumber: draft.itemNumber,
          productPropertiesText: draft.productPropertiesText,
        },
      }, getActiveTabLocalImageFiles());
    }

    if (activeTabMeta.marketplace === "KAUFLAND") {
      return void submitKauflandCreate(activeMarketplaceSiteIds);
    }

    if (activeTabMeta.marketplace === "OTTO") {
      return void submitOttoCreate(activeMarketplaceSiteIds);
    }

    return void controller.handleCreateProductForSiteIds(activeMarketplaceSiteIds);
  }

  function openPublishSitesDialog() {
    setSelectedPublishSiteIds(
      new Set(
        activeTab === "jv"
          ? Object.keys(JV_SITE_KEY_BY_MARKETPLACE_SITE_ID)
          : activeTab === "xl"
            ? [PUBLISHABLE_XL_SITE_ID]
            : [],
      ),
    );
    setIsPublishSitesDialogOpen(true);
  }

  function confirmPublishSites() {
    const selectedJvSiteKeys = Array.from(selectedPublishSiteIds)
      .map((siteId) => JV_SITE_KEY_BY_MARKETPLACE_SITE_ID[siteId as keyof typeof JV_SITE_KEY_BY_MARKETPLACE_SITE_ID])
      .filter((siteKey): siteKey is (typeof JV_RUBRIC_SITE_TABS)[number]["key"] => Boolean(siteKey));
    const selectedNonJvSiteIds = Array.from(selectedPublishSiteIds).filter(
      (siteId) => !(siteId in JV_SITE_KEY_BY_MARKETPLACE_SITE_ID),
    );

    if (selectedJvSiteKeys.length === 0 && selectedNonJvSiteIds.length === 0) {
      showToast("Выберите хотя бы один сайт для публикации.", "error");
      return;
    }

    setIsPublishSitesDialogOpen(false);
    if (selectedJvSiteKeys.length > 0) {
      void handleSendToAllJvSites(selectedJvSiteKeys);
    }
    if (selectedNonJvSiteIds.length > 0) {
      if (activeTab === "xl") {
        const draft = xlDraftRefByTab.current[activeTab]?.sourceKey === activeXlSourceKey
          ? xlDraftRefByTab.current[activeTab].draft
          : activeXlDescriptionFields;
        void controller.handleCreateProductForXlDefaultSite(draft, getActiveTabLocalImageFiles());
        return;
      }

      if (activeTabMeta.marketplace === "HOOD") {
        const draft = hoodPublishDraftRef.current?.draftKey === activeHoodSourceKey
          ? hoodPublishDraftRef.current.draft
          : hoodDraftRefByTab.current[activeTab]?.sourceKey === activeHoodSourceKey
            ? hoodDraftRefByTab.current[activeTab].draft
            : activeHoodInitialDraft;
        void controller.handleCreateProductForHoodSiteIds(selectedNonJvSiteIds, {
          name: draft.name,
          ean: draft.ean,
          price: draft.price,
          fields: {
            description: draft.description,
            quantity: draft.quantity,
            condition: draft.condition,
            itemMode: draft.itemMode,
            itemNumber: draft.itemNumber,
            productPropertiesText: draft.productPropertiesText,
          },
        }, getActiveTabLocalImageFiles());
        return;
      }

      if (activeTabMeta.marketplace === "KAUFLAND") {
        void submitKauflandCreate(selectedNonJvSiteIds);
        return;
      }

      if (activeTabMeta.marketplace === "OTTO") {
        void submitOttoCreate(selectedNonJvSiteIds);
        return;
      }

      void controller.handleCreateProduct({}, selectedNonJvSiteIds, undefined, getActiveTabLocalImageFiles());
    }
  }

  function handleMainCreate() {
    const siteKey = "JV_DE";
    const selectedCategoryIds = jvPublishingSelectionsRef.current.rubricIdsBySite[siteKey] ?? [];
    const mainCategoryId = jvPublishingSelectionsRef.current.mainRubricIdBySite[siteKey] ?? null;
    const selectedDeliveryId = jvPublishingSelectionsRef.current.deliveryIdsBySite[siteKey]?.[0];

    if (selectedCategoryIds.length === 0) {
      showToast("Select at least one JV DE category before creating the job.", "error");
      return;
    }
    if (!mainCategoryId || !selectedCategoryIds.includes(mainCategoryId)) {
      showToast("Select one main JV DE category before creating the job.", "error");
      return;
    }
    if (selectedDeliveryId === undefined) {
      showToast("Select one JV DE delivery option before creating the job.", "error");
      return;
    }

    const orderedCategoryIds = selectedCategoryIds.sort((left, right) => {
      if (left === mainCategoryId) return -1;
      if (right === mainCategoryId) return 1;
      return left - right;
    });

    return void controller.handleCreateProduct({
      categories: orderedCategoryIds.map((categoryId) => ({
        category_id: categoryId,
        main_category: categoryId === mainCategoryId,
      })),
      jv_fields: {
        lieferzeitid: selectedDeliveryId,
        lieferzeit: selectedDeliveryId,
        lieferzeit_id: selectedDeliveryId,
      },
    }, undefined, undefined, getActiveTabLocalImageFiles());
  }

  return (
    <AppShell
      title={t.createProduct}
      subtitle={t.createProduct}
    >
      <div
        className={[
          "rounded-[var(--radius-card)] border border-border/70 bg-card p-4",
          isComingSoonMarketplace ? "flex h-[calc(100vh-24px)] flex-col" : "",
        ].join(" ")}
      >
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
                    "h-10 min-w-[110px] rounded-[var(--radius-control)] border border-border/70 bg-card px-4 text-xs font-semibold uppercase tracking-normal shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/5",
                    isActive
                      ? "border-primary/35 bg-primary/10 text-primary"
                      : "text-foreground",
                  ].join(" ")}
                >
                  {getCreateProductTabLabel(tab, t)}
                </button>
              );
            })}
          </div>

          <div className="flex min-h-10 items-center justify-end gap-3">
            <CreateProductEanPoolPanel />
            <button
              type="button"
              onClick={openPublishSitesDialog}
              disabled={primaryActionLoading || !canCreateProduct}
              className="flex min-h-10 items-center justify-center rounded-[var(--radius-control)] bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                activeTab === "jv"
                  ? t.createProductOnJvSites
                  : t.createProductOnAllSelectedSites
              }
            >
              {primaryActionLabel}
            </button>
            {isLoading ? (
              <div
                className="size-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
                aria-label={t.createProductLoadingSourceData}
              />
            ) : null}
          </div>
        </div>

        <PublishSitesDialog
          open={isPublishSitesDialogOpen}
          title={activeTabMeta.label}
          sites={publishSiteOptions}
          selectedSiteIds={selectedPublishSiteIds}
          onOpenChange={setIsPublishSitesDialogOpen}
          onSelectedSiteIdsChange={setSelectedPublishSiteIds}
          onConfirm={confirmPublishSites}
        />

        {activeTab === "jv" ? (
          <div className="mt-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
              <JvCreateProductPanel
                fields={{ name: jvName, urlKey: jvUrlKey, artikelnr: jvArtikelnr, price: jvPrice, evp: jvEvp, bezeichnung: jvBezeichnung, kurzbeschreibung: jvKurzbeschreibung, shortDescriptionReal: jvShortDescriptionReal, metaTitle: jvMetaTitle, metaDescription: jvMetaDescription, metaKeyword: jvMetaKeyword, description: jvDescription }}
                previewHtml={normalizedDescriptionPreviewHtml}
                descriptionMode={jvDescriptionMode}
                labels={{ name: t.name, urlKey: t.xljvUrlKey, artikelnr: t.createProductArtikelnr, price: t.price, bezeichnung: t.bezeichnungLabel, kurzbeschreibung: t.kurzbeschreibungLabel, shortDescriptionReal: t.createProductShortDescriptionReal, metaTitle: t.metaTitle, metaDescription: t.metaDescription, metaKeyword: t.metaKeyword, description: t.description, keywordPlaceholder: t.createProductKeywordPlaceholder, code: t.codeLabel, preview: t.previewLabel }}
                onFieldDraftChange={(key, value) => {
                  jvDraftRef.current = { ...jvDraftRef.current, [key]: value };
                }}
                onDescriptionModeChange={setJvDescriptionMode}
                buildUrlKey={buildUrlKeyFromName}
                computeEvp={computeEvpFromPrice}
              />

              <div className="w-full space-y-3 xl:ml-auto xl:w-[520px] xl:flex-none">
                <CreateProductImageGallery
                  items={galleryItems}
                  activeItemId={activeGalleryImageId}
                  previewAlt={t.createProductJvGalleryPreview}
                  emptyPreviewLabel={t.noImagesInGallery}
                  emptyGalleryLabel={t.createProductNoGalleryImages}
                  uploadLabel={t.productEditorUploadImagesAction}
                  thumbnailAlt={(index) => t.createProductJvGalleryThumbnail.replace("{index}", String(index + 1))}
                  deleteAlt={(index) => t.createProductDeleteImage.replace("{index}", String(index + 1))}
                  onActiveItemChange={setActiveGalleryImageId}
                  onFilesSelected={handleGalleryUpload}
                  onDeleteItem={handleDeleteGalleryItem}
                  onMoveItem={handleMoveGalleryItem}
                />
                <JvPublishingOptionsPanel
                  sourceSiteKey={controller.sourceSnapshot?.siteKey}
                  sourceCategories={sourceCategories}
                  sourceDeliveryId={asIntegerOrUndefined(sourceJvFields.lieferzeitid)}
                  onSelectionsChange={(selections) => {
                    jvPublishingSelectionsRef.current = selections;
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {activeTab !== "jv" && !isComingSoonMarketplace ? (
          <div className="mt-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
            <div className={[
              "flex flex-col gap-4 xl:flex-row",
              activeTabMeta.sourceSite === "HOOD" ? "xl:items-stretch" : "xl:items-start",
            ].join(" ")}>
              <div className={[
                "min-w-0 flex-1",
                activeTabMeta.sourceSite === "HOOD" ? "xl:flex xl:flex-col" : "",
              ].join(" ")}>
                {activeTabMeta.sourceSite === "HOOD" ? (
                  <HoodCreateProductPanel
                    initialDraft={activeHoodInitialDraft}
                    draftKey={activeHoodSourceKey}
                    publishDraftRef={hoodPublishDraftRef}
                    codeLabel={t.codeLabel}
                    previewLabel={t.previewLabel}
                    previewDocumentFor={(description) => makeHoodDescriptionPreviewEditableDocument(buildHoodDescriptionPreviewDocument(description, activeTabMeta.account))}
                    onDraftChange={(draft) => {
                      hoodDraftRefByTab.current[activeTab] = { sourceKey: activeHoodSourceKey, draft };
                    }}
                  />
                ) : null}
                {activeTabMeta.sourceSite === "KAUFLAND" ? (
                  <KauflandProductDetailsPanel
                    initialDraft={activeKauflandInitialDraft}
                    draftKey={activeKauflandSourceKey}
                    codeLabel={t.codeLabel}
                    previewLabel={t.previewLabel}
                    previewDocumentFor={(description) => makeHoodDescriptionPreviewEditableDocument(buildKauflandDescriptionPreviewDocument(description))}
                    renderProductFields={(product, onProductChange) => (
                      <KauflandProductFields product={product} onProductChange={onProductChange} />
                    )}
                    deliveryPortalId="kaufland-delivery-time-range"
                    renderDeliveryTimeRange={(product, onProductChange) => (
                      <KauflandDeliveryTimeRange product={product} onProductChange={onProductChange} />
                    )}
                    onDraftChange={(draft) => {
                      kauflandDraftRefByTab.current[activeTab] = { sourceKey: activeKauflandSourceKey, draft };
                    }}
                  />
                ) : null}
                {activeTabMeta.marketplace === "OTTO" ? (
                  <div className="space-y-3">
                    {ottoSearchLoading ? (
                      <div className="text-sm text-muted-foreground">Searching OTTO product data…</div>
                    ) : null}
                    {activeOttoProfile && ottoSearchErrors[activeOttoProfile] ? (
                      <div className="text-sm text-destructive">{ottoSearchErrors[activeOttoProfile]}</div>
                    ) : null}
                    {!ottoSearchLoading && activeOttoProfile && !activeOttoProduct && !ottoSearchErrors[activeOttoProfile] ? (
                      <div className="text-sm text-muted-foreground">No OTTO product data was found for this EAN.</div>
                    ) : null}
                    <OttoCreateProductPanel
                      initialDraft={activeOttoInitialDraft}
                      draftKey={activeOttoSourceKey}
                      categoryId={ottoCategoryByTab[activeTab] ?? ""}
                      categoryName={ottoCategoryNameByTab[activeTab] ?? ""}
                      productAttributes={readOttoProductAttributes(activeOttoProduct)}
                      onDraftChange={(draft) => {
                        ottoDraftRefByTab.current[activeTab] = { sourceKey: activeOttoSourceKey, draft };
                      }}
                    />
                  </div>
                ) : null}
                {activeTabMeta.sourceSite === "XL" && activeTabMeta.marketplace !== "OTTO" ? (
                  <XlCreateProductPanel
                    initialFields={activeXlInitialDraft}
                    draftKey={activeXlSourceKey}
                    codeLabel={t.codeLabel}
                    previewLabel={t.previewLabel}
                    onDraftChange={(draft) => {
                      xlDraftRefByTab.current[activeTab] = { sourceKey: activeXlSourceKey, draft };
                    }}
                  />
                ) : null}
              </div>
              <div className="w-full space-y-3 xl:ml-auto xl:w-[520px] xl:flex-none">
                <CreateProductImageGallery
                  items={tabGalleryItems}
                  activeItemId={activeTabGalleryImageId}
                  previewAlt={t.createProductJvGalleryPreview}
                  emptyPreviewLabel={t.noImagesInGallery}
                  emptyGalleryLabel={t.createProductNoGalleryImages}
                  uploadLabel={t.productEditorUploadImagesAction}
                  thumbnailAlt={(index) => t.createProductJvGalleryThumbnail.replace("{index}", String(index + 1))}
                  deleteAlt={(index) => t.createProductDeleteImage.replace("{index}", String(index + 1))}
                  onActiveItemChange={(itemId) =>
                    setActiveTabGalleryImageIdByTab((current) => ({
                      ...current,
                      [activeTab]: itemId,
                    }))
                  }
                  onFilesSelected={handleTabGalleryUpload}
                  onDeleteItem={handleDeleteTabGalleryItem}
                  onMoveItem={handleMoveTabGalleryItem}
                />
                {activeTabMeta.marketplace === "OTTO" ? (
                  <OttoCategoriesPanel
                    selectedCategoryId={ottoCategoryByTab[activeTab] ?? ""}
                    onSelectedCategoryChange={(category) => {
                      setOttoCategoryByTab((current) => ({ ...current, [activeTab]: category.id }));
                      setOttoCategoryNameByTab((current) => ({ ...current, [activeTab]: category.name }));
                    }}
                  />
                ) : null}
                {activeTabMeta.sourceSite === "KAUFLAND" ? <div id="kaufland-delivery-time-range" /> : null}
                {activeTabMeta.sourceSite === "HOOD" ? (
                  <HoodProductPropertiesPanel
                    initialValue={activeHoodInitialDraft.productPropertiesText}
                    draftKey={activeHoodSourceKey}
                    onDraftChange={(productPropertiesText) => {
                      const current = hoodDraftRefByTab.current[activeTab]?.sourceKey === activeHoodSourceKey
                        ? hoodDraftRefByTab.current[activeTab].draft
                        : activeHoodInitialDraft;
                      hoodDraftRefByTab.current[activeTab] = {
                        sourceKey: activeHoodSourceKey,
                        draft: { ...current, productPropertiesText },
                      };
                    }}
                  />
                ) : null}
                {activeTabMeta.sourceSite === "XL" && activeTabMeta.marketplace !== "OTTO" ? (
                  <div className="space-y-2 rounded-[var(--radius-control)] border border-border/70 bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t.createProductRubricTree}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedXlRubricIds(areAllXlRubricsExpanded ? new Set<number>() : new Set(expandableXlRubricIds))}
                        disabled={expandableXlRubricIds.length === 0}
                        className="rounded-[var(--radius-pill)] border border-border/70 bg-background px-3 py-1 text-[11px] font-semibold uppercase transition hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {areAllXlRubricsExpanded ? t.createProductCollapseAll : t.createProductExpandAll}
                      </button>
                    </div>

                    <Input
                      value={xlRubricSearch}
                      onChange={(event) => setXlRubricSearch(event.target.value)}
                      placeholder={t.createProductSearchRubric}
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-[var(--radius-pill)] border border-border/70 bg-muted/30 px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                        XL {selectedXlRubricIds.size}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowOnlySelectedXlRubrics((current) => !current)}
                        className={[
                          "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold uppercase transition",
                          showOnlySelectedXlRubrics
                            ? "bg-primary text-primary-foreground"
                            : "border border-border/70 bg-background text-foreground hover:bg-muted/40",
                        ].join(" ")}
                      >
                        {t.xljvSelectedOnly}
                      </button>
                    </div>

                    {xlRubricTreeLoading ? (
                      <div className="text-sm text-muted-foreground">{t.createProductLoadingRubricTree}</div>
                    ) : null}

                    {xlRubricTreeError ? (
                      <div className="text-sm text-destructive">{xlRubricTreeError}</div>
                    ) : null}

                    {!xlRubricTreeLoading && !xlRubricTreeError && xlRubricTree.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t.createProductNoRubricTreeData}</div>
                    ) : null}

                    {!xlRubricTreeLoading && !xlRubricTreeError && xlRubricTree.length > 0 && filteredXlRubricTree.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t.createProductNoRubricsFound}</div>
                    ) : null}

                    {!xlRubricTreeLoading && !xlRubricTreeError && filteredXlRubricTree.length > 0 ? (
                      <div className="max-h-[320px] overflow-auto rounded-[var(--radius-control)] border border-border/70 bg-card py-2">
                        {renderXlRubricTree(filteredXlRubricTree)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isComingSoonMarketplace ? (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-6 text-center">
            <div className="text-lg font-semibold text-foreground">Coming soon</div>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {activeTabMeta.label} product creation is being prepared.
            </p>
          </div>
        ) : null}

      </div>
    </AppShell>
  );
}
