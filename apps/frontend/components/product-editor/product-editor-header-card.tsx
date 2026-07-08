"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { Toolbar } from "../ui/toolbar";
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
  children?: ReactNode;
}) {
  return (
    <Card className={cn("wh-product-editor-anchor border-border bg-card shadow-[var(--wh-shadow-card)]", props.className)}>
      <CardHeader className="border-b border-border/80 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-tight text-foreground">Product discovery</p>
            <CardDescription className="text-sm">Enter EAN, SKU or product identifier to resolve marketplace targets.</CardDescription>
          </div>
          <Badge variant="secondary" className="wh-orchestrator-badge h-7 border border-primary/25 bg-primary/10 px-3 text-[11px] font-semibold uppercase tracking-normal text-primary">Orchestrator-only</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid gap-2">
          <div className="space-y-2.5">
            <Toolbar className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_184px]">
              <label htmlFor="product-editor-ean-command" className="sr-only">
                Enter EAN, SKU or product identifier
              </label>
              <Input
                id="product-editor-ean-command"
                value={props.eanInput}
                onChange={(event) => props.onChangeEan(event.target.value)}
                placeholder="Enter EAN, SKU or product ID"
                maxLength={100}
                className="h-10 w-full bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary/35"
              />
              <Button type="button" className="wh-discover-button h-10 w-full text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary/35" disabled={!props.isEanValid || props.discovering} onClick={props.onSearch}>
                {props.discovering ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                Discover Product
              </Button>
            </Toolbar>
          </div>
        </div>
        {props.children ? (
          <>
            <Separator className="mt-4" />
            <div className="pt-4">{props.children}</div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

