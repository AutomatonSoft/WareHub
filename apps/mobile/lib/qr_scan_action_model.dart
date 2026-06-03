enum ScanActionChoice {
  add,
  remove,
  cancel,
}

enum ScanAddSourceChoice {
  qr,
  kid,
  empty,
  cancel,
}

enum ScanRemoveSourceChoice {
  qr,
  manual,
  cancel,
}

bool isScanActionLocked({
  required bool adding,
  required bool removing,
  required String? printingItemId,
  required bool printingImage,
}) {
  return adding || removing || printingItemId != null || printingImage;
}

ScanActionChoice parseScanActionChoice(String? raw) {
  switch (raw) {
    case 'add':
      return ScanActionChoice.add;
    case 'remove':
      return ScanActionChoice.remove;
    default:
      return ScanActionChoice.cancel;
  }
}

ScanAddSourceChoice parseScanAddSourceChoice(String? raw) {
  switch (raw) {
    case 'empty':
      return ScanAddSourceChoice.empty;
    case 'kid':
      return ScanAddSourceChoice.kid;
    case 'qr':
      return ScanAddSourceChoice.qr;
    default:
      return ScanAddSourceChoice.cancel;
  }
}

ScanRemoveSourceChoice parseScanRemoveSourceChoice(String? raw) {
  switch (raw) {
    case 'manual':
      return ScanRemoveSourceChoice.manual;
    case 'qr':
      return ScanRemoveSourceChoice.qr;
    default:
      return ScanRemoveSourceChoice.cancel;
  }
}
