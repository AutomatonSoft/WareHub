import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/mobile_sentry.dart';

void main() {
  test('parseSentryRate returns fallback for invalid value', () {
    expect(parseSentryRate('abc', 0.2), 0.2);
    expect(parseSentryRate('2.0', 0.2), 0.2);
    expect(parseSentryRate('-0.1', 0.2), 0.2);
  });

  test('parseSentryRate accepts value in range', () {
    expect(parseSentryRate('0.5', 0.2), 0.5);
  });

  test('isSentryEnabled checks non-empty dsn', () {
    expect(isSentryEnabled('https://key@host/1'), isTrue);
    expect(isSentryEnabled('   '), isFalse);
  });
}
