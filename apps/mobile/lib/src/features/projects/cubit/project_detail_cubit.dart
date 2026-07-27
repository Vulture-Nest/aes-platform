import 'package:bloc/bloc.dart';

import '../../../api/api_exception.dart';
import '../../../data/attachments_repository.dart';
import '../../../services/receipt_capture.dart';
import '../data/projects_repository.dart';
import 'project_detail_state.dart';

/// Loads one project's WBS tree and applies light-touch progress updates from the
/// field. An optional progress photo is uploaded to `/v1/attachments` first (the
/// same flow requests use for receipts) and referenced from the progress note.
class ProjectDetailCubit extends Cubit<ProjectDetailState> {
  ProjectDetailCubit({
    required String projectId,
    required ProjectsRepository repository,
    required AttachmentsRepository attachments,
  })  : _projectId = projectId,
        _repo = repository,
        _attachments = attachments,
        super(const ProjectDetailState());

  final String _projectId;
  final ProjectsRepository _repo;
  final AttachmentsRepository _attachments;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      final project = await _repo.findOne(_projectId);
      emit(ProjectDetailState(project: project));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  /// Apply a progress update to [nodeId]. Uploads [photo] first when present and
  /// links it from the note. Returns null on success, or an error message. On
  /// success the refreshed project (with rolled-up parents) replaces state.
  Future<String?> updateNodeProgress(
    String nodeId, {
    required double percentComplete,
    String? note,
    bool complete = false,
    CapturedReceipt? photo,
  }) async {
    emit(state.copyWith(saving: true, clearError: true));
    try {
      var body = note?.trim() ?? '';
      if (photo != null) {
        final key = await _attachments.upload(
          photo.bytes,
          filename: photo.filename,
          contentType: photo.contentType,
        );
        final ref = 'Photo attached ($key)';
        body = body.isEmpty ? ref : '$body\n$ref';
      }
      final updated = await _repo.updateProgress(
        _projectId,
        nodeId,
        ProgressUpdate(
          percentComplete: percentComplete,
          note: body.isEmpty ? null : body,
          complete: complete,
        ),
      );
      emit(ProjectDetailState(project: updated));
      return null;
    } on ApiException catch (e) {
      emit(state.copyWith(saving: false, error: e.message));
      return e.message;
    }
  }
}
