"use client";

import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Site, XLJVCreateFormState } from "./xljv-search-utils";

type XLJVCreateImagesProps = {
  site: Site;
  createForm: XLJVCreateFormState;
  createImageUploadLoading: boolean;
  labels: {
    uploadImageToFtp: string;
    uploadXlImage: string;
    uploading: string;
    uploadedUrlsAutoAdded: string;
    uploadedImagePaths: string;
    mainImagePath: string;
    additionalImagePathsJson: string;
    willAppearAfterUpload: string;
  };
  onCreateImageUpload: (files: FileList | null) => Promise<void>;
};

export function XLJVCreateImages(props: XLJVCreateImagesProps) {
  return (
    <>
      <div className="md:col-span-2 rounded-xl border border-border bg-card px-3 py-2">
        <div className="mb-2 text-xs font-semibold">{props.site === "JV" ? props.labels.uploadImageToFtp : props.labels.uploadXlImage}</div>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void props.onCreateImageUpload(event.target.files)}
          disabled={props.createImageUploadLoading}
          className="w-full text-xs"
        />
        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
          {props.createImageUploadLoading ? props.labels.uploading : props.labels.uploadedUrlsAutoAdded}
        </div>
      </div>
      <div className="md:col-span-2 rounded-xl border border-border bg-muted/30 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
          {props.labels.uploadedImagePaths}
        </div>
        <div className="mb-1 text-xs font-semibold">{props.labels.mainImagePath}</div>
        <Input value={props.createForm.image || ""} readOnly placeholder={props.labels.willAppearAfterUpload} />
        <div className="mb-1 mt-2 text-xs font-semibold">{props.labels.additionalImagePathsJson}</div>
        <Textarea className="min-h-[90px] text-xs" value={props.createForm.images_json || "[]"} readOnly />
      </div>
    </>
  );
}
