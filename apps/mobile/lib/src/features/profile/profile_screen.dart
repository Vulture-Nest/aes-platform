import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../config/flavor_config.dart';
import '../../models/auth_user.dart';
import '../../models/site_role.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui_kit.dart';
import '../auth/cubit/auth_cubit.dart';

/// Account / profile screen: shows the signed-in identity, every RBAC role
/// assignment (so a user can see exactly what access they hold), the environment
/// the app is pointed at, and a confirmed sign-out. Read-only — the API owns
/// identity and roles, so there is nothing to edit here.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthCubit>().state;
    final user = authState is AuthAuthenticated ? authState.user : null;

    return Scaffold(
      appBar: gradientAppBar('Profile'),
      body: user == null
          ? const EmptyState(icon: Icons.person_off_outlined, message: 'No active session.')
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                _IdentityCard(user: user),
                const SectionLabel('Roles & access'),
                _RolesCard(roles: user.roles),
                const SectionLabel('App'),
                const _AppInfoCard(),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: () => _confirmSignOut(context),
                  icon: const Icon(Icons.logout, color: AppTheme.danger),
                  label: const Text('Sign out', style: TextStyle(color: AppTheme.danger)),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: AppTheme.danger.withValues(alpha: 0.5)),
                  ),
                ),
              ],
            ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context) async {
    final authCubit = context.read<AuthCubit>();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to continue.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTheme.danger),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    // The router's auth redirect returns the user to /login once the session
    // clears, so we only need to fire logout here.
    if (confirmed == true) await authCubit.logout();
  }
}

/// Branded identity hero: avatar initials, email, and account status.
class _IdentityCard extends StatelessWidget {
  const _IdentityCard({required this.user});
  final AuthUser user;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final primaryRole = user.roles.isEmpty ? null : _humanizeRole(user.roles.first.role);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
            decoration: const BoxDecoration(gradient: AppTheme.authGradient),
            child: Column(
              children: [
                Container(
                  height: 72,
                  width: 72,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.16),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withValues(alpha: 0.4), width: 2),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    _initials(user.email),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  user.email,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
                ),
                if (primaryRole != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      primaryRole,
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Row(
              children: [
                Expanded(
                  child: _KeyValue(
                    label: 'Status',
                    valueWidget: StatusPill(
                      label: user.status,
                      color: user.status == 'ACTIVE' ? AppTheme.greenDark : AppTheme.watch,
                    ),
                  ),
                ),
                Expanded(
                  child: _KeyValue(
                    label: 'Access',
                    value: user.hasGlobalRole ? 'Global' : 'Site-scoped',
                    valueColor: onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One row per RBAC assignment: the role, and whether it is global or scoped to
/// a single site. Mirrors what the API grants so a user sees their real access.
class _RolesCard extends StatelessWidget {
  const _RolesCard({required this.roles});
  final List<SiteRole> roles;

  @override
  Widget build(BuildContext context) {
    if (roles.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('No roles are assigned to this account.'),
        ),
      );
    }
    return Card(
      child: Column(
        children: [
          for (var i = 0; i < roles.length; i++) ...[
            if (i > 0) const Divider(height: 1),
            ListTile(
              leading: IconBadge(
                roles[i].siteId == null ? Icons.public : Icons.location_on_outlined,
              ),
              title: Text(
                _humanizeRole(roles[i].role),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(roles[i].siteId == null ? 'All sites' : 'Site-scoped'),
            ),
          ],
        ],
      ),
    );
  }
}

/// Environment the build is pointed at — useful for testers/support to confirm
/// which backend a device is talking to.
class _AppInfoCard extends StatelessWidget {
  const _AppInfoCard();

  @override
  Widget build(BuildContext context) {
    final config = context.read<FlavorConfig>();
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
        child: Column(
          children: [
            _KeyValue(
              label: 'Environment',
              value: config.name.toUpperCase(),
              valueColor: onSurface,
              padded: true,
            ),
            const Divider(height: 1),
            _KeyValue(
              label: 'API endpoint',
              value: config.apiBaseUrl,
              valueColor: onSurface,
              padded: true,
            ),
          ],
        ),
      ),
    );
  }
}

/// A label above a value (or a value widget). Used in the identity + app cards.
class _KeyValue extends StatelessWidget {
  const _KeyValue({
    required this.label,
    this.value,
    this.valueWidget,
    this.valueColor,
    this.padded = false,
  });

  final String label;
  final String? value;
  final Widget? valueWidget;
  final Color? valueColor;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: EdgeInsets.symmetric(vertical: padded ? 12 : 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: onSurface.withValues(alpha: 0.5),
            ),
          ),
          const SizedBox(height: 6),
          valueWidget ??
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  value ?? '',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: valueColor),
                ),
              ),
        ],
      ),
    );
  }
}

/// e.g. FINANCE_DIRECTOR -> "Finance Director".
String _humanizeRole(String role) => role
    .split('_')
    .where((w) => w.isNotEmpty)
    .map((w) => '${w[0]}${w.substring(1).toLowerCase()}')
    .join(' ');

/// Two-letter avatar initials from the local part of an email.
String _initials(String email) {
  final local = email.split('@').first;
  final parts = local.split(RegExp(r'[._-]')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.substring(0, parts.first.length >= 2 ? 2 : 1).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
