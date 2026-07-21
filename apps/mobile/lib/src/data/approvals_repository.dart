import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/approval_decision.dart';
import '../models/approval_item.dart';

/// Wraps the approval-engine endpoints (`/v1/approvals`). The inbox returns the
/// steps awaiting the current user; decide records an approve/reject/return.
class ApprovalsRepository {
  const ApprovalsRepository(this._dio);

  final Dio _dio;

  Future<List<ApprovalItem>> inbox() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/approvals/inbox');
      return (response.data ?? [])
          .map((json) => ApprovalItem.fromJson(json as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> decide(String approvalId, ApprovalDecision decision, {String? comment}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/approvals/$approvalId/decide',
        data: {
          'decision': decision.wire,
          if (comment != null && comment.isNotEmpty) 'comment': comment,
        },
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
