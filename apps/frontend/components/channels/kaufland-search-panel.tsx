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
  KauflandWriteBody,
  KauflandResponse,
  KauflandSite
} from "./kaufland-api";
import {
  buildKauflandRequiredEanMessage,
  buildKauflandWriteConfirmMessage
} from "./kaufland-write-guardrails-model";
import { createEmptyKauflandProductPayload, KauflandChangePayload, KauflandCreatePayload } from "./kaufland-panel/kaufland-panel-types";
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

function parseJsonArray(raw: string, label: string): unknown[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) {
      throw new Error(label);
    }
    return parsed;
  } catch {
    throw new Error(label);
  }
}

function firstOrEmpty(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function jsonArrayValue(value: unknown): string {
  return JSON.stringify(Array.isArray(value) ? value : [], null, 2);
}

function buildKauflandWritePayload(form: KauflandCreatePayload): KauflandWriteBody {
  const list = (field: string) => parseJsonArray(form[field as keyof KauflandCreatePayload] as string, `${field} must be a JSON array.`);
  const payload: KauflandWriteBody = {
    ean: form.ean.trim(), controller: form.controller, category: list("category").map(String), title: form.title,
    mpn: form.mpn, short_description: list("short_description").map(String), description: form.description,
    picture: list("picture").map(String), manufacturer: form.manufacturer, product_dimensions: form.product_dimensions,
    colour: form.colour, length: form.length, width: form.width, height: form.height, material: form.material,
    storefront: form.storefront, product_safety_contact: list("product_safety_contact") as Record<string, unknown>[],
    category_detail: list("category_detail") as Record<string, unknown>[], material_composition: form.material_composition,
    abnehmbarer_bezug: form.abnehmbarer_bezug, parts_of_animal_origin: form.parts_of_animal_origin,
    picture_urls: list("picture_urls").map(String), size: form.size, color: form.color,
  };
  if (form.price.trim()) payload.price = Number(form.price);
  if (form.unit_id.trim()) payload.unit_id = Number(form.unit_id);
  if (form.delivery.trim()) payload.delivery = Number(form.delivery);
  return payload;
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
  const [createForm, setCreateForm] = useState<KauflandCreatePayload>(() => createEmptyKauflandProductPayload());
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<KauflandResponse | null>(null);
  const [deleteForm, setDeleteForm] = useState<{ ean: string; controller: "jv" | "xl" }>({
    ean: "",
    controller: "xl"
  });
  const [changeForm, setChangeForm] = useState<KauflandChangePayload>(() => createEmptyKauflandProductPayload());
  const [changeFormInitial, setChangeFormInitial] = useState<KauflandChangePayload>(() => createEmptyKauflandProductPayload());

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
    mutationFn: (payload: KauflandWriteBody) => createKauflandByEan(payload)
  });
  const deleteMutation = useMutation({
    mutationFn: (payload: { ean: string; controller: "jv" | "xl" }) => deleteKauflandByEan(payload)
  });

  const buildRequestFailedStatusMessage = (status: number) =>
    t.requestFailedHttpStatus.replace("{status}", String(status));

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
        throw new Error(payload.detail || buildRequestFailedStatusMessage(response.status));
      }

      setResult(payload);
      const responseData = (payload.response_data ?? payload) as Record<string, unknown>;
      const nextForm: KauflandChangePayload = {
        ean: normalizedEan,
        controller: site,
        category: jsonArrayValue(responseData.category),
        title: firstOrEmpty(responseData.title),
        mpn: firstOrEmpty(responseData.mpn),
        short_description: jsonArrayValue(responseData.short_description),
        description: firstOrEmpty(responseData.description),
        picture: jsonArrayValue(responseData.picture),
        manufacturer: firstOrEmpty(responseData.manufacturer),
        product_dimensions: firstOrEmpty(responseData.product_dimensions),
        colour: firstOrEmpty(responseData.colour),
        length: firstOrEmpty(responseData.length), width: firstOrEmpty(responseData.width), height: firstOrEmpty(responseData.height),
        material: firstOrEmpty(responseData.material),
        storefront: firstOrEmpty(responseData.storefront) || "de",
        product_safety_contact: jsonArrayValue(responseData.product_safety_contact),
        category_detail: jsonArrayValue(responseData.category_detail),
        material_composition: firstOrEmpty(responseData.material_composition),
        abnehmbarer_bezug: firstOrEmpty(responseData.abnehmbarer_bezug),
        parts_of_animal_origin: firstOrEmpty(responseData.parts_of_animal_origin),
        price: firstOrEmpty(responseData.price),
        unit_id: firstOrEmpty(responseData.unit_id),
        picture_urls: jsonArrayValue(responseData.picture_urls),
        size: firstOrEmpty(responseData.size),
        color: firstOrEmpty(responseData.color),
        delivery: firstOrEmpty(responseData.delivery),
      };
      setChangeForm(nextForm);
      setCreateForm(nextForm);
      setDeleteForm({
        ean: normalizedEan,
        controller: site
      });
      setChangeFormInitial(nextForm);
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
      setError(buildKauflandRequiredEanMessage("delete", t));
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
        endpoint: "/api/v1/services/kaufland/products/delete/",
        request_payload: payload,
        response: parsed,
      } as KauflandResponse;
      setDeleteResult(debugPayload);
      if (!response.ok) {
        const detail =
          parsed && typeof parsed === "object" && "detail" in (parsed as Record<string, unknown>)
            ? String((parsed as Record<string, unknown>).detail ?? "")
            : "";
        throw new Error(detail || buildRequestFailedStatusMessage(response.status));
      }
      setDeleteStatus(t.kauflandDeleteSuccess);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t.failedDeleteKauflandProduct);
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
      setError(buildKauflandRequiredEanMessage("create", t));
      return;
    }
    const createConfirmed = window.confirm(
      buildKauflandWriteConfirmMessage({ action: "create", ean: normalizedEan, labels: t })
    );
    if (!createConfirmed) {
      return;
    }
    setCreateLoading(true);
    try {
      const payload = buildKauflandWritePayload({ ...createForm, ean: normalizedEan });
      const { response, parsed } = await createMutation.mutateAsync(payload);
      const debugPayload = {
        ok: response.ok,
        status: response.status,
        endpoint: "/api/v1/services/kaufland/products/create/",
        request_payload: payload,
        response: parsed,
      } as KauflandResponse;
      setCreateResult(debugPayload);
      if (!response.ok) {
        const detail =
          parsed && typeof parsed === "object" && "detail" in (parsed as Record<string, unknown>)
            ? String((parsed as Record<string, unknown>).detail ?? "")
            : "";
        throw new Error(detail || buildRequestFailedStatusMessage(response.status));
      }
      setCreateStatus(t.kauflandCreateSuccess);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t.failedCreateKauflandProduct);
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

    try {
      const fullPayload = buildKauflandWritePayload({ ...changeForm, ean: normalizedEan });
      const payload: Record<string, unknown> = { ean: normalizedEan, controller: changeForm.controller };
      const changedFields = (Object.keys(changeForm) as Array<keyof KauflandChangePayload>)
        .filter((field) => !["ean", "controller"].includes(field) && changeForm[field] !== changeFormInitial[field]);
      for (const field of changedFields) payload[field] = fullPayload[field as keyof KauflandWriteBody];
      payload.changed_fields = changedFields;
      if (changedFields.length === 0) throw new Error("No Kaufland fields were changed.");

      setChangeLoading(true);
      const { response, parsed } = await changeMutation.mutateAsync(payload);
      const debugPayload = {
        ok: response.ok, status: response.status, endpoint: "/api/v1/services/kaufland/products/ean/change/", request_payload: payload, response: parsed,
      } as KauflandResponse;
      setChangeResult(debugPayload);
      if (!response.ok) throw new Error(buildRequestFailedStatusMessage(response.status));
      setChangeStatus(t.updateSuccessKaufland);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : t.failedUpdateKauflandProduct);
    } finally {
      setChangeLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <KauflandSearchCard ean={ean} site={site} loading={loading} onSetEan={setEan} onSetSite={setSite} onSubmit={handleSearch} />
      {loading ? <KauflandLoadingState /> : null}
      {error ? <KauflandErrorState title={t.kauflandRequestFailed} description={error} /> : null}
      {!loading && !error && !result ? <KauflandEmptyState title={t.kauflandNoResponseYet} description={t.kauflandSearchByEanHint} /> : null}
      {result ? <KauflandResponseCard title={t.kauflandResponse} payload={result} /> : null}
      <KauflandCreateCard form={createForm} loading={createLoading} onSetForm={setCreateForm} onSubmit={handleCreateProduct} />
      <KauflandUpdateCard form={changeForm} loading={changeLoading} onSetForm={setChangeForm} onSubmit={handleChangeProduct} />
      <KauflandDeleteCard form={deleteForm} loading={deleteLoading} onSetForm={setDeleteForm} onSubmit={handleDeleteProduct} />
      {changeStatus ? <Card className="border-emerald-500/20 bg-emerald-500/5"><CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">{changeStatus}</CardContent></Card> : null}
      {createStatus ? <Card className="border-emerald-500/20 bg-emerald-500/5"><CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">{createStatus}</CardContent></Card> : null}
      {deleteStatus ? <Card className="border-emerald-500/20 bg-emerald-500/5"><CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">{deleteStatus}</CardContent></Card> : null}
      {createResult ? <KauflandResponseCard title={t.kauflandCreateResponse} payload={createResult} /> : null}
      {changeResult ? <KauflandResponseCard title={t.changeResponse} payload={changeResult} /> : null}
      {deleteResult ? <KauflandResponseCard title={t.kauflandDeleteResponse} payload={deleteResult} /> : null}
    </div>
  );
}
