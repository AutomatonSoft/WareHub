import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/qr_scan_action_model.dart';

void main() {
  group('isScanActionLocked', () {
    test('returns false when no blocking flags are active', () {
      final bool result = isScanActionLocked(
        adding: false,
        removing: false,
        printingItemId: null,
        printingImage: false,
      );

      expect(result, isFalse);
    });

    test('returns true when any blocking flag is active', () {
      expect(
        isScanActionLocked(
          adding: true,
          removing: false,
          printingItemId: null,
          printingImage: false,
        ),
        isTrue,
      );
      expect(
        isScanActionLocked(
          adding: false,
          removing: true,
          printingItemId: null,
          printingImage: false,
        ),
        isTrue,
      );
      expect(
        isScanActionLocked(
          adding: false,
          removing: false,
          printingItemId: 'id-1',
          printingImage: false,
        ),
        isTrue,
      );
      expect(
        isScanActionLocked(
          adding: false,
          removing: false,
          printingItemId: null,
          printingImage: true,
        ),
        isTrue,
      );
    });
  });

  group('parseScanActionChoice', () {
    test('maps add and remove choices', () {
      expect(parseScanActionChoice('add'), ScanActionChoice.add);
      expect(parseScanActionChoice('remove'), ScanActionChoice.remove);
    });

    test('maps unknown and null to cancel', () {
      expect(parseScanActionChoice('unknown'), ScanActionChoice.cancel);
      expect(parseScanActionChoice(null), ScanActionChoice.cancel);
    });
  });

  group('parseScanAddSourceChoice', () {
    test('maps supported sources', () {
      expect(parseScanAddSourceChoice('qr'), ScanAddSourceChoice.qr);
      expect(parseScanAddSourceChoice('kid'), ScanAddSourceChoice.kid);
      expect(parseScanAddSourceChoice('empty'), ScanAddSourceChoice.empty);
    });

    test('maps unknown and null to cancel', () {
      expect(parseScanAddSourceChoice('x'), ScanAddSourceChoice.cancel);
      expect(parseScanAddSourceChoice(null), ScanAddSourceChoice.cancel);
    });
  });

  group('parseScanRemoveSourceChoice', () {
    test('maps supported sources', () {
      expect(parseScanRemoveSourceChoice('qr'), ScanRemoveSourceChoice.qr);
      expect(
          parseScanRemoveSourceChoice('manual'), ScanRemoveSourceChoice.manual);
    });

    test('maps unknown and null to cancel', () {
      expect(parseScanRemoveSourceChoice('x'), ScanRemoveSourceChoice.cancel);
      expect(parseScanRemoveSourceChoice(null), ScanRemoveSourceChoice.cancel);
    });
  });
}
