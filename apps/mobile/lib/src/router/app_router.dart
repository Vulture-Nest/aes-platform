import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/cubit/auth_cubit.dart';
import '../features/auth/login_screen.dart';
import '../features/home/home_screen.dart';

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
