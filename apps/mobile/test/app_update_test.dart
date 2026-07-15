import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:sofortbot_mobile/app_update.dart';

void main() {
  test('normalizeVersion strips only v prefix', () {
    expect(normalizeVersion('v0.0.16'), '0.0.16');
    expect(normalizeVersion('0.0.16'), '0.0.16');
    expect(normalizeVersion('v0.0.16+40'), '0.0.16+40');
    expect(normalizeVersion('0.0.16-stage.1'), '0.0.16-stage.1');
  });

  test('compareVersions compares semantic-like values', () {
    expect(compareVersions('0.0.16', '0.0.15'), greaterThan(0));
    expect(compareVersions('1.2.3', '1.2.3'), 0);
    expect(compareVersions('1.2.3', '2.0.0'), lessThan(0));
    expect(compareVersions('0.2.0-stage.2', '0.2.0-stage.1'), greaterThan(0));
    expect(compareVersions('0.2.0', '0.2.0-stage.9'), greaterThan(0));
    expect(
      compareVersions('0.5.7-stage.1+1001', '0.5.7-stage.1+1000'),
      greaterThan(0),
    );
    expect(
      compareVersions('v0.5.7-stage.2+1001', '0.5.7-stage.1+1000'),
      greaterThan(0),
    );
  });

  test('formatInstalledVersion appends build number when needed', () {
    expect(
      formatInstalledVersion(
        PackageInfo(
          appName: 'WareHub',
          packageName: 'dev.warehub.mobile',
          version: '0.5.7-stage.1',
          buildNumber: '1000',
          buildSignature: '',
          installerStore: null,
        ),
      ),
      '0.5.7-stage.1+1000',
    );
    expect(
      formatInstalledVersion(
        PackageInfo(
          appName: 'WareHub',
          packageName: 'dev.warehub.mobile',
          version: '0.5.7-stage.1+1000',
          buildNumber: '1000',
          buildSignature: '',
          installerStore: null,
        ),
      ),
      '0.5.7-stage.1+1000',
    );
  });
}
