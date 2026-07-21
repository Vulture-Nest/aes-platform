import 'package:equatable/equatable.dart';

import 'site_role.dart';

/// The authenticated user as returned by `GET /v1/auth/me`. Roles are loaded
/// fresh from the API (never embedded in the token) so revocation is immediate.
class AuthUser extends Equatable {
  const AuthUser({
    required this.id,
    required this.email,
    required this.status,
    required this.roles,
  });

  final String id;
  final String email;
  final String status;
  final List<SiteRole> roles;

  /// Distinct role names held by the user (across all sites).
  Set<String> get roleNames => roles.map((r) => r.role).toSet();

  /// True when the user holds any role that applies across all sites.
  bool get hasGlobalRole => roles.any((r) => r.siteId == null);

  /// True when the user holds at least one of [candidates].
  bool hasAnyRole(Iterable<String> candidates) =>
      candidates.any(roleNames.contains);

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
        status: json['status'] as String? ?? 'ACTIVE',
        roles: (json['roles'] as List<dynamic>? ?? [])
            .map((r) => SiteRole.fromJson(r as Map<String, dynamic>))
            .toList(),
      );

  @override
  List<Object?> get props => [id, email, status, roles];
}
