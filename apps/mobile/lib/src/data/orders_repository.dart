import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../models/order.dart';

/// Wraps `/v1/orders` — list, detail (with receipts), mark-serviced — plus a
/// client-name lookup for display.
class OrdersRepository {
  const OrdersRepository(this._dio);

  final Dio _dio;

  Future<List<Order>> list() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/orders');
      return (response.data ?? []).map((j) => Order.fromJson(j as Map<String, dynamic>)).toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<Order> findOne(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/orders/$id');
      return Order.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> markServiced(String id) async {
    try {
      await _dio.post<Map<String, dynamic>>('/v1/orders/$id/mark-serviced');
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// clientId -> client name, for labelling orders. Returns {} if forbidden.
  Future<Map<String, String>> clientNames() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/clients');
      return {
        for (final c in response.data ?? [])
          (c as Map<String, dynamic>)['id'] as String: c['name'] as String? ?? '',
      };
    } on DioException {
      return const {};
    }
  }
}
