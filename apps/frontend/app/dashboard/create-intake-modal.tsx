"use client";

import React, { useMemo, useState } from "react";

import { IntakeDto, createIntake, fetchAfterbuyOrdersByKid, AfterbuyKidOrderMatch } from "../client-api";
import { Lang } from "../i18n";
import { MAIN_CATEGORIES, SUBCATEGORIES_BY_MAIN, MainCategory } from "./category-map";
import {
  applyMainCategoryChange,
  buildCategoryPayload,
  normalizeOptionalSelection
} from "./category-form-logic";

type CreateIntakeModalProps = {
  open: boolean;
  apiBase: string;
  token: string;
  lang: Lang;
  onClose: () => void;
  onCreated: (created: IntakeDto[]) => void;
};

type UiCopy = {
  title: string;
  kid: string;
  find: string;
  create: string;
  close: string;
  creating: string;
  finding: string;
  enterKid: string;
  notFound: string;
  found: string;
  selectOrders: string;
  success: string;
  selectAtLeastOne: string;
  failedCreate: string;
  categoryOptional: string;
  subcategoryOptional: string;
  withoutCategory: string;
  noSelection: string;
  kidPlaceholder: string;
};

const copyByLang: Record<Lang, UiCopy> = {
  en: {
    title: "Create item by KID",
    kid: "KID number",
    find: "Find Order IDs",
    create: "Create selected",
    close: "Close",
    creating: "Creating...",
    finding: "Searching...",
    enterKid: "Enter KID number.",
    notFound: "No Order ID found for this KID.",
    found: "Order list loaded.",
    selectOrders: "Select order IDs",
    success: "Items created.",
    selectAtLeastOne: "Select at least one Order ID.",
    failedCreate: "Failed to create item.",
    categoryOptional: "Category (optional)",
    subcategoryOptional: "Subcategory (optional)",
    withoutCategory: "Without category",
    noSelection: "No selection",
    kidPlaceholder: "KID-123456"
  },
  ru: {
    title: "Создать товар по KID",
    kid: "Номер KID",
    find: "Найти Order ID",
    create: "Создать выбранные",
    close: "Закрыть",
    creating: "Создание...",
    finding: "Поиск...",
    enterKid: "Введите номер KID.",
    notFound: "Для этого KID не найден ни один Order ID.",
    found: "Список заказов загружен.",
    selectOrders: "Выберите Order ID",
    success: "Товары созданы.",
    selectAtLeastOne: "Выберите хотя бы один Order ID.",
    failedCreate: "Не удалось создать товар.",
    categoryOptional: "Категория (необязательно)",
    subcategoryOptional: "Подкатегория (необязательно)",
    withoutCategory: "Без категории",
    noSelection: "Не выбрано",
    kidPlaceholder: "KID-123456"
  },
  de: {
    title: "Artikel per KID anlegen",
    kid: "KID-Nummer",
    find: "Order-IDs suchen",
    create: "Ausgewahlte erstellen",
    close: "Schliessen",
    creating: "Erstelle...",
    finding: "Suche...",
    enterKid: "KID-Nummer eingeben.",
    notFound: "Keine Order-ID fur diese KID gefunden.",
    found: "Bestellliste geladen.",
    selectOrders: "Order-IDs auswahlen",
    success: "Artikel erstellt.",
    selectAtLeastOne: "Mindestens eine Order-ID auswahlen.",
    failedCreate: "Element konnte nicht erstellt werden.",
    categoryOptional: "Kategorie (optional)",
    subcategoryOptional: "Unterkategorie (optional)",
    withoutCategory: "Ohne Kategorie",
    noSelection: "Keine Auswahl",
    kidPlaceholder: "KID-123456"
  }
};

export function CreateIntakeModal({
  open,
  apiBase,
  token,
  lang,
  onClose,
  onCreated
}: CreateIntakeModalProps) {
  const text = copyByLang[lang];
  const [kidValue, setKidValue] = useState("");
  const [foundOrders, setFoundOrders] = useState<AfterbuyKidOrderMatch[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [isFinding, setIsFinding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [categoryMain, setCategoryMain] = useState("");
  const [categorySub, setCategorySub] = useState("");

  const selectedCount = useMemo(
    () => Object.values(selectedOrderIds).filter(Boolean).length,
    [selectedOrderIds]
  );
  const safeFoundOrders = Array.isArray(foundOrders) ? foundOrders : [];

  function clearModal() {
    setKidValue("");
    setFoundOrders([]);
    setSelectedOrderIds({});
    setMessage("");
    setCategoryMain("");
    setCategorySub("");
  }

  function onModalClose() {
    clearModal();
    onClose();
  }

  async function onFindOrders() {
    const kid = kidValue.trim();
    if (!kid) {
      setMessage(text.enterKid);
      return;
    }

    setIsFinding(true);
    setMessage("");
    setFoundOrders([]);
    setSelectedOrderIds({});
    try {
      const data = await fetchAfterbuyOrdersByKid(apiBase, token, kid);
      const nextMatches = Array.isArray(data.matches) ? data.matches : [];
      setFoundOrders(nextMatches);
      const preselected = nextMatches.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.order_id] = true;
        return acc;
      }, {});
      setSelectedOrderIds(preselected);
      setMessage(
        nextMatches.length > 0
          ? text.found
          : `${text.notFound} (${data.account}, ${data.final_url})`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.notFound);
    } finally {
      setIsFinding(false);
    }
  }

  async function onCreateSelected() {
    const kid = kidValue.trim();
    if (!kid) {
      setMessage(text.enterKid);
      return;
    }
    const ids = foundOrders
      .filter((item) => typeof item.order_id === "string" && item.order_id.length > 0)
      .map((item) => item.order_id)
      .filter((orderId) => selectedOrderIds[orderId]);
    if (ids.length === 0) {
      setMessage(text.selectAtLeastOne);
      return;
    }

    setIsCreating(true);
    setMessage("");
    try {
      const categoryPayload = buildCategoryPayload(categoryMain, categorySub);
      const created: IntakeDto[] = [];
      for (const orderId of ids) {
        const intake = await createIntake(apiBase, token, {
          qr_code: orderId,
          kid_number: kid,
          category_main: categoryPayload.category_main ?? undefined,
          category_sub: categoryPayload.category_sub ?? undefined
        });
        created.push(intake);
      }
      onCreated(created);
      setMessage(text.success);
      onModalClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.failedCreate);
    } finally {
      setIsCreating(false);
    }
  }

  if (!open) {
    return null;
  }

  const normalizedMain = normalizeOptionalSelection(categoryMain);
  const subcategories = normalizedMain
    ? SUBCATEGORIES_BY_MAIN[normalizedMain as MainCategory] ?? []
    : [];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onModalClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={text.title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{text.title}</h2>
        <div className="form modal-form">
          <label>
            {text.kid}
            <input
              value={kidValue}
              onChange={(event) => setKidValue(event.target.value)}
              placeholder={text.kidPlaceholder}
              autoFocus
            />
          </label>
          <label>
            {text.categoryOptional}
            <select
              className="ui-select"
              value={categoryMain}
              onChange={(event) => {
                const next = applyMainCategoryChange(event.target.value);
                setCategoryMain(next.categoryMain ?? "");
                setCategorySub("");
              }}
            >
              <option value="">{text.withoutCategory}</option>
              {MAIN_CATEGORIES.map((main) => (
                <option key={main} value={main}>
                  {main}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text.subcategoryOptional}
            <select
              className="ui-select"
              value={categorySub}
              disabled={!normalizedMain}
              onChange={(event) => setCategorySub(event.target.value)}
            >
              <option value="">{text.noSelection}</option>
              {subcategories.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={() => void onFindOrders()} disabled={isFinding || isCreating}>
            {isFinding ? text.finding : text.find}
          </button>
          <button
            type="button"
            onClick={() => void onCreateSelected()}
            disabled={isCreating || foundOrders.length === 0 || selectedCount === 0}
          >
            {isCreating ? text.creating : text.create}
          </button>
          <button type="button" className="ghost-action-button" onClick={onModalClose} disabled={isCreating}>
            {text.close}
          </button>
        </div>

        {safeFoundOrders.length > 0 ? (
          <div className="modal-preview">
            <span>{text.selectOrders}</span>
            <div className="order-match-list">
              {safeFoundOrders.map((item) => (
                <label key={item.order_id} className="order-match-item">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedOrderIds[item.order_id])}
                    onChange={(event) =>
                      setSelectedOrderIds((prev) => ({
                        ...prev,
                        [item.order_id]: event.target.checked
                      }))
                    }
                  />
                  <b>{item.order_id}</b>
                  <p>{(item.title || "-").slice(0, 240)}</p>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {message ? <p className="subtitle">{message}</p> : null}
      </section>
    </div>
  );
}
