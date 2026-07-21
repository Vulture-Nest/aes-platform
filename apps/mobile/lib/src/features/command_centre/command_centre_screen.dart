import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/alert.dart';
import '../../models/command_centre.dart';
import '../../theme/app_theme.dart';
import '../../theme/money.dart';
import 'cubit/command_centre_cubit.dart';

/// Command Centre: a health verdict banner over summary panels, plus the active
/// alert feed with one-tap acknowledge.
class CommandCentreScreen extends StatefulWidget {
  const CommandCentreScreen({super.key});

  @override
  State<CommandCentreScreen> createState() => _CommandCentreScreenState();
}

class _CommandCentreScreenState extends State<CommandCentreScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<CommandCentreCubit>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Command Centre')),
      body: BlocBuilder<CommandCentreCubit, CommandCentreState>(
        builder: (context, state) {
          if (state.loading && state.dashboard == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.dashboard == null) {
            return _ErrorView(message: state.error, onRetry: () => context.read<CommandCentreCubit>().load());
          }
          final cc = state.dashboard!;
          return RefreshIndicator(
            onRefresh: () => context.read<CommandCentreCubit>().load(),
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                _VerdictBanner(verdict: cc.verdict),
                const SizedBox(height: 12),
                _panels(cc),
                const SizedBox(height: 8),
                _AlertsSection(alerts: state.alerts, ackingId: state.ackingId),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _panels(CommandCentre cc) {
    final cards = <Widget>[
      _MetricCard(icon: Icons.account_balance_wallet_outlined, label: 'Cash on hand', value: _usd(cc.cashUsd)),
      _MetricCard(icon: Icons.swap_vert, label: 'Net money in/out', value: _usd(cc.net)),
      _MetricCard(icon: Icons.shield_outlined, label: 'Expected in', value: _usd(cc.expectedIn)),
      _MetricCard(icon: Icons.outbox_outlined, label: 'Expected out', value: _usd(cc.expectedOut)),
      _MetricCard(icon: Icons.receipt_long_outlined, label: 'Obligations', value: _usd(cc.obligationsUsd)),
      _MetricCard(
        icon: Icons.warning_amber_outlined,
        label: 'Unfunded gap',
        value: _usd(cc.unfundedGapUsd),
        emphasise: (cc.unfundedGapUsd ?? 0) > 0,
      ),
      _MetricCard(icon: Icons.request_quote_outlined, label: 'Receivables', value: _usd(cc.receivables)),
      _MetricCard(icon: Icons.trending_up, label: 'Operating profit', value: _usd(cc.operatingProfit)),
      _MetricCard(
        icon: Icons.percent,
        label: 'Margin',
        value: cc.margin == null ? '—' : '${(cc.margin! * 100).toStringAsFixed(1)}%',
      ),
      _MetricCard(icon: Icons.gavel_outlined, label: 'Tax + interest', value: _usd(cc.taxWithInterest)),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.5,
      children: cards,
    );
  }

  String _usd(double? v) => v == null ? '—' : Money.format(v);
}

class _VerdictBanner extends StatelessWidget {
  const _VerdictBanner({required this.verdict});

  final String verdict;

  @override
  Widget build(BuildContext context) {
    final (color, text) = switch (verdict) {
      'ACT' => (AppTheme.danger, 'ACT — the business needs attention'),
      'WATCH' => (AppTheme.watch, 'WATCH — keep an eye on this'),
      _ => (AppTheme.seed, 'Healthy'),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          const Icon(Icons.insights, color: Colors.white),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.icon,
    required this.label,
    required this.value,
    this.emphasise = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool emphasise;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Icon(icon, color: emphasise ? AppTheme.danger : scheme.primary, size: 22),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            Text(
              value,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: emphasise ? AppTheme.danger : null,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AlertsSection extends StatelessWidget {
  const _AlertsSection({required this.alerts, required this.ackingId});

  final List<Alert> alerts;
  final String? ackingId;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        Text('Alerts', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        if (alerts.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('No active alerts'),
          )
        else
          for (final alert in alerts)
            _AlertTile(alert: alert, acking: ackingId == alert.id),
      ],
    );
  }
}

class _AlertTile extends StatelessWidget {
  const _AlertTile({required this.alert, required this.acking});

  final Alert alert;
  final bool acking;

  Color get _color => switch (alert.severity) {
        AlertSeverity.danger => AppTheme.danger,
        AlertSeverity.watch => AppTheme.watch,
        AlertSeverity.info => Colors.blue,
      };

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(Icons.circle, size: 14, color: _color),
        title: Text(alert.message),
        subtitle: Text(alert.severity.name.toUpperCase()),
        trailing: acking
            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
            : TextButton(
                onPressed: () => context.read<CommandCentreCubit>().acknowledge(alert.id),
                child: const Text('Ack'),
              ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String? message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off, size: 48),
          const SizedBox(height: 12),
          Text(message ?? 'Could not load the command centre'),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
