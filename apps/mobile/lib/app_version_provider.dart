import 'package:package_info_plus/package_info_plus.dart';

typedef PackageInfoLoader = Future<PackageInfo> Function();

class AppVersionProvider {
  AppVersionProvider({PackageInfoLoader? packageInfoLoader})
      : _packageInfoLoader = packageInfoLoader ?? PackageInfo.fromPlatform;

  final PackageInfoLoader _packageInfoLoader;

  Future<String?> load() async {
    try {
      final PackageInfo packageInfo = await _packageInfoLoader();
      final String version = packageInfo.version.trim();
      final String buildNumber = packageInfo.buildNumber.trim();
      if (version.isEmpty || buildNumber.isEmpty) {
        return null;
      }
      return 'v$version+$buildNumber';
    } catch (_) {
      return null;
    }
  }
}
