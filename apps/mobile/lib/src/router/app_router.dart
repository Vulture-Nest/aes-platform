import 'package:go_router/go_router.dart';

import '../config/flavor_config.dart';
import '../features/home/home_screen.dart';

/// Builds the app routes for the given flavor. Role guards mirroring API RBAC
/// (user_site_roles) are added in the S7 stage — the UI hides what the API forbids.
GoRouter buildRouter(FlavorConfig config) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        name: 'home',
        builder: (context, state) => HomeScreen(flavor: config),
      ),
    ],
  );
}
