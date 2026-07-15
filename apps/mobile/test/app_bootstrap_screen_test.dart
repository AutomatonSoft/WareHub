import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/app_bootstrap_screen.dart';

void main() {
  group('resolveInitialAppRoute', () {
    test('opens login when there is no stored session', () {
      expect(
        resolveInitialAppRoute(
          hasLocalSession: false,
          biometricEnabled: false,
        ),
        '/login',
      );
    });

    test('opens home for a stored session without biometric lock', () {
      expect(
        resolveInitialAppRoute(
          hasLocalSession: true,
          biometricEnabled: false,
        ),
        '/home',
      );
    });

    test('opens biometric login for a protected stored session', () {
      expect(
        resolveInitialAppRoute(
          hasLocalSession: true,
          biometricEnabled: true,
        ),
        '/login',
      );
    });
  });
}
