import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/approval_decision.dart';
import '../../models/approval_item.dart';
import '../../theme/money.dart';
import '../../widgets/ui_kit.dart';
import 'cubit/approvals_cubit.dart';

/// The approvals inbox: pending steps awaiting the signed-in user. One-tap
/// approve/reject/return via a bottom sheet; money items require a biometric
/// confirmation on approval (handled inside the cubit).
class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<ApprovalsCubit>().load();
    });
  }

  Future<void> _openDecisionSheet(ApprovalItem item) async {
    final cubit = context.read<ApprovalsCubit>();
    final result = await showModalBottomSheet<DecideResult>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: _DecisionSheet(item: item),
      ),
    );
    if (result != null && mounted) {
      final messenger = ScaffoldMessenger.of(context);
      messenger.hideCurrentSnackBar();
      if (result.message != null) {
        messenger.showSnackBar(SnackBar(content: Text(result.message!)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar('Approvals'),
      body: BlocBuilder<ApprovalsCubit, ApprovalsState>(
        builder: (context, state) {
          if (state.loading && state.items.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          return RefreshIndicator(
            onRefresh: () => context.read<ApprovalsCubit>().load(),
            child: _Body(
              state: state,
              onTap: _openDecisionSheet,
            ),
          );
        },
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.state, required this.onTap});

  final ApprovalsState state;
  final ValueChanged<ApprovalItem> onTap;

  @override
  Widget build(BuildContext context) {
    if (state.error != null && state.items.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 120),
          Icon(Icons.cloud_off, size: 48, color: Theme.of(context).disabledColor),
          const SizedBox(height: 12),
          Center(child: Text(state.error!, textAlign: TextAlign.center)),
        ],
      );
    }
    if (state.items.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 120),
          Icon(Icons.inbox_outlined, size: 48),
          SizedBox(height: 12),
          Center(child: Text('No approvals waiting')),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: state.items.length,
      itemBuilder: (context, i) {
        final item = state.items[i];
        return _ApprovalCard(
          item: item,
          busy: state.decidingId == item.id,
          onTap: () => onTap(item),
        );
      },
    );
  }
}

class _ApprovalCard extends StatelessWidget {
  const _ApprovalCard({required this.item, required this.busy, required this.onTap});

  final ApprovalItem item;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final amountLabel = item.amount == null
        ? null
        : Money.format(item.amount, currency: item.currency ?? 'USD');
    return Card(
      child: ListTile(
        onTap: busy ? null : onTap,
        leading: CircleAvatar(
          child: Icon(item.isMoneyItem ? Icons.payments_outlined : Icons.description_outlined),
        ),
        title: Text(item.moduleLabel, style: theme.textTheme.titleMedium),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (amountLabel != null)
              Text(amountLabel, style: theme.textTheme.titleSmall),
            Text('${item.subjectTable} · step ${item.step} · as ${item.approverRole}'),
            if (item.isMoneyItem)
              Row(
                children: [
                  const Icon(Icons.fingerprint, size: 14),
                  const SizedBox(width: 4),
                  Text('Biometric confirm', style: theme.textTheme.labelSmall),
                ],
              ),
          ],
        ),
        trailing: busy
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.chevron_right),
      ),
    );
  }
}

/// Bottom sheet to approve / return / reject a step with an optional comment.
class _DecisionSheet extends StatefulWidget {
  const _DecisionSheet({required this.item});

  final ApprovalItem item;

  @override
  State<_DecisionSheet> createState() => _DecisionSheetState();
}

class _DecisionSheetState extends State<_DecisionSheet> {
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _decide(ApprovalDecision decision) async {
    setState(() => _busy = true);
    final result = await context.read<ApprovalsCubit>().decide(
          widget.item,
          decision,
          comment: _comment.text.trim(),
        );
    if (mounted) Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final amountLabel = item.amount == null
        ? ''
        : ' · ${Money.format(item.amount, currency: item.currency ?? 'USD')}';
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(item.moduleLabel + amountLabel, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            '${item.subjectTable} · acting as ${item.approverRole}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _comment,
            enabled: !_busy,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Comment (recommended for reject / return)',
            ),
          ),
          const SizedBox(height: 16),
          if (item.isMoneyItem)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(Icons.fingerprint, size: 16),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Approving a money item asks for biometric confirmation.',
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ),
                ],
              ),
            ),
          FilledButton.icon(
            onPressed: _busy ? null : () => _decide(ApprovalDecision.approved),
            icon: const Icon(Icons.check),
            label: const Text('Approve'),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _decide(ApprovalDecision.returned),
                  icon: const Icon(Icons.undo),
                  label: const Text('Return'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _decide(ApprovalDecision.rejected),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.error,
                  ),
                  icon: const Icon(Icons.close),
                  label: const Text('Reject'),
                ),
              ),
            ],
          ),
          if (_busy)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }
}
