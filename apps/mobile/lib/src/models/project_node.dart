import 'package:equatable/equatable.dart';

/// The kind of WBS node — a project decomposes into phases › tasks › subtasks.
enum ProjectNodeType {
  phase('PHASE', 'Phase'),
  task('TASK', 'Task'),
  subtask('SUBTASK', 'Subtask');

  const ProjectNodeType(this.wire, this.label);

  final String wire;
  final String label;

  static ProjectNodeType fromWire(String? value) {
    return ProjectNodeType.values.firstWhere(
      (t) => t.wire == value,
      orElse: () => ProjectNodeType.task,
    );
  }
}

/// A single node in a project's Work Breakdown Structure (`project_nodes`).
/// Parents carry a rolled-up [percentComplete]; leaves carry their entered value.
class ProjectNode extends Equatable {
  const ProjectNode({
    required this.id,
    required this.projectId,
    required this.parentId,
    required this.type,
    required this.title,
    required this.percentComplete,
    required this.position,
    this.plannedStart,
    this.plannedFinish,
    this.actualFinish,
  });

  final String id;
  final String projectId;
  final String? parentId;
  final ProjectNodeType type;
  final String title;
  final double percentComplete;
  final int position;
  final DateTime? plannedStart;
  final DateTime? plannedFinish;
  final DateTime? actualFinish;

  bool get isComplete => percentComplete >= 100;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;
  static DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

  factory ProjectNode.fromJson(Map<String, dynamic> json) {
    return ProjectNode(
      id: json['id'] as String,
      projectId: json['projectId'] as String? ?? '',
      parentId: json['parentId'] as String?,
      type: ProjectNodeType.fromWire(json['type'] as String?),
      title: json['title'] as String? ?? '',
      percentComplete: _num(json['percentComplete']),
      position: (json['position'] as num?)?.toInt() ?? 0,
      plannedStart: _date(json['plannedStart']),
      plannedFinish: _date(json['plannedFinish']),
      actualFinish: _date(json['actualFinish']),
    );
  }

  @override
  List<Object?> get props => [id, parentId, type, title, percentComplete, position];
}
