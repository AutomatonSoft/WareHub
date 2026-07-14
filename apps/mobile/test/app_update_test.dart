import 'package:flutter_test/flutter_test.dart';
import 'package:sofortbot_mobile/app_update.dart';

void main() {
  test('normalizeVersion strips v prefix', () {
    expect(normalizeVersion('v0.0.16'), '0.0.16');
    expect(normalizeVersion('0.0.16'), '0.0.16');
    expect(normalizeVersion('v0.0.16+40'), '0.0.16');
    expect(normalizeVersion('0.0.16-stage.1'), '0.0.16-stage.1');
  });

  test('compareVersions compares semantic-like values', () {
    expect(compareVersions('0.0.16', '0.0.15'), greaterThan(0));
    expect(compareVersions('1.2.3', '1.2.3'), 0);
    expect(compareVersions('1.2.3', '2.0.0'), lessThan(0));
    expect(compareVersions('0.2.0-stage.2', '0.2.0-stage.1'), greaterThan(0));
    expect(compareVersions('0.2.0', '0.2.0-stage.9'), greaterThan(0));
  });
}
