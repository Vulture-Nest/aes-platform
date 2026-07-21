import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/alert.dart';

/// Reads the command-centre alert feed (`GET /v1/alerts`). Used by the home
/// danger banner and, later, the command-centre alert list.
class AlertsRepository {
  const AlertsRepository(this._dio);

  final Dio _dio;

  /// Active (unacknowledged, unresolved) alerts. Returns an empty list — never
  /// throws for a forbidden feed — so the banner simply stays hidden for roles
  /// that cannot see the command centre.
  Future<List<Alert>> activeAlerts() async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '/v1/alerts',
        queryParameters: {'activeOnly': true},
      );
      return (response.data ?? [])
          .map((json) => Alert.fromJson(json as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      final api = ApiException.fromDio(error);
      if (api.statusCode == 403) {
        return const [];
      }
      throw api;
    }
  }

  /// Acknowledge an alert (stops the repeat-until-ack pings on DANGER alerts).
  Future<void> acknowledge(String alertId) async {
    try {
      await _dio.post<Map<String, dynamic>>('/v1/alerts/$alertId/ack');
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
