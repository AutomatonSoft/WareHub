import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:local_auth/local_auth.dart';
import 'app_settings.dart';
import 'app_theme.dart';
import 'auth_widgets.dart';
import 'mobile_logging.dart';

part 'auth_screen_biometrics.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _loginHidden = true;
  bool _loginBusy = false;
  bool _biometricAvailable = false;
  bool _biometricBusy = false;
  bool _autoPrompted = false;
  bool _checkedBiometrics = false;

  final LocalAuthentication _localAuth = LocalAuthentication();

  final TextEditingController _loginController = TextEditingController();
  final TextEditingController _loginPasswordController =
      TextEditingController();

  @override
  void dispose() {
    _loginController.dispose();
    _loginPasswordController.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final AppSettings settings = AppSettingsScope.of(context);
    if (!_checkedBiometrics) {
      _checkedBiometrics = true;
      unawaited(_initBiometrics(settings));
    }
  }

  void _showMessage(String message) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: uiCardSoft,
        ),
      );
  }

  Future<void> _continueToApp() async {
    if (!mounted) {
      return;
    }
    Navigator.of(context).pushReplacementNamed('/home');
  }

  Future<void> _onLoginSubmitted() async {
    if (_loginBusy) {
      return;
    }
    final AppSettings settings = AppSettingsScope.of(context);
    final String apiBase = normalizeApiBase(settings.apiBaseUrl);
    final String login = _loginController.text.trim();
    final String password = _loginPasswordController.text;
    if (login.isEmpty || password.isEmpty) {
      _showMessage('Login and password are required.');
      return;
    }

    setState(() {
      _loginBusy = true;
    });
    debugPrint('Auth login start apiBase=$apiBase login=$login');
    unawaited(
      sendMobileLog(
        'info',
        'auth login started',
        context: 'apiBase=$apiBase login=$login',
      ),
    );

    try {
      final http.Response response = await http
          .post(
            Uri.parse('$apiBase/auth/login'),
            headers: const <String, String>{'Content-Type': 'application/json'},
            body: jsonEncode(<String, String>{
              'login': login,
              'password': password,
            }),
          )
          .timeout(const Duration(seconds: 10));
      debugPrint(
          'Auth login response status=${response.statusCode} apiBase=$apiBase');
      unawaited(
        sendMobileLog(
          'info',
          'auth login response',
          context: 'status=${response.statusCode} apiBase=$apiBase',
        ),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        String message = 'Login failed: HTTP ${response.statusCode}';
        try {
          final dynamic payload = jsonDecode(response.body);
          if (payload is Map<String, dynamic>) {
            final dynamic apiCode = payload['code'];
            final dynamic apiMessage = payload['message'];
            if (apiMessage is String && apiMessage.trim().isNotEmpty) {
              message = apiMessage.trim();
            }
            if (apiCode is String && apiCode.trim().isNotEmpty) {
              message = '$message (${apiCode.trim()})';
            }
          }
        } catch (_) {}
        _showMessage(message);
        return;
      }

      final dynamic decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        _showMessage('Login failed: invalid response');
        return;
      }
      final String token = '${decoded['token'] ?? ''}'.trim();
      final dynamic rawUser = decoded['user'];
      String nextLogin = login;
      String nextEmail = '';
      String nextAvatarUrl = '';
      if (rawUser is Map<String, dynamic>) {
        nextLogin = '${rawUser['login'] ?? login}'.trim();
        nextEmail = '${rawUser['email'] ?? ''}'.trim();
        nextAvatarUrl = '${rawUser['avatar_url'] ?? ''}'.trim();
      }
      final String nextRole = rawUser is Map<String, dynamic>
          ? '${rawUser['role'] ?? ''}'.trim()
          : '';

      if (token.isEmpty) {
        _showMessage('Login failed: token missing');
        return;
      }

      await settings.saveSession(
        token: token,
        login: nextLogin,
        email: nextEmail,
        avatarUrl: nextAvatarUrl,
        role: nextRole,
      );
      configureMobileLogAuthToken(token);
      await _refreshProfile(token, apiBase);
    } on TimeoutException {
      debugPrint('Auth login timeout apiBase=$apiBase');
      _showMessage('Login failed: backend timeout at $apiBase');
      return;
    } catch (error) {
      debugPrint('Auth login error apiBase=$apiBase error=$error');
      unawaited(
        sendMobileLog(
          'error',
          'auth login failed',
          context: 'apiBase=$apiBase error=$error',
        ),
      );
      _showMessage('Login failed: $error');
      return;
    } finally {
      if (mounted) {
        setState(() {
          _loginBusy = false;
        });
      }
    }

    await _offerBiometricEnrollment();
    if (!mounted) {
      return;
    }
    await _continueToApp();
  }

  Future<void> _refreshProfile(String token, String apiBase) async {
    final AppSettings settings = AppSettingsScope.of(context);
    try {
      final http.Response response = await http.get(
        Uri.parse('$apiBase/auth/me'),
        headers: <String, String>{
          'Authorization': 'Bearer $token',
        },
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return;
      }
      final dynamic decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        return;
      }
      await settings.updateProfile(
        login: '${decoded['login'] ?? ''}',
        email: '${decoded['email'] ?? ''}',
        avatarUrl: '${decoded['avatar_url'] ?? ''}',
        role: '${decoded['role'] ?? ''}',
      );
    } catch (_) {
      // Ignore profile sync errors on login.
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppSettings settings = AppSettingsScope.of(context);
    final AppStrings strings = AppStrings.of(context);
    return Theme(
      data: buildAppTheme(),
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(gradient: appBackgroundGradient),
          child: Stack(
            children: <Widget>[
              Positioned(
                top: -120,
                right: -80,
                child: AuthGlowOrb(
                  size: 260,
                  colors: <Color>[
                    uiGreen.withValues(alpha: 0.4),
                    Colors.transparent,
                  ],
                ),
              ),
              Positioned(
                bottom: -140,
                left: -90,
                child: AuthGlowOrb(
                  size: 320,
                  colors: <Color>[
                    uiOrange.withValues(alpha: 0.35),
                    Colors.transparent,
                  ],
                ),
              ),
              SafeArea(
                child: LayoutBuilder(
                  builder: (BuildContext context, BoxConstraints constraints) {
                    return Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 460),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: <Widget>[
                              Align(
                                alignment: Alignment.centerRight,
                                child: SizedBox(
                                  width: double.infinity,
                                  child: AuthLanguagePicker(
                                    label: strings.language,
                                    value: settings.language,
                                    onChanged: (AppLang lang) {
                                      settings.setLanguage(lang);
                                    },
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              AuthGlassCard(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: <Widget>[
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: <Widget>[
                                        ClipRRect(
                                          borderRadius:
                                              BorderRadius.circular(12),
                                          child: Image.asset(
                                            'assets/images/logo.png',
                                            width: 44,
                                            height: 44,
                                            fit: BoxFit.cover,
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        const Text(
                                          'Warehub',
                                          style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 0.8,
                                            color: uiNavy,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 12),
                                    Text(
                                      strings.loginTitle,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        fontSize: 26,
                                        fontWeight: FontWeight.w800,
                                        color: uiText,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(
                                      strings.loginSubtitle,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: uiMuted,
                                      ),
                                    ),
                                    const SizedBox(height: 18),
                                    AuthLoginForm(
                                      strings: strings,
                                      loginController: _loginController,
                                      passwordController:
                                          _loginPasswordController,
                                      passwordHidden: _loginHidden,
                                      isBusy: _loginBusy,
                                      onSubmit: _onLoginSubmitted,
                                      onTogglePassword: () => setState(() {
                                        _loginHidden = !_loginHidden;
                                      }),
                                    ),
                                    const SizedBox(height: 12),
                                    if (!_biometricAvailable) ...<Widget>[
                                      const SizedBox(height: 6),
                                      Text(
                                        strings.fingerprintUnavailable,
                                        style: const TextStyle(
                                          color: uiMuted,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                    if (_biometricAvailable &&
                                        settings.biometricEnabled) ...<Widget>[
                                      const SizedBox(height: 10),
                                      FilledButton.tonalIcon(
                                        onPressed: _biometricBusy
                                            ? null
                                            : _authenticateWithBiometrics,
                                        icon: _biometricBusy
                                            ? const SizedBox(
                                                width: 16,
                                                height: 16,
                                                child:
                                                    CircularProgressIndicator(
                                                  strokeWidth: 2,
                                                ),
                                              )
                                            : const Icon(
                                                Icons.fingerprint,
                                                size: 20,
                                              ),
                                        label: Text(strings.fingerprintLogin),
                                        style: FilledButton.styleFrom(
                                          backgroundColor: uiCardSoft,
                                          foregroundColor: uiText,
                                          padding: const EdgeInsets.symmetric(
                                            vertical: 12,
                                          ),
                                          shape: RoundedRectangleBorder(
                                            borderRadius:
                                                BorderRadius.circular(16),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
