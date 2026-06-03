import type { ProductDraft } from "./client-api-types";
import { PRODUCT_DRAFTS_KEY } from "./client-api-shared";

export function readProductDraft(intakeId: string): ProductDraft {
  const empty: ProductDraft = {
    title: "",
    ean: "",
    price: "",
    size: "",
    color: ""
  };
  const raw = localStorage.getItem(PRODUCT_DRAFTS_KEY);
  if (!raw) {
    return empty;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, ProductDraft>;
    const draft = parsed[intakeId];
    if (!draft) {
      return empty;
    }
    return {
      title: draft.title ?? "",
      ean: draft.ean ?? "",
      price: draft.price ?? "",
      size: draft.size ?? "",
      color: draft.color ?? ""
    };
  } catch {
    return empty;
  }
}

export function saveProductDraft(intakeId: string, draft: ProductDraft) {
  const raw = localStorage.getItem(PRODUCT_DRAFTS_KEY);
  const parsed = raw ? ((JSON.parse(raw) as Record<string, ProductDraft>) ?? {}) : {};
  parsed[intakeId] = draft;
  localStorage.setItem(PRODUCT_DRAFTS_KEY, JSON.stringify(parsed));
}

