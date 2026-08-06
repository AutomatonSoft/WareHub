import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:sofortbot_mobile/app_version_provider.dart';

void main() {
  test('loads installed APK version and build number', () async {
    final AppVersionProvider provider = AppVersionProvider(
      packageInfoLoader: () async => PackageInfo(
        appName: 'WareHub',
        packageName: 'dev.warehub.mobile',
        version: '0.5.7-stage.2',
        buildNumber: '1001',
        buildSignature: '',
        installerStore: null,
      ),
    );

    expect(await provider.load(), 'v0.5.7-stage.2+1001');
  });

  test('returns null when package metadata cannot be loaded', () async {
    final AppVersionProvider provider = AppVersionProvider(
      packageInfoLoader: () async => throw StateError('unavailable'),
    );

    expect(await provider.load(), isNull);
  });

  test('returns null when package metadata is incomplete', () async {
    final AppVersionProvider provider = AppVersionProvider(
      packageInfoLoader: () async => PackageInfo(
        appName: 'WareHub',
        packageName: 'dev.warehub.mobile',
        version: '0.5.7',
        buildNumber: '',
        buildSignature: '',
        installerStore: null,
      ),
    );

    expect(await provider.load(), isNull);
  });
}
