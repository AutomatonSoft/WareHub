"use client";

import { Dispatch, FormEvent, SetStateAction } from "react";
import Image from "next/image";
import { useLabels } from "../../../app/use-labels";
import { HoodPatchForm, parseImagesText, prettyJson } from "../hood-search-utils";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { ScrollArea } from "../../ui/scroll-area";
import { Textarea } from "../../ui/textarea";

type HoodProperty = { name: string; value: string };

type Props = {
  patchLoading: boolean;
  patchForm: HoodPatchForm;
  patchPreview: { changedKeys: string[]; filteredPayloadObject: Record<string, unknown> };
  uploadedUrls: string[];
  deletingUrl: string | null;
  patchFiles: File[];
  patchResult: unknown;
  allHoodFields: Record<string, unknown> | null;
  hoodProductProperties: HoodProperty[];
  ean: string;
  activeGalleryIndex: number;
  setActiveGalleryIndex: Dispatch<SetStateAction<number>>;
  onSetPatchField: (field: keyof HoodPatchForm, value: string) => void;
  onSetPatchFiles: (files: File[]) => void;
  onPatch: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onUploadImages: () => Promise<void>;
  onDeleteUploadedUrl: (url: string) => Promise<void>;
};

export function HoodPatchWorkspaceCard(props: Props) {
  const t = useLabels();
  const {
    patchLoading, patchForm, patchPreview, uploadedUrls, deletingUrl, patchFiles, patchResult, allHoodFields, hoodProductProperties, ean, activeGalleryIndex, setActiveGalleryIndex,
    onSetPatchField, onSetPatchFiles, onPatch, onUploadImages, onDeleteUploadedUrl
  } = props;
  const galleryImages = parseImagesText(patchForm.imagesText);

  return (
      <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.patchWorkspace}</CardTitle>
        <div className="text-sm text-muted-foreground">{t.fillFieldsAndPatchHint}</div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(event) => void onPatch(event)}>
          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,65fr)_minmax(320px,35fr)]">
            <main className="order-2 space-y-4 xl:order-1">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-foreground">{t.mainFields}</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input placeholder={t.productTitlePlaceholder} value={patchForm.title} onChange={(event) => onSetPatchField("title", event.target.value)} />
                  <Input placeholder={t.forExamplePrice} value={patchForm.price} onChange={(event) => onSetPatchField("price", event.target.value)} />
                  <Input placeholder={t.forExampleQuantity} value={patchForm.quantity} onChange={(event) => onSetPatchField("quantity", event.target.value)} />
                  <Input placeholder={t.forExampleCategoryId} value={patchForm.categoryID} onChange={(event) => onSetPatchField("categoryID", event.target.value)} />
                  <Input placeholder={t.forExampleCondition} value={patchForm.condition} onChange={(event) => onSetPatchField("condition", event.target.value)} />
                  <Input placeholder={t.forExampleItemMode} value={patchForm.itemMode} onChange={(event) => onSetPatchField("itemMode", event.target.value)} />
                  <Input placeholder={t.forExampleItemNumber} value={patchForm.itemNumber} onChange={(event) => onSetPatchField("itemNumber", event.target.value)} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-foreground">{t.descriptionLabel}</div>
                <Textarea value={patchForm.description} onChange={(event) => onSetPatchField("description", event.target.value)} className="min-h-[180px] bg-muted/30" placeholder={t.productDescriptionHtmlAllowed} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={patchLoading}>{t.patchAction}</Button>
                <Button type="button" variant="secondary" disabled={patchLoading || patchFiles.length === 0} onClick={() => void onUploadImages()}>{t.uploadImagesToFtpAction}</Button>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t.sendingFields}</div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">{patchPreview.changedKeys.length > 0 ? patchPreview.changedKeys.join(", ") : "-"}</div>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t.outgoingPayload}</div>
                <ScrollArea className="max-h-[260px] rounded-xl border border-border/60 bg-muted/30 p-3">
                  <pre className="max-w-full whitespace-pre-wrap break-words text-xs text-muted-foreground">{prettyJson(patchPreview.filteredPayloadObject)}</pre>
                </ScrollArea>
              </div>
              {uploadedUrls.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t.uploadedImageUrls}</div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {uploadedUrls.map((url) => (
                      <li key={url} className="flex flex-wrap items-center gap-2 break-all">
                        <a href={url} target="_blank" rel="noreferrer" className="break-all underline">{url}</a>
                        <Button type="button" variant="secondary" className="h-9 px-3 text-xs" disabled={deletingUrl === url} onClick={() => void onDeleteUploadedUrl(url)}>
                          {deletingUrl === url ? t.deletingShort : t.deleteFromFtp}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {patchResult ? (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t.patchResponse}</div>
                  <ScrollArea className="max-h-[360px] rounded-xl border border-border/60 bg-muted/30 p-3">
                    <pre className="max-w-full whitespace-pre-wrap break-words text-xs text-muted-foreground">{prettyJson(patchResult)}</pre>
                  </ScrollArea>
                </div>
              ) : null}
            </main>
            <aside className="order-1 space-y-4 xl:order-2">
              <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-sm font-semibold text-foreground">{t.gallery}</div>
                {galleryImages.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px]">
                    <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                      <Image src={galleryImages[Math.min(activeGalleryIndex, galleryImages.length - 1)]} alt={t.gallery} width={920} height={560} unoptimized className="h-[260px] w-full object-contain" />
                    </div>
                    <div className="grid max-h-[260px] grid-cols-4 gap-2 overflow-auto lg:grid-cols-1">
                      {galleryImages.map((url, index) => (
                        <button key={`${url}-${index}`} type="button" onClick={() => setActiveGalleryIndex(index)} className={`overflow-hidden rounded-xl border ${index === activeGalleryIndex ? "border-primary" : "border-border"}`}>
                          <Image src={url} alt={t.gallery} width={120} height={80} unoptimized className="h-20 w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Textarea value={patchForm.imagesText} onChange={(event) => onSetPatchField("imagesText", event.target.value)} className="min-h-[120px] bg-muted/30" placeholder={t.oneUrlPerLine} />
                <input type="file" multiple accept="image/*" onChange={(event) => onSetPatchFiles(event.target.files ? Array.from(event.target.files) : [])} className="focus-ring w-full rounded-xl border border-border bg-muted/30 p-3 text-sm text-foreground" />
                {patchFiles.length > 0 ? <div className="break-all text-xs text-muted-foreground">{t.selectedFiles}: {patchFiles.map((file) => file.name).join(", ")}</div> : null}
              </div>
              {allHoodFields ? (
                <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="text-sm font-semibold text-foreground">{t.categoriesProperties}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm"><div className="text-xs text-muted-foreground">{t.itemIdLabel}</div><div className="font-medium text-foreground">{String((allHoodFields as { itemID?: unknown }).itemID ?? "-")}</div></div>
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm"><div className="text-xs text-muted-foreground">{t.ean}</div><div className="font-medium text-foreground">{String((allHoodFields as { ean?: unknown }).ean ?? (ean.trim() || "-"))}</div></div>
                  </div>
                  {hoodProductProperties.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{t.productProperties}</div>
                      <div className="max-h-[280px] overflow-auto rounded-xl border border-border/60 bg-muted/30 p-2">
                        <div className="grid gap-2">
                          {hoodProductProperties.map((prop, index) => (
                            <div key={`${prop.name}-${index}`} className="grid gap-2 rounded-xl border border-border/50 bg-background/70 p-2 md:grid-cols-2">
                              <div className="text-xs"><div className="text-muted-foreground">{t.nameLabel}</div><div className="text-foreground">{prop.name || "-"}</div></div>
                              <div className="text-xs"><div className="text-muted-foreground">{t.valueLabel}</div><div className="text-foreground">{prop.value || "-"}</div></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


