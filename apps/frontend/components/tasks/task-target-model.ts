export type TaskTarget = {
  marketplace?: string;
  target?: string;
  status?: string;
  data?: unknown;
  details?: unknown;
  error?: { message?: string; [key: string]: unknown };
};

export type TargetState = "queued" | "running" | "processing" | "submitted" | "success" | "failed" | "unknown" | "skipped";
export type TaskTargetRow = { key: string; label: string; state: TargetState; ean: string; target: TaskTarget };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function taskTargetLabel(target: TaskTarget): string {
  const raw = target.target || target.marketplace || "—";
  const parts = raw.split(",");
  const parameters = Object.fromEntries(parts.slice(1).map(part => part.split("=")));
  const siteKey = parameters.site_key || (/^(JV_|XL)/i.test(raw) && !raw.includes(",") ? raw : "");
  if (siteKey) return siteKey.toUpperCase().replace(/^XLMOEBEL_/, "XL_").replace(/CO_UK$/, "UK").replaceAll("_", " ");
  if (/^(OTTO|HOOD|KAUFLAND|EBAY)[_-](JV|XL|DEP)$/i.test(raw)) {
    return raw.toUpperCase().replace(/[_-]/g, " ").replace(/^KAUFLAND/, "Kaufland").replace(/^EBAY/, "eBay");
  }
  const marketplace = (target.marketplace || parts[0]).toLowerCase();
  const name = marketplace === "kaufland" ? "Kaufland" : marketplace === "ebay" ? "eBay"
    : marketplace === "xljv" ? (parameters.account || parameters.site || "JV/XL").toUpperCase() : marketplace.toUpperCase();
  const account = marketplace === "xljv" ? "" : (parameters.account || parameters.profile || "").toUpperCase();
  return [name, account].filter(Boolean).join(" ");
}

export function buildTaskTargetRows(results: TaskTarget[] = [], targets: string[] = [], taskStatus = ""): TaskTargetRow[] {
  const rows = new Map<string, TaskTarget>();
  for (const target of targets) rows.set(target, { target, marketplace: target.split(",")[0] });
  results.forEach((target, index) => rows.set(target.target || `${target.marketplace || "target"}:${index}`, target));
  return [...rows].map(([key, target]) => {
    const status = (target.status || "").toLowerCase();
    const data = record(target.data ?? target.details);
    const publication = String(data.publication_state || "").toLowerCase();
    let state: TargetState = "unknown";
    if (["failed", "error", "rejected", "cancelled"].includes(status) || publication === "rejected") state = "failed";
    else if (["skipped", "no_changes"].includes(status)) state = "skipped";
    else if (publication === "pending") state = "submitted";
    else if (["success", "ok", "applied", "completed"].includes(status)) state = "success";
    else if (["running", "applying"].includes(status)) state = "running";
    else if (["queued", "pending"].includes(status || taskStatus)) state = "queued";
    else if (!status && taskStatus === "running") state = "processing";
    const mappingResult = record(data.marketplace_ean_mapping);
    const mapping = record(record(mappingResult.mapping).mapping);
    const ean = mapping.ean ?? data.ean;
    return { key, label: taskTargetLabel(target), state, ean: typeof ean === "string" ? ean : "", target };
  });
}

export function taskOperationName(operation: string, language: string): string {
  const labels: Record<string, string[]> = {
    publish: ["Create product", "Создание товара", "Artikel erstellen"],
    update: ["Update product", "Обновление товара", "Artikel aktualisieren"],
    fetch: ["Load product", "Загрузка данных товара", "Artikeldaten laden"],
    unpublish: ["Deactivate product", "Деактивация товара", "Artikel deaktivieren"],
    relist: ["Activate product", "Активация товара", "Artikel aktivieren"],
  };
  const normalized = operation === "jv_create" ? "publish" : operation.startsWith("product_editor_") ? "update"
    : operation === "marketplace_activate" ? "relist" : operation === "marketplace_deactivate" ? "unpublish" : operation;
  return labels[normalized]?.[language === "ru" ? 1 : language === "de" ? 2 : 0] || operation;
}

export function targetStateLabel(state: TargetState, language: string, operation: string): string {
  const labels: Record<TargetState, string[]> = {
    queued: ["Queued", "В очереди", "In Warteschlange"],
    running: ["Sending", "Отправляется", "Wird gesendet"],
    processing: ["Awaiting result", "Ожидает результата", "Ergebnis ausstehend"],
    submitted: ["Submitted for validation", "Отправлено на проверку", "Zur Prüfung gesendet"],
    success: ["Request completed", "Запрос выполнен", "Anfrage abgeschlossen"],
    failed: ["Error", "Ошибка", "Fehler"],
    unknown: ["Result unavailable", "Результат неизвестен", "Ergebnis unbekannt"],
    skipped: ["Skipped", "Пропущено", "Übersprungen"],
  };
  const values = state === "success" && ["publish", "jv_create"].includes(operation)
    ? ["Sent", "Отправлено", "Gesendet"] : labels[state];
  return values[language === "ru" ? 1 : language === "de" ? 2 : 0];
}
