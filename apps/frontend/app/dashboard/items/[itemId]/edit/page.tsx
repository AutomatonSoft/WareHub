"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLabels } from "../../../../use-labels";
import {
  DEFAULT_API_BASE,
  fetchIntakes,
  IntakeDto,
  parseOrderIdFromQr,
  ProductDraft,
  readAuth,
  readProductDraft,
  saveProductDraft
} from "../../../../client-api";
import { ArrowLeft, Save } from "lucide-react";

export default function ItemEditPage() {
  const t = useLabels();
  const params = useParams<{ itemId: string }>();
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);
  const [token, setToken] = useState("");
  const [item, setItem] = useState<IntakeDto | null>(null);
  const [status, setStatus] = useState(t.loading);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductDraft>({
    title: "",
    ean: "",
    price: "",
    size: "",
    color: ""
  });

  useEffect(() => {
    const auth = readAuth();
    setToken(auth?.token ?? "");
  }, []);

  useEffect(() => {
    if (!token || !params.itemId) {
      return;
    }

    const run = async () => {
      setStatus(t.loadingItem);
      try {
        const intakes = await fetchIntakes(apiBase, token, 200);
        const selected = intakes.find((it) => it.id === params.itemId) ?? null;
        setItem(selected);
        if (!selected) {
          setStatus(t.itemNotFound);
          return;
        }
        setForm(readProductDraft(selected.id));
        setStatus(t.ready);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : t.failedToLoadItem);
      }
    };

    void run();
  }, [apiBase, token, params.itemId, t.failedToLoadItem, t.itemNotFound, t.loadingItem, t.ready]);

  function updateField<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) {
      return;
    }
    setSaving(true);
    try {
      saveProductDraft(item.id, form);
      setStatus(t.saved);
    } finally {
      setSaving(false);
    }
  }

  if (!item) {
    return (
      <main className="page">
        <section className="card">
          <Link href="/dashboard" className="inline-back">
            <ArrowLeft size={16} />
            {t.backToDashboard}
          </Link>
          <h1>{t.fillMissingData}</h1>
          <p>{status}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card details-card">
        <div className="details-tools">
          <Link href={`/dashboard/items/${item.id}`} className="inline-back">
            <ArrowLeft size={16} />
            {t.back}
          </Link>
        </div>

        <h1>{t.fillMissingData}</h1>
        <p className="subtitle">
          {t.orderId}: {parseOrderIdFromQr(item.qr_code) ?? "n/a"} | {t.kid}: {item.kid_number}
        </p>

        <form className="form item-edit-form" onSubmit={onSubmit}>
          <label>
            {t.productTitle}
            <input value={form.title} onChange={(e) => updateField("title", e.target.value)} />
          </label>
          <label>
            {t.ean}
            <input value={form.ean} onChange={(e) => updateField("ean", e.target.value)} />
          </label>
          <label>
            {t.price}
            <input value={form.price} onChange={(e) => updateField("price", e.target.value)} />
          </label>
          <label>
            {t.size}
            <input value={form.size} onChange={(e) => updateField("size", e.target.value)} />
          </label>
          <label>
            {t.color}
            <input value={form.color} onChange={(e) => updateField("color", e.target.value)} />
          </label>
          <button type="submit" disabled={saving} className="save-button">
            <Save size={16} />
            {saving ? t.saving : t.save}
          </button>
        </form>

        <p className="subtitle">{status}</p>
      </section>
    </main>
  );
}
