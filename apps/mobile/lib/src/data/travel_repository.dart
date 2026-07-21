import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/travel_request.dart';

/// Fields for raising a new travel request (starts DRAFT). Per-diem/advance are
/// computed server-side from the rate table.
class NewTravel {
  const NewTravel({
    required this.destination,
    required this.dateFrom,
    required this.dateTo,
    required this.days,
    required this.currency,
    this.destinationClass,
    this.grade,
  });

  final String destination;
  final DateTime dateFrom;
  final DateTime dateTo;
  final int days;
  final String currency;
  final String? destinationClass;
  final String? grade;

  Map<String, dynamic> toJson() => {
        'destination': destination,
        'dateFrom': dateFrom.toIso8601String(),
        'dateTo': dateTo.toIso8601String(),
        'days': days,
        'currency': currency,
        if (destinationClass != null && destinationClass!.isNotEmpty)
          'destinationClass': destinationClass,
        if (grade != null && grade!.isNotEmpty) 'grade': grade,
      };
}

/// Wraps `/v1/travel` — list, create (DRAFT), submit into the approval engine.
class TravelRepository {
  const TravelRepository(this._dio);

  final Dio _dio;

  Future<List<TravelRequest>> list() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/travel');
      return (response.data ?? [])
          .map((j) => TravelRequest.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<TravelRequest> create(NewTravel input) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>('/v1/travel', data: input.toJson());
      return TravelRequest.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> submit(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/v1/travel/$id/submit');
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
