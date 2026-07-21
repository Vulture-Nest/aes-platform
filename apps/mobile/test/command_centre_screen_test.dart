import 'package:aes_mobile/src/features/command_centre/command_centre_screen.dart';
import 'package:aes_mobile/src/features/command_centre/cubit/command_centre_cubit.dart';
import 'package:aes_mobile/src/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  Future<CommandCentreCubit> pump(WidgetTester tester, {required FakeAlertsRepository alerts}) async {
    // Tall surface so the whole scroll view (metrics + alert feed) is laid out.
    tester.view.physicalSize = const Size(500, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final cubit = CommandCentreCubit(repository: FakeCommandCentreRepository(), alerts: alerts);
    addTearDown(cubit.close);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: BlocProvider.value(value: cubit, child: const CommandCentreScreen()),
      ),
    );
    await tester.pumpAndSettle();
    return cubit;
  }

  testWidgets('shows the verdict banner, a metric and the alert feed', (tester) async {
    await pump(tester, alerts: FakeAlertsRepository(alerts: [dangerAlert('Cash runway negative')]));

    expect(find.textContaining('ACT'), findsWidgets);
    expect(find.text('Net money in/out'), findsOneWidget);
    expect(find.text('Cash runway negative'), findsOneWidget);
    expect(find.text('Ack'), findsOneWidget);
  });

  testWidgets('acknowledging an alert removes it from the feed', (tester) async {
    final alerts = FakeAlertsRepository(alerts: [dangerAlert('Cash runway negative')]);
    await pump(tester, alerts: alerts);

    await tester.tap(find.text('Ack'));
    await tester.pumpAndSettle();

    expect(alerts.acked, ['a1']);
    expect(find.text('Cash runway negative'), findsNothing);
    expect(find.text('No active alerts'), findsOneWidget);
  });
}
