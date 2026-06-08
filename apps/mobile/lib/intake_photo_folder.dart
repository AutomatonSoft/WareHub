/// Produces a stable folder token for intake photos.
///
/// Output contract remains `<SECTION>_<WAREHOUSE_LOCATION>` to keep existing
/// storage layout backwards compatible.
String buildIntakePhotoFolder(String section, String warehouseLocation) {
  final String normalizedSection = normalizeIntakePhotoFolderToken(section);
  final String normalizedLocation =
      normalizeIntakePhotoFolderToken(warehouseLocation);
  return '${normalizedSection}_$normalizedLocation';
}

/// Normalizes a free-form section/location token into an upper-case folder-safe
/// token made of `[A-Z0-9_]`.
String normalizeIntakePhotoFolderToken(String value) {
  final String trimmed = value.trim().toUpperCase();
  if (trimmed.isEmpty) {
    return '';
  }

  final StringBuffer buffer = StringBuffer();
  bool previousWasUnderscore = false;

  for (final int codeUnit in trimmed.codeUnits) {
    final bool isAsciiDigit = codeUnit >= 48 && codeUnit <= 57;
    final bool isAsciiUpper = codeUnit >= 65 && codeUnit <= 90;
    final bool isUnderscore = codeUnit == 95;
    final bool isDash = codeUnit == 45;
    final bool isWhitespace = codeUnit == 32 || codeUnit == 9;
    final bool isPathSeparator =
        codeUnit == 47 || codeUnit == 92 || codeUnit == 58;

    if (isAsciiDigit || isAsciiUpper) {
      buffer.writeCharCode(codeUnit);
      previousWasUnderscore = false;
      continue;
    }

    if (isUnderscore || isDash || isWhitespace || isPathSeparator) {
      if (!previousWasUnderscore) {
        buffer.write('_');
        previousWasUnderscore = true;
      }
    }
  }

  final String normalized = buffer.toString();
  if (normalized.isEmpty) {
    return '';
  }

  return normalized.replaceAll(RegExp(r'^_+|_+$'), '');
}

({String section, String warehouseLocation}) parseIntakePhotoFolder(
  String folder,
) {
  final int separatorIndex = folder.indexOf('_');
  if (separatorIndex < 0) {
    return (section: folder, warehouseLocation: '');
  }

  return (
    section: folder.substring(0, separatorIndex),
    warehouseLocation: folder.substring(separatorIndex + 1),
  );
}
