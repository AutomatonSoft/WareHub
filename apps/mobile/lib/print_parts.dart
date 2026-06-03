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
