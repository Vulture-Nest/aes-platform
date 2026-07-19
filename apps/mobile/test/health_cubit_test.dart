import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aes_mobile/src/data/health_repository.dart';
import 'package:aes_mobile/src/features/home/cubit/health_cubit.dart';

class _OkRepository implements HealthRepository {
  @override
  Future<bool> isHealthy() async => true;
}

class _UnhealthyRepository implements HealthRepository {
  @override
  Future<bool> isHealthy() async => false;
}

class _FailingRepository implements HealthRepository {
  @override
  Future<bool> isHealthy() async => throw Exception('connection refused');
}

void main() {
  blocTest<HealthCubit, HealthState>(
    'emits [Loading, Online] when the API is healthy',
    build: () => HealthCubit(_OkRepository()),
    act: (cubit) => cubit.check(),
    expect: () => [isA<HealthLoading>(), isA<HealthOnline>()],
  );

  blocTest<HealthCubit, HealthState>(
    'emits [Loading, Offline] when the API reports unhealthy',
    build: () => HealthCubit(_UnhealthyRepository()),
    act: (cubit) => cubit.check(),
    expect: () => [isA<HealthLoading>(), isA<HealthOffline>()],
  );

  blocTest<HealthCubit, HealthState>(
    'emits [Loading, Offline] when the probe throws',
    build: () => HealthCubit(_FailingRepository()),
    act: (cubit) => cubit.check(),
    expect: () => [isA<HealthLoading>(), isA<HealthOffline>()],
  );
}
