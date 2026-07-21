import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/requisition.dart';

/// Fields for raising a new cash requisition (starts DRAFT).
class NewRequisition {
  const NewRequisition({
    required this.purpose,
    required this.amount,
    required this.currency,
    required this.requiredByDate,
    this.attachmentKey,
  });

  final String purpose;
  final double amount;
  final String currency;
  final DateTime requiredByDate;
  final String? attachmentKey;

  Map<String, dynamic> toJson() => {
        'purpose': purpose,
        'amount': amount,
        'currency': currency,
        'requiredByDate': requiredByDate.toIso8601String(),
        if (attachmentKey != null) 'attachmentKey': attachmentKey,
      };

  factory NewRequisition.fromMap(Map<String, dynamic> m) => NewRequisition(
        purpose: m['purpose'] as String? ?? '',
        amount: (m['amount'] as num?)?.toDouble() ?? 0,
        currency: m['currency'] as String? ?? 'USD',
        requiredByDate: DateTime.parse(m['requiredByDate'] as String),
        attachmentKey: m['attachmentKey'] as String?,
      );
}

/// Wraps `/v1/requisitions` — list, create (DRAFT), submit into the approval engine.
class RequisitionsRepository {
  const RequisitionsRepository(this._dio);

  final Dio _dio;

  Future<List<Requisition>> list() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/requisitions');
      return (response.data ?? [])
          .map((j) => Requisition.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<Requisition> create(NewRequisition input) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/requisitions',
        data: input.toJson(),
      );
      return Requisition.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> submit(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/v1/requisitions/$id/submit');
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
