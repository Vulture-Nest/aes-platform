import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/command_centre.dart';

/// Reads the composite Command Centre dashboard (`GET /v1/command-centre`).
class CommandCentreRepository {
  const CommandCentreRepository(this._dio);

  final Dio _dio;

  Future<CommandCentre> dashboard() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/command-centre');
      return CommandCentre.fromJson(response.data ?? {});
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
