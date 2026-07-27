import 'dart:async';

import '../../../api/api_exception.dart';
import '../../../services/connectivity_monitor.dart';
import 'timesheet_draft_store.dart';
import 'timesheets_repository.dart';

/// Result of flushing the timesheet draft queue, for the UI to report.
class TimesheetSyncSummary {
  const TimesheetSyncSummary({this.synced = 0, this.failed = 0, this.rejected = 0});

  /// Draft cells successfully pushed to the API.
  final int synced;

  /// Cells kept queued after a transient failure (offline / 5xx).
  final int failed;

  /// Cells dropped after a permanent server rejection (4xx — server-wins).
  final int rejected;

  static const empty = TimesheetSyncSummary();

  bool get anything => synced > 0 || failed > 0 || rejected > 0;
}

/// Flushes the offline timesheet draft queue to the API when connectivity allows.
/// Mirrors the requests-feature [SyncService]: drafts are batched per period into
/// one bulk upsert; a period flagged for submission is submitted once its rows land.
/// Transient failures (offline / 5xx) keep the drafts queued; permanent 4xx
/// rejections drop them and are surfaced to the user (server-wins).
class TimesheetSyncService {
  TimesheetSyncService({
    required TimesheetDraftStore store,
    required TimesheetsRepository repository,
    ConnectivityMonitor? connectivity,
  })  : _store = store,
        _repo = repository,
        _connectivity = connectivity ?? PlusConnectivityMonitor();

  final TimesheetDraftStore _store;
  final TimesheetsRepository _repo;
  final ConnectivityMonitor _connectivity;

  StreamSubscription<bool>? _sub;
  bool _flushing = false;

  /// Auto-flush whenever connectivity is regained.
  void start() {
    _sub ??= _connectivity.onStatusChange.listen((online) {
      if (online) flush();
    });
  }

  Future<void> dispose() async {
    await _sub?.cancel();
    _sub = null;
  }

  Future<bool> isOnline() => _connectivity.isOnline();

  /// Flush all queued drafts, grouped by period. Returns a summary for the UI.
  Future<TimesheetSyncSummary> flush() async {
    if (_flushing || !await _connectivity.isOnline()) {
      return TimesheetSyncSummary.empty;
    }
    _flushing = true;
    try {
      final drafts = await _store.all();
      if (drafts.isEmpty) return TimesheetSyncSummary.empty;

      // Batch by period so each period is one bulk upsert.
      final byPeriod = <String, List<TimesheetDraft>>{};
      for (final d in drafts) {
        byPeriod.putIfAbsent(d.periodId, () => []).add(d);
      }

      var synced = 0;
      var failed = 0;
      var rejected = 0;
      for (final entry in byPeriod.entries) {
        final periodId = entry.key;
        final periodDrafts = entry.value;
        try {
          await _repo.upsertEntries(periodId, [for (final d in periodDrafts) d.entry]);
          if (periodDrafts.any((d) => d.submitAfter)) {
            await _repo.submit(periodId);
          }
          await _store.removeForPeriod(periodId);
          synced += periodDrafts.length;
        } on ApiException catch (e) {
          final status = e.statusCode;
          if (status != null && status >= 400 && status < 500 && status != 429) {
            // Permanent rejection — drop and report (server-wins).
            await _store.removeForPeriod(periodId);
            rejected += periodDrafts.length;
          } else {
            // Transient (offline / 5xx / rate-limit) — keep for the next flush.
            failed += periodDrafts.length;
          }
        }
      }
      return TimesheetSyncSummary(synced: synced, failed: failed, rejected: rejected);
    } finally {
      _flushing = false;
    }
  }
}
