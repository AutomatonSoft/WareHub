import 'app_settings.dart';
import 'models.dart';
import 'warehouse_location_utils.dart';

const String palletFallbackAsset = 'assets/images/pallet.png';
const String productFallbackAsset = 'assets/images/blank.png';

class InventoryItemDisplayData {
  const InventoryItemDisplayData({
    required this.title,
    required this.kidNumber,
    required this.productKey,
    required this.place,
    required this.fallbackAssetPath,
  });

  final String title;
  final String kidNumber;
  final String productKey;
  final String place;
  final String fallbackAssetPath;

  factory InventoryItemDisplayData.fromItem({
    required IntakeData item,
    required List<String> warehouseLocations,
    required AppStrings strings,
  }) {
    final String palletLabel = strings.text('pallet_placeholder');
    final String kidNumber = _localizedPalletValue(
      item.kidNumber,
      palletLabel,
      emptyFallback: item.kidNumber,
    );
    final String place = warehouseLocations.isNotEmpty
        ? warehouseLocations.first
        : item.warehouseLocation.trim();

    return InventoryItemDisplayData(
      title: formatInventoryProductHeading(
        place: place,
        section: item.section,
        kidNumber: kidNumber,
      ),
      kidNumber: kidNumber,
      productKey: _localizedPalletValue(
        item.productKey,
        palletLabel,
        emptyFallback: '-',
      ),
      place: place,
      fallbackAssetPath: _isPalletPlaceholderItem(item)
          ? palletFallbackAsset
          : productFallbackAsset,
    );
  }
}

bool _isPalletPlaceholderItem(IntakeData item) {
  return _isPalletText(item.qrCode) ||
      _isPalletText(item.kidNumber) ||
      _isPalletText(item.productKey);
}

String _localizedPalletValue(
  String value,
  String palletLabel, {
  required String emptyFallback,
}) {
  final String trimmed = value.trim();
  if (trimmed.isEmpty) {
    return emptyFallback;
  }
  return _isPalletText(trimmed) ? palletLabel : trimmed;
}

bool _isPalletText(String value) {
  final Set<String> candidates = _normalizedPalletCandidates(value);
  return candidates.any(_palletAliases.contains);
}

Set<String> _normalizedPalletCandidates(String value) {
  final String normalized = _normalizePalletToken(value);
  final Set<String> candidates = <String>{};
  if (normalized.isNotEmpty) {
    candidates.add(normalized);
  }
  for (final RegExpMatch match
      in RegExp(r'[A-Za-zА-Яа-яЁё]+').allMatches(value)) {
    final String token = _normalizePalletToken(match.group(0) ?? '');
    if (token.isNotEmpty) {
      candidates.add(token);
    }
  }
  return candidates;
}

String _normalizePalletToken(String value) {
  return value
      .trim()
      .toLowerCase()
      .replaceAll('ё', 'е')
      .replaceAll(RegExp(r'[^a-zа-я]'), '');
}

const Set<String> _palletAliases = <String>{
  'pallet',
  'pallets',
  'palet',
  'palets',
  'palete',
  'paletes',
  'palett',
  'paletts',
  'palette',
  'palettes',
  'pallete',
  'pallette',
  'paletten',
  'palleten',
  'палет',
  'палеты',
  'палета',
  'палетта',
  'палетты',
  'паллет',
  'паллеты',
  'паллета',
  'паллетта',
  'паллетти',
  'поддон',
  'поддоны',
};
