import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../models/auth_user.dart';
import '../../rbac/roles.dart';
import '../../theme/app_theme.dart';
import '../auth/cubit/auth_cubit.dart';
import 'cubit/dashboard_cubit.dart';
import 'widgets/danger_banner.dart';

/// A role-gated dashboard destination. [route] navigates when set; otherwise the
/// tile shows a "coming soon" hint until its screen ships.
class _Tile {
  const _Tile(this.label, this.icon, this.roles, {this.route, this.accent = AppTheme.greenDark, this.subtitle});
  final String label;
  final IconData icon;
  final Set<String> roles;
  final String? route;
  final Color accent;
  final String? subtitle;
}

const _tiles = <_Tile>[
  _Tile(
    'Approvals',
    Icons.fact_check_outlined,
    {...Roles.siteApprovers, ...Roles.financeApprovers},
    route: '/approvals',
    accent: AppTheme.greenDark,
    subtitle: 'Approve, reject, return',
  ),
  _Tile(
    'Requests',
    Icons.note_add_outlined,
    Roles.requestCapture,
    route: '/requests',
    accent: Color(0xFF2F80ED),
    subtitle: 'Requisitions & travel',
  ),
  _Tile(
    'Petty Cash',
    Icons.savings_outlined,
    {Roles.siteClerk, Roles.siteManager, Roles.financeOfficer},
    route: '/requests',
    accent: Color(0xFF13877E),
    subtitle: 'Float withdrawals',
  ),
  _Tile(
    'Orders',
    Icons.local_shipping_outlined,
    {Roles.financeOfficer, Roles.financeDirector, Roles.sysAdmin, Roles.auditor},
    route: '/orders',
    accent: Color(0xFF7B5CD6),
    subtitle: 'Order health board',
  ),
  _Tile(
    'Command Centre',
    Icons.insights_outlined,
    Roles.commandCentre,
    route: '/command-centre',
    accent: Color(0xFF3F51B5),
    subtitle: 'Live financial pulse',
  ),
  _Tile(
    'Director Actions',
    Icons.gavel_outlined,
    {Roles.director, Roles.sysAdmin},
    route: '/director',
    accent: AppTheme.watch,
    subtitle: 'Withdrawals & transfers',
  ),
  _Tile(
    'Projects',
    Icons.account_tree_outlined,
    {Roles.siteManager, Roles.opsStaff, ...Roles.directors, Roles.sysAdmin},
    route: '/projects',
    accent: Color(0xFF0E7C66),
    subtitle: 'Portfolio & progress',
  ),
  _Tile(
    'Boards',
    Icons.dashboard_customize_outlined,
    Roles.all,
    route: '/boards',
    accent: Color(0xFF546E7A),
    subtitle: 'Kanban boards',
  ),
  _Tile(
    'Timesheets',
    Icons.access_time,
    {Roles.siteClerk, Roles.siteManager},
    route: '/timesheets',
    accent: Color(0xFFC97A0A),
    subtitle: 'Timekeeper capture',
  ),
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
      body: RefreshIndicator(
        onRefresh: () => context.read<DashboardCubit>().load(),
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            _Header(user: user, onSignOut: () => context.read<AuthCubit>().logout()),
            BlocBuilder<DashboardCubit, DashboardState>(
              builder: (context, state) => state.dangerAlerts.isEmpty
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: DangerBanner(
                          alerts: state.dangerAlerts,
                          onTap: () => context.push('/command-centre'),
                        ),
                      ),
                    ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 24, 20, 8),
              child: Text(
                'Quick actions',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.4),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              child: GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 14,
                crossAxisSpacing: 14,
                childAspectRatio: 1.05,
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

/// Branded gradient header: logo, greeting, role, and sign-out.
class _Header extends StatelessWidget {
  const _Header({required this.user, required this.onSignOut});
  final AuthUser? user;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    final role = user == null || user!.roles.isEmpty
        ? ''
        : user!.roles.first.role.split('_').map((w) => '${w[0]}${w.substring(1).toLowerCase()}').join(' ');
    return Container(
      padding: EdgeInsets.fromLTRB(20, topPad + 16, 12, 22),
      decoration: const BoxDecoration(
        gradient: AppTheme.authGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Image.asset(AppTheme.logoWhite, height: 28),
              const Spacer(),
              IconButton(
                tooltip: 'Sign out',
                icon: const Icon(Icons.logout, color: Colors.white),
                onPressed: onSignOut,
              ),
            ],
          ),
          const SizedBox(height: 18),
          const Text(
            'Welcome back',
            style: TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const SizedBox(height: 2),
          Text(
            user?.email ?? '',
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
          ),
          if (role.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                role,
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ),
          ],
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
    final accent = tile.accent;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(
          children: [
            // subtle accent wash in the corner
            Positioned(
              top: -24,
              right: -24,
              child: Container(
                height: 84,
                width: 84,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.08),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 46,
                    width: 46,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [accent, Color.lerp(accent, Colors.black, 0.18)!],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(13),
                      boxShadow: [
                        BoxShadow(
                          color: accent.withValues(alpha: 0.35),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Icon(tile.icon, size: 24, color: Colors.white),
                  ),
                  const Spacer(),
                  Text(
                    tile.label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    tile.subtitle ?? 'Open',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
