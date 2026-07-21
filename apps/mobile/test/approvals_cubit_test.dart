import 'package:aes_mobile/src/features/approvals/cubit/approvals_cubit.dart';
import 'package:aes_mobile/src/models/approval_decision.dart';
import 'package:aes_mobile/src/services/biometric_authenticator.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  ApprovalsCubit build(FakeApprovalsRepository repo, {BiometricAuthenticator? bio}) => ApprovalsCubit(
        repository: repo,
        biometric: bio ?? const AlwaysConfirmAuthenticator(),
      );

  test('load populates the inbox', () async {
    final cubit = build(FakeApprovalsRepository(items: [moneyApproval(), nonMoneyApproval()]));
    await cubit.load();
    expect(cubit.state.items.length, 2);
    expect(cubit.state.loading, isFalse);
  });

  test('approving a money item requires biometric confirmation and calls the API', () async {
    final repo = FakeApprovalsRepository(items: [moneyApproval()]);
    final cubit = build(repo);
    await cubit.load();

    final result = await cubit.decide(cubit.state.items.first, ApprovalDecision.approved);

    expect(result.status, DecideStatus.success);
    expect(repo.decisions.single.decision, ApprovalDecision.approved);
    expect(cubit.state.items, isEmpty); // actioned step drops off the inbox
  });

  test('a declined biometric cancels a money approval without calling the API', () async {
    final repo = FakeApprovalsRepository(items: [moneyApproval()]);
    final cubit = build(repo, bio: const DenyBiometric());
    await cubit.load();

    final result = await cubit.decide(cubit.state.items.first, ApprovalDecision.approved);

    expect(result.status, DecideStatus.cancelled);
    expect(repo.decisions, isEmpty); // never reached the API
    expect(cubit.state.items.length, 1); // still in the inbox
  });

  test('non-money items skip biometrics; reject/return pass a comment', () async {
    final repo = FakeApprovalsRepository(items: [nonMoneyApproval()]);
    // Even with a denying authenticator, a non-money item is not gated.
    final cubit = build(repo, bio: const DenyBiometric());
    await cubit.load();

    final result = await cubit.decide(
      cubit.state.items.first,
      ApprovalDecision.returned,
      comment: 'Fix the dates',
    );

    expect(result.status, DecideStatus.success);
    expect(repo.decisions.single.decision, ApprovalDecision.returned);
    expect(repo.decisions.single.comment, 'Fix the dates');
  });

  test('a failed decide surfaces the error and keeps the item', () async {
    final repo = FakeApprovalsRepository(items: [nonMoneyApproval()], failDecide: true);
    final cubit = build(repo);
    await cubit.load();

    final result = await cubit.decide(cubit.state.items.first, ApprovalDecision.approved);

    expect(result.status, DecideStatus.failed);
    expect(cubit.state.items.length, 1);
    expect(cubit.state.error, isNotNull);
  });
}
