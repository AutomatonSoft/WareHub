import 'dart:convert';

import 'package:http/http.dart' as http;

import 'app_settings.dart';
import 'mobile_logging.dart';
import 'user_facing_error.dart';

enum MobileAuthRefreshStatus {
  refreshed,
  invalid,
  temporarilyUnavailable,
}

class MobileAuthRefreshResult {
  const MobileAuthRefreshResult(this.status);

  final MobileAuthRefreshStatus status;

  bool get refreshed => status == MobileAuthRefreshStatus.refreshed;
  bool get shouldLogout => status == MobileAuthRefreshStatus.invalid;
  bool get isTemporarilyUnavailable =>
      status == MobileAuthRefreshStatus.temporarilyUnavailable;
}

Future<MobileAuthRefreshResult>? _refreshInFlight;

class MobileAuthPayload {
  const MobileAuthPayload({
    required this.accessToken,
    required this.refreshToken,
    required this.login,
    required this.email,
    required this.avatarUrl,
    required this.role,
  });

  final String accessToken;
  final String refreshToken;
  final String login;
  final String email;
  final String avatarUrl;
  final String role;
}

MobileAuthPayload? parseMobileAuthPayload(
  Map<String, dynamic> payload, {
  String fallbackLogin = '',
}) {
  final String accessToken =
      '${payload['access_token'] ?? payload['token'] ?? ''}'.trim();
  if (accessToken.isEmpty) {
    return null;
  }

  final dynamic rawUser = payload['user'];
  String login = fallbackLogin.trim();
  String email = '';
  String avatarUrl = '';
  String role = '';
  if (rawUser is Map<String, dynamic>) {
    login = '${rawUser['login'] ?? login}'.trim();
    email = '${rawUser['email'] ?? ''}'.trim();
    avatarUrl = '${rawUser['avatar_url'] ?? ''}'.trim();
    role = '${rawUser['role'] ?? ''}'.trim();
  }

  return MobileAuthPayload(
    accessToken: accessToken,
    refreshToken: '${payload['refresh_token'] ?? ''}'.trim(),
    login: login,
    email: email,
    avatarUrl: avatarUrl,
    role: role,
  );
}

Future<MobileAuthRefreshResult> refreshMobileAuthSessionDetailed(
  AppSettings settings, {
  String? apiBase,
}) async {
  final Future<MobileAuthRefreshResult>? existing = _refreshInFlight;
  if (existing != null) {
    return existing;
  }

  final Future<MobileAuthRefreshResult> next =
      _refreshMobileAuthSessionOnce(settings, apiBase: apiBase);
  _refreshInFlight = next;
  try {
    return await next;
  } finally {
    if (identical(_refreshInFlight, next)) {
      _refreshInFlight = null;
    }
  }
}

Future<bool> refreshMobileAuthSession(
  AppSettings settings, {
  String? apiBase,
}) async {
  final MobileAuthRefreshResult result =
      await refreshMobileAuthSessionDetailed(settings, apiBase: apiBase);
  return result.refreshed;
}

Future<MobileAuthRefreshResult> _refreshMobileAuthSessionOnce(
  AppSettings settings, {
  String? apiBase,
}) async {
  final String refreshToken = settings.refreshToken.trim();
  if (refreshToken.isEmpty) {
    return const MobileAuthRefreshResult(MobileAuthRefreshStatus.invalid);
  }

  final String normalizedApiBase =
      normalizeApiBase(apiBase ?? settings.apiBaseUrl);
  try {
    final http.Response response = await http
        .post(
          Uri.parse('$normalizedApiBase/auth/refresh'),
          headers: const <String, String>{
            'Content-Type': 'application/json',
            'x-warehub-client': 'mobile',
          },
          body: jsonEncode(<String, String>{
            'refresh_token': refreshToken,
          }),
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode >= 500) {
      return const MobileAuthRefreshResult(
        MobileAuthRefreshStatus.temporarilyUnavailable,
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return const MobileAuthRefreshResult(MobileAuthRefreshStatus.invalid);
    }
    final dynamic decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      return const MobileAuthRefreshResult(MobileAuthRefreshStatus.invalid);
    }
    final MobileAuthPayload? payload = parseMobileAuthPayload(
      decoded,
      fallbackLogin: settings.login,
    );
    if (payload == null || payload.refreshToken.isEmpty) {
      return const MobileAuthRefreshResult(MobileAuthRefreshStatus.invalid);
    }

    await settings.saveSession(
      token: payload.accessToken,
      refreshToken: payload.refreshToken,
      login: payload.login.isEmpty ? settings.login : payload.login,
      email: payload.email,
      avatarUrl: payload.avatarUrl,
      role: payload.role,
    );
    configureMobileLogAuthToken(payload.accessToken);
    return const MobileAuthRefreshResult(MobileAuthRefreshStatus.refreshed);
  } catch (error) {
    if (isNetworkUnavailableError(error)) {
      return const MobileAuthRefreshResult(
        MobileAuthRefreshStatus.temporarilyUnavailable,
      );
    }
    return const MobileAuthRefreshResult(MobileAuthRefreshStatus.invalid);
  }
}

Future<http.Response> mobileAuthorizedRequest(
  AppSettings settings,
  String method,
  Uri uri, {
  Map<String, String>? headers,
  String? body,
  bool retryOnUnauthorized = true,
}) async {
  Future<http.Response> sendOnce() async {
    final http.Request request = http.Request(method, uri);
    request.headers.addAll(headers ?? const <String, String>{});
    final String token = settings.authToken.trim();
    if (token.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    if (body != null) {
      request.body = body;
    }
    return http.Response.fromStream(await request.send());
  }

  final http.Response response = await sendOnce();
  if (response.statusCode != 401 || !retryOnUnauthorized) {
    return response;
  }

  final MobileAuthRefreshResult refresh =
      await refreshMobileAuthSessionDetailed(settings);
  if (refresh.refreshed) {
    return sendOnce();
  }
  if (refresh.isTemporarilyUnavailable) {
    throw const MobileAuthRefreshUnavailableException();
  }
  if (!refresh.shouldLogout) {
    return response;
  }
  return response;
}

Future<void> logoutMobileAuthSession(
  AppSettings settings, {
  String? apiBase,
}) async {
  final String accessToken = settings.authToken.trim();
  final String refreshToken = settings.refreshToken.trim();
  if (accessToken.isEmpty && refreshToken.isEmpty) {
    await settings.clearSession();
    configureMobileLogAuthToken('');
    return;
  }

  final String normalizedApiBase =
      normalizeApiBase(apiBase ?? settings.apiBaseUrl);
  final Map<String, String> headers = <String, String>{
    'Content-Type': 'application/json',
    'x-warehub-client': 'mobile',
  };
  if (accessToken.isNotEmpty) {
    headers['Authorization'] = 'Bearer $accessToken';
  }

  try {
    await http
        .post(
          Uri.parse('$normalizedApiBase/auth/logout'),
          headers: headers,
          body: jsonEncode(<String, String>{
            if (refreshToken.isNotEmpty) 'refresh_token': refreshToken,
          }),
        )
        .timeout(const Duration(seconds: 5));
  } catch (_) {}

  await settings.clearSession();
  configureMobileLogAuthToken('');
}
