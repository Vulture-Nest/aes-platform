import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/request_status.dart';
import '../../models/requisition.dart';
import '../../models/travel_request.dart';
import '../../theme/money.dart';
import 'cubit/outbox_cubit.dart';
import 'cubit/petty_cash_cubit.dart';
import 'cubit/request_list_state.dart';
import 'cubit/requisitions_cubit.dart';
import 'cubit/travel_cubit.dart';
import 'petty_cash_tab.dart';
import 'requisition_form.dart';
import 'travel_form.dart';
import 'widgets/request_widgets.dart';

/// Normalised view of a request row for the shared list + detail UI.
class _RequestVM {
  const _RequestVM({
    required this.id,
    required this.title,
    required this.amountLabel,
    required this.subtitle,
    required this.status,
    required this.rows,
  });

  final String id;
  final String title;
  final String amountLabel;
  final String subtitle;
  final String status;
  final List<(String, String)> rows;

  bool get isDraft => RequestLifecycle.isDraft(status);
}

/// Requests hub: raise & track requisitions and travel from the field.
class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key});

  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<RequisitionsCubit>().load();
      context.read<TravelCubit>().load();
      context.read<PettyCashCubit>().loadFloats();
    });
    _tabs.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final requisitions = context.read<RequisitionsCubit>();
    final travel = context.read<TravelCubit>();
    final outbox = context.read<OutboxCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final String? message;
    if (_tabs.index == 0) {
      message = await Navigator.of(context).push<String>(
        MaterialPageRoute(
          builder: (_) => BlocProvider.value(value: requisitions, child: const RequisitionForm()),
        ),
      );
    } else {
      message = await Navigator.of(context).push<String>(
        MaterialPageRoute(
          builder: (_) => BlocProvider.value(value: travel, child: const TravelForm()),
        ),
      );
    }
    await outbox.refresh();
    if (message != null) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Requests'),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Requisitions'),
            Tab(text: 'Travel'),
            Tab(text: 'Petty Cash'),
          ],
        ),
      ),
      // Petty-cash withdrawals are raised against a specific float, so no hub FAB there.
      floatingActionButton: _tabs.index < 2
          ? FloatingActionButton.extended(
              onPressed: _create,
              icon: const Icon(Icons.add),
              label: Text(_tabs.index == 0 ? 'New requisition' : 'New travel'),
            )
          : null,
      body: Column(
        children: [
          const _PendingSyncBanner(),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: const [_RequisitionsTab(), _TravelTab(), PettyCashTab()],
            ),
          ),
        ],
      ),
    );
  }
}

/// Shown at the top of the hub when there are drafts queued offline; offers a
/// manual "Sync now" and reports the result.
class _PendingSyncBanner extends StatelessWidget {
  const _PendingSyncBanner();

  Future<void> _sync(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final summary = await context.read<OutboxCubit>().syncNow();
    final parts = <String>[
      if (summary.synced > 0) '${summary.synced} synced',
      if (summary.failed > 0) '${summary.failed} still pending',
      if (summary.conflicts.isNotEmpty) '${summary.conflicts.length} rejected',
    ];
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text(parts.isEmpty ? 'Nothing to sync' : parts.join(' · '))),
      );
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<OutboxCubit, OutboxState>(
      builder: (context, state) {
        if (state.pending == 0) return const SizedBox.shrink();
        return Material(
          color: Theme.of(context).colorScheme.secondaryContainer,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const Icon(Icons.cloud_upload_outlined, size: 20),
                const SizedBox(width: 12),
                Expanded(child: Text('${state.pending} draft(s) saved offline')),
                if (state.syncing)
                  const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                else
                  TextButton(onPressed: () => _sync(context), child: const Text('Sync now')),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _RequisitionsTab extends StatelessWidget {
  const _RequisitionsTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<RequisitionsCubit, RequestListState<Requisition>>(
      builder: (context, state) => _RequestListView(
        loading: state.loading,
        error: state.error,
        items: [
          for (final r in state.items)
            _RequestVM(
              id: r.id,
              title: r.purpose,
              amountLabel: Money.format(r.amount, currency: r.currency),
              subtitle: r.requiredByDate == null
                  ? ''
                  : 'Required by ${r.requiredByDate!.toIso8601String().substring(0, 10)}',
              status: r.status,
              rows: [
                ('Amount', Money.format(r.amount, currency: r.currency)),
                if (r.requiredByDate != null)
                  ('Required by', r.requiredByDate!.toIso8601String().substring(0, 10)),
                if (r.shortfall != null && r.shortfall! > 0)
                  ('Shortfall', Money.format(r.shortfall, currency: r.currency)),
                if (r.attachmentKey != null) ('Receipt', 'Attached'),
              ],
            ),
        ],
        onRefresh: () => context.read<RequisitionsCubit>().load(),
        onSubmit: (id) => context.read<RequisitionsCubit>().submit(id),
      ),
    );
  }
}

class _TravelTab extends StatelessWidget {
  const _TravelTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<TravelCubit, RequestListState<TravelRequest>>(
      builder: (context, state) => _RequestListView(
        loading: state.loading,
        error: state.error,
        items: [
          for (final t in state.items)
            _RequestVM(
              id: t.id,
              title: t.destination,
              amountLabel: Money.format(t.advanceAmount, currency: t.currency),
              subtitle: (t.dateFrom == null || t.dateTo == null)
                  ? ''
                  : '${t.dateFrom!.toIso8601String().substring(0, 10)} → ${t.dateTo!.toIso8601String().substring(0, 10)}',
              status: t.status,
              rows: [
                ('Advance', Money.format(t.advanceAmount, currency: t.currency)),
                if (t.perDiem != null) ('Per diem', Money.format(t.perDiem, currency: t.currency)),
                if (t.destinationClass != null) ('Class', t.destinationClass!),
                if (t.shortfall != null && t.shortfall! > 0)
                  ('Shortfall', Money.format(t.shortfall, currency: t.currency)),
              ],
            ),
        ],
        onRefresh: () => context.read<TravelCubit>().load(),
        onSubmit: (id) => context.read<TravelCubit>().submit(id),
      ),
    );
  }
}

class _RequestListView extends StatelessWidget {
  const _RequestListView({
    required this.loading,
    required this.error,
    required this.items,
    required this.onRefresh,
    required this.onSubmit,
  });

  final bool loading;
  final String? error;
  final List<_RequestVM> items;
  final Future<void> Function() onRefresh;
  final Future<String?> Function(String id) onSubmit;

  Future<void> _openDetail(BuildContext context, _RequestVM vm) async {
    final messenger = ScaffoldMessenger.of(context);
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _DetailSheet(vm: vm, onSubmit: onSubmit),
    );
    if (submitted == true) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Submitted for approval')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: (items.isEmpty)
          ? ListView(
              children: [
                const SizedBox(height: 120),
                Icon(error != null ? Icons.cloud_off : Icons.inbox_outlined, size: 48),
                const SizedBox(height: 12),
                Center(child: Text(error ?? 'No requests yet — tap + to raise one')),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final vm = items[i];
                return Card(
                  child: ListTile(
                    onTap: () => _openDetail(context, vm),
                    title: Text(vm.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (vm.subtitle.isNotEmpty) Text(vm.subtitle),
                        const SizedBox(height: 4),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: StatusChip(status: vm.status),
                        ),
                      ],
                    ),
                    trailing: Text(
                      vm.amountLabel,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class _DetailSheet extends StatefulWidget {
  const _DetailSheet({required this.vm, required this.onSubmit});

  final _RequestVM vm;
  final Future<String?> Function(String id) onSubmit;

  @override
  State<_DetailSheet> createState() => _DetailSheetState();
}

class _DetailSheetState extends State<_DetailSheet> {
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    final error = await widget.onSubmit(widget.vm.id);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final vm = widget.vm;
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(vm.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            StatusChip(status: vm.status),
            const SizedBox(height: 16),
            for (final row in vm.rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(row.$1, style: Theme.of(context).textTheme.bodyMedium),
                    Text(row.$2, style: Theme.of(context).textTheme.titleSmall),
                  ],
                ),
              ),
            const Divider(height: 32),
            Text('Progress', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            RequestTimeline(status: vm.status),
            if (vm.isDraft) ...[
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _busy ? null : _submit,
                icon: _busy
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send),
                label: const Text('Submit for approval'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
