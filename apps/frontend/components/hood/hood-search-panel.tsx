"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLabels } from "../../app/use-labels";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { deleteHoodImageByEan, fetchHoodByEan, patchHoodByEan } from "./hood-api";
import { HoodSearchToolbar } from "./search-panel/hood-search-toolbar";
import { HoodStatusCard } from "./search-panel/hood-status-card";
import { HoodSearchResults } from "./search-panel/hood-search-results";
import { HoodPatchWorkspaceCard } from "./search-panel/hood-patch-workspace-card";
import { HoodErrorState } from "./search-panel/hood-error-state";
import { HoodEmptyState } from "./search-panel/hood-empty-state";
import { HoodLoadingState } from "./search-panel/hood-loading-state";
import {
  HoodAccount,
  HoodItem,
  HoodPatchForm,
  HoodResponse,
  HoodStatusMeta,
  PATCH_FORM_FIELD_KEYS,
  buildOutgoingPatchPayload,
  decodeHtmlEntities,
  extractFirstItemFromPayload,
  parseImagesText,
  prettyJson,
  removeUrlFromImagesText
} from "./hood-search-utils";
import { buildHoodWriteConfirmMessage } from "./hood-write-guardrails-model";
import { getHoodPatchPrecheckError } from "./hood-write-precheck-model";
import { getRequiredEanError } from "../shared/write-guardrails-model";

type HoodSearchPanelProps = {
  initialEan?: string;
  initialAccount?: HoodAccount;
  title?: string;
  hideToolbar?: boolean;
  defaultTab?: "search" | "patch";
  autoSearchOnMount?: boolean;
};

export function HoodSearchPanel(props: HoodSearchPanelProps = {}) {
  const t = useLabels();
  const {
    initialEan = "",
    initialAccount = "xl",
    title,
    hideToolbar = false,
    defaultTab = "search",
    autoSearchOnMount = false
  } = props;
  const [activeTab, setActiveTab] = useState<"search" | "patch">(defaultTab);
  const [ean, setEan] = useState(initialEan);
  const [account, setAccount] = useState<HoodAccount>(initialAccount);
  const [loading, setLoading] = useState(false);
  const [patchLoading, setPatchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [items, setItems] = useState<HoodItem[]>([]);
  const [externalPayload, setExternalPayload] = useState<unknown>(null);
  const [statusMeta, setStatusMeta] = useState<HoodStatusMeta | null>(null);
  const [patchResult, setPatchResult] = useState<unknown>(null);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [patchFiles, setPatchFiles] = useState<File[]>([]);
  const [editedPatchFields, setEditedPatchFields] = useState<Array<keyof HoodPatchForm>>([]);
  const [patchForm, setPatchForm] = useState<HoodPatchForm>({
    title: "",
    description: "",
    price: "",
    quantity: "",
    categoryID: "",
    condition: "",
    itemMode: "",
    itemNumber: "",
    imagesText: ""
  });
  const [initialPatchForm, setInitialPatchForm] = useState<HoodPatchForm>({
    title: "",
    description: "",
    price: "",
    quantity: "",
    categoryID: "",
    condition: "",
    itemMode: "",
    itemNumber: "",
    imagesText: ""
  });

  function setPatchField(field: keyof HoodPatchForm, value: string) {
    setPatchForm((current) => ({ ...current, [field]: value }));
    setEditedPatchFields((current) => (current.includes(field) ? current : [...current, field]));
  }

  function resetPatchEditedFields() {
    setEditedPatchFields([]);
  }

  const explicitChangedKeys = useMemo(
    () =>
      editedPatchFields.map((field) => (field === "imagesText" ? "images" : field)),
    [editedPatchFields]
  );

  const patchPreview = useMemo(
    () => buildOutgoingPatchPayload(patchForm, initialPatchForm, explicitChangedKeys),
    [patchForm, initialPatchForm, explicitChangedKeys]
  );
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const allHoodFields = useMemo(() => {
    const firstItem = extractFirstItemFromPayload(externalPayload);
    return firstItem && typeof firstItem === "object" ? firstItem : null;
  }, [externalPayload]);
  const hoodProductProperties = useMemo(() => {
    if (!allHoodFields) return [];
    const raw = (allHoodFields as { productProperties?: unknown }).productProperties;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const row = item as { name?: unknown; value?: unknown };
        return {
          name: String(row.name ?? "").trim(),
          value: String(row.value ?? "").trim()
        };
      })
      .filter((item) => item.name.length > 0 || item.value.length > 0);
  }, [allHoodFields]);

  const fetchByEanMutation = useMutation({
    mutationFn: ({ ean, account }: { ean: string; account: HoodAccount }) => fetchHoodByEan(ean, account)
  });

  useEffect(() => {
    if (initialEan) setEan(initialEan);
  }, [initialEan]);

  useEffect(() => {
    setAccount(initialAccount);
  }, [initialAccount]);

  useEffect(() => {
    const galleryImages = parseImagesText(patchForm.imagesText);
    if (galleryImages.length === 0) {
      setActiveGalleryIndex(0);
      return;
    }
    if (activeGalleryIndex >= galleryImages.length) {
      setActiveGalleryIndex(0);
    }
  }, [activeGalleryIndex, patchForm.imagesText]);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  async function runSearchByEan(normalizedEan: string, selectedAccount: HoodAccount) {
    setLoading(true);
    setSearched(true);
    setError(null);
    setPatchError(null);
    setItems([]);
    setExternalPayload(null);
    setStatusMeta(null);
    setPatchResult(null);

    try {
      const { response, payload } = await fetchByEanMutation.mutateAsync({
        ean: normalizedEan,
        account: selectedAccount
      });
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(t.hoodAdminSessionRequired);
        }
        const detail = payload.detail || t.hoodRequestFailed;
        const statusCodeText =
          typeof payload.status_code === "number" ? ` status=${payload.status_code}` : "";
        const bodyText = payload.body ? ` body=${payload.body}` : "";
        throw new Error(`${detail}${statusCodeText}${bodyText}`);
      }

      setItems(Array.isArray(payload.items) ? payload.items : []);
      setExternalPayload(payload.external_payload ?? null);
      setStatusMeta(payload.status_meta ?? null);
      setUploadedUrls([]);
      setPatchFiles([]);
      resetPatchEditedFields();
      const firstItem = extractFirstItemFromPayload(payload.external_payload);
      if (firstItem) {
        const firstImages = Array.isArray(firstItem.images) ? firstItem.images : [];
        const normalizedImages = firstImages
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0)
          .join("\n");

        setPatchForm({
          title: String(firstItem.title ?? ""),
          description: decodeHtmlEntities(String(firstItem.description ?? "")),
          price: String(firstItem.price ?? ""),
          quantity: String(firstItem.quantity ?? ""),
          categoryID: String(firstItem.categoryID ?? ""),
          condition: String(firstItem.condition ?? ""),
          itemMode: String(firstItem.itemMode ?? ""),
          itemNumber: String(firstItem.itemNumber ?? ""),
          imagesText: normalizedImages
        });
        setInitialPatchForm({
          title: String(firstItem.title ?? ""),
          description: decodeHtmlEntities(String(firstItem.description ?? "")),
          price: String(firstItem.price ?? ""),
          quantity: String(firstItem.quantity ?? ""),
          categoryID: String(firstItem.categoryID ?? ""),
          condition: String(firstItem.condition ?? ""),
          itemMode: String(firstItem.itemMode ?? ""),
          itemNumber: String(firstItem.itemNumber ?? ""),
          imagesText: normalizedImages
        });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t.failedLoadHoodItem);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoSearchOnMount) return;
    const normalizedEan = (initialEan || "").trim();
    if (!normalizedEan) return;
    void runSearchByEan(normalizedEan, initialAccount);
  }, [autoSearchOnMount, initialAccount, initialEan]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const eanError = getRequiredEanError(ean, t);
    if (eanError) {
      setError(eanError);
      return;
    }
    const normalizedEan = ean.trim();

    await runSearchByEan(normalizedEan, account);
  }

  async function submitPatch(options?: { uploadOnly?: boolean }) {
    const uploadOnly = options?.uploadOnly === true;
    const normalizedEan = ean.trim();
    const changedKeys = uploadOnly ? [] : patchPreview.changedKeys;
    const filteredPayloadObject: Record<string, unknown> = uploadOnly ? {} : patchPreview.filteredPayloadObject;
    const precheckError = getHoodPatchPrecheckError({
      ean: normalizedEan,
      uploadOnly,
      hasPatchFiles: patchFiles.length > 0,
      payloadFieldCount: Object.keys(filteredPayloadObject).length,
      labels: t
    });
    if (precheckError) {
      setPatchError(precheckError);
      return;
    }
    const confirmed = window.confirm(
      buildHoodWriteConfirmMessage({
        action: uploadOnly ? "upload_images" : "patch",
        ean: normalizedEan,
        labels: t
      })
    );
    if (!confirmed) {
      return;
    }

    setPatchLoading(true);
    setPatchError(null);
    setPatchResult(null);

    try {
      const { response, payload } = await patchHoodByEan({
        ean: normalizedEan,
        account,
        payloadObject: filteredPayloadObject,
        changedKeys,
        patchFiles
      });

      if (!response.ok) {
        const parsed = (payload ?? {}) as HoodResponse;
        const detail = parsed.detail || `${t.patchFailed} HTTP ${response.status}`;
        const statusCodeText =
          typeof parsed.status_code === "number" ? ` status=${parsed.status_code}` : "";
        const bodyText = parsed.body ? ` body=${parsed.body}` : "";
        throw new Error(`${detail}${statusCodeText}${bodyText}`);
      }

      setPatchResult(payload);
      const parsed = (payload ?? {}) as HoodResponse;
      setStatusMeta(parsed.status_meta ?? null);
      const urls = Array.isArray(parsed.uploaded_image_urls)
        ? parsed.uploaded_image_urls.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];
      setUploadedUrls(urls);
      if (urls.length > 0) {
        const existing = parseImagesText(patchForm.imagesText);
        const merged = Array.from(new Set([...existing, ...urls]));
        setPatchForm((current) => ({ ...current, imagesText: merged.join("\n") }));
        setPatchFiles([]);
      }
      setInitialPatchForm((current) => ({ ...current, ...patchForm }));
      resetPatchEditedFields();
    } catch (requestError) {
      setPatchError(requestError instanceof Error ? requestError.message : t.patchFailed);
    } finally {
      setPatchLoading(false);
    }
  }

  async function handlePatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPatch({ uploadOnly: false });
  }

  async function handleUploadImages() {
    await submitPatch({ uploadOnly: true });
  }

  async function handleDeleteUploadedUrl(url: string) {
    const normalizedEan = ean.trim();
    const eanError = getRequiredEanError(normalizedEan, t);
    if (eanError) {
      setPatchError(eanError);
      return;
    }
    const confirmed = window.confirm(
      buildHoodWriteConfirmMessage({ action: "delete_image", ean: normalizedEan, labels: t })
    );
    if (!confirmed) {
      return;
    }

    setDeletingUrl(url);
    setPatchError(null);
    try {
      const { response, payload } = await deleteHoodImageByEan({
        ean: normalizedEan,
        account,
        url
      });
      if (!response.ok) {
        const detail = payload.detail || `${t.deleteFailed}: HTTP ${response.status}`;
        throw new Error(detail);
      }

      setUploadedUrls((current) => current.filter((currentUrl) => currentUrl !== url));
      setPatchForm((current) => ({
        ...current,
        imagesText: removeUrlFromImagesText(current.imagesText, url)
      }));
    } catch (requestError) {
      setPatchError(requestError instanceof Error ? requestError.message : t.deleteFailed);
    } finally {
      setDeletingUrl(null);
    }
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      {title ? (
        <Card>
          <CardContent className="py-3 text-sm font-semibold">{title}</CardContent>
        </Card>
      ) : null}
      {!hideToolbar ? (
        <HoodSearchToolbar
          activeTab={activeTab}
          ean={ean}
          account={account}
          loading={loading}
          patchLoading={patchLoading}
          onSetActiveTab={setActiveTab}
          onSetEan={setEan}
          onSetAccount={setAccount}
          onSubmit={(event) => (activeTab === "search" ? void handleSubmit(event) : void handlePatch(event))}
        />
      ) : null}

      {activeTab === "search" && error ? <HoodErrorState title={t.hoodSearchFailed} description={error} /> : null}
      {activeTab === "patch" && patchError ? <HoodErrorState title={t.hoodPatchFailed} description={patchError} /> : null}

      {activeTab === "search" && loading ? <HoodLoadingState /> : null}
      {activeTab === "search" && searched && !loading && !error && items.length === 0 ? <HoodEmptyState title={t.noItemsFound} description={t.tryAnotherEanOrSwitchAccount} /> : null}

      {statusMeta ? <HoodStatusCard statusMeta={statusMeta} /> : null}

      {activeTab === "search" ? (
        <HoodSearchResults items={items} externalPayload={externalPayload} />
      ) : (
        <HoodPatchWorkspaceCard
          patchLoading={patchLoading}
          patchForm={patchForm}
          patchPreview={patchPreview}
          uploadedUrls={uploadedUrls}
          deletingUrl={deletingUrl}
          patchFiles={patchFiles}
          patchResult={patchResult}
          allHoodFields={allHoodFields}
          hoodProductProperties={hoodProductProperties}
          ean={ean}
          activeGalleryIndex={activeGalleryIndex}
          setActiveGalleryIndex={setActiveGalleryIndex}
          onSetPatchField={setPatchField}
          onSetPatchFiles={setPatchFiles}
          onPatch={handlePatch}
          onUploadImages={handleUploadImages}
          onDeleteUploadedUrl={handleDeleteUploadedUrl}
        />
      )}
    </div>
  );
}
