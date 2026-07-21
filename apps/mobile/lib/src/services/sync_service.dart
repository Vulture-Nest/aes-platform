import 'dart:async';

import '../api/api_exception.dart';
import '../data/outbox_store.dart';
import '../data/petty_cash_repository.dart';
import '../data/requisitions_repository.dart';
import '../data/travel_repository.dart';
import '../models/outbox_item.dart';
import 'connectivity_monitor.dart';

/// A queued item the server rejected on a business rule (server-wins): it is
/// dropped from the outbox and surfaced to the user rather than retried forever.
class SyncConflict {
  const SyncConflict(this.item, this.reason);
  final OutboxItem item;
  final String reason;
}

class SyncSummary {
  const SyncSummary({this.synced = 0, this.failed = 0, this.conflicts = const []});

  final int synced;
  final int failed;
  final List<SyncConflict> conflicts;

  static const empty = SyncSummary();

  bool get anything => synced > 0 || failed > 0 || conflicts.isNotEmpty;
}

/// Flushes the offline outbox to the API when connectivity allows. Transient
/// failures (offline / 5xx) keep the item queued; permanent business rejections
/// (4xx) drop it and report a conflict — server-wins, user-notified (spec §15.1).
class SyncService {
  SyncService({
    required OutboxStore store,
    required ConnectivityMonitor connectivity,
    required RequisitionsRepository requisitions,
    required TravelRepository travel,
    required PettyCashRepository pettyCash,
  })  : _store = store,
        _connectivity = connectivity,
        _requisitions = requisitions,
        _travel = travel,
        _pettyCash = pettyCash;

  final OutboxStore _store;
  final ConnectivityMonitor _connectivity;
  final RequisitionsRepository _requisitions;
  final TravelRepository _travel;
  final PettyCashRepository _pettyCash;

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

  Future<SyncSummary> flush() async {
    if (_flushing || !await _connectivity.isOnline()) {
      return SyncSummary.empty;
    }
    _flushing = true;
    try {
      var synced = 0;
      var failed = 0;
      final conflicts = <SyncConflict>[];
      for (final item in await _store.all()) {
        try {
          await _dispatch(item);
          await _store.remove(item.id);
          synced++;
        } on ApiException catch (e) {
          final status = e.statusCode;
          if (status != null && status >= 400 && status < 500 && status != 429) {
            // Permanent rejection — drop and report (server-wins).
            conflicts.add(SyncConflict(item, e.message));
            await _store.remove(item.id);
          } else {
            // Transient (offline / 5xx / rate-limit) — keep for the next flush.
            await _store.update(item.copyWith(failed: true, lastError: e.message));
            failed++;
          }
        }
      }
      return SyncSummary(synced: synced, failed: failed, conflicts: conflicts);
    } finally {
      _flushing = false;
    }
  }

  Future<void> _dispatch(OutboxItem item) async {
    switch (item.kind) {
      case OutboxKind.requisition:
        final created = await _requisitions.create(NewRequisition.fromMap(item.payload));
        if (item.submitAfter) await _requisitions.submit(created.id);
      case OutboxKind.travel:
        final created = await _travel.create(NewTravel.fromMap(item.payload));
        if (item.submitAfter) await _travel.submit(created.id);
      case OutboxKind.pettyCashWithdrawal:
        await _pettyCash.createWithdrawal(
          item.floatId!,
          amount: (item.payload['amount'] as num).toDouble(),
          purpose: item.payload['purpose'] as String,
          receiptKey: item.payload['receiptKey'] as String?,
        );
    }
  }
}
