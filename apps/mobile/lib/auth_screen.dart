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
  BiometricType? _preferredBiometricType;

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

  Future<void> _openForgotPassword() async {
    final AppSettings settings = AppSettingsScope.of(context);
    final String apiBase = normalizeApiBase(settings.apiBaseUrl);
    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (BuildContext context) {
        return _ForgotPasswordDialog(apiBase: apiBase);
      },
    );
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
        username: authPayload.username,
        email: authPayload.email,
        firstName: authPayload.firstName,
        lastName: authPayload.lastName,
        phoneNumber: authPayload.phoneNumber,
        avatarUrl: authPayload.avatarUrl,
        role: authPayload.role,
        status: authPayload.status,
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
        username: '${decoded['username'] ?? decoded['user_name'] ?? ''}',
        email: '${decoded['email'] ?? ''}',
        firstName: '${decoded['first_name'] ?? ''}',
        lastName: '${decoded['last_name'] ?? ''}',
        phoneNumber: '${decoded['phone_number'] ?? decoded['phone'] ?? ''}',
        avatarUrl: '${decoded['avatar_url'] ?? ''}',
        role: '${decoded['role'] ?? ''}',
        status: '${decoded['status'] ?? ''}',
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
        body: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
          child: Container(
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
                                onForgotPassword: () {
                                  unawaited(_openForgotPassword());
                                },
                                onTogglePassword: () => setState(() {
                                  _loginHidden = !_loginHidden;
                                }),
                              ),
                              const SizedBox(height: AuthSpacing.md),
                              if (!_biometricAvailable)
                                Text(
                                  strings.text('biometric_unavailable'),
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
                                      : Icon(
                                          _preferredBiometricType ==
                                                  BiometricType.face
                                              ? Icons.face_rounded
                                              : _preferredBiometricType ==
                                                      BiometricType.fingerprint
                                                  ? Icons.fingerprint
                                                  : Icons.lock_person_rounded,
                                          size: 20,
                                        ),
                                  label: Text(
                                    _biometricLoginLabel(strings),
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
      ),
    );
  }
}

enum _ForgotPasswordStep { email, code, password }

class _ForgotPasswordDialog extends StatefulWidget {
  const _ForgotPasswordDialog({required this.apiBase});

  final String apiBase;

  @override
  State<_ForgotPasswordDialog> createState() => _ForgotPasswordDialogState();
}

class _ForgotPasswordDialogState extends State<_ForgotPasswordDialog> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _codeController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmController = TextEditingController();

  _ForgotPasswordStep _step = _ForgotPasswordStep.email;
  bool _busy = false;
  bool _passwordHidden = true;
  bool _confirmHidden = true;
  String? _message;
  bool _messageIsError = false;

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    if (_busy) {
      return;
    }
    final AppStrings strings = AppStrings.of(context);
    final String email = _emailController.text.trim().toLowerCase();
    if (!_looksLikeEmail(email)) {
      _setMessage(strings.text('reset_email_invalid'), error: true);
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
      _messageIsError = false;
    });
    try {
      final http.Response response = await http
          .post(
            Uri.parse('${widget.apiBase}/auth/password/reset/request'),
            headers: const <String, String>{
              'Content-Type': 'application/json',
              'x-warehub-client': 'mobile',
            },
            body: jsonEncode(<String, String>{'email': email}),
          )
          .timeout(const Duration(seconds: 10));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw UserFacingError(_extractAuthMessage(
          response,
          strings.text('reset_request_failed'),
        ));
      }
      setState(() {
        _step = _ForgotPasswordStep.code;
        _message = strings.text('reset_code_sent');
        _messageIsError = false;
      });
    } on TimeoutException {
      _setMessage(strings.text('network_unavailable_login'), error: true);
    } catch (error) {
      _setMessage('$error', error: true);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  void _continueToPassword() {
    final AppStrings strings = AppStrings.of(context);
    final String code = _codeController.text.trim();
    if (code.length != 6) {
      _setMessage(strings.text('reset_code_invalid'), error: true);
      return;
    }
    setState(() {
      _step = _ForgotPasswordStep.password;
      _message = null;
      _messageIsError = false;
    });
  }

  Future<void> _confirmReset() async {
    if (_busy) {
      return;
    }
    final AppStrings strings = AppStrings.of(context);
    final String email = _emailController.text.trim().toLowerCase();
    final String code = _codeController.text.trim();
    final String password = _passwordController.text;
    final String confirm = _confirmController.text;
    final String? passwordError = _validatePassword(password, strings);
    if (passwordError != null) {
      _setMessage(passwordError, error: true);
      return;
    }
    if (password != confirm) {
      _setMessage(strings.text('reset_password_mismatch'), error: true);
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
      _messageIsError = false;
    });
    try {
      final http.Response response = await http
          .post(
            Uri.parse('${widget.apiBase}/auth/password/reset/confirm'),
            headers: const <String, String>{
              'Content-Type': 'application/json',
              'x-warehub-client': 'mobile',
            },
            body: jsonEncode(<String, String>{
              'email': email,
              'code': code,
              'password': password,
            }),
          )
          .timeout(const Duration(seconds: 10));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw UserFacingError(_extractAuthMessage(
          response,
          strings.text('reset_confirm_failed'),
        ));
      }
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(strings.text('password_reset_success')),
            backgroundColor: AuthColors.muted,
          ),
        );
    } on TimeoutException {
      _setMessage(strings.text('network_unavailable_login'), error: true);
    } catch (error) {
      _setMessage('$error', error: true);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  void _setMessage(String message, {required bool error}) {
    if (!mounted) {
      return;
    }
    setState(() {
      _message = message;
      _messageIsError = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(
        horizontal: AuthSpacing.screenHorizontal,
        vertical: AuthSpacing.xxl,
      ),
      backgroundColor: Colors.transparent,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 430),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: AuthColors.card,
            borderRadius: BorderRadius.circular(AuthRadii.xl),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 28,
                offset: const Offset(0, 16),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AuthSpacing.xl,
              AuthSpacing.lg,
              AuthSpacing.xl,
              AuthSpacing.xl,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: Text(
                          strings.text('reset_password_title'),
                          style: AuthTextStyles.title.copyWith(fontSize: 24),
                        ),
                      ),
                      IconButton(
                        onPressed:
                            _busy ? null : () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: AuthSpacing.sm),
                  Text(
                    _stepSubtitle(strings),
                    style: AuthTextStyles.helper,
                  ),
                  const SizedBox(height: AuthSpacing.lg),
                  ..._buildStepFields(strings),
                  if ((_message ?? '').trim().isNotEmpty) ...<Widget>[
                    const SizedBox(height: AuthSpacing.md),
                    Container(
                      padding: const EdgeInsets.all(AuthSpacing.md),
                      decoration: BoxDecoration(
                        color: _messageIsError
                            ? AuthColors.destructive.withValues(alpha: 0.10)
                            : AuthColors.muted,
                        borderRadius: BorderRadius.circular(AuthRadii.md),
                      ),
                      child: Text(
                        _message!,
                        style: AuthTextStyles.helper.copyWith(
                          color: _messageIsError
                              ? AuthColors.destructive
                              : AuthColors.foreground,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: AuthSpacing.lg),
                  AuthPrimaryCta(
                    label: _primaryLabel(strings),
                    isBusy: _busy,
                    onTap: _primaryAction,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildStepFields(AppStrings strings) {
    switch (_step) {
      case _ForgotPasswordStep.email:
        return <Widget>[
          AuthTextField(
            controller: _emailController,
            label: strings.text('email_value'),
            enabled: !_busy,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => unawaited(_requestCode()),
          ),
        ];
      case _ForgotPasswordStep.code:
        return <Widget>[
          AuthTextField(
            controller: _codeController,
            label: strings.text('reset_code'),
            enabled: !_busy,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _continueToPassword(),
          ),
        ];
      case _ForgotPasswordStep.password:
        return <Widget>[
          AuthTextField(
            controller: _passwordController,
            label: strings.text('new_password'),
            enabled: !_busy,
            obscureText: _passwordHidden,
            textInputAction: TextInputAction.next,
            suffix: IconButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _passwordHidden = !_passwordHidden;
                      }),
              icon: Icon(
                _passwordHidden ? Icons.visibility : Icons.visibility_off,
                color: AuthColors.mutedForeground,
              ),
            ),
          ),
          const SizedBox(height: AuthSpacing.md),
          AuthTextField(
            controller: _confirmController,
            label: strings.text('confirm_password'),
            enabled: !_busy,
            obscureText: _confirmHidden,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => unawaited(_confirmReset()),
            suffix: IconButton(
              onPressed: _busy
                  ? null
                  : () => setState(() {
                        _confirmHidden = !_confirmHidden;
                      }),
              icon: Icon(
                _confirmHidden ? Icons.visibility : Icons.visibility_off,
                color: AuthColors.mutedForeground,
              ),
            ),
          ),
        ];
    }
  }

  String _stepSubtitle(AppStrings strings) {
    switch (_step) {
      case _ForgotPasswordStep.email:
        return strings.text('reset_email_help');
      case _ForgotPasswordStep.code:
        return strings.text('reset_code_help');
      case _ForgotPasswordStep.password:
        return strings.text('reset_password_help');
    }
  }

  String _primaryLabel(AppStrings strings) {
    if (_busy) {
      return strings.text('loading');
    }
    switch (_step) {
      case _ForgotPasswordStep.email:
        return strings.text('send_reset_code');
      case _ForgotPasswordStep.code:
        return strings.text('next');
      case _ForgotPasswordStep.password:
        return strings.text('update_password');
    }
  }

  void _primaryAction() {
    switch (_step) {
      case _ForgotPasswordStep.email:
        unawaited(_requestCode());
        return;
      case _ForgotPasswordStep.code:
        _continueToPassword();
        return;
      case _ForgotPasswordStep.password:
        unawaited(_confirmReset());
        return;
    }
  }
}

bool _looksLikeEmail(String value) {
  final String email = value.trim();
  return email.isNotEmpty &&
      email.length <= 254 &&
      !email.contains(RegExp(r'\s')) &&
      RegExp(r'^[^@]+@[^@]+\.[^@]+$').hasMatch(email);
}

String? _validatePassword(String value, AppStrings strings) {
  if (value.length < 8 || value.length > 128) {
    return strings.text('reset_password_length');
  }
  if (!RegExp(r'[A-Z]').hasMatch(value) ||
      !RegExp(r'[a-z]').hasMatch(value) ||
      !RegExp(r'[0-9]').hasMatch(value)) {
    return strings.text('reset_password_requirements');
  }
  return null;
}

String _extractAuthMessage(http.Response response, String fallback) {
  if (response.statusCode >= 500) {
    return fallback;
  }
  try {
    final dynamic decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      final dynamic message = decoded['message'] ?? decoded['detail'];
      if (message is String && message.trim().isNotEmpty) {
        return message.trim();
      }
    }
  } catch (_) {}
  return fallback;
}
