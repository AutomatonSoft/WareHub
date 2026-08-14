const String kStockStatusInStock = 'in_stock';
const String kStockStatusReturned = 'returned';
const String kStockStatusOut = 'out';

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

const Set<String> _showroomSectionAliases = <String>{'SHOWROOM', 'ШОУРУМ'};

String normalizeWarehouseSection(String section) {
  final String normalized = section.trim().toUpperCase();
  return _showroomSectionAliases.contains(normalized) ? 'A' : normalized;
}

String normalizeWarehouseLocation(String warehouseLocation) {
  final String normalized = warehouseLocation.trim().toUpperCase();
  final String compact = normalized.replaceAll(RegExp(r'\s+'), '');
  for (final String alias in _showroomSectionAliases) {
    if (compact.startsWith(alias)) {
      return 'A${compact.substring(alias.length)}';
    }
  }
  return normalized;
}

String warehouseSectionLabel(String section) {
  return normalizeWarehouseSection(section);
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
