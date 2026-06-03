import 'package:sentry_flutter/sentry_flutter.dart';

const String sentryDsn = String.fromEnvironment('SENTRY_DSN', defaultValue: '');
const String sentryRelease =
    String.fromEnvironment('APP_VERSION', defaultValue: '');
const String sentryEnvironment = String.fromEnvironment(
  'APP_ENV',
  defaultValue: 'dev',
);
const String sentryTracesSampleRateRaw = String.fromEnvironment(
  'SENTRY_TRACES_SAMPLE_RATE',
  defaultValue: '0.1',
);
const bool sentrySendDefaultPii = bool.fromEnvironment(
  'SENTRY_SEND_DEFAULT_PII',
  defaultValue: false,
);

bool isSentryEnabled([String? dsn]) {
  return (dsn ?? sentryDsn).trim().isNotEmpty;
}

double parseSentryRate(String raw, double fallback) {
  final double? parsed = double.tryParse(raw.trim());
  if (parsed == null || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

void configureMobileSentry(SentryFlutterOptions options) {
  options.dsn = sentryDsn;
  options.environment = sentryEnvironment;
  if (sentryRelease.trim().isNotEmpty) {
    options.release = sentryRelease.trim();
  }
  options.tracesSampleRate = parseSentryRate(sentryTracesSampleRateRaw, 0.1);
  options.sendDefaultPii = sentrySendDefaultPii;
}
