import 'package:dio/dio.dart';

import '../data/token_store.dart';
import '../models/token_pair.dart';

bool _isAuthPath(String path) =>
    path.contains('/auth/login') || path.contains('/auth/refresh');

/// Attaches the bearer access token to outbound requests and transparently
/// refreshes it once on a 401 (single-flight, so a burst of parallel 401s
/// triggers only one refresh). If the refresh fails the tokens are cleared and
/// [onAuthFailure] fires so the app can return to the login screen.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.tokenStore,
    required this.refreshDio,
    this.onAuthFailure,
  });

  final TokenStore tokenStore;

  /// A bare Dio (no auth interceptor) used to call /auth/refresh and to replay
  /// the original request after a refresh — avoids re-entering this interceptor.
  final Dio refreshDio;

  final void Function()? onAuthFailure;

  Future<TokenPair?>? _refreshing;

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (!_isAuthPath(options.path)) {
      final tokens = await tokenStore.read();
      if (tokens != null) {
        options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final request = err.requestOptions;
    final alreadyRetried = request.extra['__retried'] == true;
    if (err.response?.statusCode != 401 || _isAuthPath(request.path) || alreadyRetried) {
      return handler.next(err);
    }

    final refreshed = await _refresh();
    if (refreshed == null) {
      await tokenStore.clear();
      onAuthFailure?.call();
      return handler.next(err);
    }

    request.extra['__retried'] = true;
    request.headers['Authorization'] = 'Bearer ${refreshed.accessToken}';
    try {
      final response = await refreshDio.fetch<dynamic>(request);
      return handler.resolve(response);
    } on DioException catch (retryError) {
      return handler.next(retryError);
    }
  }

  /// Single-flight refresh: concurrent callers await the same in-flight future.
  Future<TokenPair?> _refresh() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<TokenPair?> _doRefresh() async {
    final current = await tokenStore.read();
    if (current == null) {
      return null;
    }
    try {
      final response = await refreshDio.post<Map<String, dynamic>>(
        '/v1/auth/refresh',
        data: {'refreshToken': current.refreshToken},
      );
      final pair = TokenPair.fromJson(response.data!);
      await tokenStore.write(pair);
      return pair;
    } on DioException {
      return null;
    }
  }
}
