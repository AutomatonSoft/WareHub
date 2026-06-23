"use client";

import type { ReactNode } from "react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { FormField } from "../ui/form-field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/cn";
import { findGroup, getGroupStatusCopy } from "./product-editor-model";
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
  const group = findGroup(discover, groupId);
  const foundCount = group?.targets.filter((target) => target.status === "found").length ?? 0;
  const totalCount = group?.targets.length ?? 0;
  return (
    <Card className="wh-product-editor-card border-border bg-card shadow-[var(--wh-shadow-card)]">
      <CardContent className="grid gap-4 pt-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
          <h2 className="text-lg font-semibold text-foreground">{subtitle}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">This tab is intentionally non-actionable in the current rollout.</p>
          <div className="mt-3 flex flex-col gap-2">
            {details.map((detail) => (
              <div key={detail} className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {detail}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/50 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current rollout</div>
          <div className="mt-2 text-sm font-medium text-foreground">{getGroupStatusCopy(group)}</div>
          <div className="mt-2 text-sm text-muted-foreground">
            {group ? `${foundCount} found / ${totalCount} total targets` : "Discover first to inspect targets."}
          </div>
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            Apply is intentionally unavailable for this tab in the current phase.
          </div>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            {group?.targets.map((target) => (
              <div key={target.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <span className="font-medium text-foreground">{target.label}</span>
                <span>{target.status}</span>
              </div>
            )) ?? "After search, target cards for this tab will appear here."}
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
  onSearch
}: {
  title: string;
  body: string;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
}) {
  return (
    <Card className="wh-product-editor-card border-border bg-card shadow-[var(--wh-shadow-card)]">
      <CardContent className="py-8">
        <div className="mx-auto grid w-full max-w-4xl gap-5 text-center">
          <div className="mx-auto flex w-full max-w-xl items-center gap-2">
            <Input
              value={eanValue}
              onChange={(event) => onChangeEan(event.target.value)}
              placeholder="Enter 13-digit EAN for this tab"
              className="h-11 rounded-[var(--radius-control)] border-border bg-background"
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
              variant="outline"
              className="h-11 shrink-0 rounded-[var(--radius-control)] px-4 text-sm font-semibold"
            >
              {searching ? "Searching..." : "Discover"}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
            <h2 className="text-2xl font-semibold leading-tight text-foreground">No product loaded</h2>
            <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">Enter an EAN here and run discovery to resolve marketplace targets for this tab.</p>
            <p className="mx-auto max-w-xl text-xs leading-5 text-muted-foreground">{body}</p>
          </div>
          <div className="grid gap-2 rounded-[var(--radius-card)] border border-border bg-muted/25 p-3 text-left text-xs text-muted-foreground sm:grid-cols-3">
            <span className="rounded-[var(--radius-control)] border border-border/80 bg-background px-3 py-2">1 Enter EAN - Input product identifier</span>
            <span className="rounded-[var(--radius-control)] border border-border/80 bg-background px-3 py-2">2 Discover targets - Resolve across marketplaces</span>
            <span className="rounded-[var(--radius-control)] border border-border/80 bg-background px-3 py-2">3 Apply through Orchestrator - Edit and publish changes</span>
          </div>
          <div className="grid gap-3 pt-1 md:grid-cols-3">
            {["Product Summary", "Marketplace Matrix", "Editable Fields"].map((section) => (
              <div key={section} className="rounded-[var(--radius-control)] border border-border bg-muted/20 p-3 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{section}</p>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="h-3 w-4/5 rounded bg-muted" />
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-8 w-full rounded-lg bg-muted/80" />
                </div>
              </div>
            ))}
          </div>
        </div>
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
  headerActions?: ReactNode;
  topLeft: ReactNode;
  topRight: ReactNode;
  description: ReactNode;
  bottom: ReactNode;
}) {
  return (
    <Card className="wh-product-editor-card border-border bg-card shadow-[var(--wh-shadow-card)]">
      <CardHeader className="wh-card-header-divider pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{props.kicker}</p>
            <CardTitle className="mt-1 text-base">{props.title}</CardTitle>
            {props.subtitle ? <CardDescription>{props.subtitle}</CardDescription> : null}
          </div>
          {props.headerActions ? (
            <div className="flex flex-wrap items-center gap-1.5">{props.headerActions}</div>
          ) : !props.hideHeaderBadges ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">Changed {props.changedCount}</Badge>
              {props.status ? <Badge variant="outline">{props.status}</Badge> : null}
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
          <section className="min-w-0">{props.topLeft}</section>
          <aside className="min-w-0">{props.topRight}</aside>
        </div>
        <section>{props.description}</section>
        <section>{props.bottom}</section>
      </CardContent>
    </Card>
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

