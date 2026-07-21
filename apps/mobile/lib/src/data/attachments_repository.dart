import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../api/api_exception.dart';

/// Uploads supporting attachments (receipt photos) to the API, which stores them
/// and returns a key the owning request references.
class AttachmentsRepository {
  const AttachmentsRepository(this._dio);

  final Dio _dio;

  /// Upload [bytes] as base64; returns the storage key.
  Future<String> upload(Uint8List bytes, {required String filename, required String contentType}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/attachments',
        data: {
          'filename': filename,
          'contentType': contentType,
          'data': base64Encode(bytes),
        },
      );
      return response.data!['key'] as String;
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
