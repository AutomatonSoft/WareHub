"use client";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { ProductEditorEbayDraft, ProductEditorWarning } from "./product-editor-types";

type Props = {
  draft: ProductEditorEbayDraft;
  accountLabel: string;
  warnings: ProductEditorWarning[];
  loading: boolean;
  applyLoading: boolean;
  changedFields: string[];
  onChange: (patch: Partial<ProductEditorEbayDraft>) => void;
  onApply: () => void;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
};

export function ProductEditorEbayPanel(props: Props) {
  const canApply = props.isEanValid && props.changedFields.length > 0 && !props.loading && !props.applyLoading;

  return (
    <div className="space-y-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 space-y-1.5 text-sm font-medium">
          EAN
          <Input value={props.eanValue} onChange={(event) => props.onChangeEan(event.target.value)} placeholder="EAN" />
        </label>
        <Button type="button" variant="outline" onClick={props.onSearch} disabled={!props.isEanValid || props.searching}>
          {props.searching ? "Loading" : "Load eBay listing"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium">
          Account
          <Input value={props.accountLabel} readOnly />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Listing mode
          <select
            className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm"
            value={props.draft.ebay_listing_mode}
            onChange={(event) => props.onChange({ ebay_listing_mode: event.target.value === "legacy" ? "legacy" : "inventory" })}
          >
            <option value="inventory">Inventory</option>
            <option value="legacy">Legacy FixedPriceItem</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Legacy Item ID
          <Input value={props.draft.ebay_item_id} onChange={(event) => props.onChange({ ebay_item_id: event.target.value })} placeholder="Required for legacy listings outside the first page" />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Variation SKU
          <Input value={props.draft.ebay_variation_sku} onChange={(event) => props.onChange({ ebay_variation_sku: event.target.value })} placeholder="Only for legacy variations" />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Price
          <Input inputMode="decimal" value={props.draft.price} onChange={(event) => props.onChange({ price: event.target.value })} />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          Quantity
          <Input inputMode="numeric" value={props.draft.quantity} onChange={(event) => props.onChange({ quantity: event.target.value })} />
        </label>
      </div>

      {props.warnings.map((warning) => <p key={warning.code} className="text-sm text-amber-700">{warning.message}</p>)}
      <p className="text-xs text-muted-foreground">Legacy listings require the eBay Item ID when they are not found on the first active-listings page.</p>
      <Button type="button" onClick={props.onApply} disabled={!canApply}>
        {props.applyLoading ? "Applying" : "Review and apply eBay changes"}
      </Button>
    </div>
  );
}
