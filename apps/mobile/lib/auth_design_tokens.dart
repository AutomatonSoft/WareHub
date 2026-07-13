import 'package:flutter/material.dart';

abstract final class AuthColors {
  static const Color background = Color(0xFFFFFFFF);
  static const Color foreground = Color(0xFF18181B);
  static const Color card = Color(0xFFFFFFFF);
  static const Color cardForeground = Color(0xFF18181B);
  static const Color muted = Color(0xFFF4F4F5);
  static const Color mutedForeground = Color(0xFF71717A);
  static const Color primary = Color(0xFF1F1F23);
  static const Color primaryForeground = Color(0xFFFAFAFA);
  static const Color border = Color(0xFFE4E4E7);
  static const Color input = Color(0xFFE4E4E7);
  static const Color ring = Color(0xFFA1A1AA);
  static const Color destructive = Color(0xFFEF4444);
}

abstract final class AuthRadii {
  static const double sm = 8;
  static const double md = 10;
  static const double lg = 12;
  static const double xl = 16;
}

abstract final class AuthSpacing {
  static const double xs = 6;
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 18;
  static const double xl = 24;
  static const double xxl = 32;
  static const double screenHorizontal = 20;
  static const double inputHeight = 52;
  static const double buttonHeight = 52;
  static const double logoSize = 46;
}

abstract final class AuthTextStyles {
  static const String fontFamily = 'Montserrat';

  static const TextStyle brand = TextStyle(
    color: AuthColors.foreground,
    fontFamily: fontFamily,
    fontSize: 15,
    fontWeight: FontWeight.w800,
    letterSpacing: 0,
  );

  static const TextStyle title = TextStyle(
    color: AuthColors.foreground,
    fontFamily: fontFamily,
    fontSize: 28,
    fontWeight: FontWeight.w800,
    height: 1.12,
    letterSpacing: 0,
  );

  static const TextStyle subtitle = TextStyle(
    color: AuthColors.mutedForeground,
    fontFamily: fontFamily,
    fontSize: 14,
    fontWeight: FontWeight.w500,
    height: 1.45,
    letterSpacing: 0,
  );

  static const TextStyle label = TextStyle(
    color: AuthColors.foreground,
    fontFamily: fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w700,
    letterSpacing: 0,
  );

  static const TextStyle input = TextStyle(
    color: AuthColors.foreground,
    fontFamily: fontFamily,
    fontSize: 15,
    fontWeight: FontWeight.w500,
    letterSpacing: 0,
  );

  static const TextStyle helper = TextStyle(
    color: AuthColors.mutedForeground,
    fontFamily: fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    height: 1.35,
    letterSpacing: 0,
  );

  static const TextStyle button = TextStyle(
    color: AuthColors.primaryForeground,
    fontFamily: fontFamily,
    fontSize: 15,
    fontWeight: FontWeight.w800,
    letterSpacing: 0,
  );

  static const TextStyle language = TextStyle(
    color: AuthColors.foreground,
    fontFamily: fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w700,
    letterSpacing: 0,
  );
}

const LinearGradient authBackgroundGradient = LinearGradient(
  colors: <Color>[
    AuthColors.background,
    AuthColors.background,
  ],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

ThemeData buildAuthTheme() {
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: AuthColors.primary,
    brightness: Brightness.light,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    fontFamily: AuthTextStyles.fontFamily,
    scaffoldBackgroundColor: AuthColors.background,
    colorScheme: scheme,
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AuthColors.muted,
      contentTextStyle: TextStyle(color: AuthColors.foreground),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AuthColors.muted,
      border: InputBorder.none,
      enabledBorder: InputBorder.none,
      focusedBorder: InputBorder.none,
      disabledBorder: InputBorder.none,
      hintStyle: AuthTextStyles.input.copyWith(
        color: AuthColors.mutedForeground,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AuthColors.primary,
        foregroundColor: AuthColors.primaryForeground,
        textStyle: AuthTextStyles.button,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AuthRadii.md),
        ),
      ),
    ),
  );
}
