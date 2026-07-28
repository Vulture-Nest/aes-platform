import 'package:aes_mobile/src/data/outbox_store.dart';
import 'package:aes_mobile/src/data/requisitions_repository.dart';
import 'package:aes_mobile/src/features/requests/cubit/requisitions_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  RequisitionsCubit build(
    FakeRequisitionsRepository repo, {
    FakeAttachmentsRepository? att,
    OutboxStore? outbox,
  }) =>
      RequisitionsCubit(
        repository: repo,
        attachments: att ?? FakeAttachmentsRepository(),
        outbox: outbox ?? InMemoryOutboxStore(),
      );

  NewRequisition input() => NewRequisition(
        purpose: 'Fuel',
        amount: 500,
        currency: 'USD',
        requiredByDate: DateTime(2026, 8, 1),
      );

  test('load populates the list', () async {
    final cubit = build(FakeRequisitionsRepository(items: [draftRequisition()]));
    await cubit.load();
    expect(cubit.state.items, hasLength(1));
  });

  test('create without a receipt does not upload and prepends the new draft', () async {
    final repo = FakeRequisitionsRepository();
    final att = FakeAttachmentsRepository();
    final cubit = build(repo, att: att);

    final result = await cubit.create(input());

    expect(result.ok, isTrue);
    expect(result.createdId, isNotNull);
    expect(att.uploads, 0);
    expect(repo.created.single.attachmentKey, isNull);
    expect(cubit.state.items.first.id, result.createdId);
  });

  test('create with a receipt uploads first and attaches the returned key', () async {
    final repo = FakeRequisitionsRepository();
    final att = FakeAttachmentsRepository(key: 'attachments/x/receipt.jpg');
    final cubit = build(repo, att: att);

    await cubit.create(input(), receipt: fakeCaptured());

    expect(att.uploads, 1);
    expect(repo.created.single.attachmentKey, 'attachments/x/receipt.jpg');
  });

  test('create with submit posts then submits', () async {
    final repo = FakeRequisitionsRepository();
    final cubit = build(repo);
    final result = await cubit.create(input(), submit: true);
    expect(repo.submitted, [result.createdId]);
  });

  test('create with submit reloads so the item shows its true (SUBMITTED) status', () async {
    // Regression: previously the pre-submit DRAFT object was left in state, so the
    // UI kept a Submit action and re-taps hit 400 ("cannot be submitted from
    // SUBMITTED"). After submit the cubit must reflect the server's reloaded view.
    final repo = FakeRequisitionsRepository(
      items: [draftRequisition(id: 'srv-1', status: 'SUBMITTED')],
    );
    final cubit = build(repo);

    await cubit.create(input(), submit: true);

    expect(repo.submitted, hasLength(1));
    expect(cubit.state.items.map((r) => r.status), everyElement(equals('SUBMITTED')));
    expect(cubit.state.items.any((r) => r.status == 'DRAFT'), isFalse);
  });

  test('offline create queues the draft to the outbox instead of failing', () async {
    final outbox = InMemoryOutboxStore();
    final cubit = build(FakeRequisitionsRepository(offline: true), outbox: outbox);

    final result = await cubit.create(input(), submit: true);

    expect(result.queuedOffline, isTrue);
    expect(result.ok, isTrue);
    final queued = await outbox.all();
    expect(queued, hasLength(1));
    expect(queued.single.payload['purpose'], 'Fuel');
    expect(queued.single.submitAfter, isTrue);
  });

  test('submit forwards to the repo and reloads', () async {
    final repo = FakeRequisitionsRepository(items: [draftRequisition(id: 'r9')]);
    final cubit = build(repo);
    await cubit.load();

    final error = await cubit.submit('r9');

    expect(error, isNull);
    expect(repo.submitted, ['r9']);
  });
}
