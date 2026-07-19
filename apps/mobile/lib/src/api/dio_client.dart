import 'package:dio/dio.dart';

import '../config/flavor_config.dart';

/// Builds the shared [Dio] instance for the selected flavor.
///
/// In later stages the OpenAPI-generated client (packages/shared) is layered on
/// top of this; auth interceptors (Entra ID bearer tokens) attach here.
Dio buildDioClient(FlavorConfig config) {
  final dio = Dio(
    BaseOptions(
      baseUrl: config.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Accept': 'application/json'},
    ),
  );

  dio.interceptors.add(
    LogInterceptor(
      requestHeader: false,
      responseHeader: false,
      // Never log bodies — payroll and PII must not reach client logs.
      requestBody: false,
      responseBody: false,
    ),
  );

  return dio;
}
