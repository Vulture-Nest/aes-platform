import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../api/api_exception.dart';
import '../../../data/director_repository.dart';
import '../../../models/director_withdrawal.dart';

class DirectorState extends Equatable {
  const DirectorState({this.loading = false, this.items = const [], this.error, this.busyId});

  final bool loading;
  final List<DirectorWithdrawal> items;
  final String? error;
  final String? busyId;

  DirectorState copyWith({
    bool? loading,
    List<DirectorWithdrawal>? items,
    String? error,
    String? busyId,
    bool clearError = false,
    bool clearBusy = false,
  }) {
    return DirectorState(
      loading: loading ?? this.loading,
      items: items ?? this.items,
      error: clearError ? null : (error ?? this.error),
      busyId: clearBusy ? null : (busyId ?? this.busyId),
    );
  }

  @override
  List<Object?> get props => [loading, items, error, busyId];
}

/// Loads a director's withdrawals and drives raise → submit → complete.
class DirectorCubit extends Cubit<DirectorState> {
  DirectorCubit(this._repo) : super(const DirectorState());

  final DirectorRepository _repo;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(DirectorState(items: await _repo.list()));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  Future<String?> create(NewWithdrawal input) async {
    try {
      await _repo.create(input);
      await load();
      return null;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message));
      return e.message;
    }
  }

  Future<String?> submit(String id) => _act(id, () => _repo.submit(id));

  Future<String?> complete(String id, String method, String reference) =>
      _act(id, () => _repo.complete(id, transferMethod: method, transferReference: reference));

  Future<String?> _act(String id, Future<void> Function() action) async {
    emit(state.copyWith(busyId: id, clearError: true));
    try {
      await action();
      await load();
      return null;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message, clearBusy: true));
      return e.message;
    }
  }
}
