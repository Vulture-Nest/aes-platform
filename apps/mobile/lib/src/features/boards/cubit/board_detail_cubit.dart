import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../api/api_exception.dart';
import '../../../models/board_detail.dart';
import '../data/boards_repository.dart';

class BoardDetailState extends Equatable {
  const BoardDetailState({
    this.loading = false,
    this.board,
    this.error,
  });

  final bool loading;
  final BoardDetail? board;
  final String? error;

  BoardDetailState copyWith({
    bool? loading,
    BoardDetail? board,
    String? error,
    bool clearError = false,
  }) {
    return BoardDetailState(
      loading: loading ?? this.loading,
      board: board ?? this.board,
      error: clearError ? null : (error ?? this.error),
    );
  }

  /// Find the latest version of a card across all lists (used to keep an open
  /// detail sheet in sync after a reload).
  BoardCard? cardById(String cardId) {
    for (final list in board?.lists ?? const <BoardList>[]) {
      for (final card in list.cards) {
        if (card.id == cardId) return card;
      }
    }
    return null;
  }

  @override
  List<Object?> get props => [loading, board, error];
}

/// Loads a single board with its lists/cards (`/v1/boards/:id`) and performs the
/// content mutations: create list, create card, add/toggle checklist item, add
/// comment. Each mutation reloads the board so the UI stays consistent.
class BoardDetailCubit extends Cubit<BoardDetailState> {
  BoardDetailCubit(this._repo, this.boardId) : super(const BoardDetailState());

  final BoardsRepository _repo;
  final String boardId;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(BoardDetailState(board: await _repo.findOne(boardId)));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  Future<String?> createList(String name) =>
      _mutate(() => _repo.createList(boardId, name));

  Future<String?> createCard(String listId, String title) =>
      _mutate(() => _repo.createCard(listId, title));

  Future<String?> addChecklistItem(String cardId, String text) =>
      _mutate(() => _repo.addChecklistItem(cardId, text));

  Future<String?> toggleChecklistItem(String itemId, bool done) =>
      _mutate(() => _repo.toggleChecklistItem(itemId, done));

  Future<String?> addComment(String cardId, String body) =>
      _mutate(() => _repo.addComment(cardId, body));

  /// Run a mutation then reload; returns an error message on failure, else null.
  Future<String?> _mutate(Future<void> Function() action) async {
    try {
      await action();
      await load();
      return null;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message));
      return e.message;
    }
  }
}
