import 'package:equatable/equatable.dart';

import 'project_node.dart';

/// A project with its full WBS node tree (`GET /v1/projects/:id`). The nodes come
/// back flat (parent-linked); the UI groups them into phases › tasks › subtasks.
class ProjectDetail extends Equatable {
  const ProjectDetail({
    required this.id,
    required this.name,
    required this.status,
    required this.percentComplete,
    required this.nodes,
    this.description,
    this.siteId,
    this.plannedStart,
    this.plannedFinish,
  });

  final String id;
  final String name;
  final String status;
  final double percentComplete;
  final List<ProjectNode> nodes;
  final String? description;
  final String? siteId;
  final DateTime? plannedStart;
  final DateTime? plannedFinish;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;
  static DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

  /// Top-level phases (parentId == null), in stored order.
  List<ProjectNode> get roots {
    final roots = nodes.where((n) => n.parentId == null).toList()
      ..sort((a, b) => a.position.compareTo(b.position));
    return roots;
  }

  /// Direct children of [parentId], in stored order.
  List<ProjectNode> childrenOf(String parentId) {
    final kids = nodes.where((n) => n.parentId == parentId).toList()
      ..sort((a, b) => a.position.compareTo(b.position));
    return kids;
  }

  factory ProjectDetail.fromJson(Map<String, dynamic> json) {
    final rawNodes = json['nodes'] as List<dynamic>? ?? const [];
    return ProjectDetail(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Untitled project',
      status: json['status'] as String? ?? 'ACTIVE',
      percentComplete: _num(json['percentComplete']),
      nodes: rawNodes
          .map((n) => ProjectNode.fromJson(n as Map<String, dynamic>))
          .toList(),
      description: json['description'] as String?,
      siteId: json['siteId'] as String?,
      plannedStart: _date(json['plannedStart']),
      plannedFinish: _date(json['plannedFinish']),
    );
  }

  @override
  List<Object?> get props => [id, name, status, percentComplete, nodes];
}
