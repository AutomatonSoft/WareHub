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
    this._refreshToken,
    this._login,
    this._username,
    this._email,
    this._firstName,
    this._lastName,
    this._phoneNumber,
    this._avatarUrl,
    this._role,
    this._status,
    this._apiBaseUrl,
  );

  static const String _langKey = 'sofortbot_mobile_lang';
  static const String _biometricKey = 'sofortbot_mobile_biometrics';
  static const String _biometricAccountKey =
      'sofortbot_mobile_biometric_account_login';
  static const String _authTokenKey = 'sofortbot_mobile_auth_token';
  static const String _refreshTokenKey = 'sofortbot_mobile_refresh_token';
  static const String _loginKey = 'sofortbot_mobile_login';
  static const String _usernameKey = 'sofortbot_mobile_username';
  static const String _emailKey = 'sofortbot_mobile_email';
  static const String _firstNameKey = 'sofortbot_mobile_first_name';
  static const String _lastNameKey = 'sofortbot_mobile_last_name';
  static const String _phoneNumberKey = 'sofortbot_mobile_phone_number';
  static const String _avatarUrlKey = 'sofortbot_mobile_avatar_url';
  static const String _roleKey = 'sofortbot_mobile_role';
  static const String _statusKey = 'sofortbot_mobile_status';
  static const String _apiBaseUrlKey = 'sofortbot_mobile_api_base_url';
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  final SharedPreferences _prefs;
  AppLang _language;
  bool _biometricEnabled;
  String _biometricAccountLogin;
  String _authToken;
  String _refreshToken;
  String _login;
  String _username;
  String _email;
  String _firstName;
  String _lastName;
  String _phoneNumber;
  String _avatarUrl;
  String _role;
  String _status;
  String _apiBaseUrl;

  AppLang get language => _language;
  bool get biometricEnabled => _biometricEnabled;
  String get biometricAccountLogin => _biometricAccountLogin;
  String get authToken => _authToken;
  String get refreshToken => _refreshToken;
  String get login => _login;
  String get username => _username;
  String get email => _email;
  String get firstName => _firstName;
  String get lastName => _lastName;
  String get phoneNumber => _phoneNumber;
  String get avatarUrl => _avatarUrl;
  String get role => _role;
  String get status => _status;
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
    String refreshToken = '';
    try {
      refreshToken = await _secureStorage.read(key: _refreshTokenKey) ?? '';
    } catch (_) {
      refreshToken = '';
    }
    if (refreshToken.isEmpty) {
      final String legacyRefreshToken = prefs.getString(_refreshTokenKey) ?? '';
      if (legacyRefreshToken.isNotEmpty) {
        refreshToken = legacyRefreshToken;
        try {
          await _secureStorage.write(
            key: _refreshTokenKey,
            value: refreshToken,
          );
          await prefs.remove(_refreshTokenKey);
        } catch (_) {
          // Keep legacy token fallback if secure storage is unavailable.
        }
      }
    }
    final String login = prefs.getString(_loginKey) ?? '';
    final String username = prefs.getString(_usernameKey) ?? '';
    final String email = prefs.getString(_emailKey) ?? '';
    final String firstName = prefs.getString(_firstNameKey) ?? '';
    final String lastName = prefs.getString(_lastNameKey) ?? '';
    final String phoneNumber = prefs.getString(_phoneNumberKey) ?? '';
    final String avatarUrl = prefs.getString(_avatarUrlKey) ?? '';
    final String role = prefs.getString(_roleKey) ?? '';
    final String status = prefs.getString(_statusKey) ?? '';
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
      refreshToken,
      login,
      username,
      email,
      firstName,
      lastName,
      phoneNumber,
      avatarUrl,
      role,
      status,
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
    String? refreshToken,
    required String login,
    String? username,
    String? email,
    String? firstName,
    String? lastName,
    String? phoneNumber,
    String? avatarUrl,
    String? role,
    String? status,
  }) async {
    _authToken = token.trim();
    if (refreshToken != null) {
      _refreshToken = refreshToken.trim();
    }
    _login = login.trim();
    _username = (username ?? '').trim();
    _email = (email ?? '').trim();
    _firstName = (firstName ?? '').trim();
    _lastName = (lastName ?? '').trim();
    _phoneNumber = (phoneNumber ?? '').trim();
    _avatarUrl = (avatarUrl ?? '').trim();
    _role = (role ?? '').trim();
    _status = (status ?? '').trim();
    await _prefs.setString(_loginKey, _login);
    await _prefs.setString(_usernameKey, _username);
    await _prefs.setString(_emailKey, _email);
    await _prefs.setString(_firstNameKey, _firstName);
    await _prefs.setString(_lastNameKey, _lastName);
    await _prefs.setString(_phoneNumberKey, _phoneNumber);
    await _prefs.setString(_avatarUrlKey, _avatarUrl);
    await _prefs.setString(_roleKey, _role);
    await _prefs.setString(_statusKey, _status);
    if (_biometricEnabled && _login.isNotEmpty) {
      _biometricAccountLogin = _login;
    }
    notifyListeners();

    try {
      await _secureStorage.write(key: _authTokenKey, value: _authToken);
      if (refreshToken != null) {
        await _secureStorage.write(
          key: _refreshTokenKey,
          value: _refreshToken,
        );
      }
      // Remove from plain prefs ONLY if secure storage succeeded.
      await _prefs.remove(_authTokenKey);
      await _prefs.remove(_refreshTokenKey);
    } catch (_) {
      // Fallback for environments where secure storage is unavailable.
      await _prefs.setString(_authTokenKey, _authToken);
      if (refreshToken != null) {
        await _prefs.setString(_refreshTokenKey, _refreshToken);
      }
    }
    if (_biometricEnabled && _biometricAccountLogin.isNotEmpty) {
      await _prefs.setString(_biometricAccountKey, _biometricAccountLogin);
    }
    _syncSentryUser();
  }

  Future<void> updateProfile({
    String? login,
    String? username,
    String? email,
    String? firstName,
    String? lastName,
    String? phoneNumber,
    String? avatarUrl,
    String? role,
    String? status,
  }) async {
    if (login != null) {
      _login = login.trim();
      await _prefs.setString(_loginKey, _login);
    }
    if (username != null) {
      _username = username.trim();
      await _prefs.setString(_usernameKey, _username);
    }
    if (email != null) {
      _email = email.trim();
      await _prefs.setString(_emailKey, _email);
    }
    if (firstName != null) {
      _firstName = firstName.trim();
      await _prefs.setString(_firstNameKey, _firstName);
    }
    if (lastName != null) {
      _lastName = lastName.trim();
      await _prefs.setString(_lastNameKey, _lastName);
    }
    if (phoneNumber != null) {
      _phoneNumber = phoneNumber.trim();
      await _prefs.setString(_phoneNumberKey, _phoneNumber);
    }
    if (avatarUrl != null) {
      _avatarUrl = avatarUrl.trim();
      await _prefs.setString(_avatarUrlKey, _avatarUrl);
    }
    if (role != null) {
      _role = role.trim();
      await _prefs.setString(_roleKey, _role);
    }
    if (status != null) {
      _status = status.trim();
      await _prefs.setString(_statusKey, _status);
    }
    notifyListeners();
    _syncSentryUser();
  }

  Future<void> clearSession() async {
    _authToken = '';
    _refreshToken = '';
    _login = '';
    _username = '';
    _email = '';
    _firstName = '';
    _lastName = '';
    _phoneNumber = '';
    _avatarUrl = '';
    _role = '';
    _status = '';
    notifyListeners();
    try {
      await _secureStorage.delete(key: _authTokenKey);
      await _secureStorage.delete(key: _refreshTokenKey);
    } catch (_) {
      // ignore secure storage delete failures
    }
    await _prefs.remove(_authTokenKey);
    await _prefs.remove(_refreshTokenKey);
    await _prefs.remove(_loginKey);
    await _prefs.remove(_usernameKey);
    await _prefs.remove(_emailKey);
    await _prefs.remove(_firstNameKey);
    await _prefs.remove(_lastNameKey);
    await _prefs.remove(_phoneNumberKey);
    await _prefs.remove(_avatarUrlKey);
    await _prefs.remove(_roleKey);
    await _prefs.remove(_statusKey);
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
