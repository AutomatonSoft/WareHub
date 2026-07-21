"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  DEFAULT_API_BASE,
  fetchIntakes,
  IntakeDto,
  parseOrderIdFromQr,
  parsePhotoUrls,
  readAuth,
  readProductDraft,
  resolvePhotoUrl
} from "../../../client-api";
import { ArrowLeft } from "lucide-react";
import { inactiveDaysLeft, intakeIsActive } from "../../intake-status";
import { dateLocale } from "../../../i18n";
import { useLabels, useLanguage } from "../../../use-labels";

function normalizeMemo(value: string | null): string {
  if (!value) {
    return "";
  }
  let out = value;
  out = out.replace(/&#(\d+);/g, (_, dec: string) => {
    const code = Number.parseInt(dec, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  out = out
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü")
    .replace(/&szlig;/gi, "ß")
    .replace(/<\/\s*$/g, "")
    .trim();
  return out;
}

export default function ItemDetailsPage() {
  const params = useParams<{ itemId: string }>();
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE, []);
  const [token, setToken] = useState("");
  const [item, setItem] = useState<IntakeDto | null>(null);
  const [status, setStatus] = useState("Loading...");
  const lang = useLanguage();
  const t = useLabels();
  const locale = useMemo(() => dateLocale[lang] ?? "en-US", [lang]);

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
        setStatus(t.ready);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : t.failedToLoadItem);
      }
    };

    void run();
  }, [apiBase, token, params.itemId, t.failedToLoadItem, t.itemNotFound, t.loadingItem, t.ready]);

  if (!item) {
    return (
      <main className="page">
        <section className="card">
          <Link href="/dashboard" className="inline-back">
            <ArrowLeft size={16} />
            {t.backToDashboard}
          </Link>
          <h1>{t.itemDetails}</h1>
          <p>{status}</p>
        </section>
      </main>
    );
  }

  const photos = parsePhotoUrls(item.photo_url).map((url) => resolvePhotoUrl(apiBase, url));
  const orderId = item.order_id ?? parseOrderIdFromQr(item.qr_code);
  const compactKid = item.kid_number.replace(/^KID-/i, "");
  const internalIndex = item.internal_index ?? `1-${compactKid}-${orderId ?? "NOORDER"}`;
  const memo = normalizeMemo(item.order_memo);
  const isActive = intakeIsActive(item);
  const daysLeft = inactiveDaysLeft(item);

  return (
    <main className="page">
      <section className="card details-card">
        <div className="details-tools">
          <Link href="/dashboard" className="inline-back">
            <ArrowLeft size={16} />
            {t.back}
          </Link>
        </div>

        <h1>{t.itemDetails}</h1>
        <section className="details-panel">
          <h2>{t.afterbuy}</h2>
          {!item.product_title ? (
            <p>{status}</p>
          ) : (
            <div className="details-stack">
              <div className="product-grid">
                <article className="product-card">
                  <div className="product-card-head">
                    <h3>{item.product_title || t.noValue}</h3>
                    <span>{t.qty} {item.box_total || 1}</span>
                  </div>
                  <div className="product-meta">
                    {item.product_price ? <p>{t.price}: {item.product_price}</p> : null}
                    {item.product_sale_date ? <p>{t.saleDate}: {item.product_sale_date}</p> : null}
                    {item.product_ean ? <p>EAN: {item.product_ean}</p> : null}
                    {item.product_sku ? <p>{t.sku}: {item.product_sku}</p> : null}
                    {item.product_size ? <p>{t.size}: {item.product_size}</p> : null}
                    {item.product_color ? <p>{t.color}: {item.product_color}</p> : null}
                    <p>{t.bWare}: {item.is_b_ware ? t.yes : t.no}</p>
                    {item.b_ware_comment ? <p>{t.bWareComment}: {item.b_ware_comment}</p> : null}
                    {item.category_main ? (
                      <p>
                        {t.category}:{" "}
                        {item.category_sub
                          ? `${item.category_main} / ${item.category_sub}`
                          : item.category_main}
                      </p>
                    ) : null}
                  </div>
                </article>
              </div>
              {memo ? (
                <div className="details-box">
                  <span>{t.memo}</span>
                  <b style={{ whiteSpace: "pre-wrap" }}>{memo}</b>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <p className="subtitle">{t.orderAndIntakeInfo}</p>

        <div className="details-grid">
          <div className="details-box">
            <span>{t.qrPayload}</span>
            <b>{item.qr_code}</b>
          </div>
          <div className="details-box">
            <span>{t.index}</span>
            <b>{internalIndex}</b>
          </div>
          <div className="details-box">
            <span>{t.sectionSlot}</span>
            <b>
              {item.section} / {item.slot_number}
            </b>
          </div>
          <div className="details-box">
            <span>{t.boxes}</span>
            <b>
              {item.box_index}/{item.box_total}
            </b>
          </div>
          <div className="details-box">
            <span>{t.unitNumber}</span>
            <b>{item.unit_index}</b>
          </div>
          <div className="details-box">
            <span>{t.productKey}</span>
            <b>{item.product_key || t.noValue}</b>
          </div>
          <div className="details-box">
            <span>{t.bWare}</span>
            <b>{item.is_b_ware ? t.yes : t.no}</b>
          </div>
          {item.b_ware_comment ? (
            <div className="details-box">
              <span>{t.bWareComment}</span>
              <b>{item.b_ware_comment}</b>
            </div>
          ) : null}
          <div className="details-box">
            <span>{t.category}</span>
            <b>
              {item.category_main
                ? item.category_sub
                  ? `${item.category_main} / ${item.category_sub}`
                  : item.category_main
                : t.noValue}
            </b>
          </div>
          <div className="details-box">
            <span>{t.kid}</span>
            <b>{item.kid_number}</b>
          </div>
          <div className="details-box">
            <span>{t.status}</span>
            <b>{isActive ? t.active : t.inactive}</b>
          </div>
          {!isActive ? (
            <div className="details-box">
              <span>{t.autoDelete}</span>
              <b>{daysLeft === 0 ? t.due : t.inDays.replace("{days}", String(daysLeft ?? 30))}</b>
            </div>
          ) : null}
          <div className="details-box">
            <span>{t.createdAt}</span>
            <b>{new Date(item.created_at).toLocaleString(locale)}</b>
          </div>
          {!isActive && item.removed_at ? (
            <div className="details-box">
              <span>{t.markedInactive}</span>
              <b>{new Date(item.removed_at).toLocaleString(locale)}</b>
            </div>
          ) : null}
        </div>

        {photos.length > 0 ? (
          <div className="photo-strip">
            {photos.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer">
                <Image src={src} alt={t.productPhoto} width={192} height={192} unoptimized className="details-photo" />
              </a>
            ))}
          </div>
        ) : null}

      </section>
    </main>
  );
}
