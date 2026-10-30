export function applyHtmlFontSize(document: Document, value: string): void {
  const size = Number(value);
  if (!Number.isInteger(size) || size < 8 || size > 96 || !document.body) return;
  const existingFonts = new Set(document.body.querySelectorAll('font[size="7"]'));
  document.execCommand("fontSize", false, "7");
  document.body.querySelectorAll<HTMLFontElement>('font[size="7"]').forEach(font => {
    if (existingFonts.has(font)) return;
    const span = document.createElement("span");
    span.style.fontSize = `${size}px`;
    span.replaceChildren(...Array.from(font.childNodes));
    font.replaceWith(span);
  });
}
