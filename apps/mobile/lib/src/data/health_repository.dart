import 'package:dio/dio.dart';

/// Thin data source over the API's `/health` endpoint. Repositories are injected
/// into cubits so state logic stays free of transport concerns and is unit-testable.
class HealthRepository {
  const HealthRepository(this._dio);

  final Dio _dio;

  /// Returns true when the API reports `status: ok`.
  Future<bool> isHealthy() async {
    final response = await _dio.get<Map<String, dynamic>>('/health');
    return response.data?['status'] == 'ok';
  }
}
