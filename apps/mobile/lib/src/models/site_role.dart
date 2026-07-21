import 'package:equatable/equatable.dart';

/// A single RBAC assignment. A null [siteId] means the role applies across all
/// sites (a global role); otherwise it is scoped to that one site.
class SiteRole extends Equatable {
  const SiteRole({required this.siteId, required this.role});

  final String? siteId;
  final String role;

  factory SiteRole.fromJson(Map<String, dynamic> json) => SiteRole(
        siteId: json['siteId'] as String?,
        role: json['role'] as String,
      );

  @override
  List<Object?> get props => [siteId, role];
}
