"use client";

import { useMemo, useState } from "react";

import { X } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { FormField } from "../ui/form-field";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/cn";
import { useLabels } from "../../app/use-labels";
import { containsTechnicalDescriptionHtml, formatFileSize, getGalleryMainImage, sanitizeDescriptionPreviewHtml } from "./product-editor-model";
import type { ProductEditorPendingUpload } from "./product-editor-types";
import { ProductEditorPreviewImage } from "./product-editor-preview-image";
import { ProductEditorSection } from "./product-editor-shared-panels";

export function ProductEditorDescriptionEditor({
  value,
  onChange,
  title = "Description",
  subtitle = "Bounded preview and source editing for marketplace HTML."
}: {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const t = useLabels();
  const [mode, setMode] = useState<"clean" | "html" | "full">("clean");
  const hasTechnicalHtml = containsTechnicalDescriptionHtml(value);
  const previewHtml = useMemo(() => sanitizeDescriptionPreviewHtml(value), [value]);
  const fullPreviewHtml = useMemo(() => value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ""), [value]);

  return (
    <ProductEditorSection title={title} subtitle={subtitle}>
      {hasTechnicalHtml ? (
        <p className="rounded-xl border border-amber-200 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-200">
          {t.productEditorDescriptionTechnicalHtml}
        </p>
      ) : null}
      <Tabs value={mode} onValueChange={(value) => setMode(value as "clean" | "html" | "full")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="clean">{t.productEditorDescriptionCleanPreview}</TabsTrigger>
          <TabsTrigger value="html">{t.productEditorDescriptionSourceHtml}</TabsTrigger>
          <TabsTrigger value="full">{t.productEditorDescriptionFullPreview}</TabsTrigger>
        </TabsList>
        <TabsContent value="clean" className="mt-3">
          <ScrollArea className="h-[360px] rounded-xl border border-border bg-background">
            <div className="p-3 text-sm text-foreground">
              {previewHtml ? (
                <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_th]:border [&_th]:border-border [&_th]:p-1.5" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <p className="text-xs text-muted-foreground">{t.productEditorNoDescriptionContent}</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="html" className="mt-3">
          <FormField label={t.productEditorHtmlSourceLabel}>
            <Textarea
              rows={11}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={t.productEditorDescriptionPlaceholder}
              className="font-mono text-xs"
            />
          </FormField>
        </TabsContent>
        <TabsContent value="full" className="mt-3">
          <ScrollArea className="h-[420px] rounded-xl border border-border bg-background">
            <iframe title="description-full-template-preview" sandbox="" srcDoc={fullPreviewHtml} className="h-[420px] w-full bg-background" />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </ProductEditorSection>
  );
}

export function ProductEditorGalleryPanel({
  images,
  removedImagesCount = 0,
  selectedImage,
  onSelectImage,
  onSetMainImage,
  onRemoveImage,
  pendingUploads = [],
  onAddPendingFiles,
  onRemovePendingUpload,
  onUploadMainFiles,
  onUploadAdditionalFiles,
  uploadLoading = false,
  hideHeader = false
}: {
  images: string[];
  removedImagesCount?: number;
  selectedImage?: string | null;
  onSelectImage?: (imageUrl: string) => void;
  onSetMainImage?: (imageUrl: string) => void;
  onRemoveImage?: (imageUrl: string) => void;
  pendingUploads?: ProductEditorPendingUpload[];
  onAddPendingFiles?: (files: FileList | null) => void;
  onRemovePendingUpload?: (uploadId: string) => void;
  onUploadMainFiles?: (files: FileList | null) => void;
  onUploadAdditionalFiles?: (files: FileList | null) => void;
  uploadLoading?: boolean;
  hideHeader?: boolean;
}) {
  const t = useLabels();
  const mainImage = getGalleryMainImage(images, selectedImage);
  const thumbnails = dedupeGalleryImages(images).slice(0, 10);

  return (
    <Card className="rounded-xl border-border bg-card shadow-sm">
      {!hideHeader ? (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t.productEditorGallerySectionTitle}</CardTitle>
          <CardDescription>{`Images: ${images.length}${removedImagesCount > 0 ? ` | Removed: ${removedImagesCount}` : ""}`}</CardDescription>
        </CardHeader>
      ) : null}
      <CardContent className="space-y-3">
        {mainImage ? (
          <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
            <div className="aspect-[4/3]">
              <div className="relative h-full w-full">
                <ProductEditorPreviewImage src={mainImage} className="object-cover" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-3 text-center text-xs text-muted-foreground">
            {t.productEditorNoProductImagesLoaded}
          </div>
        )}

        {thumbnails.length > 0 ? (
          <div className="grid grid-cols-5 gap-1.5">
            {thumbnails.map((imageUrl, index) => (
              <div key={`${imageUrl}-${index}`} className="relative">
                <button
                  type="button"
                  onClick={() => onSelectImage?.(imageUrl)}
                  className={cn("w-full overflow-hidden rounded-xl border border-border bg-muted transition hover:border-primary/50", imageUrl === mainImage ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : "")}
                >
                  <div className="relative h-12 w-full">
                    <ProductEditorPreviewImage src={imageUrl} className="object-cover" />
                  </div>
                </button>
                {onSetMainImage && imageUrl !== images[0] ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSetMainImage(imageUrl);
                    }}
                    className="absolute bottom-1 left-1 h-6 px-1.5 text-[10px]"
                  >
                    {t.main}
                  </Button>
                ) : null}
                {onRemoveImage ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveImage(imageUrl);
                    }}
                    className="absolute right-1 top-1"
                    aria-label={t.productEditorRemoveImageTitle}
                  >
                    <X size={10} />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">{t.productEditorRemovedImagesStayOnFtp}</p>

        {onUploadMainFiles || onUploadAdditionalFiles ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {onUploadMainFiles ? (
              <label className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground">
                <span>{uploadLoading ? t.productEditorUploadingMainImage : t.productEditorUploadMainImage}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploadLoading}
                  onChange={(event) => {
                    onUploadMainFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : null}
            {onUploadAdditionalFiles ? (
              <label className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground">
                <span>{uploadLoading ? t.productEditorUploadingAdditionalImages : t.productEditorAddAdditionalImages}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={uploadLoading}
                  onChange={(event) => {
                    onUploadAdditionalFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {onAddPendingFiles ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.productEditorPendingUploadsTitle}</div>
            <label className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-border bg-background px-2 py-2 text-xs text-foreground">
              <span>{t.productEditorSelectFilesLocalOnly}</span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  onAddPendingFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {pendingUploads.length > 0 ? (
              <div className="mt-2 space-y-1">
                {pendingUploads.map((upload) => (
                  <PendingUploadRow key={upload.id} upload={upload} onRemove={() => onRemovePendingUpload?.(upload.id)} canRemove={Boolean(onRemovePendingUpload)} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function dedupeGalleryImages(images: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of images) {
    const key = normalizeGalleryImageKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(raw);
  }
  return result;
}

function normalizeGalleryImageKey(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("cosmoshop/")) return `https://jvmoebel.de/${raw}`.toLowerCase();
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw.toLowerCase();
  if (raw.startsWith("/")) return raw.toLowerCase();
  return `/${raw}`.toLowerCase();
}

export function ProductEditorAttributesEditor({
  title = "Artikelmerkmale",
  subtitle,
  attributes,
  onChange,
  emptyText = "No Artikelmerkmale loaded.",
  readOnly = false
}: {
  title?: string;
  subtitle?: string;
  attributes: Array<{ key: string; label: string; value: string }>;
  onChange: (attributes: Array<{ key: string; label: string; value: string }>) => void;
  emptyText?: string;
  readOnly?: boolean;
}) {
  const t = useLabels();
  return (
    <ProductEditorSection title={title} subtitle={subtitle}>
      {attributes.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted px-2.5 py-2 text-xs text-muted-foreground">{emptyText === "No Artikelmerkmale loaded." ? t.productEditorNoArtikelmerkmaleLoaded : emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {attributes.map((row, index) => (
            <FormField key={`${row.key}-${index}`} label={row.label}>
              <Input
                value={row.value}
                readOnly={readOnly}
                onChange={(event) => {
                  if (readOnly) {
                    return;
                  }
                  const next = attributes.map((current, currentIndex) =>
                    currentIndex === index ? { ...current, value: event.target.value } : current
                  );
                  onChange(next);
                }}
                placeholder={row.key}
              />
            </FormField>
          ))}
        </div>
      )}
    </ProductEditorSection>
  );
}

function PendingUploadRow({
  upload,
  onRemove,
  canRemove
}: {
  upload: ProductEditorPendingUpload;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const t = useLabels();
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-2 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-foreground">{upload.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {formatFileSize(upload.size)}
          {upload.type ? ` | ${upload.type}` : ""}
        </div>
      </div>
      {canRemove ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onRemove}>
          {t.productEditorRemoveAction}
        </Button>
      ) : null}
    </div>
  );
}
