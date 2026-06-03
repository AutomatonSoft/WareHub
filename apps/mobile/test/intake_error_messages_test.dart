import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/app_language.dart';
import 'package:sofortbot_mobile/app_strings.dart';
import 'package:sofortbot_mobile/intake_error_messages.dart';

void main() {
  test('maps duplicate intake conflict to friendly message', () {
    final String message = buildCreateIntakeErrorMessage(
      strings: const AppStrings(AppLang.en),
      statusCode: 409,
      details:
          'intake with same qr_code, kid_number, unit_index and box_index already exists',
    );

    expect(
      message,
      'This product is already in the intake list for the same unit/box.',
    );
  });

  test('returns http message with details for non-duplicate error', () {
    final String message = buildCreateIntakeErrorMessage(
      strings: const AppStrings(AppLang.en),
      statusCode: 500,
      details: 'database timeout',
    );

    expect(message, 'Create intake failed: HTTP 500. database timeout');
  });
}
