"use client";

import { useLabels } from "../../app/use-labels";

export function HtmlFontStyleControls({ onSaveSelection, onSizeChange, onColorChange }: {
  onSaveSelection: () => void;
  onSizeChange?: (size: string) => void;
  onColorChange: (color: string) => void;
}) {
  const t = useLabels();
  return <>
    {onSizeChange ? <select
      defaultValue=""
      aria-label={t.htmlFontSize}
      title={t.htmlFontSize}
      onMouseDown={onSaveSelection}
      onFocus={onSaveSelection}
      onChange={(event) => { onSizeChange(event.target.value); event.target.value = ""; }}
      className="min-h-8 rounded-[var(--radius-control)] border border-border/70 bg-background px-2 text-xs"
    >
      <option value="" disabled>{t.htmlFontSize}</option>
      {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64].map(size => <option key={size} value={size}>{size} px</option>)}
    </select> : null}
    <label className="inline-flex min-h-8 items-center gap-2 rounded-[var(--radius-control)] border border-border/70 bg-background px-2 text-xs">
      {t.htmlFontColor}
      <input type="color" defaultValue="#000000" aria-label={t.htmlFontColor} title={t.htmlFontColor}
        onMouseDown={onSaveSelection} onFocus={onSaveSelection}
        onChange={(event) => onColorChange(event.currentTarget.value)}
        className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
      />
    </label>
  </>;
}
