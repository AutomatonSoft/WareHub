"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLabels } from "../../app/use-labels";
import { Card, CardContent } from "../ui/card";
import {
  changeKauflandByEan,
  createKauflandByEan,
  deleteKauflandByEan,
  fetchKauflandByEan,
  KauflandCreateBody,
  KauflandResponse,
  KauflandSite
} from "./kaufland-api";
import {
  buildKauflandRequiredEanMessage,
  buildKauflandWriteConfirmMessage
} from "./kaufland-write-guardrails-model";
import { KauflandChangePayload, KauflandCreatePayload } from "./kaufland-panel/kaufland-panel-types";
import { KauflandSearchCard } from "./kaufland-panel/kaufland-search-card";
import { KauflandCreateCard } from "./kaufland-panel/kaufland-create-card";
import { KauflandUpdateCard } from "./kaufland-panel/kaufland-update-card";
import { KauflandDeleteCard } from "./kaufland-panel/kaufland-delete-card";
import { KauflandResponseCard } from "./kaufland-panel/kaufland-response-card";
import { KauflandLoadingState } from "./kaufland-panel/kaufland-loading-state";
import { KauflandErrorState } from "./kaufland-panel/kaufland-error-state";
import { KauflandEmptyState } from "./kaufland-panel/kaufland-empty-state";

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function parseStringArrayJson(raw: string): { ok: true; value: string[] } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) {
      return { ok: false, message: "Picture must be a JSON array of strings." };
    }
    return { ok: true, value: parsed.map((item) => String(item ?? "")).filter(Boolean) };
  } catch {
    return { ok: false, message: "Invalid picture JSON." };
  }
}

export function KauflandSearchPanel() {
  const t = useLabels();
  const [ean, setEan] = useState("");
  const [site, setSite] = useState<KauflandSite>("xl");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KauflandResponse | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeStatus, setChangeStatus] = useState<string | null>(null);
  const [changeResult, setChangeResult] = useState<KauflandResponse | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<KauflandResponse | null>(null);
  const [createForm, setCreateForm] = useState<KauflandCreatePayload>({
    ean: "",
    controller: "xl",
    title: "",
    description: "",
    picture: "[]",
    price: "",
    size: "",
    color: "",
    material: "",
    delivery: "",
    height: "",
    length: "",
    width: "",
  });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<KauflandResponse | null>(null);
  const [deleteForm, setDeleteForm] = useState<{ ean: string; controller: "jv" | "xl" }>({
    ean: "",
    controller: "xl"
  });
  const [changeForm, setChangeForm] = useState<KauflandChangePayload>({
    ean: "",
    title: "",
    description: "",
    picture_urls: "[]",
    unit_id: "1",
    storefront: "de",
    price: "",
    controller: "xl"
  });
  const [changeFormInitial, setChangeFormInitial] = useState<KauflandChangePayload>({
    ean: "",
    title: "",
    description: "",
    picture_urls: "[]",
    unit_id: "1",
    storefront: "de",
    price: "",
    controller: "xl"
  });

  const siteOptions = useMemo(
    () => [
      { value: "xl" as const, label: "XL" },
      { value: "jv" as const, label: "JV" }
    ],
    []
  );

  const searchMutation = useMutation({
    mutationFn: (params: { ean: string; site: KauflandSite }) => fetchKauflandByEan(params)
  });

  const changeMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => changeKauflandByEan(payload)
  });
  const createMutation = useMutation({
    mutationFn: (payload: KauflandCreateBody) => createKauflandByEan(payload)
  });
  const deleteMutation = useMutation({
    mutationFn: (payload: { ean: string; controller: "jv" | "xl" }) => deleteKauflandByEan(payload)
  });

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEan = ean.trim();
    if (!normalizedEan) {
      setError(t.enterEan);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setChangeStatus(null);
    setChangeResult(null);

    try {
      const { response, payload } = await searchMutation.mutateAsync({ ean: normalizedEan, site });
      if (!response.ok) {
        throw new Error(payload.detail || `Request failed: HTTP ${response.status}`);
      }

      setResult(payload);
      const responseData = (payload.response_data ?? payload) as Record<string, unknown>;
      const firstOrEmpty = (value: unknown) =>
        Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
      const normalizedPicture = responseData.picture;
      const pictureUrls = Array.isArray(normalizedPicture)
        ? normalizedPicture.map((item) => String(item ?? "")).filter(Boolean)
        : [];
      setChangeForm({
        ean: normalizedEan,
        title: firstOrEmpty(responseData.title),
        description: firstOrEmpty(responseData.description),
        picture_urls: JSON.stringify(pictureUrls, null, 2),
        unit_id: firstOrEmpty(responseData.unit_id) || "1",
        storefront: firstOrEmpty(responseData.storefront) || "de",
        price: firstOrEmpty(responseData.price),
        controller: site
      });
      setDeleteForm({
        ean: normalizedEan,
        controller: site
      });
      setChangeFormInitial({
        ean: normalizedEan,
        title: firstOrEmpty(responseData.title),
        description: firstOrEmpty(responseData.description),
        picture_urls: JSON.stringify(pictureUrls, null, 2),
        unit_id: firstOrEmpty(responseData.unit_id) || "1",
        storefront: firstOrEmpty(responseData.storefront) || "de",
        price: firstOrEmpty(responseData.price),
        controller: site
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t.failedLoadKauflandProduct);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDeleteStatus(null);
    setDeleteResult(null);

    const normalizedEan = deleteForm.ean.trim();
    if (!normalizedEan) {
      setError(buildKauflandRequiredEanMessage("delete"));
      return;
    }
    const deleteConfirmed = window.confirm(
      buildKauflandWriteConfirmMessage({ action: "delete", ean: normalizedEan, labels: t })
    );
    if (!deleteConfirmed) {
      return;
    }

    setDeleteLoading(true);
    try {
      const payload = { ean: normalizedEan, controller: deleteForm.controller };
      const { response, parsed } = await deleteMutation.mutateAsync(payload);
      const debugPayload = {
        ok: response.ok,
        status: response.status,
        endpoint: "/api/services/kaufland/products/delete/",
        request_payload: payload,
        response: parsed,
      } as KauflandResponse;
      setDeleteResult(debugPayload);
      if (!response.ok) {
        const detail =
          parsed && typeof parsed === "object" && "detail" in (parsed as Record<string, unknown>)
            ? String((parsed as Record<string, unknown>).detail ?? "")
            : "";
        throw new Error(detail || `Request failed: HTTP ${response.status}`);
      }
      setDeleteStatus("Kaufland product deleted successfully.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete Kaufland product.");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreateStatus(null);
    setCreateResult(null);

    const normalizedEan = createForm.ean.trim();
    if (!normalizedEan) {
      setError(buildKauflandRequiredEanMessage("create"));
      return;
    }
    const createConfirmed = window.confirm(
      buildKauflandWriteConfirmMessage({ action: "create", ean: normalizedEan, labels: t })
    );
    if (!createConfirmed) {
      return;
    }
    const parsedPicture = parseStringArrayJson(createForm.picture);
    const picturePayload: unknown = parsedPicture.ok ? parsedPicture.value : createForm.picture;

    setCreateLoading(true);
    try {
      const payload: KauflandCreateBody = {
        ean: normalizedEan,
        controller: createForm.controller,
        title: createForm.title,
        description: createForm.description,
        picture: picturePayload,
        price: Number(createForm.price),
        size: createForm.size,
        color: createForm.color,
        material: createForm.material,
        delivery: createForm.delivery,
        height: createForm.height,
        length: createForm.length,
        width: createForm.width,
      };
      const { response, parsed } = await createMutation.mutateAsync(payload);
      const debugPayload = {
        ok: response.ok,
        status: response.status,
        endpoint: "/api/services/kaufland/products/create/",
        request_payload: payload,
        response: parsed,
      } as KauflandResponse;
      setCreateResult(debugPayload);
      if (!response.ok) {
        const detail =
          parsed && typeof parsed === "object" && "detail" in (parsed as Record<string, unknown>)
            ? String((parsed as Record<string, unknown>).detail ?? "")
            : "";
        throw new Error(detail || `Request failed: HTTP ${response.status}`);
      }
      setCreateStatus("Kaufland product created successfully.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create Kaufland product.");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleChangeProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setChangeStatus(null);
    setChangeResult(null);

    const normalizedEan = changeForm.ean.trim();
    if (!normalizedEan) {
      setError(t.changeFormEanRequired);
      return;
    }
    const changeConfirmed = window.confirm(
      buildKauflandWriteConfirmMessage({ action: "change", ean: normalizedEan, labels: t })
    );
    if (!changeConfirmed) {
      return;
    }

    let pictureUrls: string[] = [];
    try {
      const parsed = JSON.parse(changeForm.picture_urls || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error(t.pictureUrlsMustBeArray);
      }
      pictureUrls = parsed.map((item) => String(item ?? "")).filter(Boolean);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : t.invalidPictureUrlsJson);
      return;
    }

    setChangeLoading(true);
    try {
      const payload: Record<string, unknown> = {
        ean: normalizedEan,
        controller: changeForm.controller,
        storefront: changeForm.storefront,
        unit_id: Number(changeForm.unit_id || "0"),
      };
      const changedFields: string[] = [];

      if (changeForm.title !== changeFormInitial.title) {
        payload.title = changeForm.title;
        changedFields.push("title");
      }
      if (changeForm.description !== changeFormInitial.description) {
        payload.description = changeForm.description;
        changedFields.push("description");
      }
      if (changeForm.price !== changeFormInitial.price) {
        payload.price = changeForm.price;
        changedFields.push("price");
      }
      if (changeForm.storefront !== changeFormInitial.storefront) {
        payload.storefront = changeForm.storefront;
        changedFields.push("storefront");
      }
      if (changeForm.unit_id !== changeFormInitial.unit_id) {
        payload.unit_id = Number(changeForm.unit_id || "0");
        changedFields.push("unit_id");
      }
      if (changeForm.picture_urls !== changeFormInitial.picture_urls) {
        payload.picture_urls = pictureUrls;
        changedFields.push("picture_urls");
      }

      payload.changed_fields = changedFields;
      const { response, parsed } = await changeMutation.mutateAsync(payload);
      const debugPayload = {
        ok: response.ok,
        status: response.status,
        endpoint: "/api/services/kaufland/products/ean/change/",
        request_payload: payload,
        response: parsed,
      } as KauflandResponse;
      setChangeResult(debugPayload);
      if (!response.ok) {
        const detail =
          parsed && typeof parsed === "object" && "detail" in (parsed as Record<string, unknown>)
            ? String((parsed as Record<string, unknown>).detail ?? "")
            : "";
        throw new Error(detail || `Request failed: HTTP ${response.status}`);
      }
      setChangeStatus(t.updateSuccessKaufland);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t.failedUpdateKauflandProduct);
    } finally {
      setChangeLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <KauflandSearchCard ean={ean} site={site} loading={loading} onSetEan={setEan} onSetSite={setSite} onSubmit={handleSearch} />
      {loading ? <KauflandLoadingState /> : null}
      {error ? <KauflandErrorState title="Kaufland request failed" description={error} /> : null}
      {!loading && !error && !result ? <KauflandEmptyState title="No response yet" description="Search by EAN to load Kaufland state." /> : null}
      {result ? <KauflandResponseCard title={t.kauflandResponse} payload={result} /> : null}
      <KauflandCreateCard form={createForm} loading={createLoading} onSetForm={setCreateForm} onSubmit={handleCreateProduct} />
      <KauflandUpdateCard form={changeForm} loading={changeLoading} onSetForm={setChangeForm} onSubmit={handleChangeProduct} />
      <KauflandDeleteCard form={deleteForm} loading={deleteLoading} onSetForm={setDeleteForm} onSubmit={handleDeleteProduct} />
      {changeStatus ? <Card className="border-emerald-500/20 bg-emerald-500/5"><CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">{changeStatus}</CardContent></Card> : null}
      {createStatus ? <Card className="border-emerald-500/20 bg-emerald-500/5"><CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">{createStatus}</CardContent></Card> : null}
      {deleteStatus ? <Card className="border-emerald-500/20 bg-emerald-500/5"><CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">{deleteStatus}</CardContent></Card> : null}
      {createResult ? <KauflandResponseCard title="Create response" payload={createResult} /> : null}
      {changeResult ? <KauflandResponseCard title={t.changeResponse} payload={changeResult} /> : null}
      {deleteResult ? <KauflandResponseCard title="Delete response" payload={deleteResult} /> : null}
    </div>
  );
}
