const aliases = {
  name: "title", productName: "title", productLine: "title", product_line: "title",
  artikelnr: "ean", article_number: "ean", itemNumber: "sku",
  selling_price: "price", amount: "quantity", stock: "quantity",
  deliveryTime: "delivery", handling_time: "delivery", lieferzeitid: "delivery",
  manufacturer_id: "delivery", shippingProfileId: "shipping_profile",
  category_id: "category", categoryId: "category", categoryID: "category", categories: "category",
  category_aspects: "aspects", imageUrls: "images", picture: "images", image: "images",
  category_name: "category", category: "category", categoryName: "category",
  fulfillmentPolicyId: "fulfillment_policy_id", paymentPolicyId: "payment_policy_id", returnPolicyId: "return_policy_id",
  aspectsText: "aspects", regulatoryText: "regulatory", productDescription: "description",
  picture_urls: "images", image_urls: "images", package_weight_and_size: "package", packageWeightAndSizeText: "package",
  merchantLocationKey: "merchant_location", productEan: "ean", secondaryCategoryId: "secondary_category",
  shortDescription: "short_description", metaTitle: "meta_title", metaDescription: "meta_description", metaKeyword: "meta_keyword",
};
const fields = new Set(["title", "ean", "sku", "price", "quantity", "delivery", "category", "description",
  "size", "color", "colour", "material", "height", "width", "length", "depth", "images", "aspects",
  "shipping_profile", "fulfillment_policy_id", "payment_policy_id", "return_policy_id", "package", "regulatory", "productReference",
  "subtitle", "condition", "brand", "mpn", "units", "merchant_location", "secondary_category", "short_description", "tag", "meta_title", "meta_description", "meta_keyword"]);
const copy = {
  en: { required: "Fill in this required field.", number: "Enter a valid number.", validation: "Check the fields listed below.",
    connection: "The marketplace is unavailable or returned a server error. Your draft has not been reset. Try again later.",
    auth: "Your session or marketplace authorization has expired. Sign in again or reconnect the account.",
    forbidden: "You do not have permission for this action. Contact an administrator.",
    limit: "The marketplace request limit has been reached. Try again later.",
    unknown: "The request failed. The API did not identify an invalid field. Keep your draft and contact support.",
    missing: "Complete the required category attribute", description: "Description must contain 1–4000 characters.",
    image: "An image does not meet eBay's minimum size: 500 pixels on its longest side." },
  ru: { required: "Заполните обязательное поле.", number: "Введите корректное число.", validation: "Исправьте поля из списка ниже.",
    connection: "Маркетплейс недоступен или вернул серверную ошибку. Черновик не сброшен. Повторите попытку позже.",
    auth: "Сессия или авторизация маркетплейса истекла. Войдите снова или подключите аккаунт заново.",
    forbidden: "Недостаточно прав для этого действия. Обратитесь к администратору.",
    limit: "Достигнут лимит запросов маркетплейса. Повторите попытку позже.",
    unknown: "Запрос завершился ошибкой. API не указал неверное поле. Сохраните черновик и обратитесь в поддержку.",
    missing: "Заполните обязательный атрибут категории", description: "Описание должно содержать от 1 до 4000 символов.",
    image: "Изображение не соответствует требованию eBay: минимум 500 пикселей по длинной стороне." },
  de: { required: "Füllen Sie dieses Pflichtfeld aus.", number: "Geben Sie eine gültige Zahl ein.", validation: "Korrigieren Sie die unten aufgeführten Felder.",
    connection: "Der Marktplatz ist nicht verfügbar oder meldet einen Serverfehler. Ihr Entwurf bleibt erhalten. Versuchen Sie es später erneut.",
    auth: "Die Sitzung oder Marktplatz-Autorisierung ist abgelaufen. Melden Sie sich erneut an oder verbinden Sie das Konto.",
    forbidden: "Sie haben keine Berechtigung. Wenden Sie sich an einen Administrator.",
    limit: "Das Anfrage-Limit wurde erreicht. Versuchen Sie es später erneut.",
    unknown: "Die Anfrage ist fehlgeschlagen. Die API hat kein ungültiges Feld angegeben. Behalten Sie den Entwurf und kontaktieren Sie den Support.",
    missing: "Ergänzen Sie das erforderliche Kategorie-Merkmal", description: "Die Beschreibung muss 1–4000 Zeichen enthalten.",
    image: "Ein Bild erfüllt die eBay-Mindestgröße nicht: 500 Pixel auf der längsten Seite." },
};

export function marketplaceFieldKey(path) {
  const parts = String(path ?? "").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  const aspectIndex = parts.findIndex((part) => ["aspects", "category_aspects"].includes(part));
  if (aspectIndex >= 0) return ["aspects", ...parts.slice(aspectIndex + 1).filter((part) => !/^\d+$/.test(part))].join(".");
  for (const part of parts.reverse()) {
    const field = aliases[part] ?? part;
    if (fields.has(field)) return field === "colour" ? "color" : field;
  }
  return "";
}

export function marketplaceFieldLabel(field, language = "en") {
  const labels = {
    ru: { title: "Название", price: "Цена", quantity: "Количество", delivery: "Доставка", category: "Категория", description: "Описание", images: "Изображения", height: "Высота", width: "Ширина", length: "Длина", depth: "Глубина", size: "Размер", color: "Цвет", material: "Материал", shipping_profile: "Профиль доставки", fulfillment_policy_id: "Условия доставки", payment_policy_id: "Условия оплаты", return_policy_id: "Условия возврата", package: "Упаковка", regulatory: "Безопасность товара", aspects: "Атрибуты категории" },
    de: { title: "Titel", price: "Preis", quantity: "Menge", delivery: "Lieferzeit", category: "Kategorie", description: "Beschreibung", images: "Bilder", height: "Höhe", width: "Breite", length: "Länge", depth: "Tiefe", size: "Größe", color: "Farbe", material: "Material", shipping_profile: "Versandprofil", fulfillment_policy_id: "Versandbedingungen", payment_policy_id: "Zahlungsbedingungen", return_policy_id: "Rücknahmebedingungen", package: "Verpackung", regulatory: "Produktsicherheit", aspects: "Kategorie-Merkmale" },
  };
  if (field.startsWith("aspects.")) return field.slice("aspects.".length);
  if (field === "ean") return "EAN";
  if (field === "sku") return "SKU / Artikel-Nr.";
  return labels[language]?.[field] ?? field.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function describeMarketplaceError(error, language = "en", fallback = "") {
  const labels = copy[language] ?? copy.en;
  const issues = [];
  let status = Number(error?.status ?? error?.status_code ?? 0) || 0;
  let requestId = "";
  const add = (message, path = "", code = "", target = "") => {
    if (typeof message !== "string" || !message.trim() || issues.length >= 50) return;
    let text = message.trim().slice(0, 600);
    if (/valid (number|integer)|number parsing|decimal parsing|integer parsing/i.test(text)) text = labels.number;
    else if (/required|may not be blank|must not be empty|field missing/i.test(text)) text = labels.required;
    if (String(code) === "25718" && /description|beschreibung|4000/i.test(message)) { path = "description"; text = labels.description; }
    if (String(code) === "25002" && /image|picture|bild/i.test(message) && /500|pixel/i.test(message)) { path = "images"; text = labels.image; }
    const field = marketplaceFieldKey(path);
    if (!issues.some((issue) => issue.field === field && issue.message === text && issue.target === target)) {
      issues.push({ field, message: text, code: String(code || ""), target });
    }
  };
  const visit = (value, depth = 0, target = "", fieldErrors = false) => {
    if (!value || typeof value !== "object" || depth > 8 || issues.length >= 50) return;
    if (Array.isArray(value)) { value.slice(0, 50).forEach((item) => typeof item === "string" ? add(item, "", "", target) : visit(item, depth + 1, target)); return; }
    if (value.status === "success") return;
    target = typeof value.target === "string" ? value.target : typeof value.target_id === "string" ? value.target_id : target;
    requestId ||= typeof value.request_id === "string" ? value.request_id : "";
    status ||= Number(value.status_code ?? value.upstream_status_code ?? 0);
    const path = Array.isArray(value.loc) ? value.loc.join(".") : value.field ?? value.path ?? "";
    const message = value.msg ?? value.message ?? (typeof value.detail === "string" ? value.detail : "");
    const before = issues.length;
    for (const name of Array.isArray(value.missing_aspects) ? value.missing_aspects : []) add(`${labels.missing}: ${name}`, `aspects.${name}`, value.code, target);
    for (const key of ["error", "errors", "details", "upstream_response", "result", "results", "targets", "field_errors", "validation_errors", "detail"]) {
      visit(value[key], depth + 1, target, key === "field_errors" || key === "errors");
    }
    if (typeof value.body === "string") {
      try { visit(JSON.parse(value.body), depth + 1, target); } catch {}
    }
    for (const [key, messages] of Object.entries(value)) {
      if (!marketplaceFieldKey(key)) continue;
      if (Array.isArray(messages) && messages.every((item) => typeof item === "string")) {
        messages.forEach((item) => add(item, key, value.code, target));
      } else if (fieldErrors && typeof messages === "string") {
        add(messages, key, value.code, target);
      }
    }
    if (message && issues.length === before) {
      if (typeof message === "string" && /^[\[{]/.test(message.trim())) {
        try { visit(JSON.parse(message), depth + 1, target); } catch {}
      }
      if (issues.length === before) add(message, path, value.code ?? value.errorId, target);
    }
  };
  visit(error?.payload ?? error);
  if (!issues.length) {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const reason = status === 401 ? labels.auth : status === 403 ? labels.forbidden : status === 429 ? labels.limit
      : status >= 500 || /failed to fetch|networkerror|transport_error|timeout/i.test(message) ? labels.connection
        : message && !/^[\w]+(?:_\w+)+$|HTTP \d+|orchestrator.*returned|request failed/i.test(message) ? message : fallback || labels.unknown;
    add(reason);
  }
  if (issues.every((issue) => !issue.field) && status >= 500 && issues.some((issue) => /returned.*error|returned.*non-success|transport_error|HTTP \d+/i.test(issue.message))) {
    issues.splice(0, issues.length, { field: "", message: labels.connection, code: "", target: "" });
  }
  if (issues.every((issue) => !issue.field)) {
    const reason = status === 401 ? labels.auth : status === 403 ? labels.forbidden : status === 429 ? labels.limit : "";
    if (reason) issues.splice(0, issues.length, { field: "", message: reason, code: "", target: "" });
    else for (const issue of issues) if (/^[\w]+(?:_\w+)+$|HTTP \d+|returned.*non-success/i.test(issue.message)) issue.message = labels.unknown;
  }
  return { message: issues.map((issue) => [issue.target, marketplaceFieldLabel(issue.field, language), issue.message].filter(Boolean).join(": ")).join("; "), issues, requestId, status };
}
