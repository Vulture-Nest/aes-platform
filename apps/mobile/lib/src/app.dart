import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'api/dio_client.dart';
import 'config/flavor_config.dart';
import 'data/health_repository.dart';
import 'features/home/cubit/health_cubit.dart';
import 'router/app_router.dart';

/// Root widget. Builds the dio client + repositories for the flavor and exposes
/// them (plus the app-level cubits) to the widget tree via BLoC providers.
/// USD/ZWG formatting and Africa/Harare localisation land in the S7 stage.
class AesApp extends StatelessWidget {
  const AesApp({super.key, required this.config});

  final FlavorConfig config;

  @override
  Widget build(BuildContext context) {
    final healthRepository = HealthRepository(buildDioClient(config));

    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<HealthRepository>.value(value: healthRepository),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<HealthCubit>(
            create: (_) => HealthCubit(healthRepository),
          ),
        ],
        child: MaterialApp.router(
          title: 'AES Platform',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B6E4F)),
            useMaterial3: true,
          ),
          routerConfig: buildRouter(config),
        ),
      ),
    );
  }
}
