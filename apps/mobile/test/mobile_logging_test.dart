import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/mobile_logging.dart';

void main() {
  group('isDevEnv', () {
    test('returns true for dev', () {
      expect(isDevEnv('dev'), isTrue);
    });

    test('returns false for stage', () {
      expect(isDevEnv('stage'), isFalse);
    });
  });

  group('canOverrideApiBase', () {
    test('returns true for dev', () {
      expect(canOverrideApiBase('dev'), isTrue);
    });

    test('returns false for stage', () {
      expect(canOverrideApiBase('stage'), isFalse);
    });

    test('returns false for prod', () {
      expect(canOverrideApiBase('prod'), isFalse);
    });
  });

  group('defaultApiBaseForEnv', () {
    test('does not force lan backend for stage', () {
      expect(
        defaultApiBaseForEnv('stage'),
        'https://stagewarehub.automatonsoft.de/api/v1',
      );
    });

    test('does not force lan backend for prod', () {
      expect(
        defaultApiBaseForEnv('prod'),
        'https://warehub.automatonsoft.de/api/v1',
      );
    });
  });

  group('normalizeApiBase', () {
    test('uses saved api base in dev env', () {
      expect(
        normalizeApiBase('https://prod.example.com/api/v1'),
        'https://prod.example.com/api/v1',
      );
    });

    test('adds api v1 suffix when missing', () {
      expect(
        normalizeApiBase('http://192.168.0.103:8932'),
        'http://192.168.0.103:8932/api/v1',
      );
    });

    test('keeps api v1 suffix when already present', () {
      expect(
        normalizeApiBase('http://192.168.0.103:8932/api/v1'),
        'http://192.168.0.103:8932/api/v1',
      );
    });
  });
}
