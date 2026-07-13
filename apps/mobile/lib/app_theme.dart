import 'package:flutter/material.dart';

import 'auth_design_tokens.dart';

const Color uiBg = AuthColors.background;
const Color uiBgSoft = AuthColors.background;
const Color uiCard = AuthColors.card;
const Color uiCardSoft = AuthColors.muted;
const Color uiText = AuthColors.foreground;
const Color uiMuted = AuthColors.mutedForeground;
const Color uiNavy = AuthColors.foreground;
const Color uiGreen = AuthColors.primary;
const Color uiGreenDeep = Color(0xFF27272A);
const Color uiBrandGreen = Color(0xFF047857);
const Color uiBrandGreenSoft = Color(0xFFECFDF5);
const Color uiOrange = Color(0xFF3F3F46);
const Color uiOrangeDeep = AuthColors.destructive;
const Color uiCyan = AuthColors.ring;
const Color uiBorder = Colors.transparent;

const LinearGradient appBackgroundGradient = LinearGradient(
  colors: <Color>[
    AuthColors.background,
    AuthColors.background,
  ],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

const LinearGradient appCardGradient = LinearGradient(
  colors: <Color>[
    AuthColors.card,
    AuthColors.card,
  ],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

const LinearGradient appCtaGradient = LinearGradient(
  colors: <Color>[
    AuthColors.primary,
    AuthColors.primary,
  ],
  begin: Alignment.centerLeft,
  end: Alignment.centerRight,
);

ThemeData buildAppTheme() {
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: uiGreen,
    brightness: Brightness.light,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    fontFamily: AuthTextStyles.fontFamily,
    scaffoldBackgroundColor: uiBg,
    colorScheme: scheme,
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: uiCardSoft,
      contentTextStyle: TextStyle(color: uiText),
    ),
    cardTheme: CardThemeData(
      color: uiCard,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AuthRadii.xl),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      foregroundColor: uiText,
      titleTextStyle: TextStyle(
        color: uiText,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: uiCardSoft,
      border: InputBorder.none,
      enabledBorder: InputBorder.none,
      focusedBorder: InputBorder.none,
      disabledBorder: InputBorder.none,
      errorBorder: InputBorder.none,
      focusedErrorBorder: InputBorder.none,
      labelStyle: TextStyle(color: uiMuted),
      floatingLabelStyle: TextStyle(color: uiText),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: uiGreen,
        foregroundColor: AuthColors.primaryForeground,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AuthRadii.md),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: uiText,
        side: const BorderSide(color: uiBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AuthRadii.md),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: uiText),
    ),
  );
}
