import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/director_repository.dart';
import '../../models/director_withdrawal.dart';
import '../../theme/app_theme.dart';
import '../../theme/money.dart';
import '../../widgets/ui_kit.dart';
import 'cubit/director_cubit.dart';

Color _statusColor(String status) => switch (status) {
      'COMPLETED' => AppTheme.greenDark,
      'SUBMITTED' => Colors.blue,
      'POSTED_AWAITING_TRANSFER' => AppTheme.watch,
      'REJECTED' => AppTheme.danger,
      'RETURNED' => AppTheme.watch,
      _ => const Color(0xFF8A8F98),
    };

/// Director actions: raise a withdrawal, track co-approval, and complete the
/// posted-awaiting-transfer ones.
class DirectorScreen extends StatefulWidget {
  const DirectorScreen({super.key});

  @override
  State<DirectorScreen> createState() => _DirectorScreenState();
}

class _DirectorScreenState extends State<DirectorScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<DirectorCubit>().load();
    });
  }

  Future<void> _raise() async {
    final cubit = context.read<DirectorCubit>();
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BlocProvider.value(value: cubit, child: const _WithdrawalForm()),
      ),
    );
  }

  Future<void> _openDetail(DirectorWithdrawal w) async {
    final cubit = context.read<DirectorCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final done = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(value: cubit, child: _DetailSheet(withdrawal: w)),
    );
    if (done != null) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(done)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar('Director actions'),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _raise,
        icon: const Icon(Icons.add),
        label: const Text('Raise withdrawal'),
      ),
      body: BlocBuilder<DirectorCubit, DirectorState>(
        builder: (context, state) {
          if (state.loading && state.items.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.items.isEmpty) {
            return EmptyState(
              icon: state.error != null ? Icons.cloud_off : Icons.gavel_outlined,
              message: state.error ?? 'No withdrawals yet — tap + to raise one',
              isError: state.error != null,
            );
          }
          return RefreshIndicator(
            onRefresh: () => context.read<DirectorCubit>().load(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
              children: [
                for (final w in state.items)
                  Card(
                    child: ListTile(
                      onTap: () => _openDetail(w),
                      leading: IconBadge(
                        w.awaitingTransfer ? Icons.sync_alt : Icons.payments_outlined,
                        color: _statusColor(w.status),
                        background: _statusColor(w.status).withValues(alpha: 0.14),
                      ),
                      title: Text(
                        Money.format(w.amount, currency: w.currency),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${w.reason} · ${w.destinationAccount}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: StatusPill(label: w.statusLabel, color: _statusColor(w.status)),
                          ),
                        ],
                      ),
                      trailing: const Icon(Icons.chevron_right),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Raise a new director withdrawal.
class _WithdrawalForm extends StatefulWidget {
  const _WithdrawalForm();

  @override
  State<_WithdrawalForm> createState() => _WithdrawalFormState();
}

class _WithdrawalFormState extends State<_WithdrawalForm> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _destination = TextEditingController();
  final _reason = TextEditingController();
  String _currency = 'USD';
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _destination.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _busy = true);
    final error = await context.read<DirectorCubit>().create(
          NewWithdrawal(
            amount: double.parse(_amount.text),
            currency: _currency,
            destinationAccount: _destination.text.trim(),
            reason: _reason.text.trim(),
          ),
        );
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop();
    } else {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar('Raise withdrawal'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _amount,
                        enabled: !_busy,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Amount'),
                        validator: (v) {
                          final n = double.tryParse(v ?? '');
                          return (n == null || n <= 0) ? 'Enter an amount' : null;
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    SizedBox(
                      width: 110,
                      child: DropdownButtonFormField<String>(
                        initialValue: _currency,
                        decoration: const InputDecoration(labelText: 'Currency'),
                        items: const [
                          DropdownMenuItem(value: 'USD', child: Text('USD')),
                          DropdownMenuItem(value: 'ZWG', child: Text('ZWG')),
                        ],
                        onChanged: _busy ? null : (v) => setState(() => _currency = v ?? 'USD'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _destination,
                  enabled: !_busy,
                  decoration: const InputDecoration(labelText: 'Destination account'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter the destination' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _reason,
                  enabled: !_busy,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(labelText: 'Reason'),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter a reason' : null,
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _busy ? null : _save,
                  icon: _busy
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.save_outlined),
                  label: const Text('Save as draft'),
                ),
                const SizedBox(height: 8),
                Text(
                  'Submit it for a second director’s co-approval from the list.',
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Withdrawal detail with the relevant action: submit (draft) or complete transfer.
class _DetailSheet extends StatefulWidget {
  const _DetailSheet({required this.withdrawal});
  final DirectorWithdrawal withdrawal;

  @override
  State<_DetailSheet> createState() => _DetailSheetState();
}

class _DetailSheetState extends State<_DetailSheet> {
  final _reference = TextEditingController();
  String _method = 'EFT';
  bool _busy = false;

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final error = await context.read<DirectorCubit>().submit(widget.withdrawal.id);
    _finish(error, 'Submitted for co-approval');
  }

  Future<void> _complete() async {
    if (_reference.text.trim().isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Enter the transfer reference')));
      return;
    }
    setState(() => _busy = true);
    final error = await context
        .read<DirectorCubit>()
        .complete(widget.withdrawal.id, _method, _reference.text.trim());
    _finish(error, 'Transfer completed');
  }

  void _finish(String? error, String success) {
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(success);
    } else {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.withdrawal;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  Money.format(w.amount, currency: w.currency),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              StatusPill(label: w.statusLabel, color: _statusColor(w.status)),
            ],
          ),
          const SizedBox(height: 12),
          Text('To: ${w.destinationAccount}', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 4),
          Text('Reason: ${w.reason}', style: Theme.of(context).textTheme.bodyMedium),
          if (w.isDraft) ...[
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _busy ? null : _submit,
              icon: _busy
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
              label: const Text('Submit for co-approval'),
            ),
          ],
          if (w.awaitingTransfer) ...[
            const Divider(height: 32),
            Text('Complete the transfer', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _method,
              decoration: const InputDecoration(labelText: 'Transfer method'),
              items: const [
                DropdownMenuItem(value: 'EFT', child: Text('EFT')),
                DropdownMenuItem(value: 'RTGS', child: Text('RTGS')),
                DropdownMenuItem(value: 'MOBILE', child: Text('Mobile')),
                DropdownMenuItem(value: 'CASH', child: Text('Cash')),
              ],
              onChanged: _busy ? null : (v) => setState(() => _method = v ?? 'EFT'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reference,
              enabled: !_busy,
              decoration: const InputDecoration(labelText: 'Transfer reference'),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy ? null : _complete,
              icon: _busy
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.done_all),
              label: const Text('Mark transfer complete'),
            ),
          ],
        ],
      ),
    );
  }
}
