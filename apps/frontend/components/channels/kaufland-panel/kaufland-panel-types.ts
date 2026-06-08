export type KauflandChangePayload = {
  ean: string;
  title: string;
  description: string;
  picture_urls: string;
  unit_id: string;
  storefront: string;
  price: string;
  controller: string;
};

export type KauflandCreatePayload = {
  ean: string;
  controller: "jv" | "xl";
  title: string;
  description: string;
  picture: string;
  price: string;
  size: string;
  color: string;
  material: string;
  delivery: string;
  height: string;
  length: string;
  width: string;
};

