import 'package:flutter/material.dart';

import '../../../models/alert.dart';
import '../../../theme/app_theme.dart';

/// Persistent red banner shown at the top of the home screen whenever there are
/// active DANGER alerts (spec §15.1). Tapping it opens the command centre.
class DangerBanner extends StatelessWidget {
  const DangerBanner({super.key, required this.alerts, this.onTap});

  final List<Alert> alerts;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    if (alerts.isEmpty) {
      return const SizedBox.shrink();
    }
    final headline = alerts.length == 1
        ? alerts.first.message
        : '${alerts.length} active danger alerts need attention';
    return Material(
      color: AppTheme.danger,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: Colors.white),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  headline,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (onTap != null)
                const Icon(Icons.chevron_right, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}
