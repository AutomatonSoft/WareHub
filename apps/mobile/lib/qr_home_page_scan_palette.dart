part of 'qr_home_page.dart';

class _ScanSourceOption {
  const _ScanSourceOption({
    required this.value,
    required this.title,
    required this.icon,
    this.emphasized = false,
  });

  final String value;
  final String title;
  final IconData icon;
  final bool emphasized;
}

class _ColorTilePalette {
  const _ColorTilePalette({
    required this.background,
    required this.border,
    required this.text,
  });

  final Color background;
  final Color border;
  final Color text;
}

class _CategorySelection {
  const _CategorySelection({
    this.main,
    this.sub,
  });

  final String? main;
  final String? sub;
}

const List<String> kCategoryMainOptionsGerman = <String>[
  'Wohnzimmer',
  'Schlafzimmer',
  'Küche',
  'Kinderzimmer',
  'Büro',
  'Flur & Garderobe',
  'Badezimmer',
  'Esszimmer',
  'Gartenmöbel',
  'Dekoration',
];

const Map<String, List<String>> kCategorySubOptionsGerman =
    <String, List<String>>{
  'Wohnzimmer': <String>[
    'Sofas',
    'Ecksofas',
    'Schlafsofas',
    'Wohnlandschaften',
    'Sessel',
    'Relaxsessel',
    'Hocker',
    'Couchtische',
    'Beistelltische',
    'TV Lowboards',
    'Wohnwände',
    'Vitrinen',
    'Kommoden',
    'Sideboards',
    'Highboards',
    'Regale',
    'Wandregale',
    'Konsolentische',
  ],
  'Schlafzimmer': <String>[
    'Betten',
    'Boxspringbetten',
    'Polsterbetten',
    'Massivholzbetten',
    'Metallbetten',
    'Einzelbetten',
    'Doppelbetten',
    'Kingsize Betten',
    'Kinderbetten',
    'Hochbetten',
    'Etagenbetten',
    'Nachttische',
    'Kleiderschränke',
    'Drehtürenschränke',
    'Schwebetürenschränke',
    'Eckschränke',
    'Kommoden',
    'Schminktische',
    'Schlafzimmer Sets',
  ],
  'Esszimmer': <String>[
    'Esstische',
    'Ausziehtische',
    'Runde Esstische',
    'Essgruppen',
    'Esszimmerstühle',
    'Polsterstühle',
    'Freischwinger',
    'Sitzbänke',
    'Barhocker',
    'Sideboards',
    'Highboards',
    'Buffetschränke',
    'Vitrinen',
  ],
  'Küche': <String>[
    'Einbauküchen',
    'Küchenzeilen',
    'Küchenschränke',
    'Hängeschränke',
    'Unterschränke',
    'Kücheninseln',
    'Küchentische',
    'Bartische',
    'Barhocker',
    'Küchenregale',
  ],
  'Büro': <String>[
    'Schreibtische',
    'Computertische',
    'Eckschreibtische',
    'Bürostühle',
    'Drehstühle',
    'Chefsessel',
    'Aktenschränke',
    'Rollcontainer',
    'Bücherregale',
    'Konferenztische',
  ],
  'Flur & Garderobe': <String>[
    'Garderoben',
    'Garderobenschränke',
    'Schuhschränke',
    'Schuhbänke',
    'Sitzbänke',
    'Konsolentische',
    'Flurkommoden',
    'Spiegel',
  ],
  'Badezimmer': <String>[
    'Waschbeckenunterschränke',
    'Spiegelschränke',
    'Badhochschränke',
    'Badregale',
    'Badmöbel Sets',
  ],
  'Kinderzimmer': <String>[
    'Kinderbetten',
    'Etagenbetten',
    'Hochbetten',
    'Babybetten',
    'Wickelkommoden',
    'Kinderkommoden',
    'Kinderkleiderschränke',
    'Kinderschreibtische',
    'Kinderstühle',
    'Kinderzimmer Sets',
  ],
  'Gartenmöbel': <String>[
    'Gartentische',
    'Gartenstühle',
    'Gartensessel',
    'Gartenbänke',
    'Loungemöbel',
    'Sonnenliegen',
    'Hängesessel',
    'Gartensofas',
    'Gartenmöbel Sets',
  ],
  'Dekoration': <String>[
    'Vasen',
    'Skulpturen & Figuren',
    'Wandbilder & Kunst',
    'Wanduhren',
    'Kerzen & Kerzenhalter',
    'Spiegel',
    'Dekoschalen & Tablett',
  ],
};

_ColorTilePalette _colorTilePaletteFor(String label, bool selected) {
  final String key = label.trim().toLowerCase();
  final Color base = switch (key) {
    'schwarz' => const Color(0xFF1A1A1A),
    'weiss' => const Color(0xFFF7F7F7),
    'grau' => const Color(0xFF9E9E9E),
    'silber' => const Color(0xFFC0C0C0),
    'beige' => const Color(0xFFD9C7A4),
    'braun' => const Color(0xFF7A4A2C),
    'blau' => const Color(0xFF2A62D6),
    'hellblau' => const Color(0xFF78C6FF),
    'marineblau' => const Color(0xFF1B2A6B),
    'turkis' => const Color(0xFF1CBECF),
    'grun' => const Color(0xFF2FA84F),
    'hellgrun' => const Color(0xFFA8E56B),
    'gelb' => const Color(0xFFF7D638),
    'orange' => const Color(0xFFF38B2A),
    'rot' => const Color(0xFFD53333),
    'bordeaux' => const Color(0xFF7B1F3A),
    'rosa' => const Color(0xFFF38DB3),
    'lila' => const Color(0xFF8C59D9),
    'violett' => const Color(0xFF6F3FBF),
    'mehrfarbig' => const Color(0xFF4A4F6E),
    _ => uiCardSoft,
  };

  final Color background =
      selected ? base.withValues(alpha: 0.9) : base.withValues(alpha: 0.72);
  final Color border = selected ? base.withValues(alpha: 1) : uiBorder;
  final double luminance = background.computeLuminance();
  final Color text = luminance > 0.58 ? const Color(0xFF1B233A) : uiText;

  return _ColorTilePalette(
    background: background,
    border: border,
    text: text,
  );
}
