import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

const String _appEnv = String.fromEnvironment('APP_ENV', defaultValue: 'dev');

bool isDevEnv([String? env]) {
  return (env ?? _appEnv).trim().toLowerCase() == 'dev';
}

bool canOverrideApiBase([String? env]) {
  return isDevEnv(env);
}

String defaultApiBaseForEnv(String env) {
  switch (env.trim().toLowerCase()) {
    case 'dev':
      return 'https://stagewarehub.automatonsoft.de/api/v1';
    case 'stage':
      return 'https://stagewarehub.automatonsoft.de/api/v1';
    case 'prod':
      return 'https://warehub.automatonsoft.de/api/v1';
    default:
      return 'https://stagewarehub.automatonsoft.de/api/v1';
  }
}

final String defaultApiBase = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: defaultApiBaseForEnv(_appEnv),
);
String _mobileLogApiBase = defaultApiBase;
String _mobileLogAuthToken = '';

String normalizeApiBase(String? value) {
  final String trimmed = (value ?? '').trim();
  final String raw = trimmed.isEmpty ? defaultApiBase : trimmed;
  final Uri uri = Uri.parse(raw);
  final String normalizedPath = uri.path.endsWith('/')
      ? uri.path.substring(0, uri.path.length - 1)
      : uri.path;
  if (normalizedPath.endsWith('/api/v1')) {
    return uri.replace(path: normalizedPath).toString();
  }
  final String nextPath =
      normalizedPath.isEmpty ? '/api/v1' : '$normalizedPath/api/v1';
  return uri.replace(path: nextPath).toString();
}

void configureMobileLogApiBase(String? value) {
  _mobileLogApiBase = normalizeApiBase(value);
}

void configureMobileLogAuthToken(String? value) {
  _mobileLogAuthToken = (value ?? '').trim();
}

Future<void> sendMobileLog(
  String level,
  String message, {
  String? context,
}) async {
  final Uri uri = Uri.parse('$_mobileLogApiBase/logs/mobile');
  final Map<String, String> headers = <String, String>{
    'Content-Type': 'application/json',
  };
  if (_mobileLogAuthToken.isNotEmpty) {
    headers['Authorization'] = 'Bearer $_mobileLogAuthToken';
  }
  try {
    await http
        .post(
          uri,
          headers: headers,
          body: jsonEncode(<String, dynamic>{
            'level': level,
            'message': message,
            if (context != null && context.trim().isNotEmpty)
              'context': context.trim(),
          }),
        )
        .timeout(const Duration(seconds: 3));
  } catch (_) {
    // Ignore transport errors for logging endpoint.
  }
}
