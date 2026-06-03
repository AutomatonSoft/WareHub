import 'dart:convert';
import 'dart:async';

import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

class MobileUpdateInfo {
  const MobileUpdateInfo({
    required this.channel,
    required this.latestVersion,
    required this.apkUrl,
    required this.currentVersion,
    required this.updateAvailable,
  });

  final String channel;
  final String latestVersion;
  final String apkUrl;
  final String currentVersion;
  final bool updateAvailable;
}

Future<MobileUpdateInfo?> loadMobileUpdateInfo(String apiBase) async {
  final Uri uri = Uri.parse('$apiBase/mobile/app-update');
  final http.Response response = await http.get(uri).timeout(
        const Duration(seconds: 10),
      );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    return null;
  }

  final dynamic decoded = jsonDecode(response.body);
  if (decoded is! Map<String, dynamic>) {
    return null;
  }

  final String channel = (decoded['channel'] as String? ?? '').trim();
  final String latestVersion =
      (decoded['latest_version'] as String? ?? '').trim();
  final String apkUrl = (decoded['apk_url'] as String? ?? '').trim();
  if (latestVersion.isEmpty || apkUrl.isEmpty) {
    return null;
  }
  final Uri? apkUri = Uri.tryParse(apkUrl);
  if (apkUri == null ||
      !(apkUri.isScheme('https') || apkUri.isScheme('http'))) {
    return null;
  }

  final PackageInfo packageInfo = await PackageInfo.fromPlatform();
  final String currentVersion = packageInfo.version.trim();
  final bool updateAvailable = compareVersions(
          normalizeVersion(latestVersion), normalizeVersion(currentVersion)) >
      0;

  return MobileUpdateInfo(
    channel: channel,
    latestVersion: latestVersion,
    apkUrl: apkUrl,
    currentVersion: currentVersion,
    updateAvailable: updateAvailable,
  );
}

String normalizeVersion(String value) {
  String normalized = value.trim();
  if (normalized.startsWith('v') || normalized.startsWith('V')) {
    normalized = normalized.substring(1);
  }
  final int plusIndex = normalized.indexOf('+');
  if (plusIndex >= 0) {
    normalized = normalized.substring(0, plusIndex);
  }
  final int dashIndex = normalized.indexOf('-');
  if (dashIndex >= 0) {
    normalized = normalized.substring(0, dashIndex);
  }
  return normalized.trim();
}

int compareVersions(String left, String right) {
  final RegExp leadingDigits = RegExp(r'^\d+');
  final List<int> a = left.split('.').map((String part) {
    final Match? match = leadingDigits.firstMatch(part.trim());
    return match == null ? 0 : int.parse(match.group(0)!);
  }).toList();
  final List<int> b = right.split('.').map((String part) {
    final Match? match = leadingDigits.firstMatch(part.trim());
    return match == null ? 0 : int.parse(match.group(0)!);
  }).toList();

  final int maxLen = a.length > b.length ? a.length : b.length;
  for (int i = 0; i < maxLen; i++) {
    final int ai = i < a.length ? a[i] : 0;
    final int bi = i < b.length ? b[i] : 0;
    if (ai > bi) {
      return 1;
    }
    if (ai < bi) {
      return -1;
    }
  }
  return 0;
}
