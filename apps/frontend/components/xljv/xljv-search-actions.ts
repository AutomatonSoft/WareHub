import {
  SITE_KEY_OPTIONS,
  Site,
  SiteLanguageMapPreview,
  XLJVCreateFormState,
  XLJVResponse
} from "./xljv-search-utils";
import {
  xljvBatchApplyByEan,
  xljvCreateAndPush,
  xljvGetSitesByEan,
  xljvSyncByEan,
  xljvUpdateByEan,
  xljvUploadImages
} from "./xljv-api";

type Setter<T> = (value: T) => void;
const SEND_ALL_SITES_CONCURRENCY = 4;
type ActionLabels = Record<string, string>;

function parseJsonArray(raw: string, labels: ActionLabels, label?: string): unknown[] {
  const text = (raw || "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (label && !Array.isArray(parsed)) {
    throw new Error(labels.xljvFieldMustBeJsonArray.replace("{field}", label));
  }
  return Array.isArray(parsed) ? parsed : [];
}

function buildTranslationSource(createForm: XLJVCreateFormState): Record<string, string> {
  return {
    name: createForm.name,
    description: createForm.description,
    tag: createForm.tag,
    meta_title: createForm.meta_title,
    meta_description: createForm.meta_description,
    meta_keyword: createForm.meta_keyword
  };
}

function buildJvLocaleBySiteKey(siteKey: string): Record<string, string> | undefined {
  const normalized = String(siteKey || "").trim().toUpperCase();
  if (!normalized) return undefined;
  return {
    [normalized]: normalized === "JV_CO_UK" ? "en" : "de"
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })
  );

  return results;
}

function parseMaybeJsonRecord(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function sendCreatedProductToAllSites(args: {
  createForm: XLJVCreateFormState;
  site: Site;
  createImageFiles: File[];
  translateTexts: boolean;
  autoDetectSourceLanguage: boolean;
  convertCurrency: boolean;
  setCreateAllSitesLoading: Setter<boolean>;
  setError: Setter<string | null>;
  setSyncStatus: Setter<string | null>;
  setSyncLog: Setter<Record<string, unknown> | null>;
  labels: ActionLabels;
}) {
  const { createForm, site, createImageFiles, translateTexts, autoDetectSourceLanguage, convertCurrency, setCreateAllSitesLoading, setError, setSyncStatus, setSyncLog, labels } = args;
  setCreateAllSitesLoading(true);
  setError(null);
  setSyncStatus(null);

  const targets: Array<{ site: Site; site_key: string }> = SITE_KEY_OPTIONS[site]
    .filter((o) => o.value && o.value !== "ALL_SITES")
    .map((o) => ({ site, site_key: o.value }));

  const baseCategories = parseJsonArray(createForm.categories_json, labels);
  const baseStores = parseJsonArray(createForm.stores_json, labels);
  const baseExtraImages = parseJsonArray(createForm.images_json, labels);
  const baseSpecials = parseJsonArray(createForm.specials_json, labels);
  const baseExtraDescriptions = parseJsonArray(createForm.descriptions_json, labels);

  let existingSiteKeys = new Set<string>();
  let discovery: Record<string, unknown> | null = null;
  if (createForm.ean.trim()) {
    try {
      const { response, payload } = await xljvGetSitesByEan({ ean: createForm.ean.trim(), site });
      if (response.ok) {
        existingSiteKeys = new Set((payload.found ?? []).map((row) => String(row.site_key || "").trim()).filter(Boolean));
        discovery = { ok: true, found_count: payload.found_count, missing_count: payload.missing_count };
      } else {
        discovery = { ok: false, status: response.status, detail: payload.detail || "sites-by-ean failed" };
      }
    } catch (err) {
      discovery = { ok: false, error: err instanceof Error ? err.message : String(err || "sites-by-ean failed") };
    }
  }

  const summary = await mapWithConcurrency(targets, SEND_ALL_SITES_CONCURRENCY, async (target) => {
    try {
      let uploadedUrls: string[] = [];
      if (createImageFiles.length > 0) {
        const { response: uploadResp, payload: uploadData } = await xljvUploadImages({
          site: target.site,
          siteKey: target.site_key,
          ean: createForm.ean,
          files: createImageFiles
        });
        if (!uploadResp.ok) {
          throw new Error(String(uploadData.detail || labels.xljvUploadFailedHttp.replace("{status}", String(uploadResp.status))));
        }
        uploadedUrls = Array.isArray(uploadData.uploaded_image_urls)
          ? uploadData.uploaded_image_urls.map((v) => String(v || "").trim()).filter(Boolean)
          : [];
        if (uploadedUrls.length === 0) {
          throw new Error(labels.xljvUploadNoImageUrlsForSite.replace("{siteKey}", target.site_key));
        }
      }

      const additionalUploaded = uploadedUrls.slice(1);
      // When files are uploaded in "all sites" mode, keep only per-target URLs.
      // Otherwise URLs from other domains leak into this target and become broken images.
      const imagesForTarget =
        createImageFiles.length > 0
          ? additionalUploaded.map((url, idx) => ({ image: url, sort_order: idx }))
          : [...baseExtraImages];

      const base: Record<string, unknown> = {
        ean: createForm.ean,
        source_model: createForm.source_model || undefined,
        source_sku: createForm.source_sku || undefined,
        source_ean_field: createForm.source_ean_field || undefined,
        manufacturer_id: createForm.manufacturer_id ? Number(createForm.manufacturer_id) : undefined,
        stock_status_id: createForm.stock_status_id ? Number(createForm.stock_status_id) : undefined,
        tax_class_id: createForm.tax_class_id ? Number(createForm.tax_class_id) : undefined,
        date_available: createForm.date_available || undefined,
        image:
          target.site === "JV"
            ? (uploadedUrls[0] || (createImageFiles.length === 0 ? (createForm.image || undefined) : undefined))
            : (uploadedUrls[0] || createForm.image || undefined),
        categories: baseCategories,
        stores: baseStores,
        images: imagesForTarget,
        specials: baseSpecials,
        price: createForm.price || "0.0000",
        status: createForm.status
      };
      if (target.site === "XL") {
        base.shipping = createForm.shipping;
        base.subtract = createForm.subtract;
        base.minimum = createForm.minimum ? Number(createForm.minimum) : undefined;
        base.points = createForm.points ? Number(createForm.points) : undefined;
        base.sort_order = createForm.sort_order ? Number(createForm.sort_order) : undefined;
        base.seo_url = createForm.seo_url || undefined;
        base.translate_texts = translateTexts;
        base.translation_source_language = autoDetectSourceLanguage ? "auto" : "de";
        base.translation_source = buildTranslationSource(createForm);
        base.convert_currency = convertCurrency;
        base.source_currency = "EUR";
      }
      if (target.site === "JV") {
        base.translate_texts = translateTexts;
        base.translation_source_language = autoDetectSourceLanguage ? "auto" : "de";
        base.translation_source = buildTranslationSource(createForm);
        base.convert_currency = convertCurrency;
        base.source_currency = "EUR";
        base.locale_by_site_key = buildJvLocaleBySiteKey(target.site_key);
      }
      if (target.site === "JV" && createForm.source_product_id.trim()) {
        base.source_product_id = Number(createForm.source_product_id.trim());
      }

      const payload: Record<string, unknown> =
        target.site === "JV"
          ? {
              ...base,
              jv_fields: {
                artikelnr: createForm.source_model || createForm.ean || "AUTO",
                jfsku: createForm.source_sku || undefined,
                inaktiv: createForm.status ? 0 : 1,
                urlkey: createForm.jv_urlkey || undefined,
                mwstid: createForm.jv_mwstid || undefined,
                lieferzeitid: createForm.jv_lieferzeitid || undefined,
                einheitid: createForm.jv_einheitid || undefined,
                grundeinheit: createForm.jv_grundeinheit || undefined,
                vpe: createForm.jv_vpe || undefined,
                is_sofort: createForm.jv_is_sofort ? 1 : 0,
                preisbasis: createForm.jv_preisbasis || undefined,
                preisfilter: createForm.jv_preisfilter || undefined,
                content_by_language: [
                  {
                    language_code: "de",
                    name: createForm.name,
                    keywords: createForm.meta_keyword,
                    short_description: createForm.short_description,
                    short_description_real: createForm.short_description_real,
                    description: createForm.description_html || createForm.description
                  }
                ]
              },
              descriptions: [
                {
                  language_id: 1,
                  name: createForm.name,
                  description: createForm.description,
                  tag: createForm.tag,
                  meta_title: createForm.meta_title,
                  meta_description: createForm.meta_description,
                  meta_keyword: createForm.meta_keyword
                },
                ...baseExtraDescriptions
              ]
            }
          : {
              ...base,
              quantity: Number(createForm.quantity || "0"),
              descriptions: [
                {
                  language_id: 1,
                  name: createForm.name,
                  description: createForm.description,
                  tag: createForm.tag,
                  meta_title: createForm.meta_title,
                  meta_description: createForm.meta_description,
                  meta_keyword: createForm.meta_keyword
                },
                ...baseExtraDescriptions
              ]
            };

      const updateExisting = async (action: string) => {
        const { response: updateResp, payload: updateData } = await xljvUpdateByEan({
          ean: createForm.ean,
          site: target.site,
          siteKey: target.site_key,
          payload
        });
        return {
          site: target.site,
          site_key: target.site_key,
          ok: updateResp.ok,
          status: updateResp.status,
          action,
          response: updateData as Record<string, unknown>
        };
      };

      if (target.site === "XL" && existingSiteKeys.has(target.site_key)) {
        const updateResult = await updateExisting("update_existing");
        if (updateResult.ok || updateResult.status !== 404) {
          return updateResult;
        }

        const syncResult = await xljvSyncByEan({
          ean: createForm.ean,
          site: target.site,
          siteKey: target.site_key
        });
        const syncPayload = parseMaybeJsonRecord(syncResult.text);
        if (!syncResult.response.ok) {
          return {
            site: target.site,
            site_key: target.site_key,
            ok: false,
            status: syncResult.response.status,
            action: "sync_before_update_failed",
            response: syncPayload
          };
        }
        const updateAfterSync = await updateExisting("update_after_source_sync");
        return {
          ...updateAfterSync,
          sync_status: syncResult.response.status,
          sync_response: syncPayload
        };
      }

      const { response: createResp, payload: createData } = await xljvCreateAndPush({
        site: target.site,
        siteKey: target.site_key,
        payload
      });
      if (!createResp.ok && target.site === "XL" && String(createData.code || "") === "xl_create_ean_conflict") {
        const { response: updateResp, payload: updateData } = await xljvUpdateByEan({
          ean: createForm.ean,
          site: target.site,
          siteKey: target.site_key,
          payload
        });
        return {
          site: target.site,
          site_key: target.site_key,
          ok: updateResp.ok,
          status: updateResp.status,
          action: "update_after_ean_conflict",
          response: updateData
        };
      }
      return { site: target.site, site_key: target.site_key, ok: createResp.ok, status: createResp.status, action: "create", response: createData };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || labels.error);
      return { site: target.site, site_key: target.site_key, ok: false, error: msg };
    }
  });

  setSyncLog({ mode: "create_and_push_all_sites", ean: createForm.ean, concurrency: SEND_ALL_SITES_CONCURRENCY, discovery, summary });
  const okCount = summary.filter((r) => Boolean((r as Record<string, unknown>).ok)).length;
  setSyncStatus(labels.xljvSendAllFinishedStatus.replace("{ok}", String(okCount)).replace("{total}", String(summary.length)));
  setCreateAllSitesLoading(false);
}

export async function sendCreatedProduct(args: {
  createForm: XLJVCreateFormState;
  site: Site;
  siteKey: string;
  siteKeyOptions: Array<{ value: string; label: string }>;
  translateTexts: boolean;
  autoDetectSourceLanguage: boolean;
  convertCurrency: boolean;
  setCreateProductSendLoading: Setter<boolean>;
  setError: Setter<string | null>;
  setSyncStatus: Setter<string | null>;
  setSyncLog: Setter<Record<string, unknown> | null>;
  setEan: Setter<string>;
  setItem: Setter<XLJVResponse | null>;
  setCreateForm: Setter<XLJVCreateFormState | null>;
  labels: ActionLabels;
}) {
  const { createForm, site, siteKey, siteKeyOptions, translateTexts, autoDetectSourceLanguage, convertCurrency, setCreateProductSendLoading, setError, setSyncStatus, setSyncLog, setEan, setItem, setCreateForm, labels } = args;
  setCreateProductSendLoading(true);
  setError(null);
  setSyncStatus(null);
  setSyncLog(null);

  try {
    const fallbackSiteKey =
      siteKeyOptions.find((option) => {
        const value = (option.value || "").trim();
        return Boolean(value) && value !== "ALL_SITES";
      })?.value || "";
    const normalizedSiteKey =
      siteKey.trim() && siteKey.trim() !== "ALL_SITES"
        ? siteKey.trim()
        : fallbackSiteKey;

    const categories = parseJsonArray(createForm.categories_json, labels, "categories");
    const stores = parseJsonArray(createForm.stores_json, labels, "stores");
    const extraImages = parseJsonArray(createForm.images_json, labels, "images");
    const specials = parseJsonArray(createForm.specials_json, labels, "specials");
    const extraDescriptions = parseJsonArray(createForm.descriptions_json, labels, "descriptions");

    const base: Record<string, unknown> = {
      ean: createForm.ean,
      source_model: createForm.source_model || undefined,
      source_sku: createForm.source_sku || undefined,
      source_ean_field: createForm.source_ean_field || undefined,
      manufacturer_id: createForm.manufacturer_id ? Number(createForm.manufacturer_id) : undefined,
      stock_status_id: createForm.stock_status_id ? Number(createForm.stock_status_id) : undefined,
      tax_class_id: createForm.tax_class_id ? Number(createForm.tax_class_id) : undefined,
      date_available: createForm.date_available || undefined,
      image: createForm.image || undefined,
      categories,
      stores,
      images: extraImages,
      specials,
      price: createForm.price || "0.0000",
      status: createForm.status
    };
    if (site === "XL") {
      base.shipping = createForm.shipping;
      base.subtract = createForm.subtract;
      base.minimum = createForm.minimum ? Number(createForm.minimum) : undefined;
      base.points = createForm.points ? Number(createForm.points) : undefined;
      base.sort_order = createForm.sort_order ? Number(createForm.sort_order) : undefined;
      base.seo_url = createForm.seo_url || undefined;
      base.translate_texts = translateTexts;
      base.translation_source_language = autoDetectSourceLanguage ? "auto" : "de";
      base.translation_source = buildTranslationSource(createForm);
      base.convert_currency = convertCurrency;
      base.source_currency = "EUR";
    }
    if (site === "JV") {
      base.translate_texts = translateTexts;
      base.translation_source_language = autoDetectSourceLanguage ? "auto" : "de";
      base.translation_source = buildTranslationSource(createForm);
      base.convert_currency = convertCurrency;
      base.source_currency = "EUR";
      base.locale_by_site_key = buildJvLocaleBySiteKey(normalizedSiteKey);
    }

    if (site === "JV" && createForm.source_product_id.trim()) base.source_product_id = Number(createForm.source_product_id.trim());

    const payload: Record<string, unknown> =
      site === "JV"
        ? {
            ...base,
            jv_fields: {
              artikelnr: createForm.source_model || createForm.ean || "AUTO",
              jfsku: createForm.source_sku || undefined,
              inaktiv: createForm.status ? 0 : 1,
              urlkey: createForm.jv_urlkey || undefined,
              mwstid: createForm.jv_mwstid || undefined,
              lieferzeitid: createForm.jv_lieferzeitid || undefined,
              einheitid: createForm.jv_einheitid || undefined,
              grundeinheit: createForm.jv_grundeinheit || undefined,
              vpe: createForm.jv_vpe || undefined,
              is_sofort: createForm.jv_is_sofort ? 1 : 0,
              preisbasis: createForm.jv_preisbasis || undefined,
              preisfilter: createForm.jv_preisfilter || undefined,
              content_by_language: [
                {
                  language_code: "de",
                  name: createForm.name,
                  keywords: createForm.meta_keyword,
                  short_description: createForm.short_description,
                  short_description_real: createForm.short_description_real,
                  description: createForm.description_html || createForm.description
                }
              ]
            },
            descriptions: [{ language_id: 1, name: createForm.name, description: createForm.description, tag: createForm.tag, meta_title: createForm.meta_title, meta_description: createForm.meta_description, meta_keyword: createForm.meta_keyword }, ...extraDescriptions]
          }
        : {
            ...base,
            quantity: Number(createForm.quantity || "0"),
            descriptions: [{ language_id: 1, name: createForm.name, description: createForm.description, tag: createForm.tag, meta_title: createForm.meta_title, meta_description: createForm.meta_description, meta_keyword: createForm.meta_keyword }, ...extraDescriptions]
          };

    const { response, payload: data } = await xljvCreateAndPush({
      site,
      siteKey: normalizedSiteKey,
      payload
    });
    setSyncLog(data);
    if (!response.ok) {
      const code = String(data.code || "");
      if (code === "xljv_source_product_id_required_for_push") {
        setSyncStatus(labels.xljvSavedLocalDbNeedsSourceProductId);
        return;
      }
      if (site === "XL" && code === "xl_create_ean_conflict") {
        const { response: updateResponse, payload: updateData } = await xljvUpdateByEan({
          ean: createForm.ean,
          site,
          siteKey: normalizedSiteKey,
          payload
        });
        setSyncLog(updateData as Record<string, unknown>);
        if (!updateResponse.ok) {
          throw new Error(
            String(
              (updateData as Record<string, unknown>).detail ||
                labels.requestFailedHttpStatus.replace("{status}", String(updateResponse.status))
            )
          );
        }
        const updatedItem = (((updateData as Record<string, unknown>).item as Record<string, unknown> | undefined) || updateData || {}) as Record<string, unknown>;
        const updatedEan = String(updatedItem.ean || createForm.ean || "").trim();
        setEan(updatedEan);
        setItem(updatedItem as XLJVResponse);
        setCreateForm(null);
        setSyncStatus(labels.xljvExistingXlUpdatedAndSent.replace("{eanPart}", updatedEan ? labels.xljvWithEan.replace("{ean}", updatedEan) : ""));
        return;
      }
      throw new Error(String(data.detail || labels.requestFailedHttpStatus.replace("{status}", String(response.status))));
    }

    const createdItem = (data.item as Record<string, unknown> | undefined) || {};
    const createdEan = String(createdItem.ean || createForm.ean || "").trim();
    setEan(createdEan);
    setItem(createdItem as XLJVResponse);
    setCreateForm(null);
    setSyncStatus(
      labels.xljvCreatedAndSentProduct
        .replace("{site}", site)
        .replace("{eanPart}", createdEan ? labels.xljvWithEan.replace("{ean}", createdEan) : "")
    );
  } catch (requestError) {
    const message = requestError instanceof Error ? requestError.message : "";
    setError(message || labels.xljvFailedCreateSendProduct);
  } finally {
    setCreateProductSendLoading(false);
  }
}

export async function syncByEan(args: {
  ean: string;
  site: Site;
  siteKey: string;
  translateTexts: boolean;
  autoDetectSourceLanguage: boolean;
  convertCurrency: boolean;
  setSyncLoading: Setter<boolean>;
  setError: Setter<string | null>;
  setSyncStatus: Setter<string | null>;
  setSyncLog: Setter<Record<string, unknown> | null>;
  onSuccess: (normalizedEan: string, site: Site, siteKey: string) => void;
  labels: ActionLabels;
}) {
  const { ean, site, siteKey, translateTexts, autoDetectSourceLanguage, convertCurrency, setSyncLoading, setError, setSyncStatus, setSyncLog, onSuccess, labels } = args;
  const normalized = ean.trim();
  if (!normalized) {
    setError(labels.xljvEnterEan);
    return;
  }
  setSyncLoading(true);
  setError(null);
  setSyncStatus(null);
  setSyncLog(null);

  try {
    const useBatch = translateTexts || convertCurrency;
    const requestBody = useBatch
      ? { site_family: site, translate_texts: translateTexts, translation_source_language: autoDetectSourceLanguage ? "auto" : "de", convert_currency: convertCurrency }
      : {};
    const { response, text } = await xljvSyncByEan({
      ean: normalized,
      site,
      siteKey,
      requestBody,
      batch: useBatch
    });

    setSyncStatus(labels.xljvHttpStatus.replace("{status}", String(response.status)));
    let parsed: unknown = text;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    setSyncLog({ ok: response.ok, status: response.status, site, site_key: siteKey.trim() || null, ean: normalized, mode: useBatch ? "batch_apply" : "single_sync", options: { translate_texts: translateTexts, translation_source_language: autoDetectSourceLanguage ? "auto" : "de", convert_currency: convertCurrency }, response: parsed ?? null });

    if (response.ok) onSuccess(normalized, site, siteKey);
  } catch (requestError) {
    const message = requestError instanceof Error ? requestError.message : "";
    setError(message || labels.xljvFailedSyncProduct);
  } finally {
    setSyncLoading(false);
  }
}

export async function sendToSelectedSites(args: {
  ean: string;
  orderDraft: {
    name: string;
    description: string;
    tag: string;
    meta_title: string;
    meta_description: string;
    meta_keyword: string;
    default_price: string;
  };
  site: Site;
  selectedSiteKeys: string[];
  templateSiteKey: string;
  translateTexts: boolean;
  autoDetectSourceLanguage: boolean;
  convertCurrency: boolean;
  setSendSelectedLoading: Setter<boolean>;
  setBatchLanguageMapsAttempted: Setter<boolean>;
  setError: Setter<string | null>;
  setSyncStatus: Setter<string | null>;
  setSyncLog: Setter<Record<string, unknown> | null>;
  setBatchLanguageMaps: Setter<SiteLanguageMapPreview[]>;
  labels: ActionLabels;
}) {
  const { ean, orderDraft, site, selectedSiteKeys, templateSiteKey, translateTexts, autoDetectSourceLanguage, convertCurrency, setSendSelectedLoading, setBatchLanguageMapsAttempted, setError, setSyncStatus, setSyncLog, setBatchLanguageMaps, labels } = args;
  const normalized = ean.trim();
  if (!normalized) return void setError(labels.xljvEnterEan);
  if (selectedSiteKeys.length === 0) return void setError(labels.chooseOneTargetSite);
  if (!templateSiteKey) return void setError(labels.chooseTemplateSite);

  setSendSelectedLoading(true);
  setBatchLanguageMapsAttempted(true);
  setError(null);
  setSyncStatus(null);
  setSyncLog(null);
  setBatchLanguageMaps([]);
  try {
    const requestBody = {
      site_family: site,
      site_keys: selectedSiteKeys,
      template_site_key: templateSiteKey,
      default_price: orderDraft.default_price || undefined,
      translate_texts: translateTexts,
      translation_source: {
        name: orderDraft.name,
        description: orderDraft.description,
        tag: orderDraft.tag,
        meta_title: orderDraft.meta_title,
        meta_description: orderDraft.meta_description,
        meta_keyword: orderDraft.meta_keyword
      },
      translation_source_language: autoDetectSourceLanguage ? "auto" : "de",
      convert_currency: convertCurrency
    };
    const { response, payload: parsed } = await xljvBatchApplyByEan({
      ean: normalized,
      site,
      requestBody
    });

    setSyncStatus(labels.xljvHttpStatus.replace("{status}", String(response.status)));
    let parsedValue: unknown = parsed;
    const parsedObj = parsedValue && typeof parsedValue === "object" ? (parsedValue as Record<string, unknown>) : null;
    const jobObj =
      parsedObj && parsedObj.job && typeof parsedObj.job === "object"
        ? (parsedObj.job as Record<string, unknown>)
        : null;
    const itemsRaw = jobObj?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    const languageMapRows: SiteLanguageMapPreview[] = items
      .map((itemRaw) => {
        const item =
          itemRaw && typeof itemRaw === "object"
            ? (itemRaw as Record<string, unknown>)
            : ({} as Record<string, unknown>);
        const details =
          item.details && typeof item.details === "object"
            ? (item.details as Record<string, unknown>)
            : null;
        const mapRaw =
          details?.language_id_by_locale && typeof details.language_id_by_locale === "object"
            ? (details.language_id_by_locale as Record<string, unknown>)
            : details?.language_map_by_locale && typeof details.language_map_by_locale === "object"
              ? (details.language_map_by_locale as Record<string, unknown>)
              : {};

        const normalizedMap: Record<string, number> = {};
        Object.entries(mapRaw).forEach(([locale, languageId]) => {
          if (!locale) return;
          const parsedLanguageId = Number(languageId);
          if (!Number.isFinite(parsedLanguageId)) return;
          normalizedMap[locale] = parsedLanguageId;
        });

        return {
          siteKey: String(item.site_key || ""),
          domain: String(item.domain || ""),
          targetLocale: String(details?.target_locale || ""),
          languageIdByLocale: normalizedMap
        };
      })
      .filter((row) => Object.keys(row.languageIdByLocale).length > 0)
      .sort((a, b) => (a.siteKey || a.domain).localeCompare(b.siteKey || b.domain));
    const fallbackRaw = Array.isArray(parsedObj?.language_mapping_by_site)
      ? (parsedObj?.language_mapping_by_site as Array<Record<string, unknown>>)
      : [];
    const fallbackRows: SiteLanguageMapPreview[] = fallbackRaw
      .map((row) => {
        const mapRaw =
          row.language_id_by_locale && typeof row.language_id_by_locale === "object"
            ? (row.language_id_by_locale as Record<string, unknown>)
            : {};
        const normalizedMap: Record<string, number> = {};
        Object.entries(mapRaw).forEach(([locale, languageId]) => {
          if (!locale) return;
          const parsedLanguageId = Number(languageId);
          if (!Number.isFinite(parsedLanguageId)) return;
          normalizedMap[locale] = parsedLanguageId;
        });
        return {
          siteKey: String(row.site_key || ""),
          domain: String(row.domain || ""),
          targetLocale: String(row.target_locale || ""),
          languageIdByLocale: normalizedMap
        };
      })
      .filter((row) => Object.keys(row.languageIdByLocale).length > 0)
      .sort((a, b) => (a.siteKey || a.domain).localeCompare(b.siteKey || b.domain));
    setBatchLanguageMaps(languageMapRows.length > 0 ? languageMapRows : fallbackRows);
    setSyncLog({ ok: response.ok, status: response.status, mode: "batch_apply_selected_sites", ean: normalized, selected_site_keys: selectedSiteKeys, template_site_key: templateSiteKey, payload: requestBody, response: parsedValue ?? null });
  } catch (requestError) {
    const message = requestError instanceof Error ? requestError.message : "";
    setError(message || labels.xljvFailedSendSelectedSites);
  } finally {
    setSendSelectedLoading(false);
  }
}
