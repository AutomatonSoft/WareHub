export const MAIN_CATEGORIES = [
  "Wohnzimmer",
  "Schlafzimmer",
  "Küche",
  "Kinderzimmer",
  "Büro",
  "Flur & Garderobe",
  "Badezimmer",
  "Esszimmer",
  "Gartenmöbel",
  "Dekoration"
] as const;

export type MainCategory = (typeof MAIN_CATEGORIES)[number];

export const SUBCATEGORIES_BY_MAIN: Record<MainCategory, readonly string[]> = {
  Wohnzimmer: [
    "Sofas",
    "Ecksofas",
    "Schlafsofas",
    "Wohnlandschaften",
    "Sessel",
    "Relaxsessel",
    "Hocker",
    "Couchtische",
    "Beistelltische",
    "TV Lowboards",
    "Wohnwände",
    "Vitrinen",
    "Kommoden",
    "Sideboards",
    "Highboards",
    "Regale",
    "Wandregale",
    "Konsolentische"
  ],
  Schlafzimmer: [
    "Betten",
    "Boxspringbetten",
    "Polsterbetten",
    "Massivholzbetten",
    "Metallbetten",
    "Einzelbetten",
    "Doppelbetten",
    "Kingsize Betten",
    "Kinderbetten",
    "Hochbetten",
    "Etagenbetten",
    "Nachttische",
    "Kleiderschränke",
    "Drehtürenschränke",
    "Schwebetürenschränke",
    "Eckschränke",
    "Kommoden",
    "Schminktische",
    "Schlafzimmer Sets"
  ],
  Esszimmer: [
    "Esstische",
    "Ausziehtische",
    "Runde Esstische",
    "Essgruppen",
    "Esszimmerstühle",
    "Polsterstühle",
    "Freischwinger",
    "Sitzbänke",
    "Barhocker",
    "Sideboards",
    "Highboards",
    "Buffetschränke",
    "Vitrinen"
  ],
  "Küche": [
    "Einbauküchen",
    "Küchenzeilen",
    "Küchenschränke",
    "Hängeschränke",
    "Unterschränke",
    "Kücheninseln",
    "Küchentische",
    "Bartische",
    "Barhocker",
    "Küchenregale"
  ],
  Büro: [
    "Schreibtische",
    "Computertische",
    "Eckschreibtische",
    "Bürostühle",
    "Drehstühle",
    "Chefsessel",
    "Aktenschränke",
    "Rollcontainer",
    "Bücherregale",
    "Konferenztische"
  ],
  "Flur & Garderobe": [
    "Garderoben",
    "Garderobenschränke",
    "Schuhschränke",
    "Schuhbänke",
    "Sitzbänke",
    "Konsolentische",
    "Flurkommoden",
    "Spiegel"
  ],
  Badezimmer: [
    "Waschbeckenunterschränke",
    "Spiegelschränke",
    "Badhochschränke",
    "Badregale",
    "Badmöbel Sets"
  ],
  Kinderzimmer: [
    "Kinderbetten",
    "Etagenbetten",
    "Hochbetten",
    "Babybetten",
    "Wickelkommoden",
    "Kinderkommoden",
    "Kinderkleiderschränke",
    "Kinderschreibtische",
    "Kinderstühle",
    "Kinderzimmer Sets"
  ],
  Gartenmöbel: [
    "Gartentische",
    "Gartenstühle",
    "Gartensessel",
    "Gartenbänke",
    "Loungemöbel",
    "Sonnenliegen",
    "Hängesessel",
    "Gartensofas",
    "Gartenmöbel Sets"
  ],
  Dekoration: [
    "Vasen",
    "Skulpturen & Figuren",
    "Wandbilder & Kunst",
    "Wanduhren",
    "Kerzen & Kerzenhalter",
    "Spiegel",
    "Dekoschalen & Tablett"
  ]
};
