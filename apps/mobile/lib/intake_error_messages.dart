import 'app_strings.dart';

String buildCreateIntakeErrorMessage({
  required AppStrings strings,
  required int statusCode,
  required String details,
}) {
  final String normalizedDetails = details.trim();
  if (_isDuplicateIntakeConflict(statusCode, normalizedDetails)) {
    return strings.text('create_intake_failed_duplicate');
  }
  if (_isInvalidBoxTotal(statusCode, normalizedDetails)) {
    return strings.format(
      'enter_number_range',
      const <String, String>{'min': '1', 'max': '20'},
    );
  }
  if (normalizedDetails.isNotEmpty) {
    return strings.format(
      'create_intake_failed_http_with_details',
      <String, String>{
        'code': '$statusCode',
        'details': normalizedDetails,
      },
    );
  }
  return strings.format(
    'create_intake_failed_http',
    <String, String>{'code': '$statusCode'},
  );
}

bool _isInvalidBoxTotal(int statusCode, String details) {
  if (statusCode != 400 || details.isEmpty) {
    return false;
  }
  final String lower = details.toLowerCase();
  return lower.contains('box_total') && lower.contains('between 1 and 20');
}

bool _isDuplicateIntakeConflict(int statusCode, String details) {
  if (statusCode != 409 || details.isEmpty) {
    return false;
  }
  final String lower = details.toLowerCase();
  return lower.contains('already exists') &&
      lower.contains('qr_code') &&
      lower.contains('kid_number') &&
      lower.contains('unit_index') &&
      lower.contains('box_index');
}
