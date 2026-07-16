"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Boxes, CreditCard, Package, Truck } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { fetchKidDetailView, type KidDetailViewModel } from "@/components/inventory/inventory-api";

function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const text = String(value).trim();
  return text.length > 0 ? text : "—";
}

function displayStatus(value: unknown): string {
  return value === "no_paid" ? "Not paid" : displayValue(value);
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="wh-sofort-order-view__field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function SofortKidOrderPage() {
  const params = useParams<{ kidNumber: string }>();
  const searchParams = useSearchParams();
  const kidNumber = decodeURIComponent(params.kidNumber ?? "");
  const kidId = useMemo(() => {
    const raw = searchParams.get("kidId");
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const [data, setData] = useState<KidDetailViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kidId) {
      setLoading(false);
      setError("kidId is missing in URL.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchKidDetailView(kidId);
        if (!cancelled) {
          setData(payload);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load item details.");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [kidId]);

  const heroPhoto = data?.kid.photoUrls[0] ?? null;
  const primaryOrder = data?.orders[0] ?? null;

  return (
    <AppShell title={`KID ${kidNumber}`} subtitle="Данные товара и заказа из database-service">
      <div className="wh-sofort-order-view">
        <div className="wh-sofort-order-view__toolbar">
          <Link href="/sofort-list" className="wh-sofort-order-view__back">
            <ArrowLeft size={16} />
            Назад к sofort-list
          </Link>
        </div>

        {loading ? (
          <section className="wh-sofort-order-view__card">
            <h2>Загрузка</h2>
            <p className="wh-sofort-order-view__commentary">Загружаю карточку товара, коды, статусы маркетплейсов, заказы, историю изменений и характеристики…</p>
          </section>
        ) : error ? (
          <section className="wh-sofort-order-view__card">
            <h2>Ошибка</h2>
            <p className="wh-sofort-order-view__commentary">{error}</p>
          </section>
        ) : data ? (
          <>
            <section className="wh-sofort-order-view__hero">
              <div className="wh-sofort-order-view__hero-media">
                {heroPhoto ? (
                  <Image
                    src={heroPhoto}
                    alt={`KID ${kidNumber}`}
                    width={240}
                    height={240}
                    unoptimized
                    className="wh-sofort-order-view__photo"
                  />
                ) : (
                  <div className="wh-sofort-order-view__photo-placeholder">KID {kidNumber}</div>
                )}
              </div>

              <div className="wh-sofort-order-view__hero-content">
                <div className="wh-sofort-order-view__hero-topline">
                  <span className="wh-sofort-order-view__hero-kid">KID {data.kid.kidNumber || kidNumber}</span>
                </div>
                <h1>{primaryOrder?.title || "Без названия"}</h1>
              </div>
            </section>

            <div className="wh-sofort-order-view__stats">
              <div className="wh-sofort-order-view__stat">
                <CreditCard size={18} />
                <div>
                  <span>KID number</span>
                  <strong>{data.kid.kidNumber || "—"}</strong>
                </div>
              </div>
              <div className="wh-sofort-order-view__stat">
                <Package size={18} />
                <div>
                  <span>Order ID</span>
                  <strong>{displayValue(primaryOrder?.orderId)}</strong>
                </div>
              </div>
              <div className="wh-sofort-order-view__stat">
                <Truck size={18} />
                <div>
                  <span>Full amount</span>
                  <strong>{displayValue(primaryOrder?.fullAmount)}</strong>
                </div>
              </div>
              <div className="wh-sofort-order-view__stat">
                <Boxes size={18} />
                <div>
                  <span>Status</span>
                  <strong>{displayStatus(primaryOrder?.status)}</strong>
                </div>
              </div>
            </div>

            <div className="wh-sofort-order-view__grid">
              <section className="wh-sofort-order-view__card wh-sofort-order-view__card--full">
                <h2>Клиент и комментарий к товару</h2>
                <div className="wh-sofort-order-view__fields">
                  <DetailField label="Клиент" value={displayValue(primaryOrder?.buyer)} />
                  <DetailField label="Комментарий к товару" value={displayValue(primaryOrder?.memo)} />
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
