import 'dart:async';

import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'app_theme.dart';

@visibleForTesting
String resolveInitialAppRoute({
  required bool hasLocalSession,
  required bool biometricEnabled,
}) {
  if (!hasLocalSession || biometricEnabled) {
    return '/login';
  }
  return '/home';
}

class AppBootstrapScreen extends StatefulWidget {
  const AppBootstrapScreen({super.key});

  @override
  State<AppBootstrapScreen> createState() => _AppBootstrapScreenState();
}

class _AppBootstrapScreenState extends State<AppBootstrapScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_openInitialRoute());
    });
  }

  Future<void> _openInitialRoute() async {
    final AppSettings settings = AppSettingsScope.of(context);
    final bool hasLocalSession = settings.authToken.trim().isNotEmpty ||
        settings.refreshToken.trim().isNotEmpty;
    final String route = resolveInitialAppRoute(
      hasLocalSession: hasLocalSession,
      biometricEnabled: settings.biometricEnabled,
    );
    if (!mounted) {
      return;
    }
    Navigator.of(context).pushReplacementNamed(route);
  }

  @override
  Widget build(BuildContext context) {
    final AppStrings strings = AppStrings.of(context);
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: appBackgroundGradient),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Image.asset(
                    'assets/images/logo.png',
                    width: 84,
                    height: 84,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Warehub',
                  style: TextStyle(
                    color: uiText,
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 18),
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.4),
                ),
                const SizedBox(height: 12),
                Text(
                  strings.text('opening_app'),
                  style: const TextStyle(
                    color: uiMuted,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
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
