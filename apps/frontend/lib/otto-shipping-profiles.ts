export type OttoShippingProfile = {
  id: string;
  name: string;
};

export type OttoShippingProfileAccount = "jv" | "xl";

export const OTTO_JV_SHIPPING_PROFILES: OttoShippingProfile[] = [
  { id: "786c6468-3baf-52e0-88b5-13757eb7f873", name: "(4-8 WOCHEN)" },
  { id: "360835cf-4962-59bb-ae66-78e8a41c8948", name: "(6-10 WOCHEN)" },
  { id: "28e3b4f8-12aa-5994-a7e9-26027baede55", name: "2-4 Wochen" },
  { id: "ad6009b9-a82f-5284-ac64-5627575655ac", name: "Express Chesterfield" },
  { id: "571dd076-4e59-5216-a86f-3e5f30319e9c", name: "Express-Produktion" },
  { id: "935a75b0-ac88-55a8-98df-8556306f1386", name: "LIEFERZEIT (8-12 WOCHEN)" },
  { id: "b4139e65-603f-52f7-9b99-393cf6b2461f", name: "SOFORT LIEFERBAR" },
  { id: "83feaefc-c110-5b39-af53-49344b77ae89", name: "WUNSCHORT - 2 MANN SERVICE - SOFORT" },
];

export const OTTO_XL_SHIPPING_PROFILES: OttoShippingProfile[] = [
  { id: "c8173da0-65d1-5265-824a-857875ff9c3b", name: "2-4 Wochen" },
  { id: "33af076b-6876-53ee-889d-517fc7e84ed7", name: "Express Chesterfield" },
  { id: "d8646bd8-8983-5cbd-8ee9-57d78abf58d7", name: "Express-Produktion" },
  { id: "d045a64d-59e6-57fb-9f69-6370dc7c9d40", name: "LIEFERZEIT (4-8 WOCHEN)" },
  { id: "5b1087dc-d7d4-5c68-8ba4-81e3bc5b6f1d", name: "LIEFERZEIT (6-10 WOCHEN)" },
  { id: "027a1a46-cf60-56f4-917b-81661569f016", name: "LIEFERZEIT (8-12 WOCHEN)" },
  { id: "9d2ac737-22dc-5bfa-8a5f-a2cef07b7efd", name: "SOFORT LIEFERBAR" },
];

export function getOttoShippingProfiles(account: OttoShippingProfileAccount): OttoShippingProfile[] {
  return account === "xl" ? OTTO_XL_SHIPPING_PROFILES : OTTO_JV_SHIPPING_PROFILES;
}
