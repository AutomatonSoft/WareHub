import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/app_bootstrap_screen.dart';

void main() {
  group('resolveInitialAppRoute', () {
    test('opens login when there is no stored session', () {
      expect(
        resolveInitialAppRoute(
          hasLocalSession: false,
        ),
        '/login',
      );
    });

    test('opens home for a stored session', () {
      expect(
        resolveInitialAppRoute(
          hasLocalSession: true,
        ),
        '/home',
      );
    });
  });
}
