"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { StatusBadge } from "../ui/status-badge";
import { cn } from "../../lib/cn";
import type { ProductEditorDiscoverResponse } from "./product-editor-types";

export function ProductEditorHeaderCard(props: {
  className?: string;
  eanInput: string;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
  discovering: boolean;
  isEanValid: boolean;
  discover: ProductEditorDiscoverResponse | null;
  foundCount: number;
  missingCount: number;
  totalCount: number;
}) {
  return (
    <Card className={cn("wh-product-editor-anchor rounded-2xl border-border bg-white shadow-[0_10px_28px_-22px_rgba(15,23,42,0.35)]", props.className)}>
      <CardHeader className="border-b border-border/80 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold leading-tight">Product Editor</CardTitle>
            <CardDescription className="text-sm">Orchestrator-controlled workspace for centralized product editing across marketplaces.</CardDescription>
          </div>
          <Badge variant="secondary" className="wh-orchestrator-badge h-7 rounded-full border border-emerald-300/70 bg-emerald-50 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">Orchestrator-only</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid gap-2">
          <div className="space-y-2.5">
            <div className="space-y-1">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground">Product Discovery</p>
              <p className="text-xs text-muted-foreground">Enter EAN, SKU or product identifier to resolve marketplace targets.</p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_184px]">
              <label htmlFor="product-editor-ean-command" className="sr-only">
                Enter EAN, SKU or product identifier
              </label>
              <Input
                id="product-editor-ean-command"
                value={props.eanInput}
                onChange={(event) => props.onChangeEan(event.target.value)}
                placeholder="Enter EAN, SKU or product ID"
                className="h-11 w-full rounded-xl border-border bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary/35"
              />
              <Button type="button" className="wh-discover-button h-11 w-full rounded-xl text-sm font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-primary/35" disabled={!props.isEanValid || props.discovering} onClick={props.onSearch}>
                {props.discovering ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                Discover Product
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
            <StatusBadge tone="found">Found {props.foundCount}</StatusBadge>
            <StatusBadge tone="missing">Missing {props.missingCount}</StatusBadge>
            <StatusBadge tone="planned">Total {props.totalCount}</StatusBadge>
          </div>
        </div>
        <Separator className="mt-4" />
      </CardContent>
    </Card>
  );
}

