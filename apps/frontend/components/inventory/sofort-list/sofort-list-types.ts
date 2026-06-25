import type { ReactNode } from "react";

export type SofortListRow = {
  id: string;
  kidId: number;
  orderDbId: number | null;
  kidNumber: string;
  ean: string;
  siteEans: {
    jv: string;
    xl: string;
    ottoJv: string;
    ottoXl: string;
    ebayJv: string;
    ebayXl: string;
    kauflandJv: string;
    kauflandXl: string;
    hoodJv: string;
    hoodXl: string;
  };
  photo: string;
  photoCount: number;
  place: string;
  store: boolean;
  quantity: number;
  room: string | null;
  furnitureType: string | null;
  company: string | null;
  commentary: string | null;
  color: string | null;
  size: string | null;
  material: string | null;
  price: string | null;
  priceCurrency: string | null;
  listingStatus: "listed" | "unlisted";
};

export type HighlightText = (value: string, query: string) => string | ReactNode[];
