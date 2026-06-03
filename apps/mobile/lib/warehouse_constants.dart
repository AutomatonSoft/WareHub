const List<String> kWarehouseSections = <String>[
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'M',
];

String warehouseSectionLabel(String section) {
  final String normalized = section.trim().toUpperCase();
  if (normalized == 'A') {
    return 'Showroom';
  }
  return normalized;
}

const List<String> kGermanColors = <String>[
  'Schwarz',
  'Weiss',
  'Grau',
  'Silber',
  'Beige',
  'Braun',
  'Blau',
  'Hellblau',
  'Marineblau',
  'Turkis',
  'Grun',
  'Hellgrun',
  'Gelb',
  'Orange',
  'Rot',
  'Bordeaux',
  'Rosa',
  'Lila',
  'Violett',
  'Mehrfarbig',
];

const int kIntakesPageSize = 100;
