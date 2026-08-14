import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app_settings.dart';
import 'app_bootstrap_screen.dart';
import 'app_theme.dart';
import 'auth_screen.dart';
import 'mobile_logging.dart';
import 'mobile_sentry.dart';
import 'qr_home_page.dart';

Future<void> main() async {
  Future<void> appRunner() async {
    WidgetsFlutterBinding.ensureInitialized();

    final AppSettings settings = await AppSettings.load();
    configureMobileLogApiBase(settings.apiBaseUrl);
    configureMobileLogAuthToken(settings.authToken);
    unawaited(
      sendMobileLog(
        'info',
        'mobile app started',
        context: 'api_base=$defaultApiBase',
      ),
    );

    configureGlobalErrorHandlers();

    runApp(
      AppSettingsScope(
        settings: settings,
        child: QrOnlyApp(settings: settings),
      ),
    );
  }

  if (isSentryEnabled()) {
    await SentryFlutter.init(
      configureMobileSentry,
      appRunner: appRunner,
    );
    return;
  }

  await appRunner();
}

void configureGlobalErrorHandlers() {
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    debugPrint('FlutterError: ${details.exceptionAsString()}');
    if (details.stack != null) {
      debugPrintStack(stackTrace: details.stack);
    }
    unawaited(
      sendMobileLog(
        'error',
        details.exceptionAsString(),
        context: details.stack?.toString(),
      ),
    );
    unawaited(
      Sentry.captureException(
        details.exception,
        stackTrace: details.stack,
      ),
    );
  };

  ui.PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
    debugPrint('Uncaught async error: $error');
    debugPrintStack(stackTrace: stack);
    unawaited(
      sendMobileLog(
        'error',
        error.toString(),
        context: stack.toString(),
      ),
    );
    unawaited(Sentry.captureException(error, stackTrace: stack));
    return true;
  };
}

class QrOnlyApp extends StatefulWidget {
  const QrOnlyApp({super.key, required this.settings});

  final AppSettings settings;

  @override
  State<QrOnlyApp> createState() => _QrOnlyAppState();
}

class _QrOnlyAppState extends State<QrOnlyApp> {
  late AppLang _language = widget.settings.language;

  @override
  void initState() {
    super.initState();
    widget.settings.addListener(_handleSettingsChanged);
  }

  @override
  void didUpdateWidget(covariant QrOnlyApp oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.settings != widget.settings) {
      oldWidget.settings.removeListener(_handleSettingsChanged);
      widget.settings.addListener(_handleSettingsChanged);
      _language = widget.settings.language;
    }
  }

  @override
  void dispose() {
    widget.settings.removeListener(_handleSettingsChanged);
    super.dispose();
  }

  void _handleSettingsChanged() {
    final AppLang next = widget.settings.language;
    if (next != _language) {
      setState(() {
        _language = next;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SofortBot Mobile',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      themeMode: ThemeMode.dark,
      locale: Locale(_language.code),
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const <Locale>[
        Locale('en'),
        Locale('ru'),
        Locale('de'),
      ],
      routes: <String, WidgetBuilder>{
        '/login': (_) => const AuthScreen(),
        '/home': (_) => const QrHomePage(),
      },
      home: const AppBootstrapScreen(),
    );
  }
}
