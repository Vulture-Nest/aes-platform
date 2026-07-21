import 'package:aes_mobile/src/data/requisitions_repository.dart';
import 'package:aes_mobile/src/features/requests/cubit/requisitions_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  RequisitionsCubit build(FakeRequisitionsRepository repo, FakeAttachmentsRepository att) =>
      RequisitionsCubit(repository: repo, attachments: att);

  NewRequisition input() => NewRequisition(
        purpose: 'Fuel',
        amount: 500,
        currency: 'USD',
        requiredByDate: DateTime(2026, 8, 1),
      );

  test('load populates the list', () async {
    final cubit = build(FakeRequisitionsRepository(items: [draftRequisition()]), FakeAttachmentsRepository());
    await cubit.load();
    expect(cubit.state.items, hasLength(1));
  });

  test('create without a receipt does not upload and prepends the new draft', () async {
    final repo = FakeRequisitionsRepository();
    final att = FakeAttachmentsRepository();
    final cubit = build(repo, att);

    final created = await cubit.create(input());

    expect(created, isNotNull);
    expect(att.uploads, 0);
    expect(repo.created.single.attachmentKey, isNull);
    expect(cubit.state.items.first.id, created!.id);
  });

  test('create with a receipt uploads first and attaches the returned key', () async {
    final repo = FakeRequisitionsRepository();
    final att = FakeAttachmentsRepository(key: 'attachments/x/receipt.jpg');
    final cubit = build(repo, att);

    await cubit.create(input(), receipt: fakeCaptured());

    expect(att.uploads, 1);
    expect(repo.created.single.attachmentKey, 'attachments/x/receipt.jpg');
  });

  test('submit forwards to the repo and reloads', () async {
    final repo = FakeRequisitionsRepository(items: [draftRequisition(id: 'r9')]);
    final cubit = build(repo, FakeAttachmentsRepository());
    await cubit.load();

    final error = await cubit.submit('r9');

    expect(error, isNull);
    expect(repo.submitted, ['r9']);
  });
}
