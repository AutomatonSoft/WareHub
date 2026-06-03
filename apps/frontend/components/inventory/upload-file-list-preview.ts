export type UploadFileListPreview = {
  visibleNames: string[];
  hiddenCount: number;
};

export function buildUploadFileListPreview(fileNames: string[], maxVisible: number): UploadFileListPreview {
  const safeMax = Number.isFinite(maxVisible) && maxVisible > 0 ? Math.floor(maxVisible) : 1;
  const normalized = fileNames.map((name) => name.trim()).filter((name) => name.length > 0);
  if (normalized.length <= safeMax) {
    return { visibleNames: normalized, hiddenCount: 0 };
  }
  return {
    visibleNames: normalized.slice(0, safeMax),
    hiddenCount: normalized.length - safeMax,
  };
}
