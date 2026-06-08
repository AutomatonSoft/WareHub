import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ImageIcon, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bulkUpdateKids, patchKidPhotoUrls, uploadKidImages } from "../inventory-api";
import { SofortListMarketplaceMatrix } from "./sofort-list-marketplace-matrix";

import type { HighlightText, SofortListRow } from "./sofort-list-types";

function sortIcon(active: boolean, direction: "asc" | "desc") {
  if (!active) return <ArrowUpDown className="size-3.5" />;
  return direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

function displayNullable(value: string | null): string {
  if (value === null) return "null";
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "null";
}

export function SofortListTableShell(props: {
  rows: SofortListRow[];
  query: string;
  selectedRowIds: Set<string>;
  allVisibleSelected: boolean;
  sortField: "place" | "quantity" | "price" | null;
  sortDirection: "asc" | "desc";
  placeholderEan: string;
  onToggleSelectVisible: () => void;
  onToggleRowSelection: (rowId: string) => void;
  onToggleSort: (field: "place" | "quantity" | "price") => void;
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
  const [editDraft, setEditDraft] = useState({
    ean: "",
    room: "",
    furnitureType: "",
    color: "",
    size: "",
    material: "",
    price: "",
    jv: "",
    xl: "",
    ottoJv: "",
    ottoXl: "",
    ebayJv: "",
    ebayXl: "",
    kauflandJv: "",
    kauflandXl: "",
    hoodJv: "",
    hoodXl: ""
  });
  const [removePhoto, setRemovePhoto] = useState(false);
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
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

  function closeFullscreenPhoto() {
    if (!fullscreenPhoto) return;
    setFullscreenPhoto(null);
  }

  function openEditModal(row: SofortListRow) {
    setEditingRow(row);
    setRemovePhoto(false);
    setEditPhotoUrl(row.photo && row.photo !== "-" ? row.photo : "");
    setEditPhotoFile(null);
    setEditError(null);
    setEditDraft({
      ean: row.ean,
      room: row.room ?? "",
      furnitureType: row.furnitureType ?? "",
      color: row.color ?? "",
      size: row.size ?? "",
      material: row.material ?? "",
      price: row.price ?? "",
      jv: row.siteEans.jv,
      xl: row.siteEans.xl,
      ottoJv: row.siteEans.ottoJv,
      ottoXl: row.siteEans.ottoXl,
      ebayJv: row.siteEans.ebayJv,
      ebayXl: row.siteEans.ebayXl,
      kauflandJv: row.siteEans.kauflandJv,
      kauflandXl: row.siteEans.kauflandXl,
      hoodJv: row.siteEans.hoodJv,
      hoodXl: row.siteEans.hoodXl
    });
  }

  async function saveEdit() {
    if (!editingRow) return;
    if (savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    let nextPhoto = editingRow.photo;
    let nextPhotoCount = editingRow.photoCount;
    const nextRoom = editDraft.room.trim() || null;
    const nextType = editDraft.furnitureType.trim() || null;
    const nextColor = editDraft.color.trim() || null;
    const nextSize = editDraft.size.trim() || null;
    const nextMaterial = editDraft.material.trim() || null;
    const nextPrice = editDraft.price.trim() || null;
    try {
      const normalizedPhotoUrl = editPhotoUrl.trim();
      if (removePhoto) {
        await patchKidPhotoUrls(editingRow.kidId, []);
        nextPhoto = "-";
        nextPhotoCount = 0;
      } else if (editPhotoFile) {
        const uploadedUrls = await uploadKidImages([editPhotoFile]);
        const nextUrl = uploadedUrls[0]?.trim();
        if (!nextUrl) {
          throw new Error("Upload completed but image URL is empty.");
        }
        await patchKidPhotoUrls(editingRow.kidId, [nextUrl]);
        nextPhoto = nextUrl;
        nextPhotoCount = 1;
      } else if (normalizedPhotoUrl && normalizedPhotoUrl !== editingRow.photo) {
        await patchKidPhotoUrls(editingRow.kidId, [normalizedPhotoUrl]);
        nextPhoto = normalizedPhotoUrl;
        nextPhotoCount = 1;
      }

      await bulkUpdateKids({
        updates: [
          {
            kidId: editingRow.kidId,
            room: nextRoom ?? undefined,
            type: nextType ?? undefined,
            color: nextColor ?? undefined,
            size: nextSize ?? undefined,
            material: nextMaterial ?? undefined,
            price: nextPrice ?? undefined
          }
        ]
      });

    const normalizedEan = editDraft.ean.trim() || props.placeholderEan;
    const nextRow: SofortListRow = {
      ...editingRow,
      photo: nextPhoto,
      photoCount: nextPhotoCount,
      ean: normalizedEan,
      room: nextRoom,
      furnitureType: nextType,
      color: nextColor,
      size: nextSize,
      material: nextMaterial,
      price: nextPrice,
      siteEans: {
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
      }
    };
    props.onUpdateRow(nextRow);
    setEditingRow(null);
    } catch (requestError) {
      setEditError(requestError instanceof Error ? requestError.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="wh-sofort-table-shell">
      <ScrollArea className="w-full wh-sofort-table-scroll">
        <Table className="wh-sofort-data-table min-w-[1514px] bg-card">
            <TableHeader>
              <TableRow className="wh-sofort-table-head-row">
                <TableHead className="w-[44px] text-center">
                  <Checkbox checked={props.allVisibleSelected} onCheckedChange={props.onToggleSelectVisible} aria-label="Select visible rows" />
                </TableHead>
                <TableHead className="w-[130px] text-center">IMAGE</TableHead>
                <TableHead className="w-[210px] text-left">
                  <div className="inline-flex items-center gap-2">
                    <span>PRODUCT</span>
                    <button type="button" className="inline-flex items-center gap-1 text-[10px]" onClick={() => props.onToggleSort("place")}>
                      PLACE {sortIcon(props.sortField === "place", props.sortDirection)}
                    </button>
                    <button type="button" className="inline-flex items-center gap-1 text-[10px]" onClick={() => props.onToggleSort("quantity")}>
                      QTY {sortIcon(props.sortField === "quantity", props.sortDirection)}
                    </button>
                  </div>
                </TableHead>
                <TableHead className="w-[230px] text-left">ATTRIBUTES</TableHead>
                <TableHead className="w-[120px] text-left">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => props.onToggleSort("price")}>
                    PRICE
                    {sortIcon(props.sortField === "price", props.sortDirection)}
                  </button>
                </TableHead>
                <TableHead className="w-[180px] text-center">EAN</TableHead>
                <TableHead className="w-[420px] text-center">MARKETPLACE EAN</TableHead>
                <TableHead className="w-[180px] text-center">ACTIONS</TableHead>
                <TableHead className="hidden w-20">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => props.onToggleSort("place")}>
                    {labels.place.toUpperCase()}
                    {sortIcon(props.sortField === "place", props.sortDirection)}
                  </button>
                </TableHead>
                <TableHead className="hidden w-24">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => props.onToggleSort("quantity")}>
                    {labels.quantity.toUpperCase()}
                    {sortIcon(props.sortField === "quantity", props.sortDirection)}
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.rows.map((row) => (
                <TableRow key={row.id} className="wh-sofort-table-row">
                  <TableCell className="text-center">
                    <Checkbox
                      checked={props.selectedRowIds.has(row.id)}
                      onCheckedChange={() => props.onToggleRowSelection(row.id)}
                      aria-label={`Select row ${row.kidNumber}`}
                    />
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    {row.photo !== "-" ? (
                      <button type="button" className="wh-sofort-product-cell__image" onClick={() => setFullscreenPhoto(row.photo)}>
                        <Image src={row.photo} alt={`Kid ${row.kidNumber}`} width={144} height={144} unoptimized className="wh-sofort-photo" />
                      </button>
                    ) : (
                      <div className="wh-sofort-product-cell__image">
                        <div className="wh-sofort-photo-placeholder" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="wh-sofort-product-cell">
                      <div className="wh-sofort-product-cell__content">
                        <p className="wh-sofort-product-cell__title">
                          <span className="wh-sofort-product-cell__title-label">KID</span>
                          <span className="wh-sofort-product-cell__title-value">{row.kidNumber && row.kidNumber !== "-" ? row.kidNumber : "—"}</span>
                        </p>
                        <p className="wh-sofort-product-cell__meta">Place {props.highlightText(row.place, props.query)}</p>
                        <p className="wh-sofort-product-cell__meta">Quantity {props.highlightText(String(row.quantity), props.query)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="wh-sofort-warehouse-cell">
                      <p className="wh-sofort-warehouse-cell__line"><span>Room</span> {props.highlightText(displayNullable(row.room), props.query)}</p>
                      <p className="wh-sofort-warehouse-cell__line"><span>Type</span> {props.highlightText(displayNullable(row.furnitureType), props.query)}</p>
                      <p className="wh-sofort-warehouse-cell__line"><span>Color</span> {props.highlightText(displayNullable(row.color), props.query)}</p>
                      <p className="wh-sofort-warehouse-cell__line"><span>Size</span> {props.highlightText(displayNullable(row.size), props.query)}</p>
                      <p className="wh-sofort-warehouse-cell__line"><span>Material</span> {props.highlightText(displayNullable(row.material), props.query)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle wh-sofort-price-cell">
                    {props.highlightText(
                      row.price !== null
                        ? `${displayNullable(row.price)} ${displayNullable(row.priceCurrency)}`
                        : displayNullable(row.price),
                      props.query
                    )}
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <Link href={`/inventory/kid/${row.kidId}`} className="wh-sofort-kid-link inline-flex flex-col items-start text-primary hover:underline">
                      <span>{props.highlightText(row.ean.trim() && row.ean !== props.placeholderEan ? row.ean : "—", props.query) || "—"}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="align-middle">
                    <SofortListMarketplaceMatrix
                      siteEans={row.siteEans}
                      query={props.query}
                      placeholderEan={props.placeholderEan}
                      highlightText={props.highlightText}
                    />
                  </TableCell>
                  <TableCell className="align-middle">
                    <div className="wh-sofort-row-actions">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(row)}>Edit</Button>
                      <Button type="button" variant="outline" size="sm">Delete</Button>
                    </div>
                  </TableCell>
                  <TableCell className="hidden">{row.place}</TableCell>
                  <TableCell className="hidden">{row.quantity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
        </Table>
      </ScrollArea>
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
      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => { if (!open && !savingEdit) setEditingRow(null); }}>
          <DialogContent
            className="!flex !gap-0 !p-0 !w-[min(860px,calc(100vw-64px))] !max-w-[860px] md:!min-w-[720px] h-auto max-h-[calc(100vh-80px)] flex-col overflow-hidden rounded-2xl"
          >
          <DialogHeader className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-background px-5 py-5 sm:px-6">
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <strong>Editing mode</strong>
                {editingRow ? ` · KID ${editingRow.kidNumber} · Place ${editingRow.place}` : ""}
              </div>
              <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:grid-cols-[140px_1fr]">
                <div className="space-y-2">
                  <div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-2">
                    {editingRow?.photo && editingRow.photo !== "-" ? (
                      <Image src={editingRow.photo} alt={`KID ${editingRow.kidNumber} photo`} width={128} height={96} className="h-full w-full object-contain" unoptimized />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-[#94a3b8]">
                        <ImageIcon size={18} />
                        <span className="text-[10px]">No photo</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-muted-foreground">Current photo</p>
                </div>
                <div className="space-y-3">
                  <label className="block space-y-1 text-xs font-medium">
                    <span className="text-muted-foreground">Photo URL</span>
                    <Input
                      className="h-10 rounded-xl text-sm"
                      value={editPhotoUrl}
                      onChange={(event) => {
                        setEditPhotoUrl(event.target.value);
                        if (removePhoto) setRemovePhoto(false);
                      }}
                      placeholder="https://..."
                    />
                  </label>
                  <div className="rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Upload new photo</p>
                        <p className="text-xs text-muted-foreground">PNG, JPG or WebP</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground hover:bg-muted">
                        <Upload size={14} />
                        <span>Choose file</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => {
                            setEditPhotoFile(event.target.files?.[0] ?? null);
                            if (removePhoto) setRemovePhoto(false);
                          }}
                        />
                      </label>
                    </div>
                    <p className="mt-2 truncate text-[11px] text-muted-foreground">{editPhotoFile ? editPhotoFile.name : "No file selected"}</p>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#fecaca] text-[#b91c1c] hover:bg-[#fef2f2] hover:text-[#991b1b]"
                      onClick={() => {
                        setRemovePhoto((current) => !current);
                        if (!removePhoto) {
                          setEditPhotoFile(null);
                          setEditPhotoUrl("");
                        } else {
                          setEditPhotoUrl(editingRow?.photo && editingRow.photo !== "-" ? editingRow.photo : "");
                        }
                      }}
                    >
                      {removePhoto ? "Undo delete" : "Delete photo"}
                    </Button>
                  </div>
                </div>
              </div>
              <section className="rounded-lg border border-border/70 bg-background/80 p-3 sm:p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">General</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium"><span className="text-muted-foreground">EAN</span><Input value={editDraft.ean} onChange={(event) => setEditDraft((current) => ({ ...current, ean: event.target.value }))} placeholder="Enter EAN" /></label>
            <label className="space-y-1 text-xs font-medium"><span className="text-muted-foreground">Price</span><Input value={editDraft.price} onChange={(event) => setEditDraft((current) => ({ ...current, price: event.target.value }))} placeholder="Enter price" /></label>
            <label className="space-y-1 text-xs font-medium"><span className="text-muted-foreground">Room</span><Input value={editDraft.room} onChange={(event) => setEditDraft((current) => ({ ...current, room: event.target.value }))} placeholder="Enter room" /></label>
            <label className="space-y-1 text-xs font-medium"><span className="text-muted-foreground">Type</span><Input value={editDraft.furnitureType} onChange={(event) => setEditDraft((current) => ({ ...current, furnitureType: event.target.value }))} placeholder="Enter type" /></label>
            <label className="space-y-1 text-xs font-medium"><span className="text-muted-foreground">Color</span><Input value={editDraft.color} onChange={(event) => setEditDraft((current) => ({ ...current, color: event.target.value }))} placeholder="Enter color" /></label>
            <label className="space-y-1 text-xs font-medium"><span className="text-muted-foreground">Size</span><Input value={editDraft.size} onChange={(event) => setEditDraft((current) => ({ ...current, size: event.target.value }))} placeholder="Enter size" /></label>
            <label className="col-span-2 space-y-1 text-xs font-medium"><span className="text-muted-foreground">Material</span><Input value={editDraft.material} onChange={(event) => setEditDraft((current) => ({ ...current, material: event.target.value }))} placeholder="Enter material" /></label>
              </div>
              </section>
              <section className="rounded-lg border border-border/70 bg-background/80 p-3 sm:p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marketplace EAN</p>
              <div className="overflow-x-auto">
                <div className="min-w-[520px] space-y-2">
                <div className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(160px,1fr)] gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Market</span><span>JV</span><span>XL</span>
                </div>
                <div className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(160px,1fr)] items-end gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">SITES</span>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.jv} onChange={(event) => setEditDraft((current) => ({ ...current, jv: event.target.value }))} placeholder="JV EAN" /></label>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.xl} onChange={(event) => setEditDraft((current) => ({ ...current, xl: event.target.value }))} placeholder="XL EAN" /></label>
                </div>
                <div className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(160px,1fr)] items-end gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">OTTO</span>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.ottoJv} onChange={(event) => setEditDraft((current) => ({ ...current, ottoJv: event.target.value }))} placeholder="JV EAN" /></label>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.ottoXl} onChange={(event) => setEditDraft((current) => ({ ...current, ottoXl: event.target.value }))} placeholder="XL EAN" /></label>
                </div>
                <div className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(160px,1fr)] items-end gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">EBAY</span>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.ebayJv} onChange={(event) => setEditDraft((current) => ({ ...current, ebayJv: event.target.value }))} placeholder="JV EAN" /></label>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.ebayXl} onChange={(event) => setEditDraft((current) => ({ ...current, ebayXl: event.target.value }))} placeholder="XL EAN" /></label>
                </div>
                <div className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(160px,1fr)] items-end gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">KAUFLAND</span>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.kauflandJv} onChange={(event) => setEditDraft((current) => ({ ...current, kauflandJv: event.target.value }))} placeholder="JV EAN" /></label>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.kauflandXl} onChange={(event) => setEditDraft((current) => ({ ...current, kauflandXl: event.target.value }))} placeholder="XL EAN" /></label>
                </div>
                <div className="grid grid-cols-[100px_minmax(160px,1fr)_minmax(160px,1fr)] items-end gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">HOOD</span>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.hoodJv} onChange={(event) => setEditDraft((current) => ({ ...current, hoodJv: event.target.value }))} placeholder="JV EAN" /></label>
                  <label className="space-y-1 text-xs font-medium"><Input className="min-w-[150px]" value={editDraft.hoodXl} onChange={(event) => setEditDraft((current) => ({ ...current, hoodXl: event.target.value }))} placeholder="XL EAN" /></label>
                </div>
                </div>
              </div>
              </section>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-30 flex min-h-16 items-center justify-end gap-2.5 border-t border-[#e5e7eb] bg-white px-4 py-3 sm:px-6">
            {editError ? <p className="mr-auto text-sm text-destructive">{editError}</p> : null}
            <Button type="button" variant="ghost" onClick={() => setEditingRow(null)} disabled={savingEdit}>Cancel</Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit}>
              {savingEdit ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
