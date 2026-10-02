"use client";

import { useLabels } from "../../app/use-labels";
import { excludedEbayImages } from "./image-validation-warnings-model";

export function EbayImageValidationWarnings({ payload }: { payload: unknown }) {
  const t = useLabels();
  const images = excludedEbayImages(payload);
  if (!images.length) return null;
  return (
    <section role="status" className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
      <h3 className="font-semibold">{t.ebayExcludedImagesTitle} ({images.length})</h3>
      <p className="text-muted-foreground">{t.ebayExcludedImagesHint}</p>
      <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto">
        {images.map((image) => (
          <li key={`${image.target}:${image.url}:${image.reason}`} className="break-all">
            <span className="font-medium">{image.target}: </span>
            {image.reason === "duplicate" ? t.ebayExcludedImageDuplicate : t.ebayExcludedImageTooSmall}
            {image.width !== undefined && image.height !== undefined ? ` (${image.width} × ${image.height} px)` : ""}
            <div className="text-xs text-muted-foreground">{image.url}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
