import 'package:aes_mobile/src/data/director_repository.dart';
import 'package:aes_mobile/src/features/director/cubit/director_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  test('load populates withdrawals', () async {
    final cubit = DirectorCubit(FakeDirectorRepository(items: [draftWithdrawal()]));
    await cubit.load();
    expect(cubit.state.items, hasLength(1));
  });

  test('create raises a draft and reloads', () async {
    final repo = FakeDirectorRepository();
    final cubit = DirectorCubit(repo);
    final error = await cubit.create(
      const NewWithdrawal(
        amount: 2000,
        currency: 'USD',
        destinationAccount: 'ACC-1',
        reason: 'Dividend',
      ),
    );
    expect(error, isNull);
    expect(repo.created.single.amount, 2000);
  });

  test('submit forwards to the repo', () async {
    final repo = FakeDirectorRepository(items: [draftWithdrawal(id: 'w1')]);
    final cubit = DirectorCubit(repo);
    await cubit.load();
    final error = await cubit.submit('w1');
    expect(error, isNull);
    expect(repo.submitted, ['w1']);
  });

  test('complete records the transfer method + reference', () async {
    final repo = FakeDirectorRepository(
      items: [draftWithdrawal(id: 'w2', status: 'POSTED_AWAITING_TRANSFER')],
    );
    final cubit = DirectorCubit(repo);
    await cubit.load();
    final error = await cubit.complete('w2', 'EFT', 'TRX-9');
    expect(error, isNull);
    expect(repo.completed.single.method, 'EFT');
    expect(repo.completed.single.ref, 'TRX-9');
  });
}
