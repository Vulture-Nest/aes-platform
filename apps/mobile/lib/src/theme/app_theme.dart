import 'package:flutter/material.dart';

/// AES brand palette + Material 3 theme, matching the admin/web apps
/// (green #6DBE45, charcoal #222429, Roboto).
class AppTheme {
  AppTheme._();

  // Brand palette (sourced from the corporate site, mirrors apps/*/theme.ts).
  static const green = Color(0xFF6DBE45);
  static const greenDark = Color(0xFF579A34);
  static const greenSoft = Color(0xFFEEF7E6);
  static const charcoal = Color(0xFF222429);
  static const charcoalSoft = Color(0xFF2B2E35);
  static const danger = Color(0xFFC0392B);
  static const watch = Color(0xFFB7791F);

  /// Kept for existing references; the brand primary.
  static const seed = green;

  static const scaffold = Color(0xFFF5F7F3);

  // Brand assets.
  static const logoWhite = 'assets/images/aes-logo-white.png';
  static const logoGreen = 'assets/images/aes-logo-green.png';
  static const mark = 'assets/images/aes-mark.png';

  /// Login / splash backdrop — charcoal fading into brand green.
  static const authGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [charcoal, Color(0xFF2C3A22), Color(0xFF3F5A2A)],
    stops: [0.0, 0.55, 1.0],
  );

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: green,
      primary: greenDark,
      secondary: green,
      surfaceTint: Colors.transparent,
    );

    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      scaffoldBackgroundColor: scaffold,
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        backgroundColor: scaffold,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: charcoal,
        titleTextStyle: TextStyle(
          color: charcoal,
          fontSize: 22,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        margin: const EdgeInsets.only(bottom: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: charcoal.withValues(alpha: 0.06)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: charcoal.withValues(alpha: 0.15)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: charcoal.withValues(alpha: 0.15)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: green, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: greenDark,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          foregroundColor: charcoal,
          side: BorderSide(color: charcoal.withValues(alpha: 0.18)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: charcoal,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      dividerTheme: DividerThemeData(color: charcoal.withValues(alpha: 0.08), space: 24),
    );
  }
}
