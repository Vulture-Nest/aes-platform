import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/petty_cash.dart';

/// Wraps the field-facing petty-cash endpoints: list floats, list a float's
/// transactions, and raise a withdrawal against a float.
class PettyCashRepository {
  const PettyCashRepository(this._dio);

  final Dio _dio;

  Future<List<PettyCashFloat>> floats() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/petty-cash/floats');
      return (response.data ?? [])
          .map((j) => PettyCashFloat.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<List<PettyCashTxn>> txns(String floatId) async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/petty-cash/floats/$floatId/txns');
      return (response.data ?? [])
          .map((j) => PettyCashTxn.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<PettyCashTxn> createWithdrawal(
    String floatId, {
    required double amount,
    required String purpose,
    String? receiptKey,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/petty-cash/floats/$floatId/withdrawals',
        data: {
          'amount': amount,
          'purpose': purpose,
          if (receiptKey != null) 'receiptKey': receiptKey,
        },
      );
      return PettyCashTxn.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
