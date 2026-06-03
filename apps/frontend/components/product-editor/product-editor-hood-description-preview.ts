export function makeHoodDescriptionPreviewEditableDocument(html: string): string {
  const source = String(html || "").trim();
  if (!source) return "";

  if (/<body\b[^>]*>/i.test(source)) {
    return source.replace(
      /<body\b([^>]*)>/i,
      (_match, attributes: string) => `<body${attributes} contenteditable="true" data-hood-preview-editable="true">`
    );
  }

  return `<!doctype html><html lang="de"><head><meta charset="utf-8" /></head><body contenteditable="true" data-hood-preview-editable="true">${source}</body></html>`;
}

export function readHoodDescriptionPreviewDocumentHtml(documentElement: Element | null): string {
  return documentElement?.outerHTML ?? "";
}
