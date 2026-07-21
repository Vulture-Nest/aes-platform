import 'package:aes_mobile/src/features/requests/cubit/petty_cash_cubit.dart';
import 'package:aes_mobile/src/models/petty_cash.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  PettyCashCubit build(FakePettyCashRepository repo, {FakeAttachmentsRepository? att}) =>
      PettyCashCubit(repository: repo, attachments: att ?? FakeAttachmentsRepository());

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

    final error = await cubit.createWithdrawal('f1', amount: 40, purpose: 'Tyres');

    expect(error, isNull);
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
