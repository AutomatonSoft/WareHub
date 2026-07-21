// ignore_for_file: invalid_use_of_protected_member

part of 'auth_screen.dart';

extension _AuthScreenBiometrics on _AuthScreenState {
  String _biometricLoginLabel(AppStrings strings) {
    return _preferredBiometricType == BiometricType.face
        ? strings.text('face_id_login')
        : strings.text('biometric_login');
  }

  String _biometricMethodName(AppStrings strings) {
    if (_preferredBiometricType == BiometricType.face) {
      return strings.text('face_id_name');
    }
    if (_preferredBiometricType == BiometricType.fingerprint) {
      return strings.text('fingerprint_name');
    }
    return strings.text('biometric_name');
  }

  Future<bool> _hasValidStoredSession() async {
    final AppSettings settings = AppSettingsScope.of(context);
    final String boundLogin = settings.biometricAccountLogin.trim();
    final String fallbackLogin = settings.login.trim();
    if (settings.authToken.trim().isEmpty &&
        settings.refreshToken.trim().isEmpty) {
      return false;
    }

    final String apiBase = normalizeApiBase(settings.apiBaseUrl);

    try {
      http.Response response = await http.get(
        Uri.parse('$apiBase/auth/me'),
        headers: <String, String>{
          'Authorization': 'Bearer ${settings.authToken.trim()}',
        },
      );
      if (response.statusCode == 401) {
        final MobileAuthRefreshResult refresh =
            await refreshMobileAuthSessionDetailed(settings, apiBase: apiBase);
        if (refresh.refreshed) {
          response = await http.get(
            Uri.parse('$apiBase/auth/me'),
            headers: <String, String>{
              'Authorization': 'Bearer ${settings.authToken.trim()}',
            },
          );
        } else if (refresh.isTemporarilyUnavailable &&
            settings.authToken.trim().isNotEmpty) {
          configureMobileLogAuthToken(settings.authToken);
          return true;
        }
      }
      if (response.statusCode >= 200 && response.statusCode < 300) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is! Map<String, dynamic>) {
          return false;
        }
        final String actualLogin = '${decoded['login'] ?? ''}'.trim();
        if (actualLogin.isEmpty) {
          return false;
        }
        final String expectedLogin =
            boundLogin.isNotEmpty ? boundLogin : fallbackLogin;
        if (expectedLogin.isNotEmpty &&
            actualLogin.toLowerCase() != expectedLogin.toLowerCase()) {
          return false;
        }
        if (boundLogin.isEmpty) {
          await settings.bindBiometricAccount(actualLogin);
        }
        await settings.updateProfile(
          login: actualLogin,
          username: '${decoded['username'] ?? decoded['user_name'] ?? ''}',
          email: '${decoded['email'] ?? ''}',
          firstName: '${decoded['first_name'] ?? ''}',
          lastName: '${decoded['last_name'] ?? ''}',
          phoneNumber: '${decoded['phone_number'] ?? decoded['phone'] ?? ''}',
          avatarUrl: '${decoded['avatar_url'] ?? ''}',
          role: '${decoded['role'] ?? ''}',
          status: '${decoded['status'] ?? ''}',
        );
        configureMobileLogAuthToken(settings.authToken);
        return true;
      }
      if (response.statusCode == 401) {
        return false;
      }
    } catch (_) {
      // Network can be unavailable during warehouse work. Keep the local
      // session usable; API calls still force login later on explicit 401.
      if (settings.authToken.trim().isNotEmpty) {
        configureMobileLogAuthToken(settings.authToken);
        return true;
      }
    }
    return false;
  }

  Future<void> _initBiometrics(AppSettings settings) async {
    final BiometricType? preferredType = await _resolveBiometricType();
    final bool available = preferredType != null;

    if (!mounted) {
      return;
    }

    setState(() {
      _biometricAvailable = available;
      _preferredBiometricType = preferredType;
    });

    if (available &&
        settings.biometricEnabled &&
        settings.biometricAccountLogin.trim().isEmpty &&
        settings.login.trim().isNotEmpty) {
      await settings.bindBiometricAccount(settings.login.trim());
    }

    if (settings.biometricEnabled) {
      if (available && !_autoPrompted) {
        _autoPrompted = true;
        await _authenticateWithBiometrics();
      }
      return;
    }

    // Auto-login check for non-biometric case or when biometrics are unavailable.
    // If we have any token, try to validate the session and proceed if successful.
    if (settings.authToken.trim().isNotEmpty ||
        settings.refreshToken.trim().isNotEmpty) {
      final bool valid = await _hasValidStoredSession();
      if (valid && mounted) {
        await _continueToApp();
      }
    }
  }

  Future<BiometricType?> _resolveBiometricType() async {
    try {
      final bool supported = await _localAuth.isDeviceSupported();
      if (!supported) {
        return null;
      }
      final bool canCheck = await _localAuth.canCheckBiometrics;
      final List<BiometricType> available =
          await _localAuth.getAvailableBiometrics();
      if (available.contains(BiometricType.face)) {
        return BiometricType.face;
      }
      if (available.contains(BiometricType.fingerprint)) {
        return BiometricType.fingerprint;
      }
      if (available.contains(BiometricType.strong)) {
        return BiometricType.strong;
      }
      if (available.contains(BiometricType.weak)) {
        return BiometricType.weak;
      }
      // Android versions before API 29 may not disclose the concrete
      // biometric type. The system prompt still selects the enrolled method.
      return canCheck ? BiometricType.weak : null;
    } catch (_) {
      return null;
    }
  }

  Future<bool> _authenticateBiometricPrompt(String reason) async {
    return _localAuth.authenticate(
      localizedReason: reason,
      options: const AuthenticationOptions(
        biometricOnly: true,
        stickyAuth: true,
        useErrorDialogs: true,
      ),
    );
  }

  Future<void> _authenticateWithBiometrics() async {
    if (_biometricBusy) {
      return;
    }
    setState(() {
      _biometricBusy = true;
    });

    try {
      final AppStrings strings = AppStrings.of(context);
      final bool ok = await _authenticateBiometricPrompt(
        strings.text('biometric_reason'),
      );
      if (ok && mounted) {
        final bool validSession = await _hasValidStoredSession();
        if (!validSession) {
          _showMessage(strings.text('session_expired_login_again'));
          return;
        }
        await _continueToApp();
      }
    } on PlatformException {
      if (mounted) {
        _showMessage(AppStrings.of(context).text('biometric_unavailable'));
      }
    } finally {
      if (mounted) {
        setState(() {
          _biometricBusy = false;
        });
      }
    }
  }

  Future<void> _offerBiometricEnrollment() async {
    if (!mounted) {
      return;
    }
    final AppSettings settings = AppSettingsScope.of(context);
    if (settings.biometricEnabled) {
      return;
    }
    final AppStrings strings = AppStrings.of(context);
    final String biometricName = _biometricMethodName(strings);
    final bool? enable = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: Text(
            strings.format(
              'enable_biometric_title',
              <String, String>{'biometric': biometricName},
            ),
          ),
          content: Text(
            strings.format(
              'enable_biometric_body',
              <String, String>{'biometric': biometricName},
            ),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(strings.text('later')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(strings.text('enable')),
            ),
          ],
        );
      },
    );
    if (enable != true) {
      return;
    }

    final BiometricType? preferredType = await _resolveBiometricType();
    final bool availableNow = preferredType != null;
    if (!mounted) {
      return;
    }
    if (_biometricAvailable != availableNow) {
      setState(() {
        _biometricAvailable = availableNow;
        _preferredBiometricType = preferredType;
      });
    } else if (_preferredBiometricType != preferredType) {
      setState(() {
        _preferredBiometricType = preferredType;
      });
    }
    if (!availableNow) {
      _showMessage(strings.text('biometric_unavailable'));
      return;
    }
    if (_biometricBusy) {
      return;
    }
    setState(() {
      _biometricBusy = true;
    });
    try {
      final bool verified = await _authenticateBiometricPrompt(
        strings.text('biometric_reason'),
      );
      if (verified) {
        await settings.setBiometricEnabled(true);
        await settings.bindBiometricAccount(settings.login);
      } else {
        _showMessage(strings.text('biometric_setup_canceled'));
      }
    } on PlatformException {
      _showMessage(strings.text('biometric_unavailable'));
    } finally {
      if (mounted) {
        setState(() {
          _biometricBusy = false;
        });
      }
    }
  }
}
