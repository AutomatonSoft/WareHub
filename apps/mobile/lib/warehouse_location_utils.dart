import 'models.dart';

const int kWarehouseMinSlot = 1;
const int kWarehouseMaxSlot = 10000;

String buildWarehouseLocation(String section, String slotCode) {
  return '${section.trim().toUpperCase()}${slotCode.trim().toUpperCase()}';
}

int? parseWarehouseSlotNumber(String slotCode) {
  final String normalized = slotCode.trim().toUpperCase();
  final RegExpMatch? match = RegExp(r'^([0-9]+)[A-Z]*$').firstMatch(normalized);
  if (match == null) {
    return null;
  }
  return int.tryParse(match.group(1)!);
}

String? parseWarehouseLocationFromQrPayload(String rawValue) {
  final String normalized =
      rawValue.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');
  if (normalized.isEmpty) {
    return null;
  }

  String? tryParseLocation(String candidate) {
    final RegExpMatch? match =
        RegExp(r'^([A-Z])([0-9]+[A-Z]*)$').firstMatch(candidate);
    if (match == null) {
      return null;
    }
    final int? slotNumber = parseWarehouseSlotNumber(match.group(2)!);
    if (slotNumber == null ||
        slotNumber < kWarehouseMinSlot ||
        slotNumber > kWarehouseMaxSlot) {
      return null;
    }
    return '${match.group(1)!}${match.group(2)!}';
  }

  final String? direct = tryParseLocation(normalized);
  if (direct != null) {
    return direct;
  }

  final Iterable<String> tokens = normalized
      .split(RegExp(r'[^A-Z0-9]+'))
      .map((String token) => token.trim())
      .where((String token) => token.isNotEmpty);
  for (final String token in tokens) {
    final String? parsed = tryParseLocation(token);
    if (parsed != null) {
      return parsed;
    }
  }
  return null;
}

MapEntry<String, int>? parseWarehouseSectionAndSlot(String warehouseLocation) {
  final RegExpMatch? match = RegExp(r'^([A-Z])([0-9]+[A-Z]*)$')
      .firstMatch(warehouseLocation.trim().toUpperCase());
  if (match == null) {
    return null;
  }
  final int? slotNumber = parseWarehouseSlotNumber(match.group(2)!);
  if (slotNumber == null ||
      slotNumber < kWarehouseMinSlot ||
      slotNumber > kWarehouseMaxSlot) {
    return null;
  }
  return MapEntry<String, int>(match.group(1)!, slotNumber);
}

bool isWarehouseSlotOccupied(
  List<IntakeData> items,
  String slotCode,
) {
  final int? slotNumber = parseWarehouseSlotNumber(slotCode);
  if (slotNumber == null ||
      slotNumber < kWarehouseMinSlot ||
      slotNumber > kWarehouseMaxSlot) {
    return false;
  }
  return items.any((IntakeData item) {
    if (!item.isActiveEffective) {
      return false;
    }
    return item.slotNumber == slotNumber;
  });
}

String? findNextFreeWarehouseSlotCode(
  List<IntakeData> items, {
  int minSlot = kWarehouseMinSlot,
  int maxSlot = kWarehouseMaxSlot,
}) {
  if (minSlot < kWarehouseMinSlot ||
      maxSlot > kWarehouseMaxSlot ||
      minSlot > maxSlot) {
    return null;
  }
  final Set<int> occupied = items
      .where((IntakeData item) {
        return item.isActiveEffective;
      })
      .map((IntakeData item) => item.slotNumber)
      .where((int slot) => slot >= minSlot && slot <= maxSlot)
      .toSet();

  for (int slot = minSlot; slot <= maxSlot; slot++) {
    if (!occupied.contains(slot)) {
      return '$slot';
    }
  }
  return null;
}
