import 'package:flutter/material.dart';

import '../../../models/request_status.dart';
import '../../../theme/app_theme.dart';

Color _statusColor(String status, ColorScheme scheme) {
  switch (status) {
    case 'DRAFT':
      return scheme.outline;
    case 'SUBMITTED':
      return Colors.blue;
    case 'APPROVED':
    case 'APPROVED_READY_TO_PAY':
    case 'DISBURSED':
    case 'CLOSED':
    case 'RETIRED':
      return AppTheme.seed;
    case 'APPROVED_PENDING_FUNDS':
    case 'RETURNED':
      return AppTheme.watch;
    case 'REJECTED':
      return AppTheme.danger;
    default:
      return scheme.outline;
  }
}

/// Coloured status pill for a request.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(status, Theme.of(context).colorScheme);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        RequestLifecycle.label(status),
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Vertical lifecycle stepper: Draft → Submitted → Approved → Disbursed → Closed,
/// with a rejected/returned marker when the chain forked.
class RequestTimeline extends StatelessWidget {
  const RequestTimeline({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final current = RequestLifecycle.stageIndex(status);
    final bad = RequestLifecycle.isTerminalBad(status);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < RequestLifecycle.stages.length; i++)
          _Step(
            label: RequestLifecycle.stages[i],
            done: i < current,
            active: i == current && !bad,
            failed: bad && i == current,
            isLast: i == RequestLifecycle.stages.length - 1,
            scheme: scheme,
          ),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.label,
    required this.done,
    required this.active,
    required this.failed,
    required this.isLast,
    required this.scheme,
  });

  final String label;
  final bool done;
  final bool active;
  final bool failed;
  final bool isLast;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final reached = done || active || failed;
    final color = failed
        ? AppTheme.danger
        : reached
            ? AppTheme.seed
            : scheme.outlineVariant;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Icon(
                failed
                    ? Icons.cancel
                    : done
                        ? Icons.check_circle
                        : active
                            ? Icons.radio_button_checked
                            : Icons.radio_button_unchecked,
                size: 20,
                color: color,
              ),
              if (!isLast)
                Expanded(
                  child: Container(width: 2, color: done ? AppTheme.seed : scheme.outlineVariant),
                ),
            ],
          ),
          const SizedBox(width: 12),
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              label,
              style: TextStyle(
                fontWeight: (active || failed) ? FontWeight.w700 : FontWeight.normal,
                color: reached ? null : scheme.outline,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
