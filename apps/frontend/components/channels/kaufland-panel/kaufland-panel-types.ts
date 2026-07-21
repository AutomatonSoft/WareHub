export type KauflandProductPayload = {
  ean: string;
  controller: "jv" | "xl";
  category: string;
  title: string;
  mpn: string;
  short_description: string;
  description: string;
  picture: string;
  manufacturer: string;
  product_dimensions: string;
  colour: string;
  length: string;
  width: string;
  height: string;
  material: string;
  storefront: string;
  product_safety_contact: string;
  category_detail: string;
  material_composition: string;
  abnehmbarer_bezug: string;
  parts_of_animal_origin: string;
  price: string;
  unit_id: string;
  picture_urls: string;
  size: string;
  color: string;
  delivery: string;
};

export const createEmptyKauflandProductPayload = (controller: "jv" | "xl" = "xl"): KauflandProductPayload => ({
  ean: "",
  controller,
  category: "[]",
  title: "",
  mpn: "",
  short_description: "[]",
  description: "",
  picture: "[]",
  manufacturer: "",
  product_dimensions: "",
  colour: "",
  length: "",
  width: "",
  height: "",
  material: "",
  storefront: "de",
  product_safety_contact: "[]",
  category_detail: "[]",
  material_composition: "",
  abnehmbarer_bezug: "",
  parts_of_animal_origin: "",
  price: "",
  unit_id: "",
  picture_urls: "[]",
  size: "",
  color: "",
  delivery: "",
});

export type KauflandChangePayload = KauflandProductPayload;
export type KauflandCreatePayload = KauflandProductPayload;
