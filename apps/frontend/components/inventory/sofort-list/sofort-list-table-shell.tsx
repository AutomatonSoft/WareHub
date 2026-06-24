import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ImageIcon, ImagePlus, Loader2, Package2, Palette, Plus, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { bulkUpdateKids, fetchKidDetails, patchKidDetails, patchKidMarketplaceEans, uploadKidImages } from "../inventory-api";
import { SofortListMarketplaceMatrix } from "./sofort-list-marketplace-matrix";

import type { HighlightText, SofortListRow } from "./sofort-list-types";

const ACCOUNT_EMPTY_VALUE = "__empty_account__";
const LISTING_STATUS_EMPTY_VALUE = "__empty_listing_status__";

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

function displayNullable(value: string | null): string {
  if (value === null) return "null";
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "null";
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createEditDraft(row: SofortListRow): EditDraftState {
  return {
    kidNumber: row.kidNumber,
    account: "",
    place: row.place ?? "",
    listingStatus: row.listingStatus,
    bWare: false,
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
  highlightText: HighlightText;
  labels: {
    place: string;
    quantity: string;
    room: string;
    type: string;
  };
}) {
  const { labels } = props;
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<SofortListRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraftState | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<PhotoPreview[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
        setEditError(error instanceof Error ? error.message : "Failed to load product details.");
      })
      .finally(() => {
        if (active) {
          setLoadingDetails(false);
        }
      });

    return () => {
      active = false;
    };
  }, [editingRow]);

  function closeFullscreenPhoto() {
    if (!fullscreenPhoto) return;
    setFullscreenPhoto(null);
  }

  function openEditModal(row: SofortListRow) {
    setEditingRow(row);
    setEditDraft(createEditDraft(row));
    setEditError(null);
  }

  function closeEditModal() {
    if (savingEdit) return;
    setEditingRow(null);
    setEditDraft(null);
    setEditError(null);
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

      const normalizedEan = editDraft.ean.trim() || props.placeholderEan;
      const normalizedSiteEans = {
        jv: editDraft.jv.trim() || props.placeholderEan,
        xl: editDraft.xl.trim() || props.placeholderEan,
        ottoJv: editDraft.ottoJv.trim() || props.placeholderEan,
        ottoXl: editDraft.ottoXl.trim() || props.placeholderEan,
        ebayJv: editDraft.ebayJv.trim() || props.placeholderEan,
        ebayXl: editDraft.ebayXl.trim() || props.placeholderEan,
        kauflandJv: editDraft.kauflandJv.trim() || props.placeholderEan,
        kauflandXl: editDraft.kauflandXl.trim() || props.placeholderEan,
        hoodJv: editDraft.hoodJv.trim() || props.placeholderEan,
        hoodXl: editDraft.hoodXl.trim() || props.placeholderEan
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
      setEditError(requestError instanceof Error ? requestError.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="wh-sofort-table-shell">
      <div className="wh-sofort-table-frame">
        <div className="wh-sofort-table-wrap ui-desktop-rhythm-table hidden max-w-full overflow-x-hidden overflow-y-visible px-0 pb-0 pt-0 md:block">
          <table className="ui-listing-table wh-sofort-data-table w-full border-separate border-spacing-y-0 text-left text-sm">
            <thead>
              <tr className="ui-table-head-row sticky top-0 z-10">
                <th scope="col" className="ui-listing-head-cell w-[44px] px-2 py-3 text-center">
                  <Checkbox checked={props.allVisibleSelected} onCheckedChange={props.onToggleSelectVisible} aria-label="Select visible rows" />
                </th>
                <th scope="col" className="ui-listing-head-cell w-[92px] px-2 py-3 text-center">
                  <span className="ui-table-head-label">IMAGE</span>
                </th>
                <th scope="col" className="ui-listing-head-cell w-[190px] px-2 py-3 text-left">
                  <span className="ui-table-head-label">PRODUCT</span>
                </th>
                <th scope="col" className="ui-listing-head-cell w-[220px] px-2 py-3 text-left">
                  <span className="ui-table-head-label">ATTRIBUTES</span>
                </th>
                <th scope="col" className="ui-listing-head-cell w-[180px] px-2 py-3 text-left">
                  <span className="ui-table-head-label">COMMENTARY</span>
                </th>
                <th scope="col" className="ui-listing-head-cell w-[148px] px-2 py-3 text-left">
                  <span className="ui-table-head-label">PRICE / EAN</span>
                </th>
                <th scope="col" className="ui-listing-head-cell w-[260px] px-2 py-3 text-center">
                  <span className="ui-table-head-label">MARKETPLACE EAN</span>
                </th>
                <th scope="col" className="ui-listing-head-cell wh-sofort-actions-head w-[116px] px-2 py-3 text-center">
                  <span className="ui-table-head-label">ACTIONS</span>
                </th>
                <th scope="col" className="hidden w-20">
                  <span className="inline-flex items-center gap-1">{labels.place.toUpperCase()}</span>
                </th>
                <th scope="col" className="hidden w-24">
                  <span className="inline-flex items-center gap-1">{labels.quantity.toUpperCase()}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row, index) => (
                <tr key={row.id} className={`ui-table-row wh-sofort-table-row ${index % 2 === 0 ? "ui-table-row-even" : "ui-table-row-odd"}`}>
                  <td className="px-2 py-3 text-center align-middle">
                    <Checkbox
                      checked={props.selectedRowIds.has(row.id)}
                      onCheckedChange={() => props.onToggleRowSelection(row.id)}
                      aria-label={`Select row ${row.kidNumber}`}
                    />
                  </td>
                  <td className="px-3 py-3 text-center align-middle">
                    {row.photo !== "-" ? (
                      <button type="button" className="wh-sofort-product-cell__image" onClick={() => setFullscreenPhoto(row.photo)}>
                        <Image src={row.photo} alt={`Kid ${row.kidNumber}`} width={144} height={144} unoptimized className="wh-sofort-photo" />
                      </button>
                    ) : (
                      <div className="wh-sofort-product-cell__image">
                        <div className="wh-sofort-photo-placeholder" />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="wh-sofort-product-cell">
                      <div className="wh-sofort-product-cell__content">
                        <p className="wh-sofort-product-cell__title wh-inventory-title-text">
                          <span className="wh-sofort-product-cell__title-label ui-table-data-meta">KID</span>
                          <span className="wh-sofort-product-cell__title-value">{row.kidNumber && row.kidNumber !== "-" ? row.kidNumber : "—"}</span>
                        </p>
                        <p className="wh-sofort-product-cell__meta ui-table-data-secondary" title={`Place ${row.place}`}>Place {props.highlightText(row.place, props.query)}</p>
                        <p className="wh-sofort-product-cell__meta ui-table-data-secondary" title={`Location ${row.store ? "Store" : "Warehouse"}`}>Location {props.highlightText(row.store ? "Store" : "Warehouse", props.query)}</p>
                        <p className="wh-sofort-product-cell__meta ui-table-data-secondary" title={`Quantity ${row.quantity}`}>Quantity {props.highlightText(String(row.quantity), props.query)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="wh-sofort-warehouse-cell">
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`Room ${displayNullable(row.room)}`}><span>Room</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.room), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`Type ${displayNullable(row.furnitureType)}`}><span>Type</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.furnitureType), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`Company ${displayNullable(row.company)}`}><span>Company</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.company), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`Color ${displayNullable(row.color)}`}><span>Color</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.color), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`Size ${displayNullable(row.size)}`}><span>Size</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.size), props.query)}</span></p>
                      <p className="wh-sofort-warehouse-cell__line ui-table-data-secondary" title={`Material ${displayNullable(row.material)}`}><span>Material</span><span className="wh-sofort-warehouse-cell__value">{props.highlightText(displayNullable(row.material), props.query)}</span></p>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="wh-sofort-commentary-cell">
                      <p className="wh-sofort-commentary-text ui-table-data-secondary" title={displayNullable(row.commentary)}>
                        {props.highlightText(displayNullable(row.commentary), props.query)}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="wh-sofort-price-ean-cell">
                      <div className="wh-inventory-price-cell wh-sofort-price-cell" title={row.price !== null ? `${displayNullable(row.price)} ${displayNullable(row.priceCurrency)}` : displayNullable(row.price)}>
                        {props.highlightText(
                          row.price !== null
                            ? `${displayNullable(row.price)} ${displayNullable(row.priceCurrency)}`
                            : displayNullable(row.price),
                          props.query
                        )}
                      </div>
                      <Link href={`/inventory/kid/${row.kidId}`} className="wh-sofort-kid-link inline-flex flex-col items-start text-primary hover:underline">
                        <span title={row.ean.trim() && row.ean !== props.placeholderEan ? row.ean : "—"}>{props.highlightText(row.ean.trim() && row.ean !== props.placeholderEan ? row.ean : "—", props.query) || "—"}</span>
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <SofortListMarketplaceMatrix
                      siteEans={row.siteEans}
                      query={props.query}
                      placeholderEan={props.placeholderEan}
                      highlightText={props.highlightText}
                    />
                  </td>
                  <td className="wh-sofort-actions-cell px-3 py-3 align-middle">
                    <div className="wh-sofort-row-actions">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(row)}>Edit</Button>
                      <Button type="button" variant="outline" size="sm">Delete</Button>
                    </div>
                  </td>
                  <td className="hidden">{row.place}</td>
                  <td className="hidden">{row.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {fullscreenPhoto ? (
        <div className="wh-sofort-photo-viewer" role="dialog" aria-modal="true" onClick={closeFullscreenPhoto}>
          <button type="button" className="wh-sofort-photo-viewer__close" onClick={closeFullscreenPhoto} aria-label="Close image viewer">
            Close
          </button>
          <div className="wh-sofort-photo-viewer__content" onClick={(event) => event.stopPropagation()}>
            <Image src={fullscreenPhoto} alt="Product image" width={1600} height={1200} unoptimized className="wh-sofort-photo-viewer__image" />
          </div>
        </div>
      ) : null}
      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => { if (!open) closeEditModal(); }}>
        <DialogContent className="!flex !w-[min(1120px,calc(100vw-32px))] !max-w-[1120px] !gap-0 !p-0 h-auto max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-2xl">
          <DialogHeader className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-background px-5 py-4 sm:px-6">
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 pb-6">
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <strong>Editing mode</strong>
                {editingRow ? ` · KID ${editingRow.kidNumber} · Place ${editingRow.place}` : ""}
              </div>

              {editDraft ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,0.92fr)] xl:items-start">
                    <SectionCard
                      icon={Package2}
                      title="Identity & Status"
                      description="Database kid fields, operational flags and listing state."
                    >
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <div className="xl:col-span-4">
                          <CompactField label="Kid Number" htmlFor="edit-kid-number">
                            <Input
                              id="edit-kid-number"
                              className="h-10 rounded-[var(--radius-control)]"
                              value={editDraft.kidNumber}
                              onChange={(event) => updateDraft("kidNumber", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="xl:col-span-2">
                          <CompactField label="Account" htmlFor="edit-kid-account">
                            <Select
                              value={editDraft.account || ACCOUNT_EMPTY_VALUE}
                              onValueChange={(nextValue) => updateDraft("account", nextValue === ACCOUNT_EMPTY_VALUE ? "" : (nextValue as EditDraftState["account"]))}
                            >
                              <SelectTrigger id="edit-kid-account" className="h-10 w-full min-w-0 rounded-[var(--radius-control)]">
                                <span className={`min-w-0 truncate text-left ${editDraft.account ? "text-foreground" : "text-muted-foreground"}`}>
                                  {editDraft.account || "Not selected"}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={ACCOUNT_EMPTY_VALUE}>Not selected</SelectItem>
                                <SelectItem value="JV">JV</SelectItem>
                                <SelectItem value="XL">XL</SelectItem>
                                <SelectItem value="CH">CH</SelectItem>
                              </SelectContent>
                            </Select>
                          </CompactField>
                        </div>

                        <CompactField label="Place" htmlFor="edit-kid-place">
                          <Input
                            id="edit-kid-place"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.place}
                            onChange={(event) => updateDraft("place", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Room" htmlFor="edit-kid-room">
                          <Input
                            id="edit-kid-room"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.room}
                            onChange={(event) => updateDraft("room", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Type" htmlFor="edit-kid-type">
                          <Input
                            id="edit-kid-type"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.furnitureType}
                            onChange={(event) => updateDraft("furnitureType", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Listing Status" htmlFor="edit-kid-listing-status">
                          <Select
                            value={editDraft.listingStatus || LISTING_STATUS_EMPTY_VALUE}
                            onValueChange={(nextValue) => updateDraft("listingStatus", nextValue === LISTING_STATUS_EMPTY_VALUE ? "" : (nextValue as EditDraftState["listingStatus"]))}
                          >
                            <SelectTrigger id="edit-kid-listing-status" className="h-10 w-full min-w-0 rounded-[var(--radius-control)]">
                              <span className={`min-w-0 truncate text-left ${editDraft.listingStatus ? "text-foreground" : "text-muted-foreground"}`}>
                                {editDraft.listingStatus || "Not selected"}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={LISTING_STATUS_EMPTY_VALUE}>Not selected</SelectItem>
                              <SelectItem value="listed">listed</SelectItem>
                              <SelectItem value="unlisted">unlisted</SelectItem>
                            </SelectContent>
                          </Select>
                        </CompactField>

                        <div className="md:col-span-2 xl:col-span-6">
                          <CompactField label="Commentary" htmlFor="edit-kid-commentary">
                            <Textarea
                              id="edit-kid-commentary"
                              className="min-h-[112px] w-full resize-y rounded-[var(--radius-control)] px-3 py-2.5"
                              value={editDraft.commentary}
                              onChange={(event) => updateDraft("commentary", event.target.value)}
                            />
                          </CompactField>
                        </div>

                        <div className="md:col-span-2 xl:col-span-6">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <StatusFlagField label="B-Ware" checked={editDraft.bWare} onCheckedChange={(checked) => updateDraft("bWare", checked)} />
                            <StatusFlagField label="Store" checked={editDraft.store} onCheckedChange={(checked) => updateDraft("store", checked)} />
                            <StatusFlagField label="In Transit" checked={editDraft.inTransit} onCheckedChange={(checked) => updateDraft("inTransit", checked)} />
                          </div>
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard
                      icon={Palette}
                      title="Product Attributes"
                      description="Product attributes stored alongside the kid record."
                      className="h-full"
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <CompactField label="Quantity" htmlFor="edit-kid-quantity">
                          <Input
                            id="edit-kid-quantity"
                            className="h-10 rounded-[var(--radius-control)]"
                            inputMode="numeric"
                            value={editDraft.quantity}
                            onChange={(event) => updateDraft("quantity", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Price" htmlFor="edit-kid-price">
                          <Input
                            id="edit-kid-price"
                            className="h-10 rounded-[var(--radius-control)]"
                            inputMode="decimal"
                            value={editDraft.price}
                            onChange={(event) => updateDraft("price", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Currency" htmlFor="edit-kid-currency">
                          <Input
                            id="edit-kid-currency"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.currency}
                            onChange={(event) => updateDraft("currency", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Company" htmlFor="edit-kid-company">
                          <Input
                            id="edit-kid-company"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.company}
                            onChange={(event) => updateDraft("company", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Color" htmlFor="edit-kid-color">
                          <Input
                            id="edit-kid-color"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.color}
                            onChange={(event) => updateDraft("color", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Size" htmlFor="edit-kid-size">
                          <Input
                            id="edit-kid-size"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.size}
                            onChange={(event) => updateDraft("size", event.target.value)}
                          />
                        </CompactField>

                        <CompactField label="Material" htmlFor="edit-kid-material">
                          <Input
                            id="edit-kid-material"
                            className="h-10 rounded-[var(--radius-control)]"
                            value={editDraft.material}
                            onChange={(event) => updateDraft("material", event.target.value)}
                          />
                        </CompactField>
                      </div>
                    </SectionCard>
                  </div>

                  <SectionCard
                    icon={ImagePlus}
                    title="Photos"
                    description="Edit all linked product photos and append multiple new uploads."
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_320px]">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
                            <ImageIcon size={14} />
                            <span>{editDraft.photoUrls.length} linked photo{editDraft.photoUrls.length === 1 ? "" : "s"}</span>
                          </div>
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addPhotoUrlRow}>
                            <Plus size={14} />
                            Add photo URL
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {editDraft.photoUrls.length > 0 ? (
                            editDraft.photoUrls.map((photoUrl, index) => (
                              <div key={`photo-url-${index}`} className="rounded-[var(--radius-control)] border border-border/70 bg-background p-3">
                                <div className="mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[calc(var(--radius-control)-4px)] border border-border/70 bg-muted/25">
                                  {photoUrl.trim() ? (
                                    <Image src={photoUrl.trim()} alt={`Photo ${index + 1}`} width={240} height={180} unoptimized className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                      <ImageIcon size={18} />
                                      <span className="text-[11px]">Awaiting URL</span>
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <CompactField label={`Photo URL ${index + 1}`} htmlFor={`edit-photo-url-${index}`}>
                                    <Input
                                      id={`edit-photo-url-${index}`}
                                      className="h-10 rounded-[var(--radius-control)]"
                                      value={photoUrl}
                                      placeholder="https://..."
                                      onChange={(event) => updatePhotoUrl(index, event.target.value)}
                                    />
                                  </CompactField>
                                  <div className="flex justify-end">
                                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => removePhotoUrl(index)}>
                                      <X size={14} />
                                      Remove
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="sm:col-span-2 flex min-h-[180px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 text-center text-sm leading-6 text-muted-foreground">
                              No linked photos yet. Add manual URLs or upload several new images below.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-[var(--radius-control)] border border-dashed border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.94)_100%)] p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">Upload new photos</p>
                          <p className="text-xs leading-5 text-muted-foreground">Multiple JPG, PNG or WebP images will be appended to the existing photo set on save.</p>
                        </div>
                        <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/40">
                          <Upload size={14} className="text-primary" />
                          <span>Choose files</span>
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
                                  Remove
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 text-center text-sm leading-6 text-muted-foreground">
                              Selected uploads will appear here as image previews, not as a plain file list.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    icon={Package2}
                    title="Marketplace EAN"
                    description="Edit the main database EAN and all marketplace mappings without widening the table."
                  >
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <CompactField label="Main EAN" htmlFor="edit-main-ean">
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
                            <span>Market</span>
                            <span>JV</span>
                            <span>XL</span>
                          </div>

                          {[
                            { label: "Sites", jvKey: "jv", xlKey: "xl" },
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
                                placeholder="JV EAN"
                              />
                              <Input
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft[market.xlKey as keyof EditDraftState] as string}
                                onChange={(event) => updateDraft(market.xlKey as keyof EditDraftState, event.target.value as never)}
                                placeholder="XL EAN"
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
                  Preparing product editor...
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-30 flex min-h-16 items-center justify-end gap-2.5 border-t border-[#e5e7eb] bg-white px-4 py-3 sm:px-6">
            <div className="mr-auto flex min-h-5 items-center">
              {loadingDetails ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Loading full product details...
                </span>
              ) : editError ? (
                <p className="text-sm text-destructive">{editError}</p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" onClick={closeEditModal} disabled={savingEdit}>Cancel</Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit || !editDraft}>
              {savingEdit ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
