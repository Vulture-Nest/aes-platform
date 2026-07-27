import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/timesheet_entry.dart';
import '../../models/timesheet_grid.dart';
import '../../models/timesheet_period.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui_kit.dart';
import 'cubit/timesheet_grid_cubit.dart';
import 'cubit/timesheet_grid_state.dart';
import 'widgets/day_cell_editor.dart';

/// The daily-hours capture grid: employees (rows) × days (columns), each cell the
/// day's total (tap to enter the five categories). The mental model is the AES
/// manhours sheet. OPEN periods are editable; captured cells persist offline and
/// sync when connectivity returns.
class TimesheetGridScreen extends StatelessWidget {
  const TimesheetGridScreen({super.key, required this.period});

  final TimesheetPeriod period;

  Future<void> _sync(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final summary = await context.read<TimesheetGridCubit>().syncNow();
    final parts = <String>[
      if (summary.synced > 0) '${summary.synced} synced',
      if (summary.failed > 0) '${summary.failed} still pending',
      if (summary.rejected > 0) '${summary.rejected} rejected',
    ];
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(parts.isEmpty ? 'Nothing to sync' : parts.join(' · '))));
  }

  Future<void> _submit(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final cubit = context.read<TimesheetGridCubit>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Submit for approval'),
        content: const Text(
          'Submit this period to the Site Manager for approval? '
          'You will not be able to edit entries after submitting.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Submit')),
        ],
      ),
    );
    if (confirmed != true) return;
    final error = await cubit.submit();
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(error ?? 'Submitted for approval')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar(period.monthLabel),
      body: BlocConsumer<TimesheetGridCubit, TimesheetGridState>(
        listenWhen: (a, b) => a.error != b.error && b.error != null,
        listener: (context, state) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text(state.error!)));
        },
        builder: (context, state) {
          if (state.loading && state.grid == null) {
            return const Center(child: CircularProgressIndicator());
          }
          final grid = state.grid;
          if (grid == null) {
            return EmptyState(
              icon: Icons.cloud_off,
              message: state.error ?? 'Could not load the timesheet',
              isError: true,
            );
          }
          return Column(
            children: [
              _SyncBanner(state: state, onSync: () => _sync(context)),
              if (grid.employees.isEmpty)
                const Expanded(
                  child: EmptyState(
                    icon: Icons.groups_outlined,
                    message: 'No employees to capture for this site yet',
                  ),
                )
              else
                Expanded(child: _Grid(grid: grid, editable: state.isEditable)),
              _BottomBar(state: state, onSubmit: () => _submit(context)),
            ],
          );
        },
      ),
    );
  }
}

/// Banner reporting queued offline drafts + a manual "Sync now" (mirrors requests).
class _SyncBanner extends StatelessWidget {
  const _SyncBanner({required this.state, required this.onSync});

  final TimesheetGridState state;
  final VoidCallback onSync;

  @override
  Widget build(BuildContext context) {
    if (state.pendingDrafts == 0 && !state.offline) return const SizedBox.shrink();
    final label = state.pendingDrafts > 0
        ? '${state.pendingDrafts} day(s) saved offline'
        : 'Offline — edits will sync when connected';
    return Material(
      color: Theme.of(context).colorScheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Icon(state.offline ? Icons.cloud_off : Icons.cloud_upload_outlined, size: 20),
            const SizedBox(width: 12),
            Expanded(child: Text(label)),
            if (state.syncing)
              const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
            else if (state.pendingDrafts > 0)
              TextButton(onPressed: onSync, child: const Text('Sync now')),
          ],
        ),
      ),
    );
  }
}

/// The scrollable employees × days matrix. The employee-name column is pinned; the
/// day columns scroll horizontally in sync with the header.
class _Grid extends StatefulWidget {
  const _Grid({required this.grid, required this.editable});

  final TimesheetGrid grid;
  final bool editable;

  @override
  State<_Grid> createState() => _GridState();
}

class _GridState extends State<_Grid> {
  static const double _nameW = 128;
  static const double _dayW = 44;
  static const double _totalW = 52;
  static const double _rowH = 52;

  final _headerH = ScrollController();
  final _bodyH = ScrollController();

  @override
  void initState() {
    super.initState();
    // Keep the day header and the grid body horizontally in sync.
    _bodyH.addListener(() {
      if (_headerH.hasClients && _headerH.offset != _bodyH.offset) {
        _headerH.jumpTo(_bodyH.offset);
      }
    });
  }

  @override
  void dispose() {
    _headerH.dispose();
    _bodyH.dispose();
    super.dispose();
  }

  int get _daysInMonth {
    final parts = widget.grid.period.month.split('-');
    if (parts.length != 2) return 31;
    final year = int.tryParse(parts[0]) ?? DateTime.now().year;
    final month = int.tryParse(parts[1]) ?? 1;
    return DateTime(year, month + 1, 0).day;
  }

  DateTime _dateFor(int day) {
    final parts = widget.grid.period.month.split('-');
    final year = int.tryParse(parts[0]) ?? DateTime.now().year;
    final month = int.tryParse(parts.length > 1 ? parts[1] : '1') ?? 1;
    return DateTime(year, month, day);
  }

  Future<void> _editCell(TimesheetEmployee employee, DateTime date) async {
    if (!widget.editable) return;
    final existing = widget.grid.entryFor(employee.id, date) ??
        TimesheetEntry(employeeId: employee.id, date: date);
    final updated = await DayCellEditor.show(
      context,
      employeeName: employee.name,
      date: date,
      entry: existing,
    );
    if (updated != null && mounted) {
      await context.read<TimesheetGridCubit>().editCell(updated);
    }
  }

  @override
  Widget build(BuildContext context) {
    final days = _daysInMonth;
    final employees = widget.grid.employees;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Day-number header row (name gutter on the left, totals gutter on the right).
        Row(
          children: [
            const SizedBox(width: _nameW, height: 34),
            Expanded(
              child: SingleChildScrollView(
                controller: _headerH,
                scrollDirection: Axis.horizontal,
                physics: const NeverScrollableScrollPhysics(),
                child: Row(
                  children: [
                    for (var d = 1; d <= days; d++)
                      _HeaderCell(day: d, weekend: _dateFor(d).weekday >= 6, width: _dayW),
                  ],
                ),
              ),
            ),
            const SizedBox(width: _totalW),
          ],
        ),
        const Divider(height: 1),
        // Vertically-scrolling body: a pinned name column, one shared horizontal
        // scroll view for every row's day cells (synced with the header), and a
        // pinned totals column.
        Expanded(
          child: SingleChildScrollView(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  children: [
                    for (final e in employees)
                      SizedBox(
                        height: _rowH,
                        child: _NameCell(name: e.name, worksNo: e.worksNo, width: _nameW),
                      ),
                  ],
                ),
                Expanded(
                  child: SingleChildScrollView(
                    controller: _bodyH,
                    scrollDirection: Axis.horizontal,
                    child: Column(
                      children: [
                        for (final employee in employees)
                          SizedBox(
                            height: _rowH,
                            child: Row(
                              children: [
                                for (var d = 1; d <= days; d++)
                                  _DayCell(
                                    entry: widget.grid.entryFor(employee.id, _dateFor(d)),
                                    weekend: _dateFor(d).weekday >= 6,
                                    editable: widget.editable,
                                    width: _dayW,
                                    onTap: () => _editCell(employee, _dateFor(d)),
                                  ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                Column(
                  children: [
                    for (final e in employees)
                      SizedBox(
                        height: _rowH,
                        child: _TotalCell(value: widget.grid.totalFor(e.id), width: _totalW),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _HeaderCell extends StatelessWidget {
  const _HeaderCell({required this.day, required this.weekend, required this.width});

  final int day;
  final bool weekend;
  final double width;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: 34,
      alignment: Alignment.center,
      child: Text(
        '$day',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: weekend
              ? AppTheme.danger.withValues(alpha: 0.8)
              : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
        ),
      ),
    );
  }
}

class _NameCell extends StatelessWidget {
  const _NameCell({required this.name, required this.worksNo, required this.width});

  final String name;
  final String? worksNo;
  final double width;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      alignment: Alignment.centerLeft,
      decoration: BoxDecoration(
        border: Border(
          right: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          if (worksNo != null)
            Text(
              worksNo!,
              style: TextStyle(
                fontSize: 11,
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
              ),
            ),
        ],
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.entry,
    required this.weekend,
    required this.editable,
    required this.width,
    required this.onTap,
  });

  final TimesheetEntry? entry;
  final bool weekend;
  final bool editable;
  final double width;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final total = entry?.total ?? 0;
    final has = total > 0;
    final anomaly = entry?.anomalyFlag ?? false;
    return InkWell(
      onTap: editable ? onTap : null,
      child: Container(
        width: width,
        margin: const EdgeInsets.all(2),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: has
              ? AppTheme.green.withValues(alpha: 0.16)
              : (weekend
                  ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.04)
                  : null),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: anomaly
                ? AppTheme.danger
                : Theme.of(context).dividerColor.withValues(alpha: 0.6),
            width: anomaly ? 1.4 : 1,
          ),
        ),
        child: Text(
          has ? _fmt(total) : '',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: has ? AppTheme.greenDark : null,
          ),
        ),
      ),
    );
  }

  static String _fmt(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);
}

class _TotalCell extends StatelessWidget {
  const _TotalCell({required this.value, required this.width});

  final double value;
  final double width;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      alignment: Alignment.center,
      child: Text(
        value == 0 ? '—' : (value == value.roundToDouble() ? value.toInt().toString() : value.toStringAsFixed(1)),
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// The bottom action bar: the submit button for OPEN periods, or a status note.
class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.state, required this.onSubmit});

  final TimesheetGridState state;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final grid = state.grid;
    if (grid == null) return const SizedBox.shrink();
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: state.isEditable
            ? Row(
                children: [
                  Expanded(
                    child: Text(
                      '${grid.capturedDays} day(s) captured',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: (state.submitting || grid.capturedDays == 0) ? null : onSubmit,
                    icon: state.submitting
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                    label: const Text('Submit'),
                  ),
                ],
              )
            : Row(
                children: [
                  const Icon(Icons.lock_outline, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      grid.period.isSiteApproved
                          ? 'Approved — read only'
                          : 'This period is ${grid.period.status.toLowerCase()} and cannot be edited',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
