import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:local_auth/local_auth.dart';
import 'app_settings.dart';
import 'auth_design_tokens.dart';
import 'auth_widgets.dart';
import 'mobile_auth.dart';
import 'mobile_logging.dart';
import 'user_facing_error.dart';

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
          backgroundColor: AuthColors.muted,
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
    final AppStrings strings = AppStrings.of(context);
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
            headers: const <String, String>{
              'Content-Type': 'application/json',
              'x-warehub-client': 'mobile',
            },
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
      final MobileAuthPayload? authPayload = parseMobileAuthPayload(
        decoded,
        fallbackLogin: login,
      );
      if (authPayload == null) {
        _showMessage('Login failed: token missing');
        return;
      }
      if (authPayload.refreshToken.isEmpty) {
        _showMessage('Login failed: refresh token missing');
        return;
      }

      await settings.saveSession(
        token: authPayload.accessToken,
        refreshToken: authPayload.refreshToken,
        login: authPayload.login,
        email: authPayload.email,
        avatarUrl: authPayload.avatarUrl,
        role: authPayload.role,
      );
      configureMobileLogAuthToken(authPayload.accessToken);
      await _refreshProfile(authPayload.accessToken, apiBase);
    } on TimeoutException {
      debugPrint('Auth login timeout apiBase=$apiBase');
      _showMessage(strings.text('network_unavailable_login'));
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
      _showMessage(
        isNetworkUnavailableError(error)
            ? strings.text('network_unavailable_login')
            : strings.format(
                'login_failed_error',
                <String, String>{'error': '$error'},
              ),
      );
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
      data: buildAuthTheme(),
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(gradient: authBackgroundGradient),
          child: SafeArea(
            child: Stack(
              children: <Widget>[
                Positioned(
                  top: AuthSpacing.sm,
                  right: AuthSpacing.screenHorizontal,
                  child: AuthLanguagePicker(
                    label: strings.language,
                    value: settings.language,
                    onChanged: (AppLang lang) {
                      settings.setLanguage(lang);
                    },
                  ),
                ),
                Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(
                      AuthSpacing.screenHorizontal,
                      AuthSpacing.xxl,
                      AuthSpacing.screenHorizontal,
                      AuthSpacing.xxl,
                    ),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 430),
                      child: AuthGlassCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: <Widget>[
                            AuthBrandHeader(
                              title: strings.loginTitle,
                              subtitle: strings.loginSubtitle,
                            ),
                            const SizedBox(height: AuthSpacing.xl),
                            AuthLoginForm(
                              strings: strings,
                              loginController: _loginController,
                              passwordController: _loginPasswordController,
                              passwordHidden: _loginHidden,
                              isBusy: _loginBusy,
                              onSubmit: _onLoginSubmitted,
                              onTogglePassword: () => setState(() {
                                _loginHidden = !_loginHidden;
                              }),
                            ),
                            const SizedBox(height: AuthSpacing.md),
                            if (!_biometricAvailable)
                              Text(
                                strings.fingerprintUnavailable,
                                style: AuthTextStyles.helper,
                              ),
                            if (_biometricAvailable &&
                                settings.biometricEnabled) ...<Widget>[
                              const SizedBox(height: AuthSpacing.sm),
                              FilledButton.tonalIcon(
                                onPressed: _biometricBusy
                                    ? null
                                    : _authenticateWithBiometrics,
                                icon: _biometricBusy
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                        ),
                                      )
                                    : const Icon(
                                        Icons.fingerprint,
                                        size: 20,
                                      ),
                                label: Text(
                                  strings.fingerprintLogin,
                                  style: AuthTextStyles.label,
                                ),
                                style: FilledButton.styleFrom(
                                  backgroundColor: AuthColors.muted,
                                  foregroundColor: AuthColors.foreground,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: AuthSpacing.md,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius:
                                        BorderRadius.circular(AuthRadii.md),
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
