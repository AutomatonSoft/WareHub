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
  siteEanStatuses: {
    jv: boolean | null;
    xl: boolean | null;
    ottoJv: boolean | null;
    ottoXl: boolean | null;
    ebayJv: boolean | null;
    ebayXl: boolean | null;
    kauflandJv: boolean | null;
    kauflandXl: boolean | null;
    hoodJv: boolean | null;
    hoodXl: boolean | null;
  };
  photo: string;
  photoUrls: string[];
  photoCount: number;
  place: string;
  section: string | null;
  bWare: boolean;
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
  marketplaceActive: boolean | null;
};

export type HighlightText = (value: string, query: string) => string | ReactNode[];
