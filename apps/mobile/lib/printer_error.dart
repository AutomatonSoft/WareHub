bool isRecoverablePrintBusyError({
  required String code,
  required String message,
  Map<String, dynamic>? details,
}) {
  final String normalizedCode = code.trim().toLowerCase();
  final String normalizedMessage = message.trim().toLowerCase();
  if (normalizedCode != 'printtaskfailed') {
    return false;
  }
  final Object? detailedCode = details?['printErrorCode'];
  if (detailedCode is num && detailedCode.toInt() == 0x06) {
    return true;
  }
  return normalizedMessage.contains('0x06');
}

String? buildPrinterRecoveryHint({
  required String code,
  required String message,
  Map<String, dynamic>? details,
}) {
  final String normalizedCode = code.trim().toLowerCase();
  if (normalizedCode != 'printtaskfailed') {
    return null;
  }

  final Object? detailedCode = details?['printErrorCode'];
  if (detailedCode is num) {
    switch (detailedCode.toInt()) {
      case 0x03:
        return 'Printer reports state 0x03. Check media loaded correctly, close cover firmly, clear jams, then press FEED once and retry.';
      case 0x06:
        return 'Printer is busy with previous task. Wait a moment and retry.';
    }
  }

  final String normalizedMessage = message.trim().toLowerCase();
  if (normalizedMessage.contains('0x03')) {
    return 'Printer reports state 0x03. Check media loaded correctly, close cover firmly, clear jams, then press FEED once and retry.';
  }
  if (normalizedMessage.contains('0x06')) {
    return 'Printer is busy with previous task. Wait a moment and retry.';
  }
  return null;
}
