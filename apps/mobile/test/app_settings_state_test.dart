import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/app_settings_state.dart';

void main() {
  group('isAdminRole', () {
    test('accepts admin case-insensitively', () {
      expect(isAdminRole('Admin'), isTrue);
    });

    test('ignores surrounding whitespace', () {
      expect(isAdminRole('  admin  '), isTrue);
    });

    test('rejects non-admin roles', () {
      expect(isAdminRole('user'), isFalse);
    });
  });
}
