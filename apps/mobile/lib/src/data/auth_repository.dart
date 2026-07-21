import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/auth_user.dart';
import '../models/token_pair.dart';

/// Wraps the API's `/v1/auth/*` endpoints. Repositories expose plain Futures and
/// throw [ApiException] on failure so cubits stay free of transport concerns.
class AuthRepository {
  const AuthRepository(this._dio);

  final Dio _dio;

  /// Authenticate with email + password; returns a fresh token pair.
  Future<TokenPair> login(String email, String password) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/auth/login',
        data: {'email': email, 'password': password},
      );
      return TokenPair.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// The current user (roles loaded fresh server-side). Sends the bearer token
  /// via the auth interceptor; a 401 here means the session is truly gone.
  Future<AuthUser> me() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/auth/me');
      return AuthUser.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// Revoke the refresh token server-side (best-effort; ignores failures).
  Future<void> logout(String refreshToken) async {
    try {
      await _dio.post<void>('/v1/auth/logout', data: {'refreshToken': refreshToken});
    } on DioException {
      // Local sign-out proceeds regardless of the server response.
    }
  }
}
