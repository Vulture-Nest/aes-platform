import 'package:flutter/material.dart';

import '../../../models/project_health.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/ui_kit.dart';

/// Brand colour for a RAG flag.
Color ragColor(Rag rag) {
  switch (rag) {
    case Rag.green:
      return AppTheme.greenDark;
    case Rag.amber:
      return AppTheme.watch;
    case Rag.red:
      return AppTheme.danger;
  }
}

/// A small coloured RAG pill (On track / At risk / Behind).
class RagChip extends StatelessWidget {
  const RagChip({super.key, required this.rag});

  final Rag rag;

  @override
  Widget build(BuildContext context) {
    return StatusPill(label: rag.label, color: ragColor(rag));
  }
}

/// A slim rounded progress bar with the brand fill.
class ProgressBar extends StatelessWidget {
  const ProgressBar({super.key, required this.percent, this.color});

  /// 0..100.
  final double percent;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final fill = color ?? AppTheme.greenDark;
    final track = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10);
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: LinearProgressIndicator(
        value: (percent.clamp(0, 100)) / 100,
        minHeight: 8,
        backgroundColor: track,
        valueColor: AlwaysStoppedAnimation<Color>(fill),
      ),
    );
  }
}

/// A short human label for the days-ahead/behind figure of a project.
String scheduleLabel(ProjectHealth h) {
  if (!h.hasSchedule) return 'No schedule set';
  final days = h.daysAheadBehind!.abs().round();
  if (days == 0) return 'On schedule';
  return h.isAhead ? '$days day(s) ahead' : '$days day(s) behind';
}
