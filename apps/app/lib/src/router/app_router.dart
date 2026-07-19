import 'package:go_router/go_router.dart';

import '../features/home/home_screen.dart';

/// Application routes. Role guards mirroring API RBAC (user_site_roles) are added
/// in the S7 Flutter stage — the UI hides what the API forbids.
final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      name: 'home',
      builder: (context, state) => const HomeScreen(),
    ),
  ],
);
