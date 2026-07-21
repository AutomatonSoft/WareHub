export type SiteKind = "JV" | "XL";
export type SiteFamily = "OTTO" | "KAUFLAND" | "HOOD" | "EBAY" | "JVMOEBEL" | "XL";
export type SiteConnectionStatus = "CONNECTED" | "DISCONNECTED" | "NOT_FOUND";

export type MarketplaceSite = {
  id: string;
  logo: SiteFamily;
  name: string;
  family: SiteFamily;
  kind: SiteKind;
  status: SiteConnectionStatus;
  lastSync: string;
  productsInDb: number;
};

export const STATUS_CACHE_KEY = "marketplace_status_cache_v1";

export const xlSiteKeys = [
  "XLMOEBEL_DE",
  "XLMOEBEL_CH",
  "XLMOBILI_IT",
  "XLMEUBILAIR_NL",
  "XLMEBELES_LV",
  "XLMOEBEL_LU",
  "XLNABYTEK_CZ",
  "XLPOSLOVNO_SI",
  "XLFURNITURE_CO_UK",
  "XLBUTOROK_HU",
  "XLHOME_GR",
  "XLMEBLE_PL",
  "XLMEUBELLA_BE",
  "XLMEUBLES_FR",
  "XLMOEBEL_AT",
  "XLMUEBLES_ES",
  "XLFURNITURE_IE",
  "XLHUONEKALUT_FI",
  "XLMOBILA_RO",
  "XLMOBILIARIO_PT",
  "XLMOBLER_SE",
  "XLNABYTOK_SK",
  "XXLMOBLER_DK"
] as const;

const baseSites: MarketplaceSite[] = [
  { id: "otto-jv", logo: "OTTO", name: "OTTO JV", family: "OTTO", kind: "JV", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "otto-xl", logo: "OTTO", name: "OTTO XL", family: "OTTO", kind: "XL", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "kaufland-jv", logo: "KAUFLAND", name: "KAUFLAND JV", family: "KAUFLAND", kind: "JV", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "kaufland-xl", logo: "KAUFLAND", name: "KAUFLAND XL", family: "KAUFLAND", kind: "XL", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "hood-jv", logo: "HOOD", name: "HOOD JV", family: "HOOD", kind: "JV", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "hood-xl", logo: "HOOD", name: "HOOD XL", family: "HOOD", kind: "XL", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "ebay-jv", logo: "EBAY", name: "EBAY JV", family: "EBAY", kind: "JV", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "ebay-xl", logo: "EBAY", name: "EBAY XL", family: "EBAY", kind: "XL", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "jvmoebel-de", logo: "JVMOEBEL", name: "JVMOEBEL DE", family: "JVMOEBEL", kind: "JV", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "jvmoebel-at", logo: "JVMOEBEL", name: "JVMOEBEL AT", family: "JVMOEBEL", kind: "JV", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "jvmoebel-ch", logo: "JVMOEBEL", name: "JVMOEBEL CH", family: "JVMOEBEL", kind: "JV", status: "DISCONNECTED", lastSync: "", productsInDb: 0 },
  { id: "jvmoebel-uk", logo: "JVMOEBEL", name: "JVMOEBEL UK", family: "JVMOEBEL", kind: "JV", status: "DISCONNECTED", lastSync: "", productsInDb: 0 }
];

const xlSites: MarketplaceSite[] = xlSiteKeys.map((key) => ({
  id: key.toLowerCase(),
  logo: "XL",
  name: key,
  family: "XL",
  kind: "XL",
  status: "DISCONNECTED",
  lastSync: "",
  productsInDb: 0
}));

export const allMarketplaceSites: MarketplaceSite[] = [...baseSites, ...xlSites];
