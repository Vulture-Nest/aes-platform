import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/timesheet_period.dart';
import '../../widgets/ui_kit.dart';
import 'cubit/timesheet_grid_cubit.dart';
import 'cubit/timesheet_periods_cubit.dart';
import 'cubit/timesheet_periods_state.dart';
import 'data/timesheet_draft_store.dart';
import 'data/timesheet_sync_service.dart';
import 'data/timesheets_repository.dart';
import 'timesheet_grid_screen.dart';

/// Timesheets landing (route `/timesheets`): pick a site, see its monthly periods,
/// open a new (OPEN) period, and drill into the capture grid. The flagship
/// offline-first capture — drafts are queued locally and synced when back online.
class TimesheetsScreen extends StatefulWidget {
  const TimesheetsScreen({
    super.key,
    required this.repository,
    required this.draftStore,
    required this.syncService,
  });

  final TimesheetsRepository repository;
  final TimesheetDraftStore draftStore;
  final TimesheetSyncService syncService;

  @override
  State<TimesheetsScreen> createState() => _TimesheetsScreenState();
}

class _TimesheetsScreenState extends State<TimesheetsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<TimesheetPeriodsCubit>().load();
    });
  }

  Future<void> _openPeriod() async {
    final cubit = context.read<TimesheetPeriodsCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final month = await _pickMonth(context);
    if (month == null) return;
    final (period, error) = await cubit.openPeriod(month);
    if (!mounted) return;
    if (period != null) {
      _openGrid(period);
    } else if (error != null) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error)));
    }
  }

  /// Pick a month (YYYY-MM) for a new period via a year/month chooser.
  Future<String?> _pickMonth(BuildContext context) async {
    final now = DateTime.now();
    var year = now.year;
    var month = now.month;
    return showDialog<String>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Open a month'),
          content: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              DropdownButton<int>(
                value: month,
                items: [
                  for (var m = 1; m <= 12; m++)
                    DropdownMenuItem(value: m, child: Text(_monthName(m))),
                ],
                onChanged: (v) => setState(() => month = v ?? month),
              ),
              const SizedBox(width: 16),
              DropdownButton<int>(
                value: year,
                items: [
                  for (var y = now.year - 2; y <= now.year + 1; y++)
                    DropdownMenuItem(value: y, child: Text('$y')),
                ],
                onChanged: (v) => setState(() => year = v ?? year),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(
              onPressed: () =>
                  Navigator.pop(context, '$year-${month.toString().padLeft(2, '0')}'),
              child: const Text('Open'),
            ),
          ],
        ),
      ),
    );
  }

  static String _monthName(int m) => const [
        '', 'January', 'February', 'March', 'April', 'May', 'June', //
        'July', 'August', 'September', 'October', 'November', 'December',
      ][m];

  void _openGrid(TimesheetPeriod period) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BlocProvider(
          create: (_) => TimesheetGridCubit(
            repository: widget.repository,
            drafts: widget.draftStore,
            sync: widget.syncService,
            periodId: period.id,
          )..load(),
          child: TimesheetGridScreen(period: period),
        ),
      ),
    ).then((_) {
      if (mounted) context.read<TimesheetPeriodsCubit>().loadPeriods();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar('Timesheets'),
      floatingActionButton: BlocBuilder<TimesheetPeriodsCubit, TimesheetPeriodsState>(
        buildWhen: (a, b) => a.creating != b.creating || a.selectedSiteId != b.selectedSiteId,
        builder: (context, state) => FloatingActionButton.extended(
          onPressed: (state.creating || state.selectedSiteId == null) ? null : _openPeriod,
          icon: const Icon(Icons.add),
          label: const Text('Open month'),
        ),
      ),
      body: BlocBuilder<TimesheetPeriodsCubit, TimesheetPeriodsState>(
        builder: (context, state) {
          if (state.loadingSites) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.sites.isEmpty) {
            return EmptyState(
              icon: state.error != null ? Icons.cloud_off : Icons.location_off_outlined,
              message: state.error ?? 'No sites available',
              isError: state.error != null,
            );
          }
          return Column(
            children: [
              _SitePicker(
                sites: state.sites,
                selectedId: state.selectedSiteId,
                onChanged: (id) => context.read<TimesheetPeriodsCubit>().selectSite(id),
              ),
              Expanded(child: _PeriodList(state: state, onOpen: _openGrid)),
            ],
          );
        },
      ),
    );
  }
}

class _SitePicker extends StatelessWidget {
  const _SitePicker({required this.sites, required this.selectedId, required this.onChanged});

  final List<TimesheetSite> sites;
  final String? selectedId;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: DropdownButtonFormField<String>(
        initialValue: selectedId,
        decoration: const InputDecoration(labelText: 'Site', prefixIcon: Icon(Icons.apartment)),
        items: [for (final s in sites) DropdownMenuItem(value: s.id, child: Text(s.name))],
        onChanged: (v) {
          if (v != null) onChanged(v);
        },
      ),
    );
  }
}

class _PeriodList extends StatelessWidget {
  const _PeriodList({required this.state, required this.onOpen});

  final TimesheetPeriodsState state;
  final ValueChanged<TimesheetPeriod> onOpen;

  @override
  Widget build(BuildContext context) {
    if (state.loadingPeriods && state.periods.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    return RefreshIndicator(
      onRefresh: () => context.read<TimesheetPeriodsCubit>().loadPeriods(),
      child: state.periods.isEmpty
          ? EmptyState(
              icon: state.error != null ? Icons.cloud_off : Icons.event_note_outlined,
              message: state.error ?? 'No timesheet periods yet — tap “Open month” to start',
              isError: state.error != null,
            )
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: state.periods.length,
              itemBuilder: (context, i) {
                final period = state.periods[i];
                return Card(
                  child: ListTile(
                    onTap: () => onOpen(period),
                    leading: const IconBadge(Icons.access_time),
                    title: Text(
                      period.monthLabel,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: _StatusPill(status: period.status),
                      ),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                  ),
                );
              },
            ),
    );
  }
}

/// Small coloured status pill for a period (OPEN / SITE_APPROVED / LOCKED).
class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'OPEN' => ('Open for capture', const Color(0xFF579A34)),
      'SITE_APPROVED' => ('Site approved', const Color(0xFF3949AB)),
      'LOCKED' => ('Locked', const Color(0xFF6D4C41)),
      _ => (status, Colors.grey),
    };
    return StatusPill(label: label, color: color);
  }
}
