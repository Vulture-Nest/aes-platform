import 'package:dio/dio.dart';

/// A user-presentable API error. Maps Dio failures (timeouts, offline, HTTP
/// error bodies) into a single message + optional status the UI can show.
class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  bool get isUnauthorized => statusCode == 401;

  factory ApiException.fromDio(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const ApiException('The server took too long to respond.');
      case DioExceptionType.connectionError:
        return const ApiException('Cannot reach the server. Check your connection.');
      case DioExceptionType.badResponse:
        final status = error.response?.statusCode;
        return ApiException(_messageFromBody(error.response?.data, status), statusCode: status);
      case DioExceptionType.cancel:
        return const ApiException('Request cancelled.');
      case DioExceptionType.badCertificate:
        return const ApiException('The server certificate could not be verified.');
      case DioExceptionType.unknown:
      default:
        return const ApiException('Something went wrong. Please try again.');
    }
  }

  static String _messageFromBody(dynamic data, int? status) {
    if (data is Map<String, dynamic>) {
      final message = data['message'];
      if (message is String && message.isNotEmpty) {
        return message;
      }
      if (message is List && message.isNotEmpty) {
        return message.first.toString();
      }
    }
    if (status == 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (status == 403) {
      return 'You do not have permission to do that.';
    }
    return 'Request failed${status != null ? ' ($status)' : ''}.';
  }

  @override
  String toString() => message;
}
