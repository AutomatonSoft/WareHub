import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ImageIcon, ImagePlus, Loader2, Package2, Palette, Plus, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLabels } from "@/app/use-labels";
import { cn } from "@/lib/utils";
import {
  bulkUpdateKids,
  createMarketplaceToggleJob,
  fetchKidDetails,
  getMarketplaceToggleJob,
  patchKidDetails,
  patchKidMarketplaceEans,
  uploadKidImages,
  CreateKidRequestError,
  type PlaceSuggestionHints,
} from "../inventory-api";
import { useToast } from "../../shared/toast-provider";
import { SofortListMarketplaceMatrix } from "./sofort-list-marketplace-matrix";

import type { HighlightText, SofortListRow } from "./sofort-list-types";

const ACCOUNT_EMPTY_VALUE = "__empty_account__";
type EditDraftState = {
  kidNumber: string;
  account: "" | "JV" | "XL" | "CH";
  place: string;
  listingStatus: "" | "listed" | "unlisted";
  bWare: boolean;
  store: boolean;
  inTransit: boolean;
  commentary: string;
  quantity: string;
  price: string;
  currency: string;
  room: string;
  furnitureType: string;
  company: string;
  color: string;
  size: string;
  material: string;
  ean: string;
  jv: string;
  xl: string;
  ottoJv: string;
  ottoXl: string;
  ebayJv: string;
  ebayXl: string;
  kauflandJv: string;
  kauflandXl: string;
  hoodJv: string;
  hoodXl: string;
  photoUrls: string[];
  photoFiles: File[];
};

type PhotoPreview = {
  file: File;
  url: string;
};

type MarketplaceActionResult = Awaited<ReturnType<typeof getMarketplaceToggleJob>>;

type MarketplaceResultDialogState = {
  kidNumber: string;
  title: string;
  successSites: string[];
  failedSites: string[];
};

type MarketplaceConfirmDialogState = {
  row: SofortListRow;
  inactive: boolean;
  nextPlace: string;
  placeError: string | null;
};

const MARKETPLACE_CONFIRM_TARGETS = [
  { key: "JV", state: "live" as const },
  { key: "XL", state: "live" as const },
  { key: "HOOD", state: "live" as const },
  { key: "OTTO", state: "pending" as const },
  { key: "EBAY", state: "pending" as const },
  { key: "KAUFLAND", state: "pending" as const },
];

function displayNullable(value: string | null): string {
  if (value === null) return "-";
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "-";
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildMarketplaceResultDialogState(
  payload: MarketplaceActionResult,
  kidNumber: string,
  labels: {
    markedActive: string;
    markedInactive: string;
  },
): MarketplaceResultDialogState {
  const successSites: string[] = [];
  const failedSites: string[] = [];

  for (const row of payload.results ?? []) {
    const siteKey = String(row.site_key || "").trim() || "UNKNOWN";
    const detailCode =
      row.details && typeof row.details === "object" && typeof row.details.code === "string"
        ? row.details.code
        : null;
    const suffix = row.ok ? `${siteKey} (${row.status_code})` : `${siteKey} (${row.status_code}${detailCode ? `, ${detailCode}` : ""})`;
    if (row.ok) successSites.push(suffix);
    else failedSites.push(suffix);
  }

  return {
    kidNumber,
    title: payload.inactive ? labels.markedInactive : labels.markedActive,
    successSites,
    failedSites,
  };
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createEditDraft(row: SofortListRow): EditDraftState {
  return {
    kidNumber: row.kidNumber,
    account: "",
    place: row.place ?? "",
    listingStatus: row.listingStatus,
    bWare: row.bWare,
    store: row.store,
    inTransit: false,
    commentary: row.commentary ?? "",
    quantity: String(row.quantity ?? ""),
    price: row.price ?? "",
    currency: row.priceCurrency ?? "",
    room: row.room ?? "",
    furnitureType: row.furnitureType ?? "",
    company: row.company ?? "",
    color: row.color ?? "",
    size: row.size ?? "",
    material: row.material ?? "",
    ean: row.ean,
    jv: row.siteEans.jv,
    xl: row.siteEans.xl,
    ottoJv: row.siteEans.ottoJv,
    ottoXl: row.siteEans.ottoXl,
    ebayJv: row.siteEans.ebayJv,
    ebayXl: row.siteEans.ebayXl,
    kauflandJv: row.siteEans.kauflandJv,
    kauflandXl: row.siteEans.kauflandXl,
    hoodJv: row.siteEans.hoodJv,
    hoodXl: row.siteEans.hoodXl,
    photoUrls: row.photo && row.photo !== "-" ? [row.photo] : [],
    photoFiles: []
  };
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  className = ""
}: {
  icon: typeof Package2;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[var(--radius-card)] border border-border/70 bg-muted/20 p-4 ${className}`}>
      <div className="mb-3.5 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border/80 bg-background text-primary">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CompactField({
  label,
  htmlFor,
  error,
  children
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function PlaceSuggestionNote({
  suggestions,
  labels,
}: {
  suggestions: PlaceSuggestionHints | null;
  labels: { subplaceSuggestion: string; baseSuggestion: string };
}) {
  if (!suggestions || (!suggestions.sameBaseSubplace && !suggestions.nextFreeBasePlace)) {
    return null;
  }

  return (
    <div className="space-y-1 rounded-[var(--radius-control)] border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
      {suggestions.sameBaseSubplace ? <p>{labels.subplaceSuggestion}: {suggestions.sameBaseSubplace}</p> : null}
      {suggestions.nextFreeBasePlace ? <p>{labels.baseSuggestion}: {suggestions.nextFreeBasePlace}</p> : null}
    </div>
  );
}

function StatusFlagField({
  label,
  checked,
  onCheckedChange
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-10 min-w-0 items-center justify-between gap-2.5 rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-muted/20">
      <span className="truncate text-sm font-medium">{label}</span>
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
    </label>
  );
}

export function SofortListTableShell(props: {
  rows: SofortListRow[];
  query: string;
  selectedRowIds: Set<string>;
  allVisibleSelected: boolean;
  placeholderEan: string;
  onToggleSelectVisible: () => void;
  onToggleRowSelection: (rowId: string) => void;
  onUpdateRow: (row: SofortListRow) => void;
  onRefresh: () => void;
  highlightText: HighlightText;
  labels: {
    place: string;
    quantity: string;
    room: string;
    type: string;
    active: string;
    inactive: string;
    activate: string;
    delete: string;
    deleteFailed: string;
    markedActive: string;
    markedInactive: string;
    deactivate: string;
    resultSuccessSites: string;
    resultFailedSites: string;
    resultNoSiteData: string;
    resultDialogTitle: string;
    confirmActionTitle: string;
    confirmActionMessage: string;
    confirmActionCancel: string;
    confirmActionConfirm: string;
    confirmActionDetails: string;
    confirmActionLive: string;
    confirmActionPending: string;
    confirmActionCurrentPlace: string;
    confirmActionNewPlace: string;
    confirmActionPlacePlaceholder: string;
    confirmActionPlaceRequired: string;
    confirmActionFootnoteDeactivate: string;
    confirmActionFootnoteActivate: string;
  };
}) {
  const { labels } = props;
  const t = useLabels();
  const { showToast } = useToast();
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<SofortListRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraftState | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<PhotoPreview[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deactivatingRowId, setDeactivatingRowId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPlaceSuggestions, setEditPlaceSuggestions] = useState<PlaceSuggestionHints | null>(null);
  const [marketplaceResult, setMarketplaceResult] = useState<MarketplaceResultDialogState | null>(null);
  const [marketplaceConfirm, setMarketplaceConfirm] = useState<MarketplaceConfirmDialogState | null>(null);

  useEffect(() => {
    if (!fullscreenPhoto) return;

    window.history.pushState({ sofortPhotoViewer: true }, "");

    const handlePopState = () => {
      setFullscreenPhoto(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [fullscreenPhoto]);

  useEffect(() => {
    const nextPreviews = (editDraft?.photoFiles ?? []).map((file) => ({
      file,
      url: URL.createObjectURL(file)
    }));
    setPhotoPreviews(nextPreviews);

    return () => {
      for (const preview of nextPreviews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [editDraft?.photoFiles]);

  useEffect(() => {
    if (!editingRow) return;

    let active = true;
    setLoadingDetails(true);
    setEditError(null);
    setEditPlaceSuggestions(null);

    void fetchKidDetails(editingRow.kidId)
      .then((details) => {
        if (!active) return;
        setEditDraft((current) => {
          const base = current ?? createEditDraft(editingRow);
          return {
            ...base,
            kidNumber: details.kidNumber || base.kidNumber,
            account: details.account ?? "",
            place: details.place,
            listingStatus: details.listingStatus,
            bWare: details.bWare,
            store: details.store,
            inTransit: details.inTransit,
            commentary: details.commentary,
            room: details.room,
            furnitureType: details.furnitureType,
            photoUrls: details.photoUrls.length > 0 ? details.photoUrls : base.photoUrls
          };
        });
      })
      .catch((error) => {
        if (!active) return;
        setEditError(error instanceof Error ? error.message : t.failedLoadProductDetails);
      })
      .finally(() => {
        if (active) {
          setLoadingDetails(false);
        }
      });

    return () => {
      active = false;
    };
  }, [editingRow, t.failedLoadProductDetails]);

  function closeFullscreenPhoto() {
    if (!fullscreenPhoto) return;
    setFullscreenPhoto(null);
  }

  function openEditModal(row: SofortListRow) {
    setEditingRow(row);
    setEditDraft(createEditDraft(row));
    setEditError(null);
    setEditPlaceSuggestions(null);
  }

  function closeEditModal() {
    if (savingEdit) return;
    setEditingRow(null);
    setEditDraft(null);
    setEditError(null);
    setEditPlaceSuggestions(null);
    setLoadingDetails(false);
  }

  function updateDraft<K extends keyof EditDraftState>(key: K, value: EditDraftState[K]) {
    setEditDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function updatePhotoUrl(index: number, value: string) {
    setEditDraft((current) => {
      if (!current) return current;
      const nextPhotoUrls = [...current.photoUrls];
      nextPhotoUrls[index] = value;
      return { ...current, photoUrls: nextPhotoUrls };
    });
  }

  function addPhotoUrlRow() {
    setEditDraft((current) => (current ? { ...current, photoUrls: [...current.photoUrls, ""] } : current));
  }

  function removePhotoUrl(index: number) {
    setEditDraft((current) => {
      if (!current) return current;
      return { ...current, photoUrls: current.photoUrls.filter((_, photoIndex) => photoIndex !== index) };
    });
  }

  function removePhotoFile(index: number) {
    setEditDraft((current) => {
      if (!current) return current;
      return { ...current, photoFiles: current.photoFiles.filter((_, fileIndex) => fileIndex !== index) };
    });
  }

  async function saveEdit() {
    if (!editingRow || !editDraft || savingEdit) return;

    setSavingEdit(true);
    setEditError(null);
    setEditPlaceSuggestions(null);

    try {
      const uploadedPhotoUrls =
        editDraft.photoFiles.length > 0 ? await uploadKidImages(editDraft.photoFiles) : [];
      const normalizedPhotoUrls = [
        ...editDraft.photoUrls.map((value) => value.trim()).filter(Boolean),
        ...uploadedPhotoUrls.map((value) => value.trim()).filter(Boolean)
      ];

      const normalizedListingStatus = editDraft.listingStatus === "listed" ? "listed" : "unlisted";

      await patchKidDetails({
        kidId: editingRow.kidId,
        kidNumber: editDraft.kidNumber.trim(),
        account: editDraft.account || null,
        place: editDraft.place,
        photoUrls: normalizedPhotoUrls,
        room: editDraft.room,
        furnitureType: editDraft.furnitureType,
        listingStatus: normalizedListingStatus,
        bWare: editDraft.bWare,
        store: editDraft.store,
        commentary: editDraft.commentary,
        inTransit: editDraft.inTransit
      });

      await bulkUpdateKids({
        updates: [
          {
            kidId: editingRow.kidId,
            room: editDraft.room.trim() || undefined,
            type: editDraft.furnitureType.trim() || undefined,
            quantity: editDraft.quantity.trim() || undefined,
            company: editDraft.company.trim() || undefined,
            color: editDraft.color.trim() || undefined,
            size: editDraft.size.trim() || undefined,
            material: editDraft.material.trim() || undefined,
            price: editDraft.price.trim() || undefined,
            currency: editDraft.currency.trim() || undefined,
            listingStatus: normalizedListingStatus
          }
        ]
      });

      const normalizedEan = editDraft.ean.trim();
      const normalizedSiteEans = {
        jv: editDraft.jv.trim(),
        xl: editDraft.xl.trim(),
        ottoJv: editDraft.ottoJv.trim(),
        ottoXl: editDraft.ottoXl.trim(),
        ebayJv: editDraft.ebayJv.trim(),
        ebayXl: editDraft.ebayXl.trim(),
        kauflandJv: editDraft.kauflandJv.trim(),
        kauflandXl: editDraft.kauflandXl.trim(),
        hoodJv: editDraft.hoodJv.trim(),
        hoodXl: editDraft.hoodXl.trim()
      };

      await patchKidMarketplaceEans({
        kidId: editingRow.kidId,
        mainEan: normalizedEan,
        jv: normalizedSiteEans.jv,
        xl: normalizedSiteEans.xl,
        ottoJv: normalizedSiteEans.ottoJv,
        ottoXl: normalizedSiteEans.ottoXl,
        ebayJv: normalizedSiteEans.ebayJv,
        ebayXl: normalizedSiteEans.ebayXl,
        kauflandJv: normalizedSiteEans.kauflandJv,
        kauflandXl: normalizedSiteEans.kauflandXl,
        hoodJv: normalizedSiteEans.hoodJv,
        hoodXl: normalizedSiteEans.hoodXl
      });

      const nextQuantity = Number.parseInt(editDraft.quantity.trim(), 10);
      const nextRow: SofortListRow = {
        ...editingRow,
        kidNumber: editDraft.kidNumber.trim() || editingRow.kidNumber,
        ean: normalizedEan,
        siteEans: normalizedSiteEans,
        photo: normalizedPhotoUrls[0] ?? "-",
        photoCount: normalizedPhotoUrls.length,
        place: editDraft.place.trim(),
        store: editDraft.store,
        quantity: Number.isFinite(nextQuantity) ? nextQuantity : 0,
        room: editDraft.room.trim() || null,
        furnitureType: editDraft.furnitureType.trim() || null,
        company: editDraft.company.trim() || null,
        commentary: editDraft.commentary.trim() || null,
        color: editDraft.color.trim() || null,
        size: editDraft.size.trim() || null,
        material: editDraft.material.trim() || null,
        price: editDraft.price.trim() || null,
        priceCurrency: editDraft.currency.trim() || null,
        listingStatus: normalizedListingStatus
      };

      props.onUpdateRow(nextRow);
      closeEditModal();
    } catch (requestError) {
      setEditError(requestError instanceof Error ? requestError.message : t.failedSaveChanges);
      setEditPlaceSuggestions(requestError instanceof CreateKidRequestError ? requestError.placeSuggestions : null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function waitForMarketplaceJobToFinish(jobId: string): Promise<MarketplaceActionResult> {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const response = await getMarketplaceToggleJob(jobId);
      if (response.job_status === "completed" || response.job_status === "failed") {
        return response;
      }
      await waitMs(400);
    }
    throw new Error(t.marketplaceToggleTimedOut.replace("{jobId}", jobId));
  }

  async function runMarketplaceAction(row: SofortListRow, nextInactive: boolean, nextPlace: string) {
    if (deactivatingRowId) return;

    setDeactivatingRowId(row.id);
    try {
      const created = await createMarketplaceToggleJob(row.kidNumber, nextInactive, nextPlace);
      const result = await waitForMarketplaceJobToFinish(created.jobId);
      props.onRefresh();
      setMarketplaceResult(buildMarketplaceResultDialogState(result, row.kidNumber, props.labels));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : props.labels.deleteFailed;
      showToast(message, "error");
    } finally {
      setDeactivatingRowId(null);
    }
  }

  function requestMarketplaceAction(row: SofortListRow) {
    if (deactivatingRowId) return;
    const nextInactive = row.marketplaceActive !== false;
    setMarketplaceConfirm({ row, inactive: nextInactive, nextPlace: "", placeError: null });
  }

  return (
    <div className="wh-sofort-table-shell">
      <div className="wh-sofort-table-frame">
        <div className="wh-sofort-table-wrap ui-desktop-rhythm-table hidden max-w-full overflow-x-hidden overflow-y-visible px-0 pb-0 pt-0 md:block">
          <table className="ui-listing-table wh-sofort-data-table wh-sofort-table-grid w-full border-separate border-spacing-y-0 text-left text-sm">
            <colgroup>
              <col className="wh-sofort-col wh-sofort-col--select" />
              <col className="wh-sofort-col wh-sofort-col--place" />
              <col className="wh-sofort-col wh-sofort-col--image" />
              <col className="wh-sofort-col wh-sofort-col--product" />
              <col className="wh-sofort-col wh-sofort-col--attributes" />
              <col className="wh-sofort-col wh-sofort-col--commentary" />
              <col className="wh-sofort-col wh-sofort-col--price" />
              <col className="wh-sofort-col wh-sofort-col--marketplace" />
              <col className="wh-sofort-col wh-sofort-col--actions" />
              <col className="wh-sofort-col wh-sofort-col--hidden" />
            </colgroup>
            <thead>
              <tr className="ui-table-head-row sticky top-0 z-10">
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--select wh-sofort-cell wh-sofort-cell--narrow py-3 text-center">
                  <Checkbox checked={props.allVisibleSelected} onCheckedChange={props.onToggleSelectVisible} aria-label={t.selectVisibleRows} />
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--place wh-sofort-cell py-3 text-left">
                  <span className="ui-table-head-label">{labels.place.toUpperCase()}</span>
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--image wh-sofort-cell py-3 text-center">
                  <span className="ui-table-head-label">{t.image.toUpperCase()}</span>
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--product wh-sofort-cell py-3 text-left">
                  <span className="ui-table-head-label">{t.product.toUpperCase()}</span>
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--attributes wh-sofort-cell py-3 text-left">
                  <span className="ui-table-head-label">{t.attributes.toUpperCase()}</span>
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--commentary wh-sofort-cell py-3 text-left">
                  <span className="ui-table-head-label">{t.commentary.toUpperCase()}</span>
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--price wh-sofort-cell py-3 text-left">
                  <span className="ui-table-head-label">{t.ean}</span>
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--marketplace wh-sofort-cell py-3 text-center">
                  <span className="ui-table-head-label">{t.marketplaceEanTitle.toUpperCase()}</span>
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-actions-head wh-sofort-head-cell wh-sofort-head-cell--actions wh-sofort-cell py-3 text-center">
                  <span className="ui-table-head-label">{t.actions.toUpperCase()}</span>
                </th>
                <th scope="col" className="hidden wh-sofort-head-cell wh-sofort-head-cell--hidden">
                  <span className="inline-flex items-center gap-1">{labels.quantity.toUpperCase()}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <tr key={row.id} className={`ui-table-row wh-sofort-table-row ${index % 2 === 0 ? "ui-table-row-even" : "ui-table-row-odd"}`}>
                  <td className="wh-sofort-cell wh-sofort-cell--narrow py-3 text-center align-middle">
                    <Checkbox
                      checked={props.selectedRowIds.has(row.id)}
                      onCheckedChange={() => props.onToggleRowSelection(row.id)}
                      aria-label={t.selectRow.replace("{kid}", row.kidNumber)}
                    />
                  </td>
                  <td className="wh-sofort-cell py-3 align-middle">
                    <div className="wh-sofort-place-cell">
                      <span className="wh-sofort-place-cell__value" title={row.place}>
                        {props.highlightText(row.place, props.query)}
                      </span>
                      <span className="wh-sofort-place-cell__location" title={`${t.location} ${row.store ? t.store : t.warehouse}`}>
                        {props.highlightText(row.store ? t.store : t.warehouse, props.query)}
                      </span>
                    </div>
                  </td>
                  <td className="wh-sofort-image-cell wh-sofort-cell py-3 text-center align-middle">
                    {row.photo !== "-" ? (
                      <button type="button" className="wh-sofort-product-cell__image" onClick={() => setFullscreenPhoto(row.photo)}>
                        <Image src={row.photo} alt={t.productPhotoForKid.replace("{kid}", row.kidNumber)} width={240} height={240} unoptimized className="wh-sofort-photo" />
                      </button>
                    ) : (
                      <div className="wh-sofort-product-cell__image">
                        <div className="wh-sofort-photo-placeholder" />
                      </div>
                    )}
                  </td>
                  <td className="wh-sofort-product-cell-wrap wh-sofort-cell py-3 align-middle">
                    <div className="wh-sofort-product-cell">
                      <div className="wh-sofort-product-cell__content">
                        <p className="wh-sofort-product-cell__title wh-inventory-title-text">
                          <span className="wh-sofort-product-cell__title-label ui-table-data-meta">{t.kid}: </span>
                          <span className="wh-sofort-product-cell__title-value">{row.kidNumber && row.kidNumber !== "-" ? row.kidNumber : "—"}</span>
                        </p>
                        <p className="wh-sofort-product-cell__meta ui-table-data-secondary" title={row.price !== null ? `${t.price} ${displayNullable(row.price)} ${displayNullable(row.priceCurrency)}` : `${t.price} ${displayNullable(row.price)}`}>
                          {t.price}: {props.highlightText(
                            row.price !== null
                              ? `${displayNullable(row.price)} ${displayNullable(row.priceCurrency)}`
                              : displayNullable(row.price),
                            props.query
                          )}
                        </p>
                        <p className="wh-sofort-product-cell__meta ui-table-data-secondary" title={`${t.quantity} ${row.quantity}`}>{t.quantity}: {props.highlightText(String(row.quantity), props.query)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="wh-sofort-attributes-cell wh-sofort-cell py-3 align-middle">
                    <div className="wh-sofort-warehouse-cell">
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`${t.room} ${displayNullable(row.room)}`}><span>{t.room}:</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.room), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`${t.type} ${displayNullable(row.furnitureType)}`}><span>{t.type}:</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.furnitureType), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`${t.company} ${displayNullable(row.company)}`}><span>{t.company}:</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.company), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`${t.color} ${displayNullable(row.color)}`}><span>{t.color}:</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.color), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`${t.size} ${displayNullable(row.size)}`}><span>{t.size}:</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.size), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`${t.material} ${displayNullable(row.material)}`}><span>{t.material}:</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.material), props.query)}</span></p>
                    </div>
                  </td>
                  <td className="wh-sofort-commentary-cell-wrap wh-sofort-cell py-3 align-middle">
                    <div className="wh-sofort-commentary-cell">
                      <p className="wh-sofort-commentary-text ui-table-data-secondary" title={displayNullable(row.commentary)}>
                        {props.highlightText(displayNullable(row.commentary), props.query)}
                      </p>
                    </div>
                  </td>
                  <td className="wh-sofort-price-ean-cell-wrap wh-sofort-cell py-3 align-middle">
                    <div className="wh-sofort-price-ean-cell">
                      <span className="wh-sofort-kid-link inline-flex flex-col items-start text-slate-950">
                        <span title={row.ean.trim() && row.ean !== props.placeholderEan ? row.ean : "—"}>{props.highlightText(row.ean.trim() && row.ean !== props.placeholderEan ? row.ean : "—", props.query) || "—"}</span>
                      </span>
                    </div>
                  </td>
                  <td className="wh-sofort-marketplace-cell wh-sofort-cell py-3 align-middle">
                    <SofortListMarketplaceMatrix
                      siteEans={row.siteEans}
                      siteEanStatuses={row.siteEanStatuses}
                      bWare={row.bWare}
                      query={props.query}
                      placeholderEan={props.placeholderEan}
                      highlightText={props.highlightText}
                      labels={{
                        matrixAria: t.marketplaceMatrixAria.replace("{kid}", row.kidNumber),
                        jv: "JV",
                        xl: "XL",
                        matched: t.matched,
                        value: t.value,
                        empty: t.noValue,
                      }}
                    />
                  </td>
                  <td className="wh-sofort-actions-cell wh-sofort-cell py-3 align-middle">
                    <div className="wh-sofort-row-actions">
                      <Link
                        href={`/create-product?kid=${encodeURIComponent(String(row.kidId))}`}
                        className={buttonVariants({ variant: "default", size: "sm", className: "min-w-[68px]" })}
                      >
                        {t.create}
                      </Link>
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(row)}>{t.edit}</Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => requestMarketplaceAction(row)}
                        disabled={deactivatingRowId === row.id}
                      >
                        {deactivatingRowId === row.id ? t.working : row.marketplaceActive === false ? props.labels.activate : props.labels.deactivate}
                      </Button>
                    </div>
                  </td>
                  <td className="hidden">{row.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {fullscreenPhoto ? (
        <div className="wh-sofort-photo-viewer" role="dialog" aria-modal="true" onClick={closeFullscreenPhoto}>
          <button type="button" className="wh-sofort-photo-viewer__close" onClick={closeFullscreenPhoto} aria-label={t.closeImageViewer}>
            {t.close}
          </button>
          <div className="wh-sofort-photo-viewer__content" onClick={(event) => event.stopPropagation()}>
            <Image src={fullscreenPhoto} alt={t.productPhoto} width={1600} height={1200} unoptimized className="wh-sofort-photo-viewer__image" />
          </div>
        </div>
      ) : null}
      <Dialog open={Boolean(marketplaceConfirm)} onOpenChange={(open) => { if (!open) setMarketplaceConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{props.labels.confirmActionTitle}</DialogTitle>
          </DialogHeader>
          {marketplaceConfirm ? (
            <div className="space-y-4">
              <div
                className={cn(
                  "rounded-xl border p-4",
                  marketplaceConfirm.inactive
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-emerald-300/50 bg-emerald-50/60"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border",
                      marketplaceConfirm.inactive
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-emerald-300/50 bg-emerald-100 text-emerald-700"
                    )}
                  >
                    {marketplaceConfirm.inactive ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {props.labels.confirmActionMessage
                        .replace("{action}", marketplaceConfirm.inactive ? props.labels.deactivate : props.labels.activate)
                        .replace("{kid}", marketplaceConfirm.row.kidNumber)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{props.labels.confirmActionDetails}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {props.labels.confirmActionDetails}
                </p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>{t.kid}: {marketplaceConfirm.row.kidNumber}</p>
                  <p>{t.ean}: {marketplaceConfirm.row.ean || "—"}</p>
                  <p>{props.labels.confirmActionCurrentPlace}: {marketplaceConfirm.row.place || "—"}</p>
                </div>
              </div>

              {!marketplaceConfirm.inactive ? (
                <div className="rounded-xl border border-emerald-300/40 bg-emerald-50/40 p-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {props.labels.confirmActionNewPlace}
                    </label>
                    <Input
                      value={marketplaceConfirm.nextPlace}
                      placeholder={props.labels.confirmActionPlacePlaceholder}
                      onChange={(event) =>
                        setMarketplaceConfirm((current) =>
                          current
                            ? { ...current, nextPlace: event.target.value, placeError: null }
                            : current
                        )
                      }
                    />
                    {marketplaceConfirm.placeError ? (
                      <p className="text-xs text-destructive">{marketplaceConfirm.placeError}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-border/70 bg-background p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t.marketplace}
                </p>
                <div className="flex flex-wrap gap-2">
                  {MARKETPLACE_CONFIRM_TARGETS.map((target) => (
                    <div key={target.key} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/20 px-3 py-1.5">
                      <span className="text-xs font-medium text-foreground">{target.key}</span>
                      <Badge variant={target.state === "live" ? "success" : "warning"}>
                        {target.state === "live" ? props.labels.confirmActionLive : props.labels.confirmActionPending}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 size={14} />
                  <span>
                    {marketplaceConfirm.inactive
                      ? props.labels.confirmActionFootnoteDeactivate
                      : props.labels.confirmActionFootnoteActivate}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMarketplaceConfirm(null)}>
              {props.labels.confirmActionCancel}
            </Button>
            <Button
              type="button"
              variant={marketplaceConfirm?.inactive ? "destructive" : "default"}
              onClick={() => {
                if (!marketplaceConfirm) return;
                if (!marketplaceConfirm.inactive && !marketplaceConfirm.nextPlace.trim()) {
                  setMarketplaceConfirm((current) => current ? { ...current, placeError: props.labels.confirmActionPlaceRequired } : current);
                  return;
                }
                const { row, inactive, nextPlace } = marketplaceConfirm;
                setMarketplaceConfirm(null);
                void runMarketplaceAction(row, inactive, nextPlace);
              }}
            >
              {marketplaceConfirm?.inactive ? props.labels.deactivate : props.labels.activate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(marketplaceResult)} onOpenChange={(open) => { if (!open) setMarketplaceResult(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{props.labels.resultDialogTitle}</DialogTitle>
          </DialogHeader>
          {marketplaceResult ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">{marketplaceResult.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">KID {marketplaceResult.kidNumber}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <h3 className="text-sm font-semibold text-emerald-900">{props.labels.resultSuccessSites}</h3>
                  {marketplaceResult.successSites.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-emerald-900">
                      {marketplaceResult.successSites.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-emerald-900/80">{props.labels.resultNoSiteData}</p>
                  )}
                </section>
                <section className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                  <h3 className="text-sm font-semibold text-rose-900">{props.labels.resultFailedSites}</h3>
                  {marketplaceResult.failedSites.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-rose-900">
                      {marketplaceResult.failedSites.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-rose-900/80">{props.labels.resultNoSiteData}</p>
                  )}
                </section>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMarketplaceResult(null)}>{t.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => { if (!open) closeEditModal(); }}>
        <DialogContent className="!flex !w-[min(1120px,calc(100vw-32px))] !max-w-[1120px] !gap-0 !p-0 h-auto max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-2xl">
          <DialogHeader className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-background px-5 py-4 sm:px-6">
            <DialogTitle>{t.editProductTitle}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 pb-6">
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <strong>{t.editingMode}</strong>
                {editingRow ? ` · ${t.kid} ${editingRow.kidNumber} · ${t.place} ${editingRow.place}` : ""}
              </div>

              {editDraft ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] xl:items-start">
                    <SectionCard
                      icon={Package2}
                      title={t.identityStatusTitle}
                      description={t.identityStatusDescription}
                    >
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                        <div className="min-w-0 xl:col-span-8">
                          <CompactField label={t.kidNumber} htmlFor="edit-kid-number">
                            <Input
                              id="edit-kid-number"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.kidNumber}
                              onChange={(event) => updateDraft("kidNumber", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-4">
                          <CompactField label={t.account} htmlFor="edit-kid-account">
                            <Select
                              value={editDraft.account || ACCOUNT_EMPTY_VALUE}
                              onValueChange={(nextValue) => updateDraft("account", nextValue === ACCOUNT_EMPTY_VALUE ? "" : (nextValue as EditDraftState["account"]))}
                            >
                              <SelectTrigger id="edit-kid-account" className="h-10 w-full min-w-0 rounded-[var(--radius-control)]">
                                <span className={`min-w-0 truncate text-left ${editDraft.account ? "text-foreground" : "text-muted-foreground"}`}>
                                  {editDraft.account || t.notSelected}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={ACCOUNT_EMPTY_VALUE}>{t.notSelected}</SelectItem>
                                <SelectItem value="JV">JV</SelectItem>
                                <SelectItem value="XL">XL</SelectItem>
                                <SelectItem value="CH">CH</SelectItem>
                              </SelectContent>
                            </Select>
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-4">
                          <CompactField label={t.place} htmlFor="edit-kid-place">
                            <Input
                              id="edit-kid-place"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.place}
                              onChange={(event) => updateDraft("place", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-4">
                          <CompactField label={t.room} htmlFor="edit-kid-room">
                            <Input
                              id="edit-kid-room"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.room}
                              onChange={(event) => updateDraft("room", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-4">
                          <CompactField label={t.type} htmlFor="edit-kid-type">
                            <Input
                              id="edit-kid-type"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.furnitureType}
                              onChange={(event) => updateDraft("furnitureType", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="md:col-span-2 xl:col-span-12">
                          <PlaceSuggestionNote
                            suggestions={editPlaceSuggestions}
                            labels={{ subplaceSuggestion: t.subplaceSuggestion, baseSuggestion: t.baseSuggestion }}
                          />
                        </div>

                        <div className="md:col-span-2 xl:col-span-12">
                          <CompactField label={t.commentary} htmlFor="edit-kid-commentary">
                            <Textarea
                              id="edit-kid-commentary"
                              className="min-h-[112px] w-full resize-y rounded-[var(--radius-control)] px-3 py-2.5"
                              value={editDraft.commentary}
                              onChange={(event) => updateDraft("commentary", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="md:col-span-2 xl:col-span-12">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <StatusFlagField label={t.bWare} checked={editDraft.bWare} onCheckedChange={(checked) => updateDraft("bWare", checked)} />
                            <StatusFlagField label={t.store} checked={editDraft.store} onCheckedChange={(checked) => updateDraft("store", checked)} />
                            <StatusFlagField label={t.inTransit} checked={editDraft.inTransit} onCheckedChange={(checked) => updateDraft("inTransit", checked)} />
                          </div>
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard
                      icon={Palette}
                      title={t.productAttributesTitle}
                      description={t.productAttributesDescription}
                      className="h-full"
                    >
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <div className="min-w-0 xl:col-span-3">
                          <CompactField label={t.quantity} htmlFor="edit-kid-quantity">
                            <Input
                              id="edit-kid-quantity"
                              className="h-10 rounded-[var(--radius-control)]"
                              inputMode="numeric"
                              value={editDraft.quantity}
                              onChange={(event) => updateDraft("quantity", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-3">
                          <CompactField label={t.price} htmlFor="edit-kid-price">
                            <Input
                              id="edit-kid-price"
                              className="h-10 rounded-[var(--radius-control)]"
                              inputMode="decimal"
                              value={editDraft.price}
                              onChange={(event) => updateDraft("price", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-3">
                          <CompactField label={t.currency} htmlFor="edit-kid-currency">
                            <Input
                              id="edit-kid-currency"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.currency}
                              onChange={(event) => updateDraft("currency", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-3">
                          <CompactField label={t.company} htmlFor="edit-kid-company">
                            <Input
                              id="edit-kid-company"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.company}
                              onChange={(event) => updateDraft("company", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-3">
                          <CompactField label={t.color} htmlFor="edit-kid-color">
                            <Input
                              id="edit-kid-color"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.color}
                              onChange={(event) => updateDraft("color", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 xl:col-span-3">
                          <CompactField label={t.size} htmlFor="edit-kid-size">
                            <Input
                              id="edit-kid-size"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.size}
                              onChange={(event) => updateDraft("size", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="min-w-0 md:col-span-2 xl:col-span-3">
                          <CompactField label={t.material} htmlFor="edit-kid-material">
                            <Input
                              id="edit-kid-material"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.material}
                              onChange={(event) => updateDraft("material", event.target.value)}
                            />
                          </CompactField>
                        </div>
                      </div>
                    </SectionCard>
                  </div>

                  <SectionCard
                    icon={ImagePlus}
                    title={t.photosTitle}
                    description={t.photosDescription}
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.56fr)] xl:items-start">
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
                            <ImageIcon size={14} />
                            <span>{t.linkedPhotosCount.replace("{count}", String(editDraft.photoUrls.length))}</span>
                          </div>
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addPhotoUrlRow}>
                            <Plus size={14} />
                            {t.addPhotoUrl}
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {editDraft.photoUrls.length > 0 ? (
                            editDraft.photoUrls.map((photoUrl, index) => (
                              <div key={`photo-url-${index}`} className="rounded-[var(--radius-control)] border border-border/70 bg-background p-3">
                                <div className="mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[calc(var(--radius-control)-4px)] border border-border/70 bg-muted/25">
                                  {photoUrl.trim() ? (
                                    <Image src={photoUrl.trim()} alt={t.photoLabel.replace("{index}", String(index + 1))} width={240} height={180} unoptimized className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                      <ImageIcon size={18} />
                                      <span className="text-[11px]">{t.awaitingUrl}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <CompactField label={t.photoUrlLabel.replace("{index}", String(index + 1))} htmlFor={`edit-photo-url-${index}`}>
                                    <Input
                                      id={`edit-photo-url-${index}`}
                                      className="h-10 rounded-[var(--radius-control)]"
                                      value={photoUrl}
                                      placeholder={t.photoUrlPlaceholder}
                                      onChange={(event) => updatePhotoUrl(index, event.target.value)}
                                    />
                                  </CompactField>
                                  <div className="flex justify-end">
                                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => removePhotoUrl(index)}>
                                      <X size={14} />
                                      {t.remove}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="sm:col-span-2 flex min-h-[180px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 text-center text-sm leading-6 text-muted-foreground">
                              {t.noLinkedPhotosHint}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-[var(--radius-control)] border border-dashed border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.94)_100%)] p-3 xl:sticky xl:top-0">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{t.uploadNewPhotos}</p>
                          <p className="text-xs leading-5 text-muted-foreground">{t.uploadNewPhotosHint}</p>
                        </div>
                        <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/40">
                          <Upload size={14} className="text-primary" />
                          <span>{t.chooseFiles}</span>
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            className="sr-only"
                            onChange={(event) => {
                              const nextFiles = Array.from(event.target.files ?? []);
                              if (nextFiles.length === 0) return;
                              setEditDraft((current) => (
                                current
                                  ? {
                                      ...current,
                                      photoFiles: [...current.photoFiles, ...nextFiles]
                                    }
                                  : current
                              ));
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <div className="space-y-2">
                          {photoPreviews.length > 0 ? (
                            photoPreviews.map((preview, index) => (
                              <div key={`${preview.file.name}-${preview.file.size}-${preview.file.lastModified}`} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border/70 bg-background p-2.5">
                                <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-border/70 bg-muted/30">
                                  <Image src={preview.url} alt={preview.file.name} fill unoptimized className="object-cover" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground" title={preview.file.name}>
                                    {preview.file.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{formatFileSize(preview.file.size)}</p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => removePhotoFile(index)}>
                                  {t.remove}
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 text-center text-sm leading-6 text-muted-foreground">
                              {t.photoPreviewUploadsHint}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    icon={Package2}
                    title={t.marketplaceEanTitle}
                    description={t.marketplaceEanDescription}
                  >
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <CompactField label={t.mainEan} htmlFor="edit-main-ean">
                          <Input
                            id="edit-main-ean"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.ean}
                            onChange={(event) => updateDraft("ean", event.target.value)}
                          />
                        </CompactField>
                      </div>

                      <div className="overflow-x-auto">
                        <div className="min-w-[720px] space-y-2">
                          <div className="grid grid-cols-[120px_minmax(160px,1fr)_minmax(160px,1fr)] gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{t.market}</span>
                            <span>JV</span>
                            <span>XL</span>
                          </div>

                          {[
                            { label: t.sites, jvKey: "jv", xlKey: "xl" },
                            { label: "OTTO", jvKey: "ottoJv", xlKey: "ottoXl" },
                            { label: "EBAY", jvKey: "ebayJv", xlKey: "ebayXl" },
                            { label: "KAUFLAND", jvKey: "kauflandJv", xlKey: "kauflandXl" },
                            { label: "HOOD", jvKey: "hoodJv", xlKey: "hoodXl" }
                          ].map((market) => (
                            <div key={market.label} className="grid grid-cols-[120px_minmax(160px,1fr)_minmax(160px,1fr)] items-end gap-2">
                              <span className="text-xs font-semibold text-muted-foreground">{market.label}</span>
                              <Input
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft[market.jvKey as keyof EditDraftState] as string}
                                onChange={(event) => updateDraft(market.jvKey as keyof EditDraftState, event.target.value as never)}
                                placeholder={t.jvEanPlaceholder}
                              />
                              <Input
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft[market.xlKey as keyof EditDraftState] as string}
                                onChange={(event) => updateDraft(market.xlKey as keyof EditDraftState, event.target.value as never)}
                                placeholder={t.xlEanPlaceholder}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </SectionCard>
                </>
              ) : (
                <div className="flex min-h-[240px] items-center justify-center rounded-[var(--radius-card)] border border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                  {t.preparingProductEditor}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-30 flex min-h-16 items-center justify-end gap-2.5 border-t border-[#e5e7eb] bg-white px-4 py-3 sm:px-6">
            <div className="mr-auto flex min-h-5 items-center">
              {loadingDetails ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  {t.loadingFullProductDetails}
                </span>
              ) : editError ? (
                <p className="text-sm text-destructive">{editError}</p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" onClick={closeEditModal} disabled={savingEdit}>{t.cancel}</Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit || !editDraft}>
              {savingEdit ? t.saving : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
