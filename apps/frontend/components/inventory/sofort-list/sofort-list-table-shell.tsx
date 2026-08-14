import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FilePlus2, ImageIcon, Loader2, PencilLine, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchablePicker } from "@/components/ui/searchable-picker";
import { Textarea } from "@/components/ui/textarea";
import { useLabels } from "@/app/use-labels";
import { cn } from "@/lib/utils";
import {
  createMarketplaceToggleJob,
  deleteInventoryEntity,
  fetchKidDetailView,
  getMarketplaceToggleJob,
  patchKidComposite,
  patchKidMarketplaceStatus,
  uploadKidImages,
  CreateKidRequestError,
  type PlaceSuggestionHints,
  type MarketplaceStatusRowKey,
} from "../inventory-api";
import { useToast } from "../../shared/toast-provider";
import { SofortListMarketplaceMatrix } from "./sofort-list-marketplace-matrix";

import type { HighlightText, SofortListRow } from "./sofort-list-types";

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

type FullscreenGalleryState = {
  photos: string[];
  index: number;
};

type SelectionListener = () => void;

class VisibleRowSelectionStore {
  private selectedRowIds = new Set<string>();
  private rows: SofortListRow[] = [];
  private listeners = new Set<SelectionListener>();

  constructor(private onSelectionChange: (rows: SofortListRow[]) => void) {}

  subscribe = (listener: SelectionListener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setOnSelectionChange(onSelectionChange: (rows: SofortListRow[]) => void) {
    this.onSelectionChange = onSelectionChange;
  }

  setRows(rows: SofortListRow[]) {
    this.rows = rows;
    const visibleRowIds = new Set(rows.map((row) => row.id));
    const next = new Set(Array.from(this.selectedRowIds).filter((rowId) => visibleRowIds.has(rowId)));
    const selectionChanged = next.size !== this.selectedRowIds.size;
    this.selectedRowIds = next;
    this.publishSelection();
    if (selectionChanged) this.emit();
  }

  isSelected(rowId: string) {
    return this.selectedRowIds.has(rowId);
  }

  isAllSelected() {
    return this.rows.length > 0 && this.rows.every((row) => this.selectedRowIds.has(row.id));
  }

  toggle(rowId: string) {
    const next = new Set(this.selectedRowIds);
    if (next.has(rowId)) next.delete(rowId);
    else next.add(rowId);
    this.commit(next);
  }

  toggleAll() {
    const next = new Set(this.selectedRowIds);
    if (this.isAllSelected()) this.rows.forEach((row) => next.delete(row.id));
    else this.rows.forEach((row) => next.add(row.id));
    this.commit(next);
  }

  clear() {
    if (this.selectedRowIds.size === 0) return;
    this.commit(new Set());
  }

  private commit(next: Set<string>) {
    this.selectedRowIds = next;
    this.publishSelection();
    this.emit();
  }

  private publishSelection() {
    this.onSelectionChange(this.rows.filter((row) => this.selectedRowIds.has(row.id)));
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

const RowSelectionCheckbox = memo(function RowSelectionCheckbox(props: {
  store: VisibleRowSelectionStore;
  rowId: string;
  ariaLabel: string;
}) {
  const checked = useSyncExternalStore(props.store.subscribe, () => props.store.isSelected(props.rowId), () => false);
  return <Checkbox checked={checked} onCheckedChange={() => props.store.toggle(props.rowId)} aria-label={props.ariaLabel} />;
});

const SelectVisibleRowsCheckbox = memo(function SelectVisibleRowsCheckbox(props: {
  store: VisibleRowSelectionStore;
  ariaLabel: string;
}) {
  const checked = useSyncExternalStore(props.store.subscribe, () => props.store.isAllSelected(), () => false);
  return <Checkbox checked={checked} onCheckedChange={() => props.store.toggleAll()} aria-label={props.ariaLabel} />;
});

const BLANK_PRODUCT_IMAGE_URL = "https://mediawarehub.veloxdesk.com/warehub/blank.png";
const PALLET_PRODUCT_IMAGE_URL = "https://mediawarehub.veloxdesk.com/warehub/pallet.png";

type ProductThumbnailProps = {
  row: SofortListRow;
  productPhotoAlt: string;
  onOpenGallery: (photos: string[], startIndex?: number) => void;
};

function isPalletValue(value: string | null): boolean {
  return /^(?:\u043f\u0430\u043b\u0435\u0442\u044b|pallets?|paletten)!*$/.test(
    value?.trim().toLocaleLowerCase("ru-RU") ?? ""
  );
}

function isPalletProduct(row: SofortListRow): boolean {
  return isPalletValue(row.room) || isPalletValue(row.furnitureType);
}

function ProductThumbnail({ row, productPhotoAlt, onOpenGallery }: ProductThumbnailProps) {
  if (isPalletProduct(row)) {
    return (
      <div className="wh-sofort-product-cell__image wh-sofort-product-cell__image--static">
        <Image src={PALLET_PRODUCT_IMAGE_URL} alt={row.furnitureType ?? ""} width={240} height={240} unoptimized className="wh-sofort-photo" />
      </div>
    );
  }

  if (row.photo !== "-") {
    return (
      <button type="button" className="wh-sofort-product-cell__image" onClick={() => onOpenGallery(row.photoUrls, 0)}>
        <Image src={row.photo} alt={productPhotoAlt} width={240} height={240} unoptimized className="wh-sofort-photo" />
      </button>
    );
  }

  return (
    <div className="wh-sofort-product-cell__image wh-sofort-product-cell__image--static">
      <Image src={BLANK_PRODUCT_IMAGE_URL} alt="" width={240} height={240} unoptimized className="wh-sofort-photo" />
    </div>
  );
}

const MARKETPLACE_CONFIRM_TARGETS = [
  { key: "JV", state: "live" as const },
  { key: "XL", state: "live" as const },
  { key: "HOOD", state: "live" as const },
  { key: "OTTO", state: "pending" as const },
  { key: "EBAY", state: "pending" as const },
  { key: "KAUFLAND", state: "pending" as const },
];

const SECTION_OPTIONS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const ROOM_OPTIONS = [
  "Wohnzimmer",
  "Schlafzimmer",
  "Kinderzimmer",
  "Jugendzimmer",
  "Arbeitszimmer",
  "Homeoffice",
  "Küche",
  "Esszimmer",
  "Flur",
  "Diele",
  "Korridor",
  "Ankleidezimmer",
  "Badezimmer",
  "WC",
  "Hauswirtschaftsraum",
  "Abstellraum",
  "Keller",
  "Dachboden",
  "Balkon",
  "Loggia",
  "Terrasse",
  "Garten",
  "Wintergarten",
  "Gästezimmer",
  "Spielzimmer",
  "Bibliothek",
  "Ruheraum",
  "Barzimmer",
  "Heimkino",
  "Fitnessraum",
  "Werkstatt",
  "Büro",
  "Konferenzraum",
  "Empfangsbereich",
  "Wartebereich",
  "Lounge",
  "Personalraum",
];
const TYPE_OPTIONS = [
  "Sofa",
  "Ecksofa",
  "Schlafsofa",
  "Modulsofa",
  "Wohnlandschaft",
  "Couch",
  "Sessel",
  "Relaxsessel",
  "Fernsehsessel",
  "Ohrensessel",
  "Hocker",
  "Pouf",
  "Sitzsack",
  "Bank",
  "Sitzbank",
  "Chaiselongue",
  "Recamiere",
  "Esstisch",
  "Couchtisch",
  "Beistelltisch",
  "Konsolentisch",
  "Schreibtisch",
  "Computertisch",
  "Gamingtisch",
  "Schminktisch",
  "Bartisch",
  "Gartentisch",
  "Klapptisch",
  "Stehtisch",
  "Servierwagen",
  "Stuhl",
  "Esszimmerstuhl",
  "Freischwinger",
  "Armlehnstuhl",
  "Polsterstuhl",
  "Barhocker",
  "Bürostuhl",
  "Drehstuhl",
  "Gamingstuhl",
  "Gartenstuhl",
  "Klappstuhl",
  "Bett",
  "Doppelbett",
  "Einzelbett",
  "Boxspringbett",
  "Polsterbett",
  "Massivholzbett",
  "Futonbett",
  "Kinderbett",
  "Babybett",
  "Hochbett",
  "Etagenbett",
  "Gästebett",
  "Klappbett",
  "Wasserbett",
  "Matratze",
  "Lattenrost",
  "Topper",
  "Bettkasten",
  "Kopfteil",
  "Kleiderschrank",
  "Schwebetürenschrank",
  "Drehtürenschrank",
  "Eckschrank",
  "Garderobenschrank",
  "Schuhschrank",
  "Badezimmerschrank",
  "Hängeschrank",
  "Hochschrank",
  "Unterschrank",
  "Aktenschrank",
  "Küchenschrank",
  "Apothekerschrank",
  "Kommode",
  "Sideboard",
  "Highboard",
  "Lowboard",
  "TV-Lowboard",
  "Vitrine",
  "Regal",
  "Wandregal",
  "Bücherregal",
  "CD-Regal",
  "Weinregal",
  "Truhe",
  "Aufbewahrungsbox",
  "Garderobe",
  "Kleiderständer",
  "Wandgarderobe",
  "Garderobenpaneel",
  "Schuhbank",
  "Spiegel",
  "Schirmständer",
  "Küchenblock",
  "Kücheninsel",
  "Küchentisch",
  "Küchenstuhl",
  "Küchenregal",
  "Küchenwagen",
  "Waschbeckenunterschrank",
  "Spiegelschrank",
  "Badezimmerregal",
  "Badspiegel",
  "Badewanne",
  "Dusche",
  "Duschkabine",
  "WC",
  "Waschbecken",
  "Deckenleuchte",
  "Pendelleuchte",
  "Hängeleuchte",
  "Stehlampe",
  "Tischlampe",
  "Wandleuchte",
  "Nachttischlampe",
  "LED-Leuchte",
  "Außenleuchte",
  "Teppich",
  "Hochflorteppich",
  "Kurzflorteppich",
  "Läufer",
  "Outdoor-Teppich",
  "Kinderteppich",
  "Vorhang",
  "Gardine",
  "Rollo",
  "Plissee",
  "Bettwäsche",
  "Kissen",
  "Dekokissen",
  "Kissenbezug",
  "Decke",
  "Tagesdecke",
  "Plaid",
  "Handtuch",
  "Badteppich",
  "Bild",
  "Wandbild",
  "Leinwandbild",
  "Poster",
  "Bilderrahmen",
  "Wanduhr",
  "Tischuhr",
  "Vase",
  "Blumenvase",
  "Pflanzgefäß",
  "Blumentopf",
  "Kunstpflanze",
  "Zimmerpflanze",
  "Kerzenständer",
  "Kerze",
  "Laterne",
  "Windlicht",
  "Skulptur",
  "Figur",
  "Dekofigur",
  "Büste",
  "Schale",
  "Dekoschale",
  "Dekotablett",
  "Ornament",
  "Globus",
  "Sanduhr",
  "Wickelkommode",
  "Hochstuhl",
  "Kinderschrank",
  "Kinderregal",
  "Kindertisch",
  "Kinderstuhl",
  "Spielzeugkiste",
  "Rollcontainer",
  "Konferenztisch",
  "Gartenmöbel",
  "Gartensofa",
  "Gartenbank",
  "Gartenliege",
  "Hängematte",
  "Hollywoodschaukel",
  "Pavillon",
  "Sonnenschirm",
  "Pflanzkübel",
  "Elektrokamin",
  "Ethanolkamin",
  "Kaminumrandung",
  "Katzenbaum",
  "Hundebett",
  "Tierregal",
  "Futterstation",
  "Schuhregal",
  "Standuhr",
  "Gemälde",
  "Kunstdruck",
  "Fotobild",
  "Kerzenhalter",
  "Tablett",
  "Korb",
  "Aufbewahrungskorb",
  "Schmuckkasten",
  "Schmuckständer",
  "Zeitschriftenständer",
  "Flaschenregal",
  "Raumteiler",
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
    photoFiles: []
  };
}

function buildKidDetailsHref(row: SofortListRow): string {
  const kidSlug = encodeURIComponent((row.kidNumber || String(row.kidId)).trim());
  const params = new URLSearchParams();
  params.set("kidId", String(row.kidId));
  if (row.orderDbId !== null) {
    params.set("orderDbId", String(row.orderDbId));
  }
  if (row.photoUrls[0]) {
    params.set("photo", row.photoUrls[0]);
  } else if (row.photo) {
    params.set("photo", row.photo);
  }
  params.set("place", row.place);
  if (row.section) {
    params.set("section", row.section);
  }
  if (row.room) {
    params.set("room", row.room);
  }
  if (row.furnitureType) {
    params.set("type", row.furnitureType);
  }
  if (row.company) {
    params.set("company", row.company);
  }
  if (row.color) {
    params.set("color", row.color);
  }
  if (row.size) {
    params.set("size", row.size);
  }
  if (row.material) {
    params.set("material", row.material);
  }
  params.set("quantity", String(row.quantity));
  if (row.price) {
    params.set("price", row.price);
  }
  if (row.priceCurrency) {
    params.set("currency", row.priceCurrency);
  }
  if (row.ean) {
    params.set("ean", row.ean);
  }
  if (row.commentary) {
    params.set("commentary", row.commentary);
  }
  if (row.bWare) {
    params.set("bWare", "true");
  }
  return `/sofort-list/${kidSlug}?${params.toString()}`;
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function SectionCard({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(
      "rounded-[calc(var(--radius-card)+2px)] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_18px_40px_-32px_rgba(15,23,42,0.24)]",
      className,
    )}>
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
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.09em] text-slate-500">
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

const StatusFlagField = memo(function StatusFlagField({
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
});

function useSofortDesktopLayout(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

export const SofortListTableShell = memo(function SofortListTableShell(props: {
  rows: SofortListRow[];
  query: string;
  availablePlaces: string[];
  occupiedPlaces: string[];
  placeholderEan: string;
  selectionResetKey: number;
  onSelectionChange: (rows: SofortListRow[]) => void;
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
    deleteBlockedByMarketplace: string;
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
  const { onSelectionChange, rows, selectionResetKey } = props;
  const t = useLabels();
  const isDesktopLayout = useSofortDesktopLayout();
  const { showToast } = useToast();
  const router = useRouter();
  const [fullscreenGallery, setFullscreenGallery] = useState<FullscreenGalleryState | null>(null);
  const selectionStoreRef = useRef<VisibleRowSelectionStore | null>(null);
  if (!selectionStoreRef.current) {
    selectionStoreRef.current = new VisibleRowSelectionStore(onSelectionChange);
  }
  const selectionStore = selectionStoreRef.current;
  const [productActionRow, setProductActionRow] = useState<SofortListRow | null>(null);
  const [editingRow, setEditingRow] = useState<SofortListRow | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraftState | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<PhotoPreview[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deactivatingRowId, setDeactivatingRowId] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPlaceSuggestions, setEditPlaceSuggestions] = useState<PlaceSuggestionHints | null>(null);
  const [marketplaceResult, setMarketplaceResult] = useState<MarketplaceResultDialogState | null>(null);
  const [marketplaceConfirm, setMarketplaceConfirm] = useState<MarketplaceConfirmDialogState | null>(null);
  const hasQuantityDeactivationWarning = Boolean(
    marketplaceConfirm?.inactive && marketplaceConfirm.row.quantity > 1
  );
  const [customRoomOptions, setCustomRoomOptions] = useState<string[]>([]);
  const [customTypeOptions, setCustomTypeOptions] = useState<string[]>([]);

  useEffect(() => {
    selectionStore.setOnSelectionChange(onSelectionChange);
  }, [onSelectionChange, selectionStore]);

  useEffect(() => {
    selectionStore.setRows(rows);
  }, [rows, selectionStore]);

  useEffect(() => {
    selectionStore.clear();
  }, [selectionResetKey, selectionStore]);
  const availablePlaceOptions = Array.from(new Set([
    ...(editDraft?.place ? [editDraft.place] : []),
    ...props.availablePlaces,
  ].map((value) => String(value || "").trim()).filter(Boolean)));
  const roomOptions = Array.from(new Set([...ROOM_OPTIONS, ...customRoomOptions].map((value) => String(value || "").trim()).filter(Boolean)));
  const typeOptions = Array.from(new Set([...TYPE_OPTIONS, ...customTypeOptions].map((value) => String(value || "").trim()).filter(Boolean)));
  const addCustomOptionTemplate = typeof t.addCustomOption === "string" && t.addCustomOption.trim()
    ? t.addCustomOption
    : "Добавить свой вариант: {value}";
  const occupiedExactPlaces = new Set(
    props.occupiedPlaces.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean)
  );
  const normalizedPlaceQuery = String(editDraft?.place || "").trim().toUpperCase();
  const filteredPlaceOptions = availablePlaceOptions.filter((place) =>
    !normalizedPlaceQuery || place.toUpperCase().startsWith(normalizedPlaceQuery)
  );
  const isPlaceOccupied = normalizedPlaceQuery.length > 0 && occupiedExactPlaces.has(normalizedPlaceQuery);
  const activeFullscreenPhoto = fullscreenGallery ? fullscreenGallery.photos[fullscreenGallery.index] ?? null : null;
  const productActionEan = productActionRow?.ean.trim() ?? "";
  const productActionMarketplaceEans = productActionRow
    ? Object.values(productActionRow.siteEans).map((value) => value.trim()).filter((value) => value && value !== props.placeholderEan && value !== "-")
    : [];
  const productActionEditorEan = productActionEan && productActionEan !== props.placeholderEan && productActionEan !== "-"
    ? productActionEan
    : productActionMarketplaceEans[0] ?? "";
  const canOpenProductEditor = Boolean(productActionEditorEan);

  function openFullscreenGallery(photos: string[], startIndex = 0) {
    const normalizedPhotos = photos.map((photo) => photo.trim()).filter(Boolean);
    if (normalizedPhotos.length === 0) return;
    const safeIndex = Math.max(0, Math.min(startIndex, normalizedPhotos.length - 1));
    setFullscreenGallery({ photos: normalizedPhotos, index: safeIndex });
  }

  const updateMarketplaceStatus = useCallback(async (row: SofortListRow, marketplace: MarketplaceStatusRowKey, nextStatus: boolean) => {
    try {
      await patchKidMarketplaceStatus({ kidId: row.kidId, marketplace, status: nextStatus });
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.failedSaveChanges, "error");
      throw error;
    }
  }, [showToast, t.failedSaveChanges]);

  function closeFullscreenPhoto() {
    if (!fullscreenGallery) return;
    setFullscreenGallery(null);
    window.history.back();
  }

  function showPreviousFullscreenPhoto() {
    setFullscreenGallery((current) => {
      if (!current || current.photos.length <= 1) return current;
      return {
        ...current,
        index: current.index === 0 ? current.photos.length - 1 : current.index - 1,
      };
    });
  }

  function showNextFullscreenPhoto() {
    setFullscreenGallery((current) => {
      if (!current || current.photos.length <= 1) return current;
      return {
        ...current,
        index: current.index === current.photos.length - 1 ? 0 : current.index + 1,
      };
    });
  }

  useEffect(() => {
    if (!fullscreenGallery) return;

    window.history.pushState({ sofortPhotoViewer: true }, "");

    const handlePopState = () => {
      setFullscreenGallery(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenGallery(null);
        return;
      }
      if (event.key === "ArrowLeft") {
        showPreviousFullscreenPhoto();
        return;
      }
      if (event.key === "ArrowRight") {
        showNextFullscreenPhoto();
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreenGallery]);

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

    void fetchKidDetailView(editingRow.kidId)
      .then((details) => {
        if (!active) return;
        const kidDetails = details.kid;
        setEditDraft((current) => {
          const base = current ?? createEditDraft(editingRow);
          return {
            ...base,
            kidNumber: kidDetails.kidNumber || base.kidNumber,
            account: kidDetails.account ?? "",
            place: kidDetails.place,
            section: kidDetails.section,
            bWare: kidDetails.bWare,
            store: kidDetails.store,
            inTransit: kidDetails.inTransit,
            commentary: kidDetails.commentary,
            room: kidDetails.room,
            furnitureType: kidDetails.furnitureType,
            photoUrls: kidDetails.photoUrls.length > 0 ? kidDetails.photoUrls : base.photoUrls,
            quantity: details.productAttributes?.quantity == null ? base.quantity : String(details.productAttributes.quantity),
            company: details.productAttributes?.company ?? base.company,
            color: details.productAttributes?.color ?? base.color,
            size: details.productAttributes?.size ?? base.size,
            material: details.productAttributes?.material ?? base.material,
            price: details.productAttributes?.price ?? base.price,
            currency: details.productAttributes?.currency ?? base.currency,
            ean: details.ean?.main_ean ?? base.ean,
            jv: details.ean?.jv ?? base.jv,
            xl: details.ean?.xl ?? base.xl,
            ottoJv: details.ean?.otto_jv ?? base.ottoJv,
            ottoXl: details.ean?.otto_xl ?? base.ottoXl,
            ebayJv: details.ean?.ebay_jv ?? base.ebayJv,
            ebayXl: details.ean?.ebay_xl ?? base.ebayXl,
            kauflandJv: details.ean?.kaufland_jv ?? base.kauflandJv,
            kauflandXl: details.ean?.kaufland_xl ?? base.kauflandXl,
            hoodJv: details.ean?.hood_jv ?? base.hoodJv,
            hoodXl: details.ean?.hood_xl ?? base.hoodXl,
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

  function openEditModal(row: SofortListRow) {
    setEditingRow(row);
    setEditDraft(null);
    setEditError(null);
    setEditPlaceSuggestions(null);
  }

  function startProductCreation(row: SofortListRow) {
    setProductActionRow(null);
    router.push(`/create-product?kid=${encodeURIComponent(String(row.kidId))}`);
  }

  function openProductEditor(row: SofortListRow) {
    const params = new URLSearchParams();
    const mainEan = row.ean.trim();
    if (mainEan && mainEan !== props.placeholderEan && mainEan !== "-") {
      params.set("ean", mainEan);
    }

    const tabEans = {
      jv: row.siteEans.jv,
      xl: row.siteEans.xl,
      hood_jv: row.siteEans.hoodJv,
      hood_xl: row.siteEans.hoodXl,
      kaufland_jv: row.siteEans.kauflandJv,
      kaufland_xl: row.siteEans.kauflandXl,
      otto_jv: row.siteEans.ottoJv,
      otto_xl: row.siteEans.ottoXl,
      ebay_jv: row.siteEans.ebayJv,
      ebay_xl: row.siteEans.ebayXl,
    };
    for (const [key, rawValue] of Object.entries(tabEans)) {
      const value = rawValue.trim();
      if (value && value !== props.placeholderEan && value !== "-") params.set(key, value);
    }

    if (![...params.values()].length) return;
    setProductActionRow(null);
    router.push(`/product-editor?${params.toString()}`);
  }

  function closeEditModal(force = false) {
    if (savingEdit && !force) return;
    setEditingRow(null);
    setEditDraft(null);
    setEditError(null);
    setEditPlaceSuggestions(null);
    setCustomRoomOptions([]);
    setCustomTypeOptions([]);
    setLoadingDetails(false);
  }

  const updateDraft = useCallback(<K extends keyof EditDraftState,>(key: K, value: EditDraftState[K]) => {
    setEditDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const updateBWare = useCallback((checked: boolean) => updateDraft("bWare", checked), [updateDraft]);
  const updateStore = useCallback((checked: boolean) => updateDraft("store", checked), [updateDraft]);
  const updateInTransit = useCallback((checked: boolean) => updateDraft("inTransit", checked), [updateDraft]);

  function updatePhotoUrl(index: number, value: string) {
    setEditDraft((current) => {
      if (!current) return current;
      const nextPhotoUrls = [...current.photoUrls];
      nextPhotoUrls[index] = value;
      return { ...current, photoUrls: nextPhotoUrls };
    });
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

      await patchKidComposite({
        kidId: editingRow.kidId,
        kid: {
          kid_number: editDraft.kidNumber.trim(),
          account: editDraft.account || null,
          place: editDraft.place.trim() || null,
          section: editDraft.section.trim() || null,
          photo: normalizedPhotoUrls,
          room: editDraft.room.trim() || null,
          furniture_type: editDraft.furnitureType.trim() || null,
          b_ware: editDraft.bWare,
          store: editDraft.store,
          commentary: editDraft.commentary.trim() || null,
          in_transit: editDraft.inTransit,
        },
        ean: {
          main_ean: normalizedEan || null,
          jv: normalizedSiteEans.jv || null,
          xl: normalizedSiteEans.xl || null,
          otto_jv: normalizedSiteEans.ottoJv || null,
          otto_xl: normalizedSiteEans.ottoXl || null,
          ebay_jv: normalizedSiteEans.ebayJv || null,
          ebay_xl: normalizedSiteEans.ebayXl || null,
          kaufland_jv: normalizedSiteEans.kauflandJv || null,
          kaufland_xl: normalizedSiteEans.kauflandXl || null,
          hood_jv: normalizedSiteEans.hoodJv || null,
          hood_xl: normalizedSiteEans.hoodXl || null,
        },
        productAttributes: {
          quantity: editDraft.quantity.trim() || undefined,
          company: editDraft.company.trim() || undefined,
          color: editDraft.color.trim() || undefined,
          size: editDraft.size.trim() || undefined,
          material: editDraft.material.trim() || undefined,
          price: editDraft.price.trim() || undefined,
          currency: editDraft.currency.trim() || undefined,
        },
      });

      const nextQuantity = Number.parseInt(editDraft.quantity.trim(), 10);
      const nextRow: SofortListRow = {
        ...editingRow,
        kidNumber: editDraft.kidNumber.trim() || editingRow.kidNumber,
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
        priceCurrency: editDraft.currency.trim() || null
      };

      props.onUpdateRow(nextRow);
      closeEditModal(true);
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

  const requestMarketplaceAction = useCallback((row: SofortListRow) => {
    if (deactivatingRowId || deletingRowId) return;
    const nextInactive = row.marketplaceActive !== false;
    setMarketplaceConfirm({ row, inactive: nextInactive, nextPlace: "", placeError: null });
  }, [deactivatingRowId, deletingRowId]);

  const runDeleteAction = useCallback(async (row: SofortListRow) => {
    if (deletingRowId || deactivatingRowId || row.marketplaceActive === true) return;

    setDeletingRowId(row.id);
    try {
      await deleteInventoryEntity({ entity: "kid", orderDbId: null, kidId: row.kidId });
      if (editingRow?.kidId === row.kidId) {
        setEditingRow(null);
        setEditDraft(null);
        setEditError(null);
        setEditPlaceSuggestions(null);
        setCustomRoomOptions([]);
        setCustomTypeOptions([]);
        setLoadingDetails(false);
      }
      props.onRefresh();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : props.labels.deleteFailed;
      showToast(message, "error");
    } finally {
      setDeletingRowId(null);
    }
  }, [deactivatingRowId, deletingRowId, editingRow?.kidId, props, showToast]);

  const inventoryList = useMemo(() => (
    <div className="wh-sofort-table-shell">
      <div className="wh-sofort-table-frame">
        {isDesktopLayout ? (
        <div className="wh-sofort-table-wrap ui-desktop-rhythm-table max-w-full overflow-x-hidden overflow-y-visible px-0 pb-0 pt-0">
          <table className="ui-listing-table wh-sofort-data-table wh-sofort-table-grid w-full border-separate border-spacing-y-0 text-left text-sm">
            <colgroup>
              <col className="wh-sofort-col wh-sofort-col--select" />
              <col className="wh-sofort-col wh-sofort-col--place" />
              <col className="wh-sofort-col wh-sofort-col--image" />
              <col className="wh-sofort-col wh-sofort-col--product" />
              <col className="wh-sofort-col wh-sofort-col--attributes" />
              <col className="wh-sofort-col wh-sofort-col--commentary" />
              <col className="wh-sofort-col wh-sofort-col--marketplace" />
              <col className="wh-sofort-col wh-sofort-col--actions" />
              <col className="wh-sofort-col wh-sofort-col--hidden" />
            </colgroup>
            <thead>
              <tr className="ui-table-head-row sticky top-0 z-10">
                <th scope="col" className="ui-listing-head-cell wh-sofort-head-cell wh-sofort-head-cell--select wh-sofort-cell wh-sofort-cell--narrow py-3 text-center">
                  <SelectVisibleRowsCheckbox store={selectionStore} ariaLabel={t.selectVisibleRows} />
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
                <tr
                  key={row.id}
                  className={cn(
                    "ui-table-row wh-sofort-table-row",
                    index % 2 === 0 ? "ui-table-row-even" : "ui-table-row-odd",
                    row.stockStatus === "out" && "wh-sofort-table-row--out-of-stock",
                    row.stockStatus === "returned" && "wh-sofort-table-row--returned",
                  )}
                >
                  <td className="wh-sofort-cell wh-sofort-cell--narrow py-3 text-center align-middle">
                    <RowSelectionCheckbox
                      store={selectionStore}
                      rowId={row.id}
                      ariaLabel={t.selectRow.replace("{kid}", row.kidNumber)}
                    />
                  </td>
                  <td className="wh-sofort-cell py-3 align-middle">
                    <div className="wh-sofort-place-cell">
                      <span
                        className="wh-sofort-place-cell__value"
                        title={row.section ? `${row.section} ${row.place}` : row.place}
                      >
                        {props.highlightText(row.section ? `${row.section} ${row.place}` : row.place, props.query)}
                      </span>
                      <span className="wh-sofort-place-cell__location" title={`${t.location} ${row.store ? t.store : t.warehouse}`}>
                        {props.highlightText(row.store ? t.store : t.warehouse, props.query)}
                      </span>
                    </div>
                  </td>
                  <td className="wh-sofort-image-cell wh-sofort-cell py-3 text-center align-middle">
                    <ProductThumbnail
                      row={row}
                      productPhotoAlt={t.productPhotoForKid.replace("{kid}", row.kidNumber)}
                      onOpenGallery={openFullscreenGallery}
                    />
                  </td>
                  <td className="wh-sofort-product-cell-wrap wh-sofort-cell py-3 align-middle">
                    <div className="wh-sofort-product-cell">
                      <div className="wh-sofort-product-cell__content">
                        <p className="wh-sofort-product-cell__title wh-inventory-title-text">
                          <span className="wh-sofort-product-cell__title-label ui-table-data-meta">{t.kid}: </span>
                          {row.kidNumber && row.kidNumber !== "-" ? (
                            <Link href={buildKidDetailsHref(row)} className="wh-sofort-kid-value-link">
                              {row.kidNumber}
                            </Link>
                          ) : (
                            <span className="wh-sofort-product-cell__title-value">—</span>
                          )}
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
                  <td className="wh-sofort-marketplace-cell wh-sofort-cell py-3 align-middle">
                    <SofortListMarketplaceMatrix
                      siteEans={row.siteEans}
                      siteEanStatuses={row.siteEanStatuses}
                      bWare={row.bWare}
                      query={props.query}
                      placeholderEan={props.placeholderEan}
                      highlightText={props.highlightText}
                      onStatusChange={(marketplace, nextStatus) => updateMarketplaceStatus(row, marketplace, nextStatus)}
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
                      <Button
                        type="button"
                        size="sm"
                        className="min-w-[112px]"
                        onClick={() => setProductActionRow(row)}
                        disabled={deletingRowId === row.id || deactivatingRowId === row.id}
                      >
                        {t.create} / {t.edit}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(row)} disabled={deletingRowId === row.id || deactivatingRowId === row.id}>{t.edit}</Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => requestMarketplaceAction(row)}
                        disabled={deactivatingRowId === row.id || deletingRowId === row.id}
                      >
                        {deactivatingRowId === row.id ? t.working : row.marketplaceActive === false ? props.labels.activate : props.labels.deactivate}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void runDeleteAction(row)}
                        disabled={deletingRowId === row.id || deactivatingRowId === row.id || row.marketplaceActive === true}
                        title={row.marketplaceActive === true ? props.labels.deleteBlockedByMarketplace : undefined}
                      >
                        {deletingRowId === row.id ? t.deleting : props.labels.delete}
                      </Button>
                    </div>
                  </td>
                  <td className="hidden">{row.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : (
        <div className="wh-sofort-mobile-list">
          <div className="wh-sofort-mobile-list__toolbar">
            <label className="wh-sofort-mobile-list__select-all">
              <SelectVisibleRowsCheckbox store={selectionStore} ariaLabel={t.selectVisibleRows} />
              <span>{t.selectVisibleRows}</span>
            </label>
          </div>
          <div className="wh-sofort-mobile-list__items">
            {props.rows.map((row) => (
              <article
                key={`mobile-${row.id}`}
                className={cn(
                  "wh-sofort-mobile-card",
                  row.stockStatus === "out" && "wh-sofort-mobile-card--out-of-stock",
                  row.stockStatus === "returned" && "wh-sofort-mobile-card--returned",
                )}
              >
                <div className="wh-sofort-mobile-card__top">
                  <label className="wh-sofort-mobile-card__checkbox">
                    <RowSelectionCheckbox
                      store={selectionStore}
                      rowId={row.id}
                      ariaLabel={t.selectRow.replace("{kid}", row.kidNumber)}
                    />
                  </label>
                  <div className="wh-sofort-mobile-card__place">
                    <span className="wh-sofort-place-cell__value">
                      {props.highlightText(row.section ? `${row.section} ${row.place}` : row.place, props.query)}
                    </span>
                    <span className="wh-sofort-place-cell__location">
                      {props.highlightText(row.store ? t.store : t.warehouse, props.query)}
                    </span>
                  </div>
                </div>

                <div className="wh-sofort-mobile-card__main">
                  <div className="wh-sofort-mobile-card__image-wrap">
                    <ProductThumbnail
                      row={row}
                      productPhotoAlt={t.productPhotoForKid.replace("{kid}", row.kidNumber)}
                      onOpenGallery={openFullscreenGallery}
                    />
                  </div>

                  <div className="wh-sofort-mobile-card__content">
                    <div className="wh-sofort-mobile-card__section wh-sofort-mobile-card__section--summary">
                      <p className="wh-sofort-mobile-card__title">
                        <span>{t.kid}:</span>
                        {row.kidNumber && row.kidNumber !== "-" ? (
                          <Link href={buildKidDetailsHref(row)} className="wh-sofort-kid-value-link">
                            {row.kidNumber}
                          </Link>
                        ) : (
                          <strong>—</strong>
                        )}
                      </p>
                      <p className="wh-sofort-mobile-card__meta">{t.quantity}: {props.highlightText(String(row.quantity), props.query)}</p>
                      <p className="wh-sofort-mobile-card__meta">
                        {t.price}: {props.highlightText(
                          row.price !== null
                            ? `${displayNullable(row.price)} ${displayNullable(row.priceCurrency)}`
                            : displayNullable(row.price),
                          props.query
                        )}
                      </p>
                    </div>

                    <div className="wh-sofort-mobile-card__section wh-sofort-mobile-card__section--attributes">
                      <p className="wh-sofort-mobile-card__meta"><span>{t.room}:</span> {props.highlightText(displayNullable(row.room), props.query)}</p>
                      <p className="wh-sofort-mobile-card__meta"><span>{t.type}:</span> {props.highlightText(displayNullable(row.furnitureType), props.query)}</p>
                      <p className="wh-sofort-mobile-card__meta"><span>{t.company}:</span> {props.highlightText(displayNullable(row.company), props.query)}</p>
                      <p className="wh-sofort-mobile-card__meta"><span>{t.color}:</span> {props.highlightText(displayNullable(row.color), props.query)}</p>
                      <p className="wh-sofort-mobile-card__meta"><span>{t.size}:</span> {props.highlightText(displayNullable(row.size), props.query)}</p>
                      <p className="wh-sofort-mobile-card__meta"><span>{t.material}:</span> {props.highlightText(displayNullable(row.material), props.query)}</p>
                    </div>

                    {row.commentary ? (
                      <div className="wh-sofort-mobile-card__section wh-sofort-mobile-card__section--commentary">
                        <p className="wh-sofort-mobile-card__commentary">{props.highlightText(displayNullable(row.commentary), props.query)}</p>
                      </div>
                    ) : null}

                    <div className="wh-sofort-mobile-card__section wh-sofort-mobile-card__section--marketplace">
                      <SofortListMarketplaceMatrix
                        siteEans={row.siteEans}
                        siteEanStatuses={row.siteEanStatuses}
                        bWare={row.bWare}
                        query={props.query}
                        placeholderEan={props.placeholderEan}
                        highlightText={props.highlightText}
                        onStatusChange={(marketplace, nextStatus) => updateMarketplaceStatus(row, marketplace, nextStatus)}
                        labels={{
                          matrixAria: t.marketplaceMatrixAria.replace("{kid}", row.kidNumber),
                          jv: "JV",
                          xl: "XL",
                          matched: t.matched,
                          value: t.value,
                          empty: t.noValue,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="wh-sofort-mobile-card__actions">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setProductActionRow(row)}
                    disabled={deletingRowId === row.id || deactivatingRowId === row.id}
                  >
                    {t.create} / {t.edit}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(row)} disabled={deletingRowId === row.id || deactivatingRowId === row.id}>{t.edit}</Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => requestMarketplaceAction(row)}
                    disabled={deactivatingRowId === row.id || deletingRowId === row.id}
                  >
                    {deactivatingRowId === row.id ? t.working : row.marketplaceActive === false ? props.labels.activate : props.labels.deactivate}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void runDeleteAction(row)}
                    disabled={deletingRowId === row.id || deactivatingRowId === row.id || row.marketplaceActive === true}
                    title={row.marketplaceActive === true ? props.labels.deleteBlockedByMarketplace : undefined}
                  >
                    {deletingRowId === row.id ? t.deleting : props.labels.delete}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  ), [
    deactivatingRowId,
    deletingRowId,
    isDesktopLayout,
    labels,
    props,
    requestMarketplaceAction,
    runDeleteAction,
    selectionStore,
    t,
    updateMarketplaceStatus,
  ]);

  return (
    <div>
      {inventoryList}
      {activeFullscreenPhoto ? (
        <div className="wh-sofort-photo-viewer" role="dialog" aria-modal="true" onClick={closeFullscreenPhoto}>
          <button type="button" className="wh-sofort-photo-viewer__close" onClick={closeFullscreenPhoto} aria-label={t.closeImageViewer}>
            {t.close}
          </button>
          <div className="wh-sofort-photo-viewer__content" onClick={(event) => event.stopPropagation()}>
            {fullscreenGallery && fullscreenGallery.photos.length > 1 ? (
              <button type="button" className="wh-sofort-photo-viewer__nav wh-sofort-photo-viewer__nav--prev" onClick={showPreviousFullscreenPhoto} aria-label={t.previousPhoto}>
                <ChevronLeft size={24} />
              </button>
            ) : null}
            <Image src={activeFullscreenPhoto} alt={t.productPhoto} width={1600} height={1200} unoptimized className="wh-sofort-photo-viewer__image" />
            {fullscreenGallery && fullscreenGallery.photos.length > 1 ? (
              <button type="button" className="wh-sofort-photo-viewer__nav wh-sofort-photo-viewer__nav--next" onClick={showNextFullscreenPhoto} aria-label={t.nextPhoto}>
                <ChevronRight size={24} />
              </button>
            ) : null}
            {fullscreenGallery && fullscreenGallery.photos.length > 1 ? (
              <div className="wh-sofort-photo-viewer__counter">
                {fullscreenGallery.index + 1} / {fullscreenGallery.photos.length}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <Dialog open={Boolean(productActionRow)} onOpenChange={(open) => { if (!open) setProductActionRow(null); }}>
        <DialogContent className="!gap-0 overflow-hidden rounded-2xl border-border/80 p-0 shadow-2xl sm:max-w-xl" showCloseButton={false}>
          <DialogHeader className="border-b border-border/70 bg-gradient-to-br from-primary/[0.075] via-background to-background px-6 pb-5 pt-6 pr-16 sm:px-7">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Product actions</p>
            <DialogTitle className="text-xl font-semibold tracking-[-0.025em]">Choose how to continue</DialogTitle>
            <DialogDescription className="mt-1.5 max-w-md text-sm leading-6">
              Create a new marketplace listing or open the product that is already linked to this item.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => setProductActionRow(null)}
            className="absolute right-5 top-5 inline-flex size-9 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground shadow-sm transition-colors duration-200 hover:border-muted-foreground/40 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-6"
            aria-label={t.close}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          {productActionRow ? (
            <div className="space-y-5 px-6 py-5 sm:px-7 sm:py-6">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary ring-1 ring-primary/15">KID</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Selected inventory item</p>
                    <p className="mt-0.5 truncate text-base font-semibold text-foreground">{productActionRow.kidNumber}</p>
                  </div>
                </div>
                <div className="shrink-0 border-l border-border/70 pl-4 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Linked EAN</p>
                  <p className={cn("mt-0.5 font-mono text-xs font-semibold", canOpenProductEditor ? "text-foreground" : "text-muted-foreground")}>
                    {canOpenProductEditor ? productActionEditorEan : "Not assigned"}
                  </p>
                </div>
              </div>
              <div className="space-y-3" aria-label="Available product actions">
                <Button type="button" className="group h-auto min-h-[112px] w-full whitespace-normal justify-start gap-4 rounded-xl px-4 py-4 text-left shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-primary/90 hover:shadow-md focus-visible:ring-offset-2" onClick={() => startProductCreation(productActionRow)}>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                    <FilePlus2 className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-primary-foreground/65">New listing</span>
                    <span className="mt-1 block text-base font-semibold">Create new product</span>
                    <span className="mt-1 block text-sm font-normal leading-5 text-primary-foreground/80">Use this inventory item as the source for a new marketplace listing.</span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 opacity-75 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" className="group h-auto min-h-[112px] w-full whitespace-normal justify-start gap-4 rounded-xl border-border/90 bg-background px-4 py-4 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/45 hover:bg-primary/[0.035] hover:shadow-sm disabled:cursor-not-allowed disabled:border-border/70 disabled:bg-muted/20 disabled:opacity-75" onClick={() => openProductEditor(productActionRow)} disabled={!canOpenProductEditor}>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 group-disabled:bg-muted group-disabled:text-muted-foreground group-disabled:ring-border">
                    <PencilLine className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Existing listing</span>
                    <span className="mt-1 block text-base font-semibold">Edit existing product</span>
                    <span className="mt-1 block text-sm font-normal leading-5 text-muted-foreground">
                      {canOpenProductEditor ? "Open Product Editor with this EAN already searched." : "Assign an EAN to this inventory item before editing."}
                    </span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-disabled:hidden motion-reduce:transition-none" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}
          <DialogFooter className="border-t border-border/70 bg-muted/[0.18] px-6 py-3.5 sm:px-7">
            <Button type="button" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => setProductActionRow(null)}>{t.cancel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

              {hasQuantityDeactivationWarning ? (
                <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-amber-950">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">{t.confirmActionQuantityWarningTitle}</p>
                      <p className="mt-1 text-sm leading-6">
                        {t.confirmActionQuantityWarningMessage.replace(
                          "{quantity}",
                          String(marketplaceConfirm.row.quantity)
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

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
              {hasQuantityDeactivationWarning
                ? t.confirmActionQuantityWarningCancel
                : props.labels.confirmActionCancel}
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
              {hasQuantityDeactivationWarning
                ? t.confirmActionQuantityWarningConfirm
                : marketplaceConfirm?.inactive
                  ? props.labels.deactivate
                  : props.labels.activate}
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
        <DialogContent className="!flex !w-[min(1180px,calc(100vw-32px))] !max-w-[1180px] !gap-0 !p-0 h-auto max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-2xl">
          <DialogHeader className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-background px-5 py-4 sm:px-6">
            <DialogTitle>{t.editProductTitle}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-2 pb-6">
              {editDraft ? (
                <>
                  <div className="grid gap-2 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,400px)] xl:items-start">
                    <div className="space-y-2">
                      <SectionCard>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
                          <div className="min-w-0 xl:col-span-12">
                            <CompactField label={t.kidNumber} htmlFor="edit-kid-number">
                              <Input
                                id="edit-kid-number"
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft.kidNumber}
                                onChange={(event) => updateDraft("kidNumber", event.target.value)}
                              />
                            </CompactField>
                          </div>

                          <div className="min-w-0 xl:col-span-2">
                            <CompactField label={t.place} htmlFor="edit-kid-place">
                              <SearchablePicker
                                id="edit-kid-place"
                                value={editDraft.place}
                                options={availablePlaceOptions}
                                placeholder={t.notSelected}
                                searchPlaceholder={t.place}
                                emptyLabel={t.noAvailablePlaces}
                                invalid={isPlaceOccupied}
                                invalidLabel={t.placeOccupied}
                                normalizeValue={normalizePlaceValue}
                                onValueChange={(value) => updateDraft("place", value)}
                              />
                            </CompactField>
                          </div>

                          <div className="min-w-0 xl:col-span-2">
                            <CompactField label={t.section} htmlFor="edit-kid-section">
                              <SearchablePicker
                                id="edit-kid-section"
                                value={editDraft.section}
                                options={SECTION_OPTIONS}
                                placeholder={t.notSelected}
                                searchPlaceholder={t.section}
                                emptyLabel={t.noAvailableSections}
                                maxLength={1}
                                normalizeValue={normalizeSectionValue}
                                onValueChange={(value) => updateDraft("section", value)}
                              />
                            </CompactField>
                          </div>

                          <div className="min-w-0 xl:col-span-4">
                            <CompactField label={t.room} htmlFor="edit-kid-room">
                              <SearchablePicker
                                id="edit-kid-room"
                                value={editDraft.room}
                                options={roomOptions}
                                placeholder={t.notSelected}
                                searchPlaceholder={t.room}
                                emptyLabel={t.noAvailableRooms}
                                canCreate
                                createLabel={addCustomOptionTemplate.replace("{value}", editDraft.room.trim() || "")}
                                onCreateOption={(value) => {
                                  setCustomRoomOptions((current) => Array.from(new Set([...current, value])));
                                  updateDraft("room", value);
                                }}
                                normalizeValue={normalizeLatinTextValue}
                                onValueChange={(value) => updateDraft("room", value)}
                              />
                            </CompactField>
                          </div>

                          <div className="min-w-0 md:col-span-2 xl:col-span-4">
                            <CompactField label={t.type} htmlFor="edit-kid-type">
                              <SearchablePicker
                                id="edit-kid-type"
                                value={editDraft.furnitureType}
                                options={typeOptions}
                                placeholder={t.notSelected}
                                searchPlaceholder={t.type}
                                emptyLabel={t.noAvailableTypes}
                                canCreate
                                createLabel={addCustomOptionTemplate.replace("{value}", editDraft.furnitureType.trim() || "")}
                                onCreateOption={(value) => {
                                  setCustomTypeOptions((current) => Array.from(new Set([...current, value])));
                                  updateDraft("furnitureType", value);
                                }}
                                normalizeValue={normalizeLatinTextValue}
                                onValueChange={(value) => updateDraft("furnitureType", value)}
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
                            <div className="grid gap-3 sm:grid-cols-3">
                              <StatusFlagField label={t.bWare} checked={editDraft.bWare} onCheckedChange={updateBWare} />
                              <StatusFlagField label={t.store} checked={editDraft.store} onCheckedChange={updateStore} />
                              <StatusFlagField label={t.inTransit} checked={editDraft.inTransit} onCheckedChange={updateInTransit} />
                            </div>
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
                          <div className="min-w-0 xl:col-span-6">
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

                          <div className="min-w-0 xl:col-span-6">
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

                          <div className="min-w-0 xl:col-span-6">
                            <CompactField label="Currency" htmlFor="edit-kid-currency">
                              <Input
                                id="edit-kid-currency"
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft.currency}
                                onChange={(event) => updateDraft("currency", event.target.value.toUpperCase())}
                                maxLength={3}
                              />
                            </CompactField>
                          </div>

                          <div className="min-w-0 xl:col-span-6">
                            <CompactField label={t.company} htmlFor="edit-kid-company">
                              <Input
                                id="edit-kid-company"
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft.company}
                                onChange={(event) => updateDraft("company", event.target.value)}
                              />
                            </CompactField>
                          </div>

                          <div className="min-w-0 xl:col-span-6">
                            <CompactField label={t.color} htmlFor="edit-kid-color">
                              <Input
                                id="edit-kid-color"
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft.color}
                                onChange={(event) => updateDraft("color", event.target.value)}
                              />
                            </CompactField>
                          </div>

                          <div className="min-w-0 xl:col-span-6">
                            <CompactField label={t.size} htmlFor="edit-kid-size">
                              <Input
                                id="edit-kid-size"
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft.size}
                                onChange={(event) => updateDraft("size", event.target.value)}
                              />
                            </CompactField>
                          </div>

                          <div className="min-w-0 md:col-span-2 xl:col-span-6">
                            <CompactField label={t.material} htmlFor="edit-kid-material">
                              <Input
                                id="edit-kid-material"
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft.material}
                                onChange={(event) => updateDraft("material", event.target.value)}
                              />
                            </CompactField>
                          </div>

                          <div className="md:col-span-2 xl:col-span-12">
                            <CompactField label={t.commentary} htmlFor="edit-kid-commentary">
                              <Textarea
                                id="edit-kid-commentary"
                                className="min-h-[132px] w-full resize-y rounded-[var(--radius-control)] px-3 py-2.5"
                                value={editDraft.commentary}
                                onChange={(event) => updateDraft("commentary", event.target.value)}
                              />
                            </CompactField>
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard>
                        <div className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <CompactField label={t.mainEan} htmlFor="edit-main-ean">
                              <Input
                                id="edit-main-ean"
                                className="h-10 rounded-[var(--radius-control)]"
                                value={editDraft.ean}
                                onChange={(event) => updateDraft("ean", event.target.value)}
                              />
                            </CompactField>
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-3">
                              <div className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                                <div key={market.label} className="grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
                                  <span className="truncate text-xs font-semibold text-muted-foreground">{market.label}</span>
                                  <Input
                                    className="h-10 min-w-0 rounded-[var(--radius-control)]"
                                    value={editDraft[market.jvKey as keyof EditDraftState] as string}
                                    onChange={(event) => updateDraft(market.jvKey as keyof EditDraftState, event.target.value as never)}
                                    placeholder={t.jvEanPlaceholder}
                                  />
                                  <Input
                                    className="h-10 min-w-0 rounded-[var(--radius-control)]"
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
                    </div>

                    <SectionCard className="self-start xl:sticky xl:top-0">
                      <div className="space-y-4">
                        <div className="space-y-2.5">
                          {editDraft.photoUrls.length > 0 ? (
                            editDraft.photoUrls.map((photoUrl, index) => (
                              <div key={`photo-url-${index}`} className="rounded-[calc(var(--radius-control)+2px)] border border-slate-200/80 bg-white p-3 shadow-[0_10px_24px_-26px_rgba(15,23,42,0.4)]">
                                <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3">
                                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100/70">
                                    {photoUrl.trim() ? (
                                      <button
                                        type="button"
                                        className="block h-full w-full"
                                        onClick={() => openFullscreenGallery(editDraft.photoUrls, index)}
                                      >
                                        <Image src={photoUrl.trim()} alt={t.photoLabel.replace("{index}", String(index + 1))} fill unoptimized className="object-cover" />
                                      </button>
                                    ) : (
                                      <div className="flex h-full items-center justify-center text-slate-400">
                                        <ImageIcon size={18} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                                        {t.photoLabel.replace("{index}", String(index + 1))}
                                      </p>
                                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-500 hover:text-destructive" onClick={() => removePhotoUrl(index)}>
                                        <X size={14} />
                                      </Button>
                                    </div>
                                    <Input
                                      id={`edit-photo-url-${index}`}
                                      className="h-10 rounded-[var(--radius-control)]"
                                      value={photoUrl}
                                      placeholder={t.photoUrlPlaceholder}
                                      onChange={(event) => updatePhotoUrl(index, event.target.value)}
                                    />
                                    {!photoUrl.trim() ? (
                                      <p className="text-[11px] text-slate-400">{t.awaitingUrl}</p>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 text-center text-sm leading-6 text-muted-foreground">
                              {t.noLinkedPhotosHint}
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <label className="flex min-h-[112px] w-full cursor-pointer items-center justify-center rounded-[calc(var(--radius-control)+2px)] border border-dashed border-slate-300/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99)_0%,rgba(248,250,252,0.94)_100%)] p-3 shadow-[0_10px_24px_-26px_rgba(15,23,42,0.4)] transition-colors hover:border-emerald-300/80 hover:bg-emerald-50/30">
                            <span className="flex size-12 items-center justify-center rounded-full border border-emerald-200/80 bg-white text-emerald-600 shadow-sm">
                              <Plus size={22} />
                            </span>
                            <span className="sr-only">{t.chooseFiles}</span>
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
                  </div>
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
            <Button type="button" variant="ghost" onClick={() => closeEditModal()} disabled={savingEdit}>{t.cancel}</Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit || !editDraft}>
              {savingEdit ? t.saving : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
