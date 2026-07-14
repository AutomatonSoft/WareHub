"use client";

import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import type { KauflandProductPayload } from "./kaufland-panel-types";

type Props = {
  form: KauflandProductPayload;
  onSetForm: (updater: (previous: KauflandProductPayload) => KauflandProductPayload) => void;
};

const JSON_FIELDS: Array<[keyof KauflandProductPayload, string]> = [
  ["category", "Category (JSON array)"],
  ["short_description", "Short description (JSON array)"],
  ["picture", "Pictures (JSON array)"],
  ["product_safety_contact", "Product safety contact (JSON array)"],
  ["category_detail", "Category detail (JSON array)"],
];

const TEXT_FIELDS: Array<[keyof KauflandProductPayload, string]> = [
  ["title", "Title"], ["mpn", "MPN"], ["manufacturer", "Manufacturer"], ["product_dimensions", "Product dimensions"],
  ["colour", "Colour"], ["material", "Material"], ["length", "Length"], ["width", "Width"], ["height", "Height"],
  ["storefront", "Storefront"], ["material_composition", "Material composition"], ["abnehmbarer_bezug", "Removable cover"],
  ["parts_of_animal_origin", "Parts of animal origin"], ["price", "Price"], ["unit_id", "Unit ID"],
];

export function KauflandProductFields({ form, onSetForm }: Props) {
  const change = (field: keyof KauflandProductPayload, value: string) => onSetForm((previous) => ({ ...previous, [field]: value }));
  return (
    <>
      {TEXT_FIELDS.map(([field, label]) => <Input key={field} placeholder={label} value={form[field]} onChange={(event) => change(field, event.target.value)} />)}
      <Textarea className="min-h-[120px] bg-muted/30 md:col-span-2" placeholder="Description" value={form.description} onChange={(event) => change("description", event.target.value)} />
      {JSON_FIELDS.map(([field, label]) => <Textarea key={field} className="min-h-[90px] bg-muted/30 md:col-span-2" placeholder={label} value={form[field]} onChange={(event) => change(field, event.target.value)} />)}
    </>
  );
}
