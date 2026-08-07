"use client";

import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { useLabels } from "../../../app/use-labels";
import type { KauflandProductPayload } from "./kaufland-panel-types";

type Props = {
  form: KauflandProductPayload;
  onSetForm: (updater: (previous: KauflandProductPayload) => KauflandProductPayload) => void;
};

const INTEGER_FIELDS = new Set<keyof KauflandProductPayload>(["price", "unit_id", "delivery"]);

export function KauflandProductFields({ form, onSetForm }: Props) {
  const t = useLabels();
  const jsonFields: Array<[keyof KauflandProductPayload, string]> = [
    ["category", t.kauflandCategoryJson],
    ["short_description", t.kauflandShortDescriptionJson],
    ["picture", t.kauflandPicturesJson],
    ["product_safety_contact", t.kauflandProductSafetyContactJson],
    ["category_detail", t.kauflandCategoryDetailJson],
    ["picture_urls", t.kauflandPictureUrlsJson],
  ];
  const textFields: Array<[keyof KauflandProductPayload, string]> = [
    ["title", t.title], ["mpn", "MPN"], ["manufacturer", t.manufacturer], ["product_dimensions", t.kauflandProductDimensions],
    ["colour", t.kauflandColour], ["material", t.material], ["length", t.length], ["width", t.width], ["height", t.height],
    ["storefront", t.kauflandStorefront], ["material_composition", t.kauflandMaterialComposition], ["abnehmbarer_bezug", t.kauflandRemovableCover],
    ["parts_of_animal_origin", t.kauflandAnimalOriginParts], ["price", t.price], ["unit_id", t.kauflandUnitId],
    ["size", t.size], ["color", t.color], ["delivery", t.kauflandDeliveryId],
  ];
  const change = (field: keyof KauflandProductPayload, value: string) => onSetForm((previous) => ({ ...previous, [field]: value }));
  return (
    <>
      {textFields.map(([field, label]) => <Input key={field} type={INTEGER_FIELDS.has(field) ? "number" : "text"} placeholder={label} value={form[field]} onChange={(event) => change(field, event.target.value)} />)}
      <Textarea className="min-h-[120px] bg-muted/30 md:col-span-2" placeholder={t.descriptionLabel} value={form.description} onChange={(event) => change("description", event.target.value)} />
      {jsonFields.map(([field, label]) => <Textarea key={field} className="min-h-[90px] bg-muted/30 md:col-span-2" placeholder={label} value={form[field]} onChange={(event) => change(field, event.target.value)} />)}
    </>
  );
}
