import 'package:aes_mobile/src/data/outbox_store.dart';
import 'package:aes_mobile/src/features/requests/cubit/petty_cash_cubit.dart';
import 'package:aes_mobile/src/models/petty_cash.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  PettyCashCubit build(
    FakePettyCashRepository repo, {
    FakeAttachmentsRepository? att,
    OutboxStore? outbox,
  }) =>
      PettyCashCubit(
        repository: repo,
        attachments: att ?? FakeAttachmentsRepository(),
        outbox: outbox ?? InMemoryOutboxStore(),
      );

  test('loadFloats populates floats', () async {
    final cubit = build(FakePettyCashRepository(floatList: [usdFloat()]));
    await cubit.loadFloats();
    expect(cubit.state.floats, hasLength(1));
    expect(cubit.state.floatsLoading, isFalse);
  });

  test('createWithdrawal without a receipt posts amount+purpose and reloads txns', () async {
    final repo = FakePettyCashRepository();
    final att = FakeAttachmentsRepository();
    final cubit = build(repo, att: att);

    final result = await cubit.createWithdrawal('f1', amount: 40, purpose: 'Tyres');

    expect(result.ok, isTrue);
    expect(att.uploads, 0);
    expect(repo.withdrawals.single.amount, 40);
    expect(repo.withdrawals.single.purpose, 'Tyres');
    expect(repo.withdrawals.single.receiptKey, isNull);
    expect(cubit.state.txns, hasLength(1)); // reloaded
  });

  test('createWithdrawal with a receipt uploads first and attaches the key', () async {
    final repo = FakePettyCashRepository();
    final att = FakeAttachmentsRepository(key: 'attachments/z/receipt.jpg');
    final cubit = build(repo, att: att);

    await cubit.createWithdrawal('f1', amount: 25, purpose: 'Fuel', receipt: fakeCaptured());

    expect(att.uploads, 1);
    expect(repo.withdrawals.single.receiptKey, 'attachments/z/receipt.jpg');
  });

  test('offline withdrawal queues to the outbox with the float id', () async {
    final outbox = InMemoryOutboxStore();
    final cubit = build(FakePettyCashRepository(offline: true), outbox: outbox);

    final result = await cubit.createWithdrawal('f1', amount: 30, purpose: 'Spares');

    expect(result.queuedOffline, isTrue);
    final queued = await outbox.all();
    expect(queued.single.floatId, 'f1');
    expect(queued.single.payload['amount'], 30);
  });

  test('loadTxns populates the selected float transactions', () async {
    final repo = FakePettyCashRepository(
      txnList: const [
        PettyCashTxn(
          id: 't1',
          type: 'WITHDRAWAL',
          amount: 20,
          currency: 'USD',
          status: 'POSTED',
        ),
      ],
    );
    final cubit = build(repo);
    await cubit.loadTxns('f1');
    expect(cubit.state.txns, hasLength(1));
  });
}
