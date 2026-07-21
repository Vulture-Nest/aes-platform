import 'package:flutter/material.dart';

/// AES brand palette + Material 3 light & dark themes, matching the admin/web
/// apps (green #6DBE45, charcoal #222429, Roboto). The charcoal→green gradient
/// (login/splash/app bars) is identical in both modes.
class AppTheme {
  AppTheme._();

  // Brand palette (mirrors apps/*/theme.ts).
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
  static const _darkScaffold = Color(0xFF121316);
  static const _darkSurface = Color(0xFF1E2025);

  // Brand assets.
  static const logoWhite = 'assets/images/aes-logo-white.png';
  static const logoGreen = 'assets/images/aes-logo-green.png';
  static const mark = 'assets/images/aes-mark.png';

  /// Login / splash / app-bar backdrop — charcoal fading into brand green.
  static const authGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [charcoal, Color(0xFF2C3A22), Color(0xFF3F5A2A)],
    stops: [0.0, 0.55, 1.0],
  );

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: green,
      brightness: brightness,
      primary: dark ? green : greenDark,
      secondary: green,
      surface: dark ? _darkSurface : Colors.white,
      surfaceTint: Colors.transparent,
    );
    final scaffoldBg = dark ? _darkScaffold : scaffold;
    final cardColor = dark ? _darkSurface : Colors.white;
    final border = (dark ? Colors.white : charcoal).withValues(alpha: dark ? 0.10 : 0.06);
    final inputBorder = (dark ? Colors.white : charcoal).withValues(alpha: dark ? 0.20 : 0.15);

    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: scaffoldBg,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: scaffoldBg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: scheme.onSurface,
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 22,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: cardColor,
        surfaceTintColor: Colors.transparent,
        margin: const EdgeInsets.only(bottom: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cardColor,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: inputBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: inputBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: green, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: dark ? green : greenDark,
          foregroundColor: dark ? charcoal : Colors.white,
          minimumSize: const Size.fromHeight(52),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          foregroundColor: scheme.onSurface,
          side: BorderSide(color: inputBorder),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: dark ? const Color(0xFF2A2D33) : charcoal,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      dividerTheme: DividerThemeData(color: scheme.onSurface.withValues(alpha: 0.08), space: 24),
    );
  }
}
