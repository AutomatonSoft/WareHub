export type OttoShippingProfile = {
  id: string;
  name: string;
};

export const OTTO_SHIPPING_PROFILES: OttoShippingProfile[] = [
  { id: "786c6468-3baf-52e0-88b5-13757eb7f873", name: "(4-8 WOCHEN)" },
  { id: "360835cf-4962-59bb-ae66-78e8a41c8948", name: "(6-10 WOCHEN)" },
  { id: "28e3b4f8-12aa-5994-a7e9-26027baede55", name: "2-4 Wochen" },
  { id: "ad6009b9-a82f-5284-ac64-5627575655ac", name: "Express Chesterfield" },
  { id: "571dd076-4e59-5216-a86f-3e5f30319e9c", name: "Express-Produktion" },
  { id: "935a75b0-ac88-55a8-98df-8556306f1386", name: "LIEFERZEIT (8-12 WOCHEN)" },
  { id: "b4139e65-603f-52f7-9b99-393cf6b2461f", name: "SOFORT LIEFERBAR" },
  { id: "83feaefc-c110-5b39-af53-49344b77ae89", name: "WUNSCHORT - 2 MANN SERVICE - SOFORT" },
];
