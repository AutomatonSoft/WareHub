"use client";

import { ImagePlus, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { useLabels } from "../../app/use-labels";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import { uploadProductImages } from "./product-image-api";

export function ProductImagePanel() {
  const t = useLabels();
  const [uploading, setUploading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [mainImageUrl, setMainImageUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0 || uploading) {
      return;
    }
    setUploading(true);
    setUploadStatus("");
    try {
      const urls = await uploadProductImages(Array.from(files));
      setUploadedUrls((current) => {
        const seen = new Set(current);
        const merged = [...current];
        for (const url of urls) {
          if (!seen.has(url)) {
            seen.add(url);
            merged.push(url);
          }
        }
        if (!mainImageUrl && merged.length > 0) {
          setMainImageUrl(merged[0]);
        }
        return merged;
      });
      setUploadStatus(`${t.uploaded} ${urls.length} ${t.imagesToFtp}`);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : t.failedUploadImageFiles);
    } finally {
      setUploading(false);
    }
  }

  function moveImageUp(index: number) {
    if (index <= 0) return;
    setUploadedUrls((current) => {
      const next = [...current];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  return (
    <Card className="h-full p-6">
      <h3 className="page-title text-lg">{t.imageManagement}</h3>
      <div className="mt-4 rounded-xl border border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.1)] p-4">
        <div className="mb-4 h-[280px] rounded-xl border border-[color:var(--outline)] bg-[linear-gradient(152deg,rgba(129,135,255,0.28),rgba(129,135,255,0.08))]" />
        <div className="grid grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 rounded-xl border border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.16)]" />
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.07)] p-5 text-center">
        <UploadCloud size={20} className="mx-auto text-[color:var(--primary)]" />
        <p className="mt-2 text-sm text-[color:var(--text-secondary)]">{t.dragDropImagesHint}</p>
        <Button
          variant="secondary"
          className="mt-3"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={14} className="mr-1" />
          {uploading ? t.uploading : t.addFiles}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(event) => void handleUploadFiles(event.target.files)}
        />
        {uploadStatus ? <p className="mt-3 text-xs text-[color:var(--text-secondary)]">{uploadStatus}</p> : null}
      </div>

      {uploadedUrls.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[color:var(--outline)] p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.uploadedImageUrls}</div>
          <div className="space-y-2 text-xs">
            {uploadedUrls.map((url, index) => (
              <div key={url} className="rounded border border-[color:var(--outline)] p-2">
                <a href={url} target="_blank" rel="noreferrer" className="block truncate text-[color:var(--primary)] hover:underline">
                  {url}
                </a>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 px-2 text-xs"
                    onClick={() => setMainImageUrl(url)}
                  >
                    {mainImageUrl === url ? "Main image" : "Set main"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 px-2 text-xs"
                    disabled={index === 0}
                    onClick={() => moveImageUp(index)}
                  >
                    Move up
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

