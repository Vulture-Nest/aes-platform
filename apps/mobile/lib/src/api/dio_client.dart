import 'package:dio/dio.dart';

import '../config/flavor_config.dart';
import '../data/token_store.dart';
import 'auth_interceptor.dart';

/// Builds the shared [Dio] instance for the selected flavor, wired for local-JWT
/// auth: an [AuthInterceptor] attaches the bearer token and refreshes it on 401.
///
/// [onAuthFailure] fires when a refresh ultimately fails, so the app can route
/// back to the login screen.
Dio buildDioClient(
  FlavorConfig config, {
  required TokenStore tokenStore,
  void Function()? onAuthFailure,
}) {
  final options = BaseOptions(
    baseUrl: config.apiBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 20),
    headers: {'Accept': 'application/json'},
  );

  final dio = Dio(options);
  // Bare client (no auth interceptor) for refresh + retry, to avoid re-entrancy.
  final refreshDio = Dio(options);

  dio.interceptors.add(
    AuthInterceptor(
      tokenStore: tokenStore,
      refreshDio: refreshDio,
      onAuthFailure: onAuthFailure,
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
