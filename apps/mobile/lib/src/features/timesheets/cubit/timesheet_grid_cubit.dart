import 'package:bloc/bloc.dart';

import '../../../api/api_exception.dart';
import '../../../models/timesheet_entry.dart';
import '../../../models/timesheet_grid.dart';
import '../data/timesheet_draft_store.dart';
import '../data/timesheet_sync_service.dart';
import '../data/timesheets_repository.dart';
import 'timesheet_grid_state.dart';

/// Drives the offline-first capture grid for one period. Editing a cell writes it
/// to the [TimesheetDraftStore] immediately (so it survives an app kill in a mine
/// dead zone), then tries to push it to the API; on any connectivity failure the
/// draft simply stays queued and syncs later — mirroring how the requests feature
/// queues drafts to its outbox.
class TimesheetGridCubit extends Cubit<TimesheetGridState> {
  TimesheetGridCubit({
    required TimesheetsRepository repository,
    required TimesheetDraftStore drafts,
    required TimesheetSyncService sync,
    required this.periodId,
  })  : _repo = repository,
        _drafts = drafts,
        _sync = sync,
        super(const TimesheetGridState());

  final TimesheetsRepository _repo;
  final TimesheetDraftStore _drafts;
  final TimesheetSyncService _sync;
  final String periodId;

  /// Load the server grid then merge any locally-queued drafts on top so unsynced
  /// edits are never lost across a restart.
  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      final grid = await _repo.getGrid(periodId);
      final merged = await _mergeDrafts(grid);
      emit(state.copyWith(
        loading: false,
        grid: merged,
        pendingDrafts: await _drafts.count(),
        offline: !await _sync.isOnline(),
      ),);
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  /// Apply the edited [entry] for a cell: update the grid, persist the draft, and
  /// try to sync it now. Offline, the draft stays queued and syncs when back online.
  Future<void> editCell(TimesheetEntry entry) async {
    final grid = state.grid;
    if (grid == null || !grid.period.isOpen) return;

    // Optimistic UI: reflect the edit immediately.
    emit(state.copyWith(grid: grid.withEntry(entry), saving: true, clearError: true));

    await _drafts.put(TimesheetDraft(periodId: periodId, entry: entry));

    try {
      await _repo.upsertEntries(periodId, [entry]);
      // Synced — clear this cell's draft.
      await _drafts.remove(TimesheetDraft(periodId: periodId, entry: entry).id);
      emit(state.copyWith(saving: false, pendingDrafts: await _drafts.count(), offline: false));
    } on ApiException catch (e) {
      if (e.statusCode == null || e.statusCode == 429 || (e.statusCode ?? 0) >= 500) {
        // Transient — keep the draft queued for the next sync.
        emit(state.copyWith(
          saving: false,
          pendingDrafts: await _drafts.count(),
          offline: e.statusCode == null,
        ),);
      } else {
        // Permanent rejection (e.g. validation) — drop the draft and surface it.
        await _drafts.remove(TimesheetDraft(periodId: periodId, entry: entry).id);
        emit(state.copyWith(
          saving: false,
          pendingDrafts: await _drafts.count(),
          error: e.message,
        ),);
      }
    }
  }

  /// Manually flush all queued drafts (the "Sync now" action). Returns a summary.
  Future<TimesheetSyncSummary> syncNow() async {
    emit(state.copyWith(syncing: true, clearError: true));
    final summary = await _sync.flush();
    // Re-read the server grid so approved/synced state is reflected.
    try {
      final grid = await _repo.getGrid(periodId);
      final merged = await _mergeDrafts(grid);
      emit(state.copyWith(
        syncing: false,
        grid: merged,
        pendingDrafts: await _drafts.count(),
        offline: !await _sync.isOnline(),
      ),);
    } on ApiException {
      emit(state.copyWith(syncing: false, pendingDrafts: await _drafts.count()));
    }
    return summary;
  }

  /// Submit the period for Site-Manager approval. Any queued drafts are flushed
  /// first so nothing is lost; returns null on success or an error message.
  Future<String?> submit() async {
    emit(state.copyWith(submitting: true, clearError: true));
    try {
      // Push any pending edits before submission so the period is complete.
      final pending = await _drafts.forPeriod(periodId);
      if (pending.isNotEmpty) {
        await _repo.upsertEntries(periodId, [for (final d in pending) d.entry]);
        await _drafts.removeForPeriod(periodId);
      }
      await _repo.submit(periodId);
      await load();
      emit(state.copyWith(submitting: false, pendingDrafts: await _drafts.count()));
      return null;
    } on ApiException catch (e) {
      // Offline: mark the queued drafts for submission so a later sync submits it.
      if (e.statusCode == null) {
        final pending = await _drafts.forPeriod(periodId);
        for (final d in pending) {
          await _drafts.put(TimesheetDraft(periodId: periodId, entry: d.entry, submitAfter: true));
        }
        emit(state.copyWith(submitting: false, offline: true, pendingDrafts: await _drafts.count()));
        return 'Offline — will submit when connectivity returns';
      }
      emit(state.copyWith(submitting: false, error: e.message));
      return e.message;
    }
  }

  /// Merge queued drafts on top of the server grid.
  Future<TimesheetGrid> _mergeDrafts(TimesheetGrid grid) async {
    var merged = grid;
    for (final draft in await _drafts.forPeriod(periodId)) {
      merged = merged.withEntry(draft.entry);
    }
    return merged;
  }
}
