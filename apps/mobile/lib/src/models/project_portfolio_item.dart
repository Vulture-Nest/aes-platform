import 'package:equatable/equatable.dart';

import 'project_health.dart';

/// A row in the projects portfolio (`GET /v1/projects/portfolio`): the project's
/// name, overall % complete, days ahead/behind and RAG flag — enough to render a
/// glanceable list before drilling into the WBS tree.
class ProjectPortfolioItem extends Equatable {
  const ProjectPortfolioItem({
    required this.projectId,
    required this.name,
    required this.status,
    required this.percentComplete,
    required this.health,
    this.siteId,
  });

  final String projectId;
  final String name;
  final String status;
  final double percentComplete;
  final ProjectHealth health;
  final String? siteId;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;

  factory ProjectPortfolioItem.fromJson(Map<String, dynamic> json) {
    return ProjectPortfolioItem(
      projectId: json['projectId'] as String,
      name: json['name'] as String? ?? 'Untitled project',
      status: json['status'] as String? ?? 'ACTIVE',
      percentComplete: _num(json['percentComplete']),
      // The portfolio response spreads the schedule-health fields at the top level.
      health: ProjectHealth.fromJson(json),
      siteId: json['siteId'] as String?,
    );
  }

  @override
  List<Object?> get props => [projectId, name, status, percentComplete, health];
}
