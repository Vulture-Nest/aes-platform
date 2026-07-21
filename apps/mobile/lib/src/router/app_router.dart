import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../data/approvals_repository.dart';
import '../data/attachments_repository.dart';
import '../data/requisitions_repository.dart';
import '../data/travel_repository.dart';
import '../features/approvals/approvals_screen.dart';
import '../features/approvals/cubit/approvals_cubit.dart';
import '../features/auth/cubit/auth_cubit.dart';
import '../features/auth/login_screen.dart';
import '../features/home/home_screen.dart';
import '../features/requests/cubit/requisitions_cubit.dart';
import '../features/requests/cubit/travel_cubit.dart';
import '../features/requests/requests_screen.dart';
import '../services/biometric_authenticator.dart';

/// Bridges a Bloc/Cubit [Stream] to a [Listenable] so go_router re-evaluates its
/// redirect whenever auth state changes.
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _sub = stream.asBroadcastStream().listen((_) => notifyListeners());
  }

  late final StreamSubscription<dynamic> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

/// App routes with an auth guard mirroring API RBAC: unauthenticated users are
/// held at /login, and a valid session lands on the home dashboard. Feature
/// routes are added as each screen ships.
GoRouter buildRouter(AuthCubit authCubit) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: GoRouterRefreshStream(authCubit.stream),
    redirect: (context, state) {
      final authState = authCubit.state;
      final location = state.matchedLocation;

      if (authState is AuthUnknown) {
        return location == '/splash' ? null : '/splash';
      }

      final loggedIn = authState is AuthAuthenticated;
      final atLogin = location == '/login';

      if (!loggedIn) {
        return atLogin ? null : '/login';
      }
      // Signed in: don't linger on the splash/login screens.
      if (atLogin || location == '/splash') {
        return '/';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const _SplashScreen()),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/', name: 'home', builder: (_, __) => const HomeScreen()),
      GoRoute(
        path: '/approvals',
        name: 'approvals',
        builder: (context, __) => BlocProvider(
          create: (context) => ApprovalsCubit(
            repository: context.read<ApprovalsRepository>(),
            biometric: context.read<BiometricAuthenticator>(),
          ),
          child: const ApprovalsScreen(),
        ),
      ),
      GoRoute(
        path: '/requests',
        name: 'requests',
        builder: (context, __) => MultiBlocProvider(
          providers: [
            BlocProvider(
              create: (context) => RequisitionsCubit(
                repository: context.read<RequisitionsRepository>(),
                attachments: context.read<AttachmentsRepository>(),
              ),
            ),
            BlocProvider(
              create: (context) => TravelCubit(context.read<TravelRepository>()),
            ),
          ],
          child: const RequestsScreen(),
        ),
      ),
    ],
  );
}

/// Shown while the stored session is being validated on launch.
class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
