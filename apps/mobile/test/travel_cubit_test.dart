import 'package:aes_mobile/src/data/outbox_store.dart';
import 'package:aes_mobile/src/data/travel_repository.dart';
import 'package:aes_mobile/src/features/requests/cubit/travel_cubit.dart';
import 'package:aes_mobile/src/models/travel_request.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  TravelCubit build(FakeTravelRepository repo, {OutboxStore? outbox}) =>
      TravelCubit(repo, outbox: outbox ?? InMemoryOutboxStore());

  NewTravel input() => NewTravel(
        destination: 'Harare',
        dateFrom: DateTime(2026, 8, 1),
        dateTo: DateTime(2026, 8, 3),
        days: 3,
        currency: 'USD',
      );

  test('load populates travel requests', () async {
    final repo = FakeTravelRepository(
      items: const [
        TravelRequest(
          id: 't1',
          destination: 'Bulawayo',
          advanceAmount: 200,
          currency: 'USD',
          status: 'DRAFT',
        ),
      ],
    );
    final cubit = build(repo);
    await cubit.load();
    expect(cubit.state.items, hasLength(1));
  });

  test('create prepends the new draft and forwards trip details', () async {
    final repo = FakeTravelRepository();
    final cubit = build(repo);
    final result = await cubit.create(input());
    expect(result.ok, isTrue);
    expect(repo.created.single.destination, 'Harare');
    expect(repo.created.single.days, 3);
    expect(cubit.state.items.first.id, result.createdId);
  });

  test('offline create queues the travel draft', () async {
    final outbox = InMemoryOutboxStore();
    final cubit = build(FakeTravelRepository(offline: true), outbox: outbox);
    final result = await cubit.create(input());
    expect(result.queuedOffline, isTrue);
    expect((await outbox.all()).single.payload['destination'], 'Harare');
  });

  test('submit forwards to the repo', () async {
    final repo = FakeTravelRepository(
      items: const [
        TravelRequest(
          id: 't5',
          destination: 'Gweru',
          advanceAmount: 90,
          currency: 'USD',
          status: 'DRAFT',
        ),
      ],
    );
    final cubit = build(repo);
    await cubit.load();
    final error = await cubit.submit('t5');
    expect(error, isNull);
    expect(repo.submitted, ['t5']);
  });
}
