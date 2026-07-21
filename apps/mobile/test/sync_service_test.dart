import 'package:aes_mobile/src/api/api_exception.dart';
import 'package:aes_mobile/src/data/outbox_store.dart';
import 'package:aes_mobile/src/data/requisitions_repository.dart';
import 'package:aes_mobile/src/models/outbox_item.dart';
import 'package:aes_mobile/src/models/requisition.dart';
import 'package:aes_mobile/src/services/connectivity_monitor.dart';
import 'package:aes_mobile/src/services/sync_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  OutboxItem reqItem({String id = 'o1', bool submit = false}) => OutboxItem(
        id: id,
        kind: OutboxKind.requisition,
        payload: newRequisitionPayload(),
        submitAfter: submit,
        createdAt: DateTime(2026, 7, 1),
      );

  SyncService build({
    required OutboxStore store,
    FakeRequisitionsRepository? req,
    ConnectivityMonitor? conn,
  }) =>
      SyncService(
        store: store,
        connectivity: conn ?? const AlwaysOnlineMonitor(),
        requisitions: req ?? FakeRequisitionsRepository(),
        travel: FakeTravelRepository(),
        pettyCash: FakePettyCashRepository(),
      );

  test('flush posts queued items and clears them on success', () async {
    final store = InMemoryOutboxStore();
    await store.enqueue(reqItem(submit: true));
    final repo = FakeRequisitionsRepository();
    final sync = build(store: store, req: repo);

    final summary = await sync.flush();

    expect(summary.synced, 1);
    expect(repo.created, hasLength(1));
    expect(repo.submitted, hasLength(1)); // submitAfter honoured
    expect(await store.count(), 0); // cleared
  });

  test('a transient failure keeps the item queued (marked failed)', () async {
    final store = InMemoryOutboxStore();
    await store.enqueue(reqItem());
    final sync = build(store: store, req: FakeRequisitionsRepository(offline: true));

    final summary = await sync.flush();

    expect(summary.failed, 1);
    expect(await store.count(), 1); // still queued for the next flush
    expect((await store.all()).single.failed, isTrue);
  });

  test('a permanent (4xx) rejection drops the item and reports a conflict', () async {
    final store = InMemoryOutboxStore();
    await store.enqueue(reqItem());
    final sync = build(store: store, req: _RejectingRequisitions());

    final summary = await sync.flush();

    expect(summary.conflicts, hasLength(1));
    expect(summary.conflicts.single.reason, contains('rejected'));
    expect(await store.count(), 0); // dropped (server-wins)
  });

  test('flush is a no-op while offline', () async {
    final store = InMemoryOutboxStore();
    await store.enqueue(reqItem());
    final sync = build(store: store, conn: _OfflineMonitor());

    final summary = await sync.flush();

    expect(summary.anything, isFalse);
    expect(await store.count(), 1);
  });
}

Map<String, dynamic> newRequisitionPayload() => {
      'purpose': 'Fuel',
      'amount': 500,
      'currency': 'USD',
      'requiredByDate': DateTime(2026, 8, 1).toIso8601String(),
    };

class _RejectingRequisitions extends FakeRequisitionsRepository {
  @override
  Future<Requisition> create(NewRequisition input) async =>
      throw const ApiException('Amount rejected', statusCode: 400);
}

class _OfflineMonitor implements ConnectivityMonitor {
  @override
  Future<bool> isOnline() async => false;
  @override
  Stream<bool> get onStatusChange => const Stream.empty();
}
