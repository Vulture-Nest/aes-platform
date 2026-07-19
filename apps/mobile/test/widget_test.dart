import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aes_mobile/src/config/flavor_config.dart';
import 'package:aes_mobile/src/data/health_repository.dart';
import 'package:aes_mobile/src/features/home/cubit/health_cubit.dart';
import 'package:aes_mobile/src/features/home/home_screen.dart';

/// Fake repository so the widget test never touches the network.
class _FakeHealthRepository implements HealthRepository {
  @override
  Future<bool> isHealthy() async => true;
}

void main() {
  testWidgets('renders the home scaffold and reports API online on check', (tester) async {
    final cubit = HealthCubit(_FakeHealthRepository());
    addTearDown(cubit.close);

    await tester.pumpWidget(
      MaterialApp(
        home: BlocProvider<HealthCubit>.value(
          value: cubit,
          child: const HomeScreen(flavor: FlavorConfig.dev),
        ),
      ),
    );

    expect(find.text('AES Platform'), findsOneWidget);
    expect(find.textContaining('flavor: dev'), findsOneWidget);
    expect(find.textContaining('not checked'), findsOneWidget);

    await tester.tap(find.text('Check API health'));
    await tester.pump(); // loading
    await tester.pump(); // future resolves

    expect(find.textContaining('online'), findsOneWidget);
  });
}
