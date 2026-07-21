import 'package:flutter/material.dart';

/// AES brand palette + Material 3 theme. The seed green matches the admin/web apps.
class AppTheme {
  AppTheme._();

  static const seed = Color(0xFF0B6E4F);
  static const danger = Color(0xFFC0392B);
  static const watch = Color(0xFFB7791F);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(seedColor: seed);
    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      appBarTheme: const AppBarTheme(centerTitle: false),
      inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
        ),
      ),
    );
  }
}
