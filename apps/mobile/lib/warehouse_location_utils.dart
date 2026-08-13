import 'models.dart';
import 'warehouse_constants.dart';

const int kWarehouseMinSlot = 1;
const int kWarehouseMaxSlot = 10000;

String formatInventoryProductHeading({
  required String place,
  required String section,
  required String kidNumber,
}) {
  final String normalizedPlace = place.trim().isEmpty ? '—' : place.trim();
  final String normalizedSection = normalizeWarehouseSection(section);
  final String normalizedKid =
      kidNumber.trim().isEmpty ? '—' : kidNumber.trim();
  if (normalizedSection.isEmpty) {
    return '$normalizedPlace - $normalizedKid';
  }
  return '$normalizedSection / $normalizedPlace - $normalizedKid';
}

int compareWarehouseSections(String left, String right) {
  final String normalizedLeft = normalizeWarehouseSection(left);
  final String normalizedRight = normalizeWarehouseSection(right);
  if (normalizedLeft.isEmpty || normalizedRight.isEmpty) {
    if (normalizedLeft.isEmpty && normalizedRight.isEmpty) return 0;
    return normalizedLeft.isEmpty ? 1 : -1;
  }

  final int leftIndex = kWarehouseSections.indexOf(normalizedLeft);
  final int rightIndex = kWarehouseSections.indexOf(normalizedRight);
  if (leftIndex != -1 && rightIndex != -1) {
    return leftIndex.compareTo(rightIndex);
  }
  if (leftIndex != -1) return -1;
  if (rightIndex != -1) return 1;
  return normalizedLeft.compareTo(normalizedRight);
}

int compareWarehousePlaces(String left, String right) {
  final String normalizedLeft = left.trim().toUpperCase();
  final String normalizedRight = right.trim().toUpperCase();
  if (normalizedLeft.isEmpty || normalizedRight.isEmpty) {
    if (normalizedLeft.isEmpty && normalizedRight.isEmpty) return 0;
    return normalizedLeft.isEmpty ? 1 : -1;
  }

  final List<String> leftParts = RegExp(r'\d+|[^\d]+')
      .allMatches(normalizedLeft)
      .map((RegExpMatch match) => match.group(0)!)
      .toList(growable: false);
  final List<String> rightParts = RegExp(r'\d+|[^\d]+')
      .allMatches(normalizedRight)
      .map((RegExpMatch match) => match.group(0)!)
      .toList(growable: false);
  final int sharedLength = leftParts.length < rightParts.length
      ? leftParts.length
      : rightParts.length;

  for (int index = 0; index < sharedLength; index++) {
    final int? leftNumber = int.tryParse(leftParts[index]);
    final int? rightNumber = int.tryParse(rightParts[index]);
    final int comparison;
    if (leftNumber != null && rightNumber != null) {
      comparison = leftNumber.compareTo(rightNumber);
    } else if (leftNumber != null) {
      comparison = -1;
    } else if (rightNumber != null) {
      comparison = 1;
    } else {
      comparison = leftParts[index].compareTo(rightParts[index]);
    }
    if (comparison != 0) return comparison;
  }
  return leftParts.length.compareTo(rightParts.length);
}

String buildWarehouseLocation(String section, String slotCode) {
  return '${normalizeWarehouseSection(section)}${slotCode.trim().toUpperCase()}';
}

String normalizeWarehousePlace(String place) {
  return place.trim().toUpperCase();
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
      normalizeWarehouseLocation(rawValue).replaceAll(RegExp(r'\s+'), '');
  if (normalized.isEmpty) {
    return null;
  }

  String? tryParseLocation(String candidate) {
    final String normalizedCandidate =
        normalizeWarehouseLocation(candidate).replaceAll(RegExp(r'\s+'), '');
    final RegExpMatch? match =
        RegExp(r'^([A-Z]?)([0-9]+[A-Z]*)$').firstMatch(normalizedCandidate);
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
  final RegExpMatch? match = RegExp(r'^([A-Z])([0-9]+[A-Z]*)$').firstMatch(
      normalizeWarehouseLocation(warehouseLocation)
          .replaceAll(RegExp(r'\s+'), ''));
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

bool isWarehousePlaceOccupied(
  List<IntakeData> items,
  String place,
) {
  final String normalizedPlace = normalizeWarehousePlace(place);
  final int? slotNumber = parseWarehouseSlotNumber(normalizedPlace);
  if (slotNumber == null ||
      slotNumber < kWarehouseMinSlot ||
      slotNumber > kWarehouseMaxSlot) {
    return false;
  }
  return items.any((IntakeData item) {
    if (!item.isActiveEffective) {
      return false;
    }
    return normalizeWarehousePlace(item.warehouseLocation) == normalizedPlace;
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
