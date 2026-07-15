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
  final String currentVersion = formatInstalledVersion(packageInfo);
  final bool updateAvailable =
      compareVersions(latestVersion, currentVersion) > 0;

  return MobileUpdateInfo(
    channel: channel,
    latestVersion: latestVersion,
    apkUrl: apkUrl,
    currentVersion: currentVersion,
    updateAvailable: updateAvailable,
  );
}

String formatInstalledVersion(PackageInfo packageInfo) {
  final String version = packageInfo.version.trim();
  final String buildNumber = packageInfo.buildNumber.trim();
  if (version.isEmpty) {
    return buildNumber;
  }
  if (buildNumber.isEmpty || version.contains('+')) {
    return version;
  }
  return '$version+$buildNumber';
}

String normalizeVersion(String value) {
  String normalized = value.trim();
  if (normalized.startsWith('v') || normalized.startsWith('V')) {
    normalized = normalized.substring(1);
  }
  return normalized.trim();
}

int compareVersions(String left, String right) {
  final _ParsedVersion a = _ParsedVersion.parse(left);
  final _ParsedVersion b = _ParsedVersion.parse(right);

  final int maxLen =
      a.core.length > b.core.length ? a.core.length : b.core.length;
  for (int i = 0; i < maxLen; i++) {
    final int ai = i < a.core.length ? a.core[i] : 0;
    final int bi = i < b.core.length ? b.core[i] : 0;
    if (ai > bi) {
      return 1;
    }
    if (ai < bi) {
      return -1;
    }
  }

  if (a.stageBuild == null) {
    if (b.stageBuild == null) {
      if (a.buildNumber != null && b.buildNumber != null) {
        return a.buildNumber!.compareTo(b.buildNumber!);
      }
      return 0;
    }
    return 1;
  }
  if (b.stageBuild == null) {
    return -1;
  }
  final int stageCompare = a.stageBuild!.compareTo(b.stageBuild!);
  if (stageCompare != 0) {
    return stageCompare;
  }
  if (a.buildNumber != null && b.buildNumber != null) {
    return a.buildNumber!.compareTo(b.buildNumber!);
  }
  return 0;
}

class _ParsedVersion {
  const _ParsedVersion(this.core, this.stageBuild, this.buildNumber);

  final List<int> core;
  final int? stageBuild;
  final int? buildNumber;

  factory _ParsedVersion.parse(String value) {
    final String normalized = normalizeVersion(value);
    final int buildSeparatorIndex = normalized.indexOf('+');
    final String withoutBuild = buildSeparatorIndex >= 0
        ? normalized.substring(0, buildSeparatorIndex)
        : normalized;
    final String? buildValue = buildSeparatorIndex >= 0
        ? normalized.substring(buildSeparatorIndex + 1)
        : null;
    final int prereleaseIndex = withoutBuild.indexOf('-');
    final String coreValue = prereleaseIndex >= 0
        ? withoutBuild.substring(0, prereleaseIndex)
        : withoutBuild;
    final String? prerelease = prereleaseIndex >= 0
        ? withoutBuild.substring(prereleaseIndex + 1)
        : null;
    final RegExp leadingDigits = RegExp(r'^\d+');
    final List<int> core = coreValue.split('.').map((String part) {
      final Match? match = leadingDigits.firstMatch(part.trim());
      return match == null ? 0 : int.parse(match.group(0)!);
    }).toList();
    final Match? stageMatch =
        RegExp(r'^stage\.(\d+)$').firstMatch(prerelease ?? '');
    final Match? buildMatch = RegExp(r'^(\d+)$').firstMatch(buildValue ?? '');

    return _ParsedVersion(
      core,
      stageMatch == null ? null : int.parse(stageMatch.group(1)!),
      buildMatch == null ? null : int.parse(buildMatch.group(1)!),
    );
  }
}
