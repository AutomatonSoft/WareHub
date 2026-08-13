List<String?> buildPrintPartsCaptions({
  required int quantity,
  required int unitIndex,
  required int totalParts,
}) {
  final int safeQuantity = quantity < 1 ? 1 : quantity;
  final int safeTotalParts = totalParts < 1 ? 1 : totalParts;
  final int safeUnitIndex = unitIndex < 1 ? 1 : unitIndex;

  final List<String?> captions = <String?>[];
  for (int i = 1; i <= safeQuantity; i++) {
    if (safeQuantity > 1) {
      captions.add('$i/$safeQuantity');
      continue;
    }
    captions.add(safeTotalParts > 1 ? '$safeUnitIndex/$safeTotalParts' : null);
  }
  return captions;
}

/// Converts the global label setting to the range accepted by the bundled
/// Android Niimbot plugin. The product settings retain their full 0..5 range,
/// but the plugin throws a native exception for every value outside 1..3.
int nativeNiimbotLabelType(int configuredType) {
  return configuredType >= 1 && configuredType <= 3 ? configuredType : 1;
}
