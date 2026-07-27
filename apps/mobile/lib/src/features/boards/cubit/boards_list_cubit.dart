import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../api/api_exception.dart';
import '../../../models/board.dart';
import '../data/boards_repository.dart';

class BoardsListState extends Equatable {
  const BoardsListState({
    this.loading = false,
    this.boards = const [],
    this.error,
  });

  final bool loading;
  final List<Board> boards;
  final String? error;

  BoardsListState copyWith({
    bool? loading,
    List<Board>? boards,
    String? error,
    bool clearError = false,
  }) {
    return BoardsListState(
      loading: loading ?? this.loading,
      boards: boards ?? this.boards,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props => [loading, boards, error];
}

/// Loads the board list (`/v1/boards`) and creates new boards. Confidential
/// boards appear only when the API returns them (directors) — no client filter.
class BoardsListCubit extends Cubit<BoardsListState> {
  BoardsListCubit(this._repo) : super(const BoardsListState());

  final BoardsRepository _repo;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(BoardsListState(boards: await _repo.list()));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  /// Create a board, then reload. Returns an error message on failure, else null.
  Future<String?> createBoard(String name, BoardVisibility visibility) async {
    try {
      await _repo.createBoard(name: name, visibility: visibility);
      await load();
      return null;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message));
      return e.message;
    }
  }
}
