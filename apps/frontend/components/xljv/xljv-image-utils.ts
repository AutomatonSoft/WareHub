import type { Site } from "./xljv-search-utils";

const HOST_BY_SITE_KEY: Record<string, string> = {
  JV_DE: "https://www.jvmoebel.de",
  JV_AT: "https://www.jvmoebel.at",
  JV_CH: "https://www.jvmoebel.ch",
  JV_CO_UK: "https://www.jvfurniture.co.uk",
  XLMOEBEL_DE: "https://www.xlmoebel.de",
  XLMOEBEL_CH: "https://www.xlmoebel.ch",
  XLMOBILI_IT: "https://www.xlmobili.it",
  XLMEUBILAIR_NL: "https://www.xlmeubilair.nl",
  XLMEBELES_LV: "https://www.xlmebeles.lv",
  XLMOEBEL_LU: "https://www.xlmoebel.lu",
  XLNABYTEK_CZ: "https://www.xlnabytek.cz",
  XLPOSLOVNO_SI: "https://www.xlposlovno.si",
  XLFURNITURE_CO_UK: "https://www.xlfurniture.co.uk",
  XLBUTOROK_HU: "https://www.xlbutorok.hu",
  XLHOME_GR: "https://www.xlhome.gr",
  XLMEBLE_PL: "https://www.xlmeble.pl",
  XLMEUBELLA_BE: "https://www.xlmeubella.be",
  XLMEUBLES_FR: "https://www.xlmeubles.fr",
  XLMOEBEL_AT: "https://www.xlmoebel.at",
  XLMUEBLES_ES: "https://www.xlmuebles.es",
  XLFURNITURE_IE: "https://www.xlfurniture.ie",
  XLHUONEKALUT_FI: "https://www.xlhuonekalut.fi",
  XLMOBILA_RO: "https://www.xlmobila.ro",
  XLMOBILIARIO_PT: "https://www.xlmobiliario.pt",
  XLMOBLER_SE: "https://www.xlmobler.se",
  XLNABYTOK_SK: "https://www.xlnabytok.sk",
  XXLMOBLER_DK: "https://www.xxlmobler.dk"
};

export function toXljvImageUrl(site: Site, siteKey: string, value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;

  const normalizedSiteKey = String(siteKey || "").trim().toUpperCase();
  const host = HOST_BY_SITE_KEY[normalizedSiteKey] || (site === "XL" ? HOST_BY_SITE_KEY.XLMOEBEL_DE : HOST_BY_SITE_KEY.JV_DE);
  const cleanPath = raw.replace(/^\.?\//, "").replace(/^\/+/, "");
  if (site === "XL" && !cleanPath.startsWith("image/")) {
    return `${host}/image/${cleanPath}`;
  }
  return `${host}/${cleanPath}`;
}
