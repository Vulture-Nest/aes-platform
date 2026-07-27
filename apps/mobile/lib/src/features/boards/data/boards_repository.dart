import 'package:dio/dio.dart';

import '../../../api/api_exception.dart';
import '../../../models/board.dart';
import '../../../models/board_detail.dart';

/// Wraps the `/v1/boards` endpoints — boards, lists, cards, checklist items and
/// comments. Confidential-board filtering is done SERVER-SIDE; this repository
/// simply renders whatever the API returns.
class BoardsRepository {
  const BoardsRepository(this._dio);

  final Dio _dio;

  // ---- Boards -------------------------------------------------------------

  Future<List<Board>> list() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/boards');
      return (response.data ?? [])
          .map((j) => Board.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<BoardDetail> findOne(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/boards/$id');
      return BoardDetail.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> createBoard({
    required String name,
    required BoardVisibility visibility,
  }) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/boards',
        data: {'name': name, 'visibility': visibility.wire},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  // ---- Lists --------------------------------------------------------------

  Future<void> createList(String boardId, String name) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/boards/$boardId/lists',
        data: {'name': name},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  // ---- Cards --------------------------------------------------------------

  Future<void> createCard(String listId, String title) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/boards/lists/$listId/cards',
        data: {'title': title},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  // ---- Checklist items ----------------------------------------------------

  Future<void> addChecklistItem(String cardId, String text) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/boards/cards/$cardId/checklist',
        data: {'text': text},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> toggleChecklistItem(String itemId, bool done) async {
    try {
      await _dio.patch<Map<String, dynamic>>(
        '/v1/boards/checklist/$itemId',
        data: {'done': done},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  // ---- Comments -----------------------------------------------------------

  Future<void> addComment(String cardId, String body) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/boards/cards/$cardId/comments',
        data: {'body': body},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }
}
