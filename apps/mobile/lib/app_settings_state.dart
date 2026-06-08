import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_language.dart';
import 'mobile_logging.dart';

bool isAdminRole(String role) => role.trim().toLowerCase() == 'admin';

class AppSettings extends ChangeNotifier {
  AppSettings._(
    this._prefs,
    this._language,
    this._biometricEnabled,
    this._biometricAccountLogin,
    this._authToken,
    this._login,
    this._email,
    this._avatarUrl,
    this._role,
    this._apiBaseUrl,
  );

  static const String _langKey = 'sofortbot_mobile_lang';
  static const String _biometricKey = 'sofortbot_mobile_biometrics';
  static const String _biometricAccountKey =
      'sofortbot_mobile_biometric_account_login';
  static const String _authTokenKey = 'sofortbot_mobile_auth_token';
  static const String _loginKey = 'sofortbot_mobile_login';
  static const String _emailKey = 'sofortbot_mobile_email';
  static const String _avatarUrlKey = 'sofortbot_mobile_avatar_url';
  static const String _roleKey = 'sofortbot_mobile_role';
  static const String _apiBaseUrlKey = 'sofortbot_mobile_api_base_url';
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  final SharedPreferences _prefs;
  AppLang _language;
  bool _biometricEnabled;
  String _biometricAccountLogin;
  String _authToken;
  String _login;
  String _email;
  String _avatarUrl;
  String _role;
  String _apiBaseUrl;

  AppLang get language => _language;
  bool get biometricEnabled => _biometricEnabled;
  String get biometricAccountLogin => _biometricAccountLogin;
  String get authToken => _authToken;
  String get login => _login;
  String get email => _email;
  String get avatarUrl => _avatarUrl;
  String get role => _role;
  bool get isAdmin => isAdminRole(_role);
  String get apiBaseUrl => _apiBaseUrl;

  static Future<AppSettings> load() async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final String? langCode = prefs.getString(_langKey);
    final bool biometrics = prefs.getBool(_biometricKey) ?? false;
    final String biometricAccount = prefs.getString(_biometricAccountKey) ?? '';
    String token = '';
    try {
      token = await _secureStorage.read(key: _authTokenKey) ?? '';
    } catch (_) {
      token = '';
    }
    if (token.isEmpty) {
      final String legacyToken = prefs.getString(_authTokenKey) ?? '';
      if (legacyToken.isNotEmpty) {
        token = legacyToken;
        try {
          await _secureStorage.write(key: _authTokenKey, value: token);
          await prefs.remove(_authTokenKey);
        } catch (_) {
          // Keep legacy token fallback if secure storage is unavailable.
        }
      }
    }
    final String login = prefs.getString(_loginKey) ?? '';
    final String email = prefs.getString(_emailKey) ?? '';
    final String avatarUrl = prefs.getString(_avatarUrlKey) ?? '';
    final String role = prefs.getString(_roleKey) ?? '';
    String apiBaseUrl = prefs.getString(_apiBaseUrlKey) ?? '';
    final String normalizedApiBaseUrl = apiBaseUrl.trim().toLowerCase();
    final bool looksLikeLocalhostOverride =
        normalizedApiBaseUrl.contains('localhost') ||
            normalizedApiBaseUrl.contains('127.0.0.1');
    if (looksLikeLocalhostOverride && !isDevEnv()) {
      // Prevent stale localhost overrides from breaking stage/prod builds.
      apiBaseUrl = '';
      await prefs.remove(_apiBaseUrlKey);
    }
    final AppSettings settings = AppSettings._(
      prefs,
      AppLangX.fromCode(langCode),
      biometrics,
      biometricAccount,
      token,
      login,
      email,
      avatarUrl,
      role,
      apiBaseUrl,
    );
    settings._syncSentryUser();
    return settings;
  }

  Future<void> setLanguage(AppLang lang) async {
    if (lang == _language) {
      return;
    }
    _language = lang;
    notifyListeners();
    await _prefs.setString(_langKey, lang.code);
  }

  Future<void> setBiometricEnabled(bool enabled) async {
    if (enabled == _biometricEnabled) {
      return;
    }
    _biometricEnabled = enabled;
    notifyListeners();
    await _prefs.setBool(_biometricKey, enabled);
    if (!enabled) {
      _biometricAccountLogin = '';
      await _prefs.remove(_biometricAccountKey);
    }
  }

  Future<void> bindBiometricAccount(String login) async {
    final String normalized = login.trim();
    if (normalized.isEmpty) {
      return;
    }
    _biometricAccountLogin = normalized;
    notifyListeners();
    await _prefs.setString(_biometricAccountKey, normalized);
  }

  Future<void> saveSession({
    required String token,
    required String login,
    String? email,
    String? avatarUrl,
    String? role,
  }) async {
    _authToken = token.trim();
    _login = login.trim();
    _email = (email ?? '').trim();
    _avatarUrl = (avatarUrl ?? '').trim();
    _role = (role ?? '').trim();
    if (_biometricEnabled && _login.isNotEmpty) {
      _biometricAccountLogin = _login;
    }
    notifyListeners();
    await _prefs.setString(_authTokenKey, _authToken);
    await _prefs.setString(_loginKey, _login);
    await _prefs.setString(_emailKey, _email);
    await _prefs.setString(_avatarUrlKey, _avatarUrl);
    await _prefs.setString(_roleKey, _role);
    await _prefs.remove(_authTokenKey);
    try {
      await _secureStorage.write(key: _authTokenKey, value: _authToken);
    } catch (_) {
      // Fallback for environments where secure storage is unavailable.
      await _prefs.setString(_authTokenKey, _authToken);
    }
    if (_biometricEnabled && _biometricAccountLogin.isNotEmpty) {
      await _prefs.setString(_biometricAccountKey, _biometricAccountLogin);
    }
    _syncSentryUser();
  }

  Future<void> updateProfile({
    String? login,
    String? email,
    String? avatarUrl,
    String? role,
  }) async {
    if (login != null) {
      _login = login.trim();
      await _prefs.setString(_loginKey, _login);
    }
    if (email != null) {
      _email = email.trim();
      await _prefs.setString(_emailKey, _email);
    }
    if (avatarUrl != null) {
      _avatarUrl = avatarUrl.trim();
      await _prefs.setString(_avatarUrlKey, _avatarUrl);
    }
    if (role != null) {
      _role = role.trim();
      await _prefs.setString(_roleKey, _role);
    }
    notifyListeners();
    _syncSentryUser();
  }

  Future<void> clearSession() async {
    _authToken = '';
    _login = '';
    _email = '';
    _avatarUrl = '';
    _role = '';
    notifyListeners();
    try {
      await _secureStorage.delete(key: _authTokenKey);
    } catch (_) {
      // ignore secure storage delete failures
    }
    await _prefs.remove(_authTokenKey);
    await _prefs.remove(_loginKey);
    await _prefs.remove(_emailKey);
    await _prefs.remove(_avatarUrlKey);
    await _prefs.remove(_roleKey);
    _syncSentryUser();
  }

  Future<void> setApiBaseUrl(String value) async {
    _apiBaseUrl = value.trim();
    notifyListeners();
    await _prefs.setString(_apiBaseUrlKey, _apiBaseUrl);
  }

  void _syncSentryUser() {
    Sentry.configureScope((Scope scope) {
      if (_authToken.isEmpty || _login.isEmpty) {
        scope.setUser(null);
        return;
      }
      scope.setUser(SentryUser(
        username: _login,
        email: _email.isEmpty ? null : _email,
      ));
    });
  }
}
