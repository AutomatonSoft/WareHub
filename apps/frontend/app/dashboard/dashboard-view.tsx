"use client";

import React from "react";
import Image from "next/image";
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { labels, Lang } from "../i18n";
import { parseOrderIdFromQr, parsePhotoUrls, resolvePhotoUrl } from "../client-api";
import { MAIN_CATEGORIES, MainCategory, SUBCATEGORIES_BY_MAIN } from "./category-map";
import { IntakePreview } from "./intake-preview";
import { inactiveDaysLeft, intakeIsActive } from "./intake-status";
import { IntakeGroup } from "./types";

type DashboardViewProps = {
  apiBase: string;
  groupedIntakes: IntakeGroup[];
  resolvedMobileApkUrl: string;
  mobileAppName: string;
  lang: Lang;
  intakeQuery: string;
  intakeSection: "all" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "M";
  intakeActivity: "all" | "active" | "inactive";
  intakeCategoryMain: "all" | MainCategory;
  intakeCategorySub: string;
  onIntakeQueryChange: (value: string) => void;
  onIntakeSectionChange: (value: "all" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "M") => void;
  onIntakeActivityChange: (value: "all" | "active" | "inactive") => void;
  onIntakeCategoryMainChange: (value: "all" | MainCategory) => void;
  onIntakeCategorySubChange: (value: string) => void;
  hasMoreIntakes: boolean;
  loadingIntakes: boolean;
  loadingMoreIntakes: boolean;
  onLoadMoreIntakes: () => void | Promise<void>;
  deletingId: string | null;
  onOpenCreate: () => void;
  onOpenItem: (id: string) => void;
  onDeleteGroup: (group: IntakeGroup) => void | Promise<void>;
};

export function DashboardView({
  apiBase,
  groupedIntakes,
  resolvedMobileApkUrl,
  mobileAppName,
  lang,
  intakeQuery,
  intakeSection,
  intakeActivity,
  intakeCategoryMain,
  intakeCategorySub,
  onIntakeQueryChange,
  onIntakeSectionChange,
  onIntakeActivityChange,
  onIntakeCategoryMainChange,
  onIntakeCategorySubChange,
  hasMoreIntakes,
  loadingIntakes,
  loadingMoreIntakes,
  onLoadMoreIntakes,
  deletingId,
  onOpenCreate,
  onOpenItem,
  onDeleteGroup
}: DashboardViewProps) {
  const t = labels[lang];
  const subcategoryOptions = React.useMemo(
    () => (intakeCategoryMain === "all" ? [] : SUBCATEGORIES_BY_MAIN[intakeCategoryMain]),
    [intakeCategoryMain]
  );
  const filteredGroups = groupedIntakes.filter((group) => {
    if (intakeCategoryMain === "all") {
      return true;
    }
    if (group.representative.category_main !== intakeCategoryMain) {
      return false;
    }
    if (intakeCategorySub === "all") {
      return true;
    }
    return group.representative.category_sub === intakeCategorySub;
  });

  return (
    <section className="card dashboard-card">
      <header className="dashboard-header">
        <div>
          <div className="brand-row">
            <Image className="brand-logo" src="/brand/logo.png" alt={t.brandLogoAlt} width={44} height={44} />
          </div>
          <div className="hero-chip-row">
            <span className="hero-chip">{t.liveWarehouse}</span>
            <span className="hero-chip hero-chip-soft">
              {groupedIntakes.length} {t.groups}
            </span>
          </div>
          <h1>{t.dashboardTitle}</h1>
          <p className="subtitle">{t.dashboardSub}</p>
        </div>
        <div className="dashboard-header-actions">
          {resolvedMobileApkUrl ? (
            <a
              href={resolvedMobileApkUrl}
              target="_blank"
              rel="noreferrer"
              className="link-button"
              title={`${t.downloadApp} ${mobileAppName} Android APK`}
            >
              <Download size={14} aria-hidden="true" />
              {t.downloadApp}
            </a>
          ) : null}
          <button type="button" onClick={onOpenCreate}>
            <Plus size={14} aria-hidden="true" style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
            {t.addItem}
          </button>
        </div>
      </header>
      <div className="intakes-toolbar">
        <div className="intakes-toolbar-field intakes-toolbar-search">
          <label htmlFor="intakes-search">{t.search}</label>
          <input
            id="intakes-search"
            value={intakeQuery}
            onChange={(event) => onIntakeQueryChange(event.target.value)}
            placeholder={t.searchIntakesPlaceholder}
            aria-label={t.search}
          />
          <Search size={14} aria-hidden="true" className="toolbar-search-icon" />
        </div>
        <div className="intakes-toolbar-field">
          <label htmlFor="intakes-section">{t.section}</label>
          <select
            id="intakes-section"
            className="ui-select admin-select"
            value={intakeSection}
            onChange={(event) =>
              onIntakeSectionChange(
                event.target.value as "all" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "M"
              )
            }
          >
            <option value="all">{t.allSections}</option>
            {["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "M"].map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>
        <div className="intakes-toolbar-field">
          <label htmlFor="intakes-activity">{t.activity}</label>
          <select
            id="intakes-activity"
            className="ui-select admin-select"
            value={intakeActivity}
            onChange={(event) =>
              onIntakeActivityChange(event.target.value as "all" | "active" | "inactive")
            }
          >
            <option value="all">{t.allActivities}</option>
            <option value="active">{t.active}</option>
            <option value="inactive">{t.inactive}</option>
          </select>
        </div>
        <div className="intakes-toolbar-field">
          <label htmlFor="intakes-category-main">{t.category}</label>
          <select
            id="intakes-category-main"
            className="ui-select admin-select"
            value={intakeCategoryMain}
            onChange={(event) =>
              onIntakeCategoryMainChange(event.target.value as "all" | MainCategory)
            }
          >
            <option value="all">{t.allCategories}</option>
            {MAIN_CATEGORIES.map((main) => (
              <option key={main} value={main}>
                {main}
              </option>
            ))}
          </select>
        </div>
        <div className="intakes-toolbar-field">
          <label htmlFor="intakes-category-sub">{t.subcategory}</label>
          <select
            id="intakes-category-sub"
            className="ui-select admin-select"
            value={intakeCategorySub}
            onChange={(event) => onIntakeCategorySubChange(event.target.value)}
            disabled={intakeCategoryMain === "all"}
          >
            <option value="all">{t.allSubcategories}</option>
            {subcategoryOptions.map((subcategory) => (
              <option key={subcategory} value={subcategory}>
                {subcategory}
              </option>
            ))}
          </select>
        </div>
      </div>
      <section className="intakes-section">
        {filteredGroups.length === 0 ? (
          <p>{t.noIntakes}</p>
        ) : (
          <div className="intakes-list">
            {filteredGroups.map((group, index) => {
              const item = group.representative;
              const photos = parsePhotoUrls(item.photo_url).map((url) => resolvePhotoUrl(apiBase, url));
              const orderId = item.order_id ?? parseOrderIdFromQr(item.qr_code) ?? "-";
              const productTitle =
                item.product_title ??
                item.product_key ??
                item.qr_code;
              const compactKid = item.kid_number.replace(/^KID-/i, "");
              const internalIndex = item.internal_index ?? `1-${compactKid}-${orderId}`;
              const isActive = intakeIsActive(item);
              const daysLeft = inactiveDaysLeft(item);
              return (
                <article
                  className={`intake-item${isActive ? "" : " intake-item-removed"}`}
                  key={group.key}
                  style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenItem(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenItem(item.id);
                    }
                  }}
                >
                  <div className="intake-image-wrap">
                    <IntakePreview photos={photos} t={t} />
                  </div>
                  <div className="intake-content">
                    <div className="intake-top">
                      <strong>{productTitle}</strong>
                      <div className="intake-actions">
                        <div className="intake-status-badges">
                          <span className={`intake-status-badge ${isActive ? "intake-status-active" : "intake-status-inactive"}`}>
                            {isActive ? t.active : t.inactive}
                          </span>
                          {!isActive ? (
                            <span className="intake-status-badge intake-status-expiry">
                              {daysLeft === 0
                                ? t.autoDeleteExpired
                                : t.autoDeleteIn.replace("{days}", String(daysLeft ?? 30))}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="danger-icon-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onDeleteGroup(group);
                          }}
                          disabled={deletingId === group.key}
                          aria-label={t.delete}
                          title={t.delete}
                        >
                          {deletingId === group.key ? (
                            <span className="danger-icon-text">{t.deleting}</span>
                          ) : (
                            <Trash2 size={16} aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="intake-grid">
                      <div>
                        <span>{t.index}</span>
                        <b>{internalIndex}</b>
                      </div>
                      <div>
                        <span>{t.sku}</span>
                        <b>{item.product_sku || "-"}</b>
                      </div>
                      <div>
                        <span>{t.kid}</span>
                        <b>{item.kid_number || "-"}</b>
                      </div>
                      <div>
                        <span>{t.price}</span>
                        <b>{item.product_price || "-"}</b>
                      </div>
                      <div>
                        <span>{t.size}</span>
                        <b>{item.product_size || "-"}</b>
                      </div>
                      <div>
                        <span>{t.color}</span>
                        <b>{item.product_color || "-"}</b>
                      </div>
                      <div>
                        <span>{t.bWare}</span>
                        <b>{item.is_b_ware ? t.yes : t.no}</b>
                      </div>
                      <div>
                        <span>{t.bWareComment}</span>
                        <b>{item.b_ware_comment || "-"}</b>
                      </div>
                      <div>
                        <span>{t.category}</span>
                        <b>
                          {item.category_main
                            ? item.category_sub
                              ? `${item.category_main} / ${item.category_sub}`
                              : item.category_main
                            : "-"}
                        </b>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {filteredGroups.length > 0 && hasMoreIntakes ? (
          <div className="intakes-footer">
            <button
              type="button"
              className="ghost-action-button"
              onClick={() => void onLoadMoreIntakes()}
              disabled={loadingIntakes || loadingMoreIntakes}
            >
              {loadingMoreIntakes ? t.loading : t.loadMore}
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
}
