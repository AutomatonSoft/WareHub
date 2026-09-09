"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ImageIcon, Loader2, Plus, X } from "lucide-react";

import { useLabels } from "../../app/use-labels";
import { cn } from "../../lib/utils";
import {
  bulkUpdateKids,
  CreateKidRequestError,
  fetchKidDetails,
  patchKidDetails,
  patchKidMarketplaceEans,
  uploadKidImages,
  type PlaceSuggestionHints,
} from "../inventory/inventory-api";
import type { SofortListRow } from "../inventory/sofort-list/sofort-list-types";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { SearchablePicker } from "../ui/searchable-picker";
import { Textarea } from "../ui/textarea";

type EditDraftState = {
  kidNumber: string;
  account: "" | "JV" | "XL" | "CH";
  place: string;
  section: string;
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

const SECTION_OPTIONS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const ROOM_OPTIONS = [
  "Wohnzimmer", "Schlafzimmer", "Kinderzimmer", "Jugendzimmer", "Arbeitszimmer", "Homeoffice", "Küche", "Esszimmer", "Flur",
  "Diele", "Korridor", "Ankleidezimmer", "Badezimmer", "WC", "Hauswirtschaftsraum", "Abstellraum", "Keller", "Dachboden",
  "Balkon", "Loggia", "Terrasse", "Garten", "Wintergarten", "Gästezimmer", "Spielzimmer", "Bibliothek", "Ruheraum",
  "Barzimmer", "Heimkino", "Fitnessraum", "Werkstatt", "Büro", "Konferenzraum", "Empfangsbereich", "Wartebereich", "Lounge", "Personalraum",
];
const TYPE_OPTIONS = [
  "Sofa", "Ecksofa", "Schlafsofa", "Modulsofa", "Wohnlandschaft", "Couch", "Sessel", "Relaxsessel", "Fernsehsessel", "Ohrensessel",
  "Hocker", "Pouf", "Sitzsack", "Bank", "Sitzbank", "Chaiselongue", "Recamiere", "Esstisch", "Couchtisch", "Beistelltisch",
  "Konsolentisch", "Schreibtisch", "Computertisch", "Gamingtisch", "Schminktisch", "Bartisch", "Gartentisch", "Klapptisch",
  "Stehtisch", "Servierwagen", "Stuhl", "Esszimmerstuhl", "Freischwinger", "Armlehnstuhl", "Polsterstuhl", "Barhocker",
  "Bürostuhl", "Drehstuhl", "Gamingstuhl", "Gartenstuhl", "Klappstuhl", "Bett", "Doppelbett", "Einzelbett", "Boxspringbett",
  "Polsterbett", "Massivholzbett", "Futonbett", "Kinderbett", "Babybett", "Hochbett", "Etagenbett", "Gästebett", "Klappbett",
  "Wasserbett", "Matratze", "Lattenrost", "Topper", "Bettkasten", "Kopfteil", "Kleiderschrank", "Schwebetürenschrank",
  "Drehtürschrank", "Eckschrank", "Garderobenschrank", "Schuhschrank", "Badezimmerschrank", "Hängeschrank", "Hochschrank",
  "Unterschrank", "Aktenschrank", "Küchenschrank", "Apothekerschrank", "Kommode", "Sideboard", "Highboard",
];

function stripCyrillic(value: string): string {
  return value.replace(/[А-Яа-яЁё]/g, "");
}

function normalizePlaceValue(value: string): string {
  const sanitized = stripCyrillic(value).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^\d/.test(sanitized)) return "";
  const match = sanitized.match(/^(\d{0,5})([A-Z]?)/);
  if (!match) return "";
  const [, digits = "", suffix = ""] = match;
  return `${digits}${suffix}`;
}

function normalizeSectionValue(value: string): string {
  return stripCyrillic(value).toUpperCase().replace(/[^A-Z]/g, "");
}

function normalizeLatinTextValue(value: string): string {
  return stripCyrillic(value);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createEditDraft(row: SofortListRow): EditDraftState {
  return {
    kidNumber: row.kidNumber,
    account: "",
    place: row.place ?? "",
    section: row.section ?? "",
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
    photoUrls: row.photoUrls,
    photoFiles: [],
  };
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[calc(var(--radius-card)+2px)] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_18px_40px_-32px_rgba(15,23,42,0.24)]", className)}>{children}</section>;
}

function CompactField({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">{label}</label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function PlaceSuggestionNote({ suggestions, labels }: { suggestions: PlaceSuggestionHints | null; labels: { subplaceSuggestion: string; baseSuggestion: string } }) {
  if (!suggestions || (!suggestions.sameBaseSubplace && !suggestions.nextFreeBasePlace)) return null;
  return (
    <div className="space-y-1 rounded-[var(--radius-control)] border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
      {suggestions.sameBaseSubplace ? <p>{labels.subplaceSuggestion}: {suggestions.sameBaseSubplace}</p> : null}
      {suggestions.nextFreeBasePlace ? <p>{labels.baseSuggestion}: {suggestions.nextFreeBasePlace}</p> : null}
    </div>
  );
}

function StatusFlagField({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className="flex h-10 min-w-0 items-center justify-between gap-2.5 rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-muted/20">
      <span className="truncate text-sm font-medium">{label}</span>
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
    </label>
  );
}

export function CriticalInventoryEditDialog({
  open,
  row,
  availablePlaces,
  occupiedPlaces,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  row: SofortListRow | null;
  availablePlaces: string[];
  occupiedPlaces: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: (row: SofortListRow) => void;
}) {
  const t = useLabels();
  const [editDraft, setEditDraft] = useState<EditDraftState | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<PhotoPreview[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPlaceSuggestions, setEditPlaceSuggestions] = useState<PlaceSuggestionHints | null>(null);
  const [customRoomOptions, setCustomRoomOptions] = useState<string[]>([]);
  const [customTypeOptions, setCustomTypeOptions] = useState<string[]>([]);

  const availablePlaceOptions = useMemo(
    () => Array.from(new Set([...(editDraft?.place ? [editDraft.place] : []), ...availablePlaces].map((value) => String(value || "").trim()).filter(Boolean))),
    [availablePlaces, editDraft?.place],
  );
  const roomOptions = useMemo(() => Array.from(new Set([...ROOM_OPTIONS, ...customRoomOptions].map((value) => String(value || "").trim()).filter(Boolean))), [customRoomOptions]);
  const typeOptions = useMemo(() => Array.from(new Set([...TYPE_OPTIONS, ...customTypeOptions].map((value) => String(value || "").trim()).filter(Boolean))), [customTypeOptions]);
  const addCustomOptionTemplate = typeof t.addCustomOption === "string" && t.addCustomOption.trim() ? t.addCustomOption : "Добавить свой вариант: {value}";
  const occupiedExactPlaces = useMemo(() => new Set(occupiedPlaces.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean)), [occupiedPlaces]);
  const normalizedPlaceQuery = String(editDraft?.place || "").trim().toUpperCase();
  const isPlaceOccupied = normalizedPlaceQuery.length > 0 && occupiedExactPlaces.has(normalizedPlaceQuery) && normalizedPlaceQuery !== String(row?.place || "").trim().toUpperCase();

  useEffect(() => {
    if (!open || !row) {
      setEditDraft(null);
      setEditError(null);
      setEditPlaceSuggestions(null);
      setCustomRoomOptions([]);
      setCustomTypeOptions([]);
      setLoadingDetails(false);
      return;
    }
    setEditDraft(createEditDraft(row));
    setEditError(null);
    setEditPlaceSuggestions(null);
  }, [open, row]);

  useEffect(() => {
    const nextPreviews = (editDraft?.photoFiles ?? []).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotoPreviews(nextPreviews);
    return () => { for (const preview of nextPreviews) URL.revokeObjectURL(preview.url); };
  }, [editDraft?.photoFiles]);

  useEffect(() => {
    if (!open || !row) return;
    let active = true;
    setLoadingDetails(true);
    setEditError(null);
    setEditPlaceSuggestions(null);

    void fetchKidDetails(row.kidId)
      .then((details) => {
        if (!active) return;
        setEditDraft((current) => {
          const base = current ?? createEditDraft(row);
          return {
            ...base,
            kidNumber: details.kidNumber || base.kidNumber,
            account: details.account ?? "",
            place: details.place,
            section: details.section,
            bWare: details.bWare,
            store: details.store,
            inTransit: details.inTransit,
            commentary: details.commentary,
            room: details.room,
            furnitureType: details.furnitureType,
            photoUrls: details.photoUrls.length > 0 ? details.photoUrls : base.photoUrls,
          };
        });
      })
      .catch((error) => {
        if (!active) return;
        setEditError(error instanceof Error ? error.message : t.failedLoadProductDetails);
      })
      .finally(() => {
        if (active) setLoadingDetails(false);
      });

    return () => { active = false; };
  }, [open, row, t.failedLoadProductDetails]);

  function updateDraft<K extends keyof EditDraftState>(key: K, value: EditDraftState[K]) {
    setEditDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveEdit() {
    if (!row || !editDraft || savingEdit) return;

    setSavingEdit(true);
    setEditError(null);
    setEditPlaceSuggestions(null);

    try {
      const uploadedPhotoUrls = editDraft.photoFiles.length > 0 ? await uploadKidImages(editDraft.photoFiles) : [];
      const normalizedPhotoUrls = [...editDraft.photoUrls.map((value) => value.trim()).filter(Boolean), ...uploadedPhotoUrls.map((value) => value.trim()).filter(Boolean)];

      await patchKidDetails({
        kidId: row.kidId,
        kidNumber: editDraft.kidNumber.trim(),
        account: editDraft.account || null,
        place: editDraft.place,
        section: editDraft.section,
        photoUrls: normalizedPhotoUrls,
        room: editDraft.room,
        furnitureType: editDraft.furnitureType,
        bWare: editDraft.bWare,
        store: editDraft.store,
        commentary: editDraft.commentary,
        inTransit: editDraft.inTransit,
      });

      await bulkUpdateKids({
        updates: [{
          kidId: row.kidId,
          room: editDraft.room.trim() || undefined,
          type: editDraft.furnitureType.trim() || undefined,
          quantity: editDraft.quantity.trim() || undefined,
          company: editDraft.company.trim() || undefined,
          color: editDraft.color.trim() || undefined,
          size: editDraft.size.trim() || undefined,
          material: editDraft.material.trim() || undefined,
          price: editDraft.price.trim() || undefined,
          currency: editDraft.currency.trim() || undefined,
        }],
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
        hoodXl: editDraft.hoodXl.trim(),
        temu: "",
      };

      await patchKidMarketplaceEans({
        kidId: row.kidId,
        mainEanJv: normalizedEan,
        ...normalizedSiteEans,
      });

      const nextQuantity = Number.parseInt(editDraft.quantity.trim(), 10);
      onSaved({
        ...row,
        kidNumber: editDraft.kidNumber.trim() || row.kidNumber,
        ean: normalizedEan,
        siteEans: normalizedSiteEans,
        photo: normalizedPhotoUrls[0] ?? "-",
        photoUrls: normalizedPhotoUrls,
        photoCount: normalizedPhotoUrls.length,
        place: editDraft.place.trim(),
        section: editDraft.section.trim() || null,
        bWare: editDraft.bWare,
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
      });
      onOpenChange(false);
    } catch (requestError) {
      setEditError(requestError instanceof Error ? requestError.message : t.failedSaveChanges);
      setEditPlaceSuggestions(requestError instanceof CreateKidRequestError ? requestError.placeSuggestions : null);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!savingEdit) onOpenChange(nextOpen); }}>
      <DialogContent className="!flex !w-[min(1180px,calc(100vw-32px))] !max-w-[1180px] !gap-0 !p-0 h-auto max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-2xl">
        <DialogHeader className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-background px-5 py-4 sm:px-6">
          <DialogTitle>{t.editProductTitle}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2 pb-6">
            {editDraft ? (
              <div className="grid gap-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,400px)] xl:items-start">
                <div className="space-y-2">
                  <SectionCard>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
                      <div className="min-w-0 xl:col-span-12"><CompactField label={t.kidNumber} htmlFor="edit-kid-number"><Input id="edit-kid-number" className="h-10 rounded-[var(--radius-control)]" value={editDraft.kidNumber} onChange={(event) => updateDraft("kidNumber", event.target.value)} /></CompactField></div>
                      <div className="min-w-0 xl:col-span-2"><CompactField label={t.place} htmlFor="edit-kid-place"><SearchablePicker id="edit-kid-place" value={editDraft.place} options={availablePlaceOptions} placeholder={t.notSelected} searchPlaceholder={t.place} emptyLabel={t.noAvailablePlaces} invalid={isPlaceOccupied} invalidLabel={t.placeOccupied} normalizeValue={normalizePlaceValue} onValueChange={(value) => updateDraft("place", value)} /></CompactField></div>
                      <div className="min-w-0 xl:col-span-2"><CompactField label={t.section} htmlFor="edit-kid-section"><SearchablePicker id="edit-kid-section" value={editDraft.section} options={SECTION_OPTIONS} placeholder={t.notSelected} searchPlaceholder={t.section} emptyLabel={t.noAvailableSections} maxLength={1} normalizeValue={normalizeSectionValue} onValueChange={(value) => updateDraft("section", value)} /></CompactField></div>
                      <div className="min-w-0 xl:col-span-4"><CompactField label={t.room} htmlFor="edit-kid-room"><SearchablePicker id="edit-kid-room" value={editDraft.room} options={roomOptions} placeholder={t.notSelected} searchPlaceholder={t.room} emptyLabel={t.noAvailableRooms} canCreate createLabel={addCustomOptionTemplate.replace("{value}", editDraft.room.trim() || "")} onCreateOption={(value) => { setCustomRoomOptions((current) => Array.from(new Set([...current, value]))); updateDraft("room", value); }} normalizeValue={normalizeLatinTextValue} onValueChange={(value) => updateDraft("room", value)} /></CompactField></div>
                      <div className="min-w-0 md:col-span-2 xl:col-span-4"><CompactField label={t.type} htmlFor="edit-kid-type"><SearchablePicker id="edit-kid-type" value={editDraft.furnitureType} options={typeOptions} placeholder={t.notSelected} searchPlaceholder={t.type} emptyLabel={t.noAvailableTypes} canCreate createLabel={addCustomOptionTemplate.replace("{value}", editDraft.furnitureType.trim() || "")} onCreateOption={(value) => { setCustomTypeOptions((current) => Array.from(new Set([...current, value]))); updateDraft("furnitureType", value); }} normalizeValue={normalizeLatinTextValue} onValueChange={(value) => updateDraft("furnitureType", value)} /></CompactField></div>
                      <div className="md:col-span-2 xl:col-span-12"><PlaceSuggestionNote suggestions={editPlaceSuggestions} labels={{ subplaceSuggestion: t.subplaceSuggestion, baseSuggestion: t.baseSuggestion }} /></div>
                      <div className="md:col-span-2 xl:col-span-12"><div className="grid gap-3 sm:grid-cols-3"><StatusFlagField label={t.bWare} checked={editDraft.bWare} onCheckedChange={(checked) => updateDraft("bWare", checked)} /><StatusFlagField label={t.store} checked={editDraft.store} onCheckedChange={(checked) => updateDraft("store", checked)} /><StatusFlagField label={t.inTransit} checked={editDraft.inTransit} onCheckedChange={(checked) => updateDraft("inTransit", checked)} /></div></div>
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
                      <div className="min-w-0 xl:col-span-6"><CompactField label={t.quantity} htmlFor="edit-kid-quantity"><Input id="edit-kid-quantity" className="h-10 rounded-[var(--radius-control)]" inputMode="numeric" value={editDraft.quantity} onChange={(event) => updateDraft("quantity", event.target.value)} /></CompactField></div>
                      <div className="min-w-0 xl:col-span-6"><CompactField label={t.price} htmlFor="edit-kid-price"><Input id="edit-kid-price" className="h-10 rounded-[var(--radius-control)]" inputMode="decimal" value={editDraft.price} onChange={(event) => updateDraft("price", event.target.value)} /></CompactField></div>
                      <div className="min-w-0 xl:col-span-6"><CompactField label={t.company} htmlFor="edit-kid-company"><Input id="edit-kid-company" className="h-10 rounded-[var(--radius-control)]" value={editDraft.company} onChange={(event) => updateDraft("company", event.target.value)} /></CompactField></div>
                      <div className="min-w-0 xl:col-span-6"><CompactField label={t.color} htmlFor="edit-kid-color"><Input id="edit-kid-color" className="h-10 rounded-[var(--radius-control)]" value={editDraft.color} onChange={(event) => updateDraft("color", event.target.value)} /></CompactField></div>
                      <div className="min-w-0 xl:col-span-6"><CompactField label={t.size} htmlFor="edit-kid-size"><Input id="edit-kid-size" className="h-10 rounded-[var(--radius-control)]" value={editDraft.size} onChange={(event) => updateDraft("size", event.target.value)} /></CompactField></div>
                      <div className="min-w-0 md:col-span-2 xl:col-span-6"><CompactField label={t.material} htmlFor="edit-kid-material"><Input id="edit-kid-material" className="h-10 rounded-[var(--radius-control)]" value={editDraft.material} onChange={(event) => updateDraft("material", event.target.value)} /></CompactField></div>
                      <div className="md:col-span-2 xl:col-span-12"><CompactField label={t.commentary} htmlFor="edit-kid-commentary"><Textarea id="edit-kid-commentary" className="min-h-[132px] w-full resize-y rounded-[var(--radius-control)] px-3 py-2.5" value={editDraft.commentary} onChange={(event) => updateDraft("commentary", event.target.value)} /></CompactField></div>
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <CompactField label={t.mainEan} htmlFor="edit-main-ean"><Input id="edit-main-ean" className="h-10 rounded-[var(--radius-control)]" value={editDraft.ean} onChange={(event) => updateDraft("ean", event.target.value)} /></CompactField>
                      </div>
                      <div className="space-y-3">
                        <div className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><span>{t.market}</span><span>JV</span><span>XL</span></div>
                        {[
                          { label: t.sites, jvKey: "jv", xlKey: "xl" },
                          { label: "OTTO", jvKey: "ottoJv", xlKey: "ottoXl" },
                          { label: "EBAY", jvKey: "ebayJv", xlKey: "ebayXl" },
                          { label: "KAUFLAND", jvKey: "kauflandJv", xlKey: "kauflandXl" },
                          { label: "HOOD", jvKey: "hoodJv", xlKey: "hoodXl" },
                        ].map((market) => (
                          <div key={market.label} className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
                            <span className="truncate text-xs font-semibold text-muted-foreground">{market.label}</span>
                            <Input className="h-10 min-w-0 rounded-[var(--radius-control)]" value={editDraft[market.jvKey as keyof EditDraftState] as string} onChange={(event) => updateDraft(market.jvKey as keyof EditDraftState, event.target.value as never)} placeholder={t.jvEanPlaceholder} />
                            <Input className="h-10 min-w-0 rounded-[var(--radius-control)]" value={editDraft[market.xlKey as keyof EditDraftState] as string} onChange={(event) => updateDraft(market.xlKey as keyof EditDraftState, event.target.value as never)} placeholder={t.xlEanPlaceholder} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <SectionCard className="self-start xl:sticky xl:top-0">
                  <div className="space-y-4">
                    <div className="space-y-2.5">
                      {editDraft.photoUrls.length > 0 ? editDraft.photoUrls.map((photoUrl, index) => (
                        <div key={`photo-url-${index}`} className="rounded-[calc(var(--radius-control)+2px)] border border-slate-200/80 bg-white p-3 shadow-[0_10px_24px_-26px_rgba(15,23,42,0.4)]">
                          <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3">
                            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100/70">
                              {photoUrl.trim() ? <Image src={photoUrl.trim()} alt={t.photoLabel.replace("{index}", String(index + 1))} fill unoptimized className="object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><ImageIcon size={18} /></div>}
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{t.photoLabel.replace("{index}", String(index + 1))}</p>
                                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-500 hover:text-destructive" onClick={() => setEditDraft((current) => current ? { ...current, photoUrls: current.photoUrls.filter((_, photoIndex) => photoIndex !== index) } : current)}><X size={14} /></Button>
                              </div>
                              <Input className="h-10 rounded-[var(--radius-control)]" value={photoUrl} placeholder={t.photoUrlPlaceholder} onChange={(event) => setEditDraft((current) => { if (!current) return current; const nextPhotoUrls = [...current.photoUrls]; nextPhotoUrls[index] = event.target.value; return { ...current, photoUrls: nextPhotoUrls }; })} />
                              {!photoUrl.trim() ? <p className="text-[11px] text-slate-400">{t.awaitingUrl}</p> : null}
                            </div>
                          </div>
                        </div>
                      )) : <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 text-center text-sm leading-6 text-muted-foreground">{t.noLinkedPhotosHint}</div>}
                    </div>

                    <div className="space-y-3">
                      <label className="flex min-h-[112px] w-full cursor-pointer items-center justify-center rounded-[calc(var(--radius-control)+2px)] border border-dashed border-slate-300/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.94)_100%)] p-3 shadow-[0_10px_24px_-26px_rgba(15,23,42,0.4)] transition-colors hover:border-emerald-300/80 hover:bg-emerald-50/30">
                        <span className="flex size-12 items-center justify-center rounded-full border border-emerald-200/80 bg-white text-emerald-600 shadow-sm"><Plus size={22} /></span>
                        <span className="sr-only">{t.chooseFiles}</span>
                        <input type="file" multiple accept="image/*" className="sr-only" onChange={(event) => {
                          const nextFiles = Array.from(event.target.files ?? []);
                          if (nextFiles.length === 0) return;
                          setEditDraft((current) => current ? { ...current, photoFiles: [...current.photoFiles, ...nextFiles] } : current);
                          event.currentTarget.value = "";
                        }} />
                      </label>
                      <div className="space-y-2">
                        {photoPreviews.length > 0 ? photoPreviews.map((preview, index) => (
                          <div key={`${preview.file.name}-${preview.file.size}-${preview.file.lastModified}`} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border/70 bg-background p-2.5">
                            <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-border/70 bg-muted/30"><Image src={preview.url} alt={preview.file.name} fill unoptimized className="object-cover" /></div>
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground" title={preview.file.name}>{preview.file.name}</p><p className="text-xs text-muted-foreground">{formatFileSize(preview.file.size)}</p></div>
                            <Button type="button" variant="outline" size="sm" onClick={() => setEditDraft((current) => current ? { ...current, photoFiles: current.photoFiles.filter((_, fileIndex) => fileIndex !== index) } : current)}>{t.remove}</Button>
                          </div>
                        )) : <div className="flex min-h-[92px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 text-center text-sm leading-6 text-muted-foreground">{t.photoPreviewUploadsHint}</div>}
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </div>
            ) : (
              <div className="flex min-h-[240px] items-center justify-center rounded-[var(--radius-card)] border border-border/70 bg-muted/20 px-4 text-center text-sm text-muted-foreground">{t.preparingProductEditor}</div>
            )}
          </div>
        </div>
        <DialogFooter className="sticky bottom-0 z-30 flex min-h-16 items-center justify-end gap-2.5 border-t border-[#e5e7eb] bg-white px-4 py-3 sm:px-6">
          <div className="mr-auto flex min-h-5 items-center">
            {loadingDetails ? <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />{t.loadingFullProductDetails}</span> : editError ? <p className="text-sm text-destructive">{editError}</p> : null}
          </div>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={savingEdit}>{t.cancel}</Button>
          <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit || !editDraft}>{savingEdit ? t.saving : t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
