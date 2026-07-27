"use client";

import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, CircleCheckBig, ClipboardCheck, LoaderCircle, PackageSearch, ScanLine, ScanSearch, SearchX, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useLabels } from "../../app/use-labels";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { FormField } from "../ui/form-field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/cn";
import { findGroup, getGroupStatusCopy } from "./product-editor-model";
import { productEditorEmptyContainer, productEditorEmptyHero, productEditorEmptyItem } from "./product-editor-empty-motion";
import type { ProductEditorDiscoverResponse, ProductEditorGroupId } from "./product-editor-types";

export function ProductEditorPlaceholderPanel({
  groupId,
  discover,
  title,
  subtitle,
  details
}: {
  groupId: ProductEditorGroupId;
  discover: ProductEditorDiscoverResponse | null;
  title: string;
  subtitle: string;
  details: string[];
}) {
  const t = useLabels();
  const group = findGroup(discover, groupId);
  const foundCount = group?.targets.filter((target) => target.status === "found").length ?? 0;
  const totalCount = group?.targets.length ?? 0;
  return (
    <Card className="wh-product-editor-card min-h-full w-full border-border bg-card shadow-[var(--wh-shadow-card)]">
      <CardContent className="grid gap-4 pt-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
          <h2 className="text-lg font-semibold text-foreground">{subtitle}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t.productEditorPlaceholderNonActionable}</p>
          <div className="mt-3 flex flex-col gap-2">
            {details.map((detail) => (
              <div key={detail} className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {detail}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/50 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t.productEditorCurrentRollout}</div>
          <div className="mt-2 text-sm font-medium text-foreground">{getGroupStatusCopy(group)}</div>
          <div className="mt-2 text-sm text-muted-foreground">
            {group ? t.productEditorFoundTargets.replace("{found}", String(foundCount)).replace("{total}", String(totalCount)) : t.productEditorDiscoverTargetsFirst}
          </div>
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            {t.productEditorApplyUnavailable}
          </div>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            {group?.targets.map((target) => (
              <div key={target.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <span className="font-medium text-foreground">{target.label}</span>
                <span>{target.status}</span>
              </div>
            )) ?? t.productEditorTargetsAppearAfterSearch}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProductEditorEmptyPanel({
  title,
  body,
  eanValue,
  isEanValid,
  searching,
  onChangeEan,
  onSearch,
  discoveryItems = []
}: {
  title: string;
  body: string;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
  discoveryItems?: Array<{
    label: string;
    ean: string;
    status: "idle" | "loading" | "found" | "missing" | "unavailable" | "error";
  }>;
}) {
  const t = useLabels();
  const reducedMotion = useReducedMotion();
  const motionState = reducedMotion ? false : "hidden";
  const steps = [
    { icon: ScanSearch, label: t.productEditorEmptyStep1, detail: "Use an EAN, SKU, or product identifier." },
    { icon: PackageSearch, label: t.productEditorEmptyStep2, detail: "We will resolve matching marketplace targets." },
    { icon: ClipboardCheck, label: t.productEditorEmptyStep3, detail: "Review the form, then publish only when ready." }
  ];
  const workspacePreviews = [
    { title: t.productEditorSummarySection, detail: "Title, images, price, and product attributes", icon: PackageSearch },
    { title: t.productEditorMarketplaceMatrixSection, detail: "Targets and availability across marketplaces", icon: ScanSearch },
    { title: t.productEditorEditableFieldsSection, detail: "Edit, review, and apply your changes", icon: ClipboardCheck }
  ];
  const visibleDiscoveryItems = discoveryItems.length > 0
    ? discoveryItems
    : ["JV", "XL", "HOOD", "KAUFLAND"].map((label) => ({ label, ean: "", status: "idle" as const }));
  const getDiscoveryDetail = (item: (typeof visibleDiscoveryItems)[number]) => {
    if (!item.ean) return t.productEditorDiscoveryNoEan;
    if (item.status === "loading") return t.productEditorDiscoverySearching.replace("{ean}", item.ean);
    if (item.status === "found") return t.productEditorDiscoveryFound;
    if (item.status === "missing") return t.productEditorDiscoveryNotFound.replace("{ean}", item.ean);
    if (item.status === "unavailable") return t.productEditorDiscoveryUnavailable;
    if (item.status === "error") return t.productEditorDiscoveryFailed;
    return t.productEditorDiscoveryQueued;
  };
  const getDiscoveryPresentation = (item: (typeof visibleDiscoveryItems)[number]) => {
    if (!item.ean) {
      return { title: "No EAN assigned", badge: "No EAN", icon: CircleAlert, iconClass: "bg-amber-100 text-amber-700", surfaceClass: "border-amber-200 bg-amber-50/60", badgeClass: "bg-amber-100 text-amber-800", dotClass: "bg-amber-500" };
    }
    if (item.status === "loading") {
      return { title: "Searching this marketplace", badge: "Searching", icon: LoaderCircle, iconClass: "bg-sky-100 text-sky-700", surfaceClass: "border-sky-200 bg-sky-50/60", badgeClass: "bg-sky-100 text-sky-800", dotClass: "bg-sky-500" };
    }
    if (item.status === "found") {
      return { title: "Product found", badge: "Found", icon: CircleCheckBig, iconClass: "bg-emerald-100 text-emerald-700", surfaceClass: "border-emerald-200 bg-emerald-50/60", badgeClass: "bg-emerald-100 text-emerald-800", dotClass: "bg-emerald-500" };
    }
    if (item.status === "missing") {
      return { title: "No matching product", badge: "Not found", icon: SearchX, iconClass: "bg-rose-100 text-rose-700", surfaceClass: "border-rose-200 bg-rose-50/60", badgeClass: "bg-rose-100 text-rose-800", dotClass: "bg-rose-500" };
    }
    if (item.status === "unavailable") {
      return { title: "Marketplace lookup unavailable", badge: "Unavailable", icon: CircleAlert, iconClass: "bg-amber-100 text-amber-700", surfaceClass: "border-amber-200 bg-amber-50/60", badgeClass: "bg-amber-100 text-amber-800", dotClass: "bg-amber-500" };
    }
    if (item.status === "error") {
      return { title: "Could not complete the check", badge: "Check failed", icon: CircleAlert, iconClass: "bg-rose-100 text-rose-700", surfaceClass: "border-rose-200 bg-rose-50/60", badgeClass: "bg-rose-100 text-rose-800", dotClass: "bg-rose-500" };
    }
    return { title: "Ready to search", badge: "Queued", icon: ScanLine, iconClass: "bg-slate-100 text-slate-700", surfaceClass: "border-slate-200 bg-slate-50/60", badgeClass: "bg-slate-100 text-slate-700", dotClass: "bg-slate-400" };
  };
  const activeDiscoveryPresentation = getDiscoveryPresentation(visibleDiscoveryItems[0]);

  return (
    <Card className="wh-product-editor-card min-h-full w-full overflow-hidden border-border bg-card shadow-[var(--wh-shadow-card)]">
      <CardContent className="flex min-h-full items-start py-7 sm:py-8">
        <motion.div
          className="mx-auto grid w-full max-w-6xl gap-4 text-center"
          variants={productEditorEmptyContainer}
          initial={motionState}
          animate="visible"
        >
          <motion.div variants={productEditorEmptyItem} className="mx-auto flex w-full max-w-2xl items-center gap-2 rounded-[var(--radius-card)] border border-border/80 bg-muted/20 p-1.5 shadow-sm">
            <Input
              value={eanValue}
              onChange={(event) => onChangeEan(event.target.value)}
              placeholder={t.productEditorSearchPlaceholder}
              maxLength={100}
              className="h-11 rounded-[var(--radius-control)] border-0 bg-background shadow-none focus-visible:ring-1"
              onKeyDown={(event) => {
                if (event.key === "Enter" && isEanValid && !searching) {
                  event.preventDefault();
                  onSearch();
                }
              }}
            />
            <Button
              type="button"
              onClick={onSearch}
              disabled={!isEanValid || searching}
              className="h-11 shrink-0 rounded-[var(--radius-control)] px-5 text-sm font-semibold shadow-sm"
            >
              {searching ? t.searching : t.productEditorDiscoverAction}
            </Button>
          </motion.div>
          <motion.section variants={productEditorEmptyHero} className="grid overflow-hidden rounded-[var(--radius-card)] border border-border/80 bg-muted/20 text-left shadow-sm lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex flex-col items-center justify-center px-5 py-6 text-center sm:px-8">
              <div className="relative mb-4 flex h-24 w-24 items-center justify-center">
                <span className="wh-editor-empty__halo absolute inset-2 rounded-3xl bg-primary/10" aria-hidden="true" />
                <span className="wh-editor-empty__orbit absolute inset-0 rounded-full border border-dashed border-primary/35" aria-hidden="true">
                  <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-card bg-primary shadow-sm" />
                  <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-emerald-400" />
                </span>
                <div className="wh-editor-empty__float relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-card text-primary shadow-md">
                  <PackageSearch className="h-6 w-6" aria-hidden="true" />
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card bg-emerald-500">
                    <CheckCircle2 className="h-2.5 w-2.5 text-white" aria-hidden="true" />
                  </span>
                </div>
              </div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Workspace ready
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t.productEditorNoProductLoaded}</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{t.productEditorEmptyDescription}</p>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{body}</p>
            </div>
            <div className="relative flex min-h-52 flex-col overflow-hidden border-t border-border/80 bg-card p-5 lg:border-l lg:border-t-0">
              <div className="wh-editor-empty__scan pointer-events-none absolute inset-x-4 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent" />
              <div className="relative flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Discovery status</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{activeDiscoveryPresentation.title}</p>
                </div>
                <span className={cn("flex h-2.5 w-2.5 rounded-full shadow-[0_0_0_4px_hsl(var(--primary)/0.08)]", activeDiscoveryPresentation.dotClass)} aria-label={activeDiscoveryPresentation.badge} />
              </div>
              <div className="relative mt-5 flex flex-1 flex-col gap-2">
                {visibleDiscoveryItems.map((item) => {
                  const presentation = getDiscoveryPresentation(item);
                  const Icon = presentation.icon;
                  return (
                  <div key={item.label} className={cn("relative flex min-h-32 flex-1 items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border px-4 py-4", presentation.surfaceClass)}>
                    <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/40" aria-hidden="true" />
                    <span className={cn("relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm", presentation.iconClass)}>
                      <Icon className={cn("h-5 w-5", item.status === "loading" && "animate-spin")} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{item.label}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", presentation.badgeClass)}>{presentation.badge}</span>
                      </div>
                      {item.ean ? <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">EAN · {item.ean}</p> : null}
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{getDiscoveryDetail(item)}</p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </motion.section>
          <motion.div variants={productEditorEmptyItem} className="rounded-[var(--radius-card)] border border-border/80 bg-muted/20 p-3 text-left">
            <div className="wh-editor-empty__flow relative mx-5 mb-1 hidden h-4 md:block" aria-hidden="true">
              <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
              <span className="wh-editor-empty__flow-signal absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.1),0_0_18px_hsl(var(--primary)/0.65)]" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
            {steps.map(({ icon: Icon, label, detail }, index) => (
              <motion.div
                key={label}
                variants={productEditorEmptyItem}
                whileHover={reducedMotion ? undefined : { y: -3, scale: 1.01 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="group rounded-[var(--radius-control)] border border-border/80 bg-background p-3 transition-colors duration-200 hover:border-primary/30 hover:bg-primary/[0.03]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{index + 1}</span>
                  <Icon className="h-4 w-4 text-muted-foreground transition-colors duration-200 group-hover:text-primary" aria-hidden="true" />
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
              </motion.div>
            ))}
            </div>
          </motion.div>
          <motion.div variants={productEditorEmptyItem} className="grid gap-3 pt-1 md:grid-cols-3">
            {workspacePreviews.map(({ title: previewTitle, detail, icon: Icon }) => (
              <motion.div
                key={previewTitle}
                variants={productEditorEmptyItem}
                whileHover={reducedMotion ? undefined : { y: -4, scale: 1.015 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="rounded-[var(--radius-card)] border border-border/80 bg-background p-4 text-left shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-primary/30 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">Ready</span>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-foreground">{previewTitle}</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{detail}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </CardContent>
    </Card>
  );
}

export function ProductEditorSummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm" className="min-h-14 rounded-[var(--radius-control)] border-border bg-muted/30 py-2 shadow-none">
      <CardContent className="px-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-sm font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

export function ProductEditorPanelLayout(props: {
  kicker: string;
  title: string;
  subtitle?: string;
  changedCount: number;
  status?: string;
  hideHeaderBadges?: boolean;
  headerLead?: ReactNode;
  headerActions?: ReactNode;
  topLeft: ReactNode;
  topRight: ReactNode;
  description: ReactNode;
  bottom: ReactNode;
}) {
  const t = useLabels();
  const reducedMotion = useReducedMotion();

  return (
    <div className="rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
      <motion.div
        className="mb-4 flex flex-wrap items-end justify-between gap-3"
        initial={reducedMotion ? false : { opacity: 0, y: -8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {props.headerLead ? (
          <div className="min-w-0 flex-1">{props.headerLead}</div>
        ) : (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{props.kicker}</p>
            <CardTitle className="mt-1 text-base">{props.title}</CardTitle>
            {props.subtitle ? <CardDescription>{props.subtitle}</CardDescription> : null}
          </div>
        )}
        {props.headerActions ? (
          <div className="flex flex-wrap items-center gap-1.5">{props.headerActions}</div>
        ) : !props.hideHeaderBadges ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{t.productEditorChangedBadge.replace("{count}", String(props.changedCount))}</Badge>
            {props.status ? <Badge variant="outline">{props.status}</Badge> : null}
          </div>
        ) : null}
      </motion.div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <motion.section
          className="min-w-0 flex-1"
          initial={reducedMotion ? false : { opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.05 }}
          transition={{ duration: 0.38, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          {props.topLeft}
        </motion.section>
        <motion.aside
          className="w-full min-w-0 xl:ml-auto xl:w-[520px] xl:flex-none"
          initial={reducedMotion ? false : { opacity: 0, x: 16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.05 }}
          transition={{ duration: 0.38, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          {props.topRight}
        </motion.aside>
      </div>
    </div>
  );
}

export function ProductEditorSection({
  title,
  subtitle,
  actions,
  children,
  className
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {title || subtitle || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {title ? <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ProductEditorFieldGrid({
  columns = "2",
  children,
  className
}: {
  columns?: "2" | "3";
  children: ReactNode;
  className?: string;
}) {
  const columnsClass = columns === "3" ? "grid gap-2 md:grid-cols-3" : "grid gap-2 md:grid-cols-2";
  return <div className={cn(columnsClass, className)}>{children}</div>;
}

export function ProductEditorTextField({
  label,
  value,
  onChange,
  placeholder,
  readOnly = false,
  className
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <FormField label={label} className={className}>
      <Input
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className={readOnly ? "bg-muted text-muted-foreground" : undefined}
      />
    </FormField>
  );
}

export function ProductEditorTextarea({
  label,
  value,
  onChange,
  rows = 8,
  placeholder,
  readOnly = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <FormField label={label}>
      <Textarea
        rows={rows}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn("font-mono text-xs", readOnly ? "bg-muted text-muted-foreground" : undefined)}
      />
    </FormField>
  );
}

export function ProductEditorReadonlyPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-[11px]">
      <span className="font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

export {
  ProductEditorDescriptionEditor,
  ProductEditorGalleryPanel,
  ProductEditorAttributesEditor
} from "./product-editor-content-sections";

