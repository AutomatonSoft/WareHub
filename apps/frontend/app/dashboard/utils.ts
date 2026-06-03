import type { AfterbuyOrderData, IntakeDto } from "../client-api";
import { intakeIsActive } from "./intake-status";
import type { IntakeGroup } from "./types";

export function buildIntakeWsUrl(apiBase: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (apiBase.startsWith("http://") || apiBase.startsWith("https://")) {
    const base = new URL(apiBase);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = "/api/v1/intakes/ws";
    base.search = "";
    base.hash = "";
    return base.toString();
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new URL(`${protocol}//${window.location.host}/api/v1/intakes/ws`).toString();
}

export function buildIntakeWsProtocol(token: string): string | null {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }
  return `auth.${normalizedToken}`;
}

export function withBaseHref(html: string, baseHref: string): string {
  const safeBase = baseHref.replace(/"/g, "&quot;");
  if (/<base\s/i.test(html)) {
    return html;
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1><base href="${safeBase}">`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head><base href="${safeBase}"></head>`);
  }
  return `<!doctype html><html><head><base href="${safeBase}"></head><body>${html}</body></html>`;
}

export function buildAfterbuyPreviewDoc(data: AfterbuyOrderData): string {
  const fullHtml = data.page_html?.trim() ?? "";
  const baseHref = data.final_url?.trim() || data.url?.trim() || "https://farm01.afterbuy.de/";
  if (fullHtml.length > 0) {
    return withBaseHref(fullHtml, baseHref);
  }

  const previewText = (data.page_preview?.trim() ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const title = (data.page_title ?? "Afterbuy preview").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const finalUrl = (data.final_url ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; padding: 12px; margin: 0; color: #111827; background: #ffffff; }
    .meta { margin-bottom: 10px; font-size: 13px; color: #374151; }
    pre { white-space: pre-wrap; word-break: break-word; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
  </style>
</head>
<body>
  <div class="meta"><b>HTTP:</b> ${data.http_status} | <b>Final URL:</b> ${finalUrl}</div>
  <pre>${previewText || "No HTML body received from Afterbuy for this response."}</pre>
</body>
</html>`;
}

export function groupIntakes(intakes: IntakeDto[]): IntakeGroup[] {
  const groups = new Map<string, IntakeGroup>();

  for (const item of intakes) {
    const unitKey = (item.internal_index ?? String(item.unit_index ?? 0)).trim();
    const productFingerprint = [
      item.product_title ?? "",
      item.product_sku ?? "",
      item.product_price ?? "",
      item.product_size ?? "",
      item.product_color ?? "",
      item.product_key ?? ""
    ]
      .map((v) => v.trim().toLowerCase())
      .join("|");

    const groupKey = [
      item.order_id ?? "",
      item.kid_number,
      productFingerprint,
      item.is_b_ware ? "bware" : "regular",
      intakeIsActive(item) ? "active" : "removed"
    ].join("|");

    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        key: groupKey,
        representative: item,
        partsTotal: Math.max(1, item.box_total ?? 1),
        partIds: [item.id],
        unitKeys: [unitKey],
        count: 1
      });
      continue;
    }

    existing.partIds.push(item.id);
    existing.partsTotal = Math.max(existing.partsTotal, Math.max(1, item.box_total ?? 1));
    if (!existing.unitKeys.includes(unitKey)) {
      existing.unitKeys.push(unitKey);
    }
    // Prefer distinct internal/unit keys, fallback to rows/parts to avoid undercount on legacy duplicate keys.
    const inferredByRows = Math.ceil(existing.partIds.length / Math.max(1, existing.partsTotal));
    existing.count = Math.max(existing.unitKeys.length, inferredByRows);
    if (new Date(item.created_at).getTime() > new Date(existing.representative.created_at).getTime()) {
      existing.representative = item;
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      new Date(b.representative.created_at).getTime() - new Date(a.representative.created_at).getTime()
  );
}
