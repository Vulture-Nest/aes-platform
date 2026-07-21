import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/director_withdrawal.dart';

class NewWithdrawal {
  const NewWithdrawal({
    required this.amount,
    required this.currency,
    required this.destinationAccount,
    required this.reason,
  });

  final double amount;
  final String currency;
  final String destinationAccount;
  final String reason;

  Map<String, dynamic> toJson() => {
        'amount': amount,
        'currency': currency,
        'destinationAccount': destinationAccount,
        'reason': reason,
      };
}

/// Wraps `/v1/director-withdrawals` — list, raise (DRAFT), submit for co-approval,
/// and complete the manual transfer.
class DirectorRepository {
  const DirectorRepository(this._dio);

  final Dio _dio;

  Future<List<DirectorWithdrawal>> list() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/director-withdrawals');
      return (response.data ?? [])
          .map((j) => DirectorWithdrawal.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<DirectorWithdrawal> create(NewWithdrawal input) async {
    try {
      final response =
          await _dio.post<Map<String, dynamic>>('/v1/director-withdrawals', data: input.toJson());
      return DirectorWithdrawal.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> submit(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/v1/director-withdrawals/$id/submit');
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> complete(String id, {required String transferMethod, required String transferReference}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/director-withdrawals/$id/complete',
        data: {'transferMethod': transferMethod, 'transferReference': transferReference},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
