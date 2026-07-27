import 'package:equatable/equatable.dart';

import '../../../models/project_detail.dart';

/// Detail state for a single project's WBS tree. [saving] flags an in-flight
/// progress update so the sheet can show a spinner without blocking the list.
class ProjectDetailState extends Equatable {
  const ProjectDetailState({
    this.loading = false,
    this.saving = false,
    this.project,
    this.error,
  });

  final bool loading;
  final bool saving;
  final ProjectDetail? project;
  final String? error;

  ProjectDetailState copyWith({
    bool? loading,
    bool? saving,
    ProjectDetail? project,
    String? error,
    bool clearError = false,
  }) {
    return ProjectDetailState(
      loading: loading ?? this.loading,
      saving: saving ?? this.saving,
      project: project ?? this.project,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props => [loading, saving, project, error];
}
