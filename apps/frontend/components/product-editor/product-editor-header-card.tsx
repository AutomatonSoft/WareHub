"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../../lib/cn";
import { useLabels } from "../../app/use-labels";
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
  onEdit: () => void;
  canEdit: boolean;
  children?: ReactNode;
}) {
  const t = useLabels();
  return (
    <div className={cn("wh-product-editor-anchor space-y-[12px]", props.className)}>
      <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_184px_auto]">
          <label htmlFor="product-editor-ean-command" className="sr-only">
            {t.productEditorHeaderInputLabel}
          </label>
          <Input
            id="product-editor-ean-command"
            value={props.eanInput}
            onChange={(event) => props.onChangeEan(event.target.value)}
            placeholder={t.productEditorHeaderInputPlaceholder}
            maxLength={100}
            className="h-10 w-full bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary/35"
          />
          <Button type="button" className="wh-discover-button h-10 w-full text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary/35" disabled={!props.isEanValid || props.discovering} onClick={props.onSearch}>
            {props.discovering ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
            {t.productEditorDiscoverProductAction}
          </Button>
          <Button type="button" variant="outline" className="h-10" disabled={!props.canEdit || props.discovering} onClick={props.onEdit}>
            Edit
          </Button>
      </div>
      {props.children ? <div>{props.children}</div> : null}
    </div>
  );
}

