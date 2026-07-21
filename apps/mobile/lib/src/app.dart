import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import 'api/dio_client.dart';
import 'config/flavor_config.dart';
import 'data/alerts_repository.dart';
import 'data/approvals_repository.dart';
import 'data/auth_repository.dart';
import 'data/token_store.dart';
import 'features/auth/cubit/auth_cubit.dart';
import 'features/home/cubit/dashboard_cubit.dart';
import 'router/app_router.dart';
import 'services/biometric_authenticator.dart';
import 'theme/app_theme.dart';

/// Root widget. Builds the auth-aware dio client + repositories for the flavor,
/// restores any stored session on launch, and exposes the app-level cubits +
/// router to the widget tree via BLoC providers.
class AesApp extends StatefulWidget {
  const AesApp({super.key, required this.config});

  final FlavorConfig config;

  @override
  State<AesApp> createState() => _AesAppState();
}

class _AesAppState extends State<AesApp> {
  late final AuthRepository _authRepository;
  late final AlertsRepository _alertsRepository;
  late final ApprovalsRepository _approvalsRepository;
  late final BiometricAuthenticator _biometric;
  late final AuthCubit _authCubit;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    final tokenStore = SecureTokenStore();
    final dio = buildDioClient(
      widget.config,
      tokenStore: tokenStore,
      // Read lazily: _authCubit is assigned just below and only invoked on a 401.
      onAuthFailure: () => _authCubit.sessionExpired(),
    );
    _authRepository = AuthRepository(dio);
    _alertsRepository = AlertsRepository(dio);
    _approvalsRepository = ApprovalsRepository(dio);
    _biometric = LocalAuthBiometricAuthenticator();
    _authCubit = AuthCubit(authRepository: _authRepository, tokenStore: tokenStore);
    _router = buildRouter(_authCubit);
    _authCubit.bootstrap();
  }

  @override
  void dispose() {
    _authCubit.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AuthRepository>.value(value: _authRepository),
        RepositoryProvider<AlertsRepository>.value(value: _alertsRepository),
        RepositoryProvider<ApprovalsRepository>.value(value: _approvalsRepository),
        RepositoryProvider<BiometricAuthenticator>.value(value: _biometric),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: _authCubit),
          BlocProvider<DashboardCubit>(create: (_) => DashboardCubit(_alertsRepository)),
        ],
        child: MaterialApp.router(
          title: 'AES Operations',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          routerConfig: _router,
        ),
      ),
    );
  }
}
