import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../models/auth_user.dart';
import '../../rbac/roles.dart';
import '../auth/cubit/auth_cubit.dart';
import 'cubit/dashboard_cubit.dart';
import 'widgets/danger_banner.dart';

/// A role-gated dashboard destination. [route] navigates when set; otherwise the
/// tile shows a "coming soon" hint until its screen ships.
class _Tile {
  const _Tile(this.label, this.icon, this.roles, {this.route});
  final String label;
  final IconData icon;
  final Set<String> roles;
  final String? route;
}

const _tiles = <_Tile>[
  _Tile(
    'Approvals',
    Icons.fact_check_outlined,
    {...Roles.siteApprovers, ...Roles.financeApprovers},
    route: '/approvals',
  ),
  _Tile('Requests', Icons.note_add_outlined, Roles.requestCapture),
  _Tile('Petty Cash', Icons.savings_outlined, {
    Roles.siteClerk,
    Roles.siteManager,
    Roles.financeOfficer,
  }),
  _Tile('Orders', Icons.local_shipping_outlined, {
    Roles.financeOfficer,
    Roles.financeDirector,
    Roles.opsDirector,
    Roles.director,
    Roles.sysAdmin,
  }),
  _Tile('Command Centre', Icons.insights_outlined, Roles.commandCentre),
  _Tile('Director Actions', Icons.gavel_outlined, Roles.directors),
];

/// Home dashboard: a persistent danger banner over a grid of role-aware tiles.
/// Feature destinations land in later stages; tiles are shown only for roles the
/// API would allow, so the UI hides what the backend forbids.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<DashboardCubit>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthCubit>().state;
    final user = authState is AuthAuthenticated ? authState.user : null;
    final visibleTiles = user == null
        ? const <_Tile>[]
        : _tiles.where((t) => user.hasAnyRole(t.roles)).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('AES Operations'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<AuthCubit>().logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => context.read<DashboardCubit>().load(),
        child: ListView(
          children: [
            BlocBuilder<DashboardCubit, DashboardState>(
              builder: (context, state) => DangerBanner(
                alerts: state.dangerAlerts,
                onTap: () => _comingSoon(context, 'Command Centre'),
              ),
            ),
            if (user != null) _Greeting(user: user),
            Padding(
              padding: const EdgeInsets.all(16),
              child: GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.15,
                children: [
                  for (final tile in visibleTiles)
                    _DashboardCard(
                      tile: tile,
                      onTap: () => tile.route != null
                          ? context.push(tile.route!)
                          : _comingSoon(context, tile.label),
                    ),
                ],
              ),
            ),
            if (visibleTiles.isEmpty && user != null)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'No actions are available for your role yet.',
                  textAlign: TextAlign.center,
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _comingSoon(BuildContext context, String label) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('$label — coming soon')));
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({required this.user});
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Signed in as', style: Theme.of(context).textTheme.labelMedium),
          Text(user.email, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}

class _DashboardCard extends StatelessWidget {
  const _DashboardCard({required this.tile, required this.onTap});
  final _Tile tile;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(tile.icon, size: 36, color: scheme.primary),
              const SizedBox(height: 12),
              Text(
                tile.label,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
