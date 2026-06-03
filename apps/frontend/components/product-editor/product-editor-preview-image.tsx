"use client";

import { useState } from "react";

const failedBlobPreviewSources = new Set<string>();

export function ProductEditorPreviewImage({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const normalizedSrc = normalizePreviewSrc(src);
  const isBlobSrc = normalizedSrc.startsWith("blob:");
  const isKnownFailed = isBlobSrc ? failedBlobPreviewSources.has(normalizedSrc) : false;

  if (failed || isKnownFailed || !normalizedSrc) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted px-2 text-center text-[11px] text-muted-foreground">
        Image not available (404)
      </div>
    );
  }

  return (
    // We intentionally use native img here to avoid noisy Next/Image dev warnings for transient blob URLs.
    <img
      src={normalizedSrc}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        if (isBlobSrc) {
          failedBlobPreviewSources.add(normalizedSrc);
        }
        setFailed(true);
      }}
    />
  );
}

function normalizePreviewSrc(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  if (raw.startsWith("blob:")) return raw;
  if (raw.startsWith("cosmoshop/")) return `https://jvmoebel.de/${raw}`;
  if (raw.startsWith("/cosmoshop/")) return `https://jvmoebel.de${raw}`;
  if (raw.startsWith("/")) return raw;
  // Prevent route-relative requests like /product-editor/cosmoshop/... that cause false 404.
  return `/${raw}`;
}
