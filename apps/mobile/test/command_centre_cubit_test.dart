import 'package:aes_mobile/src/features/command_centre/cubit/command_centre_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  test('load fetches the dashboard + active alerts', () async {
    final alerts = FakeAlertsRepository(alerts: [dangerAlert('Cash runway negative')]);
    final cubit = CommandCentreCubit(
      repository: FakeCommandCentreRepository(),
      alerts: alerts,
    );

    await cubit.load();

    expect(cubit.state.dashboard, isNotNull);
    expect(cubit.state.dashboard!.verdict, 'ACT');
    expect(cubit.state.dashboard!.net, 17985);
    expect(cubit.state.alerts, hasLength(1));
  });

  test('acknowledge calls the API and drops the alert from the feed', () async {
    final alerts = FakeAlertsRepository(alerts: [dangerAlert('Cash runway negative')]);
    final cubit = CommandCentreCubit(
      repository: FakeCommandCentreRepository(),
      alerts: alerts,
    );
    await cubit.load();

    await cubit.acknowledge('a1');

    expect(alerts.acked, ['a1']);
    expect(cubit.state.alerts, isEmpty);
    expect(cubit.state.ackingId, isNull);
  });

  test('exposes headline metrics defensively', () async {
    final cubit = CommandCentreCubit(
      repository: FakeCommandCentreRepository({'healthVerdict': {}}),
      alerts: FakeAlertsRepository(),
    );
    await cubit.load();

    // Missing panels degrade to null / default verdict rather than throwing.
    expect(cubit.state.dashboard!.verdict, 'OK');
    expect(cubit.state.dashboard!.cashUsd, isNull);
  });
}
