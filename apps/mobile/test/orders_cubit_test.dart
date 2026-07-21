import 'package:aes_mobile/src/features/orders/cubit/orders_cubit.dart';
import 'package:aes_mobile/src/models/order.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  test('load fetches orders + client names', () async {
    final cubit = OrdersCubit(FakeOrdersRepository(items: [openOrder()]));
    await cubit.load();
    expect(cubit.state.orders, hasLength(1));
    expect(cubit.state.clientNames['c1'], 'Mimosa Mine');
  });

  test('board sorts attention-first (overdue before open before serviced)', () async {
    final overdue = Order(
      id: 'a',
      reference: 'A',
      clientId: 'c1',
      valueExVat: 100,
      currency: 'USD',
      serviced: false,
      closingDate: DateTime(2020, 1, 1),
    );
    final cubit = OrdersCubit(
      FakeOrdersRepository(
        items: [openOrder(id: 'serv', serviced: true), openOrder(id: 'open'), overdue],
      ),
    );
    await cubit.load();
    final order = cubit.state.sorted.map((o) => o.status).toList();
    expect(order.first, OrderStatus.overdue);
    expect(order.last, OrderStatus.serviced);
  });

  test('markServiced posts and updates the order in place', () async {
    final repo = FakeOrdersRepository(items: [openOrder(id: 'o9')]);
    final cubit = OrdersCubit(repo);
    await cubit.load();

    final error = await cubit.markServiced('o9');

    expect(error, isNull);
    expect(repo.serviced, ['o9']);
    expect(cubit.state.orders.firstWhere((o) => o.id == 'o9').serviced, isTrue);
  });
}
