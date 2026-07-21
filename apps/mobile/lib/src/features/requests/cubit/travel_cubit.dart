import 'package:bloc/bloc.dart';

import '../../../api/api_exception.dart';
import '../../../data/travel_repository.dart';
import '../../../models/travel_request.dart';
import 'request_list_state.dart';

/// Loads + creates + submits travel requests. Per-diem/advance are computed by
/// the API from the rate table, so the client only supplies trip details.
class TravelCubit extends Cubit<RequestListState<TravelRequest>> {
  TravelCubit(this._repo) : super(const RequestListState<TravelRequest>());

  final TravelRepository _repo;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(RequestListState(items: await _repo.list()));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  Future<TravelRequest?> create(NewTravel input) async {
    try {
      final created = await _repo.create(input);
      emit(RequestListState(items: [created, ...state.items]));
      return created;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message));
      return null;
    }
  }

  Future<String?> submit(String id) async {
    try {
      await _repo.submit(id);
      await load();
      return null;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message));
      return e.message;
    }
  }
}
