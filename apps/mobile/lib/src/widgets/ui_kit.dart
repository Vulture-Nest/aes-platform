import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';

/// A slim branded app bar with the charcoal→green gradient and white content.
/// Used across feature screens for a consistent look.
PreferredSizeWidget gradientAppBar(
  String title, {
  List<Widget>? actions,
  PreferredSizeWidget? bottom,
}) {
  return AppBar(
    title: Text(title),
    foregroundColor: Colors.white,
    titleTextStyle: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
    iconTheme: const IconThemeData(color: Colors.white),
    actionsIconTheme: const IconThemeData(color: Colors.white),
    elevation: 0,
    scrolledUnderElevation: 0,
    // Charcoal fallback so the white title is always on a dark background even
    // if the gradient fails to paint; the gradient Container fills the bar.
    backgroundColor: AppTheme.charcoal,
    surfaceTintColor: Colors.transparent,
    flexibleSpace: Container(
      decoration: const BoxDecoration(gradient: AppTheme.authGradient),
    ),
    systemOverlayStyle: SystemUiOverlayStyle.light,
    actions: actions,
    bottom: bottom,
  );
}

/// Small upper-section label (e.g. "Quick actions").
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.padding});
  final String text;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.fromLTRB(20, 20, 20, 8),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
        ),
      ),
    );
  }
}

/// A soft, coloured status pill.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// A centred empty / error state with an icon and message.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.message, this.isError = false});
  final IconData icon;
  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final color =
        isError ? AppTheme.danger : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.45);
    return ListView(
      children: [
        const SizedBox(height: 120),
        Icon(icon, size: 52, color: color),
        const SizedBox(height: 14),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(message, textAlign: TextAlign.center, style: TextStyle(color: color)),
          ),
        ),
      ],
    );
  }
}

/// A leading circular icon badge (soft brand-green by default).
class IconBadge extends StatelessWidget {
  const IconBadge(this.icon, {super.key, this.color, this.background, this.size = 44});
  final IconData icon;
  final Color? color;
  final Color? background;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: size,
      width: size,
      decoration: BoxDecoration(color: background ?? AppTheme.greenSoft, shape: BoxShape.circle),
      child: Icon(icon, size: size * 0.52, color: color ?? AppTheme.greenDark),
    );
  }
}
