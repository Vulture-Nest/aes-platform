import 'package:dio/dio.dart';

import '../../../api/api_exception.dart';
import '../../../models/project_detail.dart';
import '../../../models/project_portfolio_item.dart';

/// Fields for a light-touch WBS progress update (`PATCH .../progress`). Field
/// users move a slider, optionally add a note and/or mark the node complete.
class ProgressUpdate {
  const ProgressUpdate({this.percentComplete, this.note, this.complete});

  final double? percentComplete;
  final String? note;
  final bool? complete;

  Map<String, dynamic> toJson() => {
        if (percentComplete != null) 'percentComplete': percentComplete,
        if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
        if (complete != null) 'complete': complete,
      };
}

/// Wraps `/v1/projects` for the mobile-light view: the portfolio roll-up, a
/// single project's WBS tree, and tenant progress updates on a node.
class ProjectsRepository {
  const ProjectsRepository(this._dio);

  final Dio _dio;

  /// Portfolio roll-up — every project with %complete, days ahead/behind, RAG.
  Future<List<ProjectPortfolioItem>> portfolio() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/projects/portfolio');
      return (response.data ?? [])
          .map((j) => ProjectPortfolioItem.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// A single project with its full WBS node tree.
  Future<ProjectDetail> findOne(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/projects/$id');
      return ProjectDetail.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// Update a node's progress; the API rolls the change up and returns the whole
  /// refreshed project (so the caller can reflect the new roll-up immediately).
  Future<ProjectDetail> updateProgress(
    String projectId,
    String nodeId,
    ProgressUpdate update,
  ) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/v1/projects/$projectId/nodes/$nodeId/progress',
        data: update.toJson(),
      );
      return ProjectDetail.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
