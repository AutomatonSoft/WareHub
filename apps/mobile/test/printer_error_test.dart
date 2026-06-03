import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/printer_error.dart';

void main() {
  group('isRecoverablePrintBusyError', () {
    test('returns true for PrintTaskFailed with 0x06', () {
      expect(
        isRecoverablePrintBusyError(
          code: 'PrintTaskFailed',
          message: 'Printer returned print error 0x06. Unknown print error.',
          details: const <String, dynamic>{},
        ),
        isTrue,
      );
    });

    test('returns true for PrintTaskFailed with details code 0x06', () {
      expect(
        isRecoverablePrintBusyError(
          code: 'PrintTaskFailed',
          message: 'Printer returned print error.',
          details: const <String, dynamic>{'printErrorCode': 0x06},
        ),
        isTrue,
      );
    });

    test('returns false for other print codes', () {
      expect(
        isRecoverablePrintBusyError(
          code: 'PermissionDenied',
          message: 'Bluetooth permission denied.',
          details: const <String, dynamic>{},
        ),
        isFalse,
      );
    });

    test('returns false when code matches but message does not contain 0x06',
        () {
      expect(
        isRecoverablePrintBusyError(
          code: 'PrintTaskFailed',
          message: 'Printer returned print error 0x03.',
          details: const <String, dynamic>{'printErrorCode': 0x03},
        ),
        isFalse,
      );
    });
  });

  group('buildPrinterRecoveryHint', () {
    test('returns actionable hint for 0x03 from details', () {
      final String? hint = buildPrinterRecoveryHint(
        code: 'PrintTaskFailed',
        message: 'Printer returned print error.',
        details: const <String, dynamic>{'printErrorCode': 0x03},
      );
      expect(hint, isNotNull);
      expect(hint, contains('0x03'));
    });

    test('returns busy hint for 0x06 from message', () {
      final String? hint = buildPrinterRecoveryHint(
        code: 'PrintTaskFailed',
        message: 'Printer returned print error 0x06.',
        details: const <String, dynamic>{},
      );
      expect(hint, isNotNull);
      expect(hint, contains('busy'));
    });

    test('returns null for non-print-task failures', () {
      expect(
        buildPrinterRecoveryHint(
          code: 'PermissionDenied',
          message: 'Bluetooth permission denied.',
          details: const <String, dynamic>{},
        ),
        isNull,
      );
    });
  });
}
