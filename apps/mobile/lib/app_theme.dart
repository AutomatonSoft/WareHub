import 'package:flutter/material.dart';

const Color uiBg = Color(0xFF0B0E18);
const Color uiBgSoft = Color(0xFF12182A);
const Color uiCard = Color(0xFF151B2E);
const Color uiCardSoft = Color(0xFF1B2238);
const Color uiText = Color(0xFFF1F3FF);
const Color uiMuted = Color(0xFF9AA6C7);
const Color uiNavy = Color(0xFFD6DCFF);
const Color uiGreen = Color(0xFF7B63FF);
const Color uiGreenDeep = Color(0xFF5B46D1);
const Color uiOrange = Color(0xFF4F9BFF);
const Color uiOrangeDeep = Color(0xFFFF8DA1);
const Color uiCyan = Color(0xFF5ED6FF);
const Color uiBorder = Color(0x26FFFFFF);

const LinearGradient appBackgroundGradient = LinearGradient(
  colors: <Color>[
    Color(0xFF0B0E18),
    Color(0xFF12182A),
    Color(0xFF0F1628),
  ],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

const LinearGradient appCardGradient = LinearGradient(
  colors: <Color>[
    Color(0x331C2440),
    Color(0x111C2440),
  ],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

const LinearGradient appCtaGradient = LinearGradient(
  colors: <Color>[
    uiGreen,
    uiOrange,
    uiCyan,
  ],
  begin: Alignment.centerLeft,
  end: Alignment.centerRight,
);

ThemeData buildAppTheme() {
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: uiGreen,
    brightness: Brightness.dark,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    fontFamily: 'Montserrat',
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
        borderRadius: BorderRadius.circular(18),
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
        letterSpacing: 0.2,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: uiCardSoft,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: uiBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: uiBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: uiGreen),
      ),
      labelStyle: const TextStyle(color: uiMuted),
      floatingLabelStyle: const TextStyle(color: uiCyan),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: uiGreen,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: uiText,
        side: const BorderSide(color: uiBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: uiCyan),
    ),
  );
}
