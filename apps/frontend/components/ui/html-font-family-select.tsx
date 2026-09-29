"use client";

const FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Courier New",
] as const;

export function HtmlFontFamilySelect({
  onSelect,
  onMouseDown,
}: {
  onSelect: (fontFamily: string) => void;
  onMouseDown?: () => void;
}) {
  return (
    <select
      defaultValue=""
      aria-label="Font family"
      title="Font family"
      onMouseDown={onMouseDown}
      onChange={(event) => {
        onSelect(event.target.value);
        event.target.value = "";
      }}
      className="min-h-8 rounded-[var(--radius-control)] border border-border/70 bg-background px-2 text-xs"
    >
      <option value="" disabled>Font</option>
      {FONT_FAMILIES.map((fontFamily) => (
        <option key={fontFamily} value={fontFamily} style={{ fontFamily }}>{fontFamily}</option>
      ))}
    </select>
  );
}
