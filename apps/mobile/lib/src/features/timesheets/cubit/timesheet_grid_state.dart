import 'package:equatable/equatable.dart';

import '../../../models/timesheet_grid.dart';

/// State for the editable capture grid. [grid] holds the period + rows + entries
/// (server values with any local drafts merged on top). [pendingDrafts] is the
/// count of cells captured offline awaiting sync; [offline] reflects connectivity.
class TimesheetGridState extends Equatable {
  const TimesheetGridState({
    this.loading = true,
    this.saving = false,
    this.submitting = false,
    this.syncing = false,
    this.grid,
    this.pendingDrafts = 0,
    this.offline = false,
    this.error,
  });

  final bool loading;
  final bool saving;
  final bool submitting;
  final bool syncing;
  final TimesheetGrid? grid;
  final int pendingDrafts;
  final bool offline;
  final String? error;

  bool get isEditable => grid?.period.isOpen ?? false;

  TimesheetGridState copyWith({
    bool? loading,
    bool? saving,
    bool? submitting,
    bool? syncing,
    TimesheetGrid? grid,
    int? pendingDrafts,
    bool? offline,
    String? error,
    bool clearError = false,
  }) {
    return TimesheetGridState(
      loading: loading ?? this.loading,
      saving: saving ?? this.saving,
      submitting: submitting ?? this.submitting,
      syncing: syncing ?? this.syncing,
      grid: grid ?? this.grid,
      pendingDrafts: pendingDrafts ?? this.pendingDrafts,
      offline: offline ?? this.offline,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props =>
      [loading, saving, submitting, syncing, grid, pendingDrafts, offline, error];
}
