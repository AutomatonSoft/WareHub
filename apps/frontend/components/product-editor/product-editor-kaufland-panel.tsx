"use client";

import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import type { ProductEditorKauflandDraft, ProductEditorWarning } from "./product-editor-types";

type Props = {
  draft: ProductEditorKauflandDraft;
  warnings: ProductEditorWarning[];
  loading: boolean;
  applyLoading: boolean;
  changedFields: string[];
  onChange: (patch: Partial<ProductEditorKauflandDraft>) => void;
  onApply: () => void;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
};

const textFields: Array<[keyof ProductEditorKauflandDraft, string]> = [
  ["title", "Title"], ["mpn", "MPN"], ["manufacturer", "Manufacturer"], ["product_dimensions", "Product dimensions"],
  ["colour", "Colour"], ["material", "Material"], ["length", "Length"], ["width", "Width"], ["height", "Height"],
  ["storefront", "Storefront"], ["material_composition", "Material composition"], ["abnehmbarer_bezug", "Removable cover"],
  ["parts_of_animal_origin", "Parts of animal origin"], ["price", "Price"], ["unit_id", "Unit ID"],
];

const jsonFields: Array<[keyof ProductEditorKauflandDraft, string]> = [
  ["category", "Category"], ["short_description", "Short description"], ["picture", "Pictures"],
  ["product_safety_contact", "Product safety contact"], ["category_detail", "Category detail"],
];

export function ProductEditorKauflandPanel(props: Props) {
  const setText = (field: keyof ProductEditorKauflandDraft, value: string) => props.onChange({ [field]: value } as Partial<ProductEditorKauflandDraft>);
  const setJson = (field: keyof ProductEditorKauflandDraft, value: string) => {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error("not array");
      props.onChange({ [field]: parsed } as Partial<ProductEditorKauflandDraft>);
    } catch {
      // Keep the current structured value until a valid JSON array is supplied.
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Kaufland product editor</CardTitle><CardDescription>Found targets are updated; missing targets are created only after applying the plan.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={props.eanValue} onChange={(event) => props.onChangeEan(event.target.value)} placeholder="Enter EAN" maxLength={100} />
            <Button type="button" variant="outline" disabled={!props.isEanValid || props.searching} onClick={props.onSearch}>{props.searching ? "Searching" : "Discover"}</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {textFields.map(([field, label]) => <Input key={field} value={String(props.draft[field] ?? "")} placeholder={label} onChange={(event) => setText(field, event.target.value)} />)}
          </div>
          <Textarea className="min-h-48" value={props.draft.description} placeholder="Description" onChange={(event) => setText("description", event.target.value)} />
          <div className="grid gap-3 md:grid-cols-2">
            {jsonFields.map(([field, label]) => <Textarea key={`${field}-${JSON.stringify(props.draft[field] ?? [])}`} className="min-h-28" defaultValue={JSON.stringify(props.draft[field] ?? [], null, 2)} placeholder={`${label} (JSON array)`} onBlur={(event) => setJson(field, event.target.value)} />)}
          </div>
          {props.warnings.map((warning) => <p key={warning.code} className="text-sm text-amber-700">{warning.message}</p>)}
          <Button type="button" disabled={props.loading || props.applyLoading || props.changedFields.length === 0} onClick={props.onApply}>
            {props.applyLoading ? "Applying" : "Review and apply Kaufland changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
