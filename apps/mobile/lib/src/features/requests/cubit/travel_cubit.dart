import 'package:bloc/bloc.dart';

import '../../../api/api_exception.dart';
import '../../../data/outbox_store.dart';
import '../../../data/travel_repository.dart';
import '../../../models/outbox_item.dart';
import '../../../models/travel_request.dart';
import 'request_list_state.dart';
import 'save_result.dart';

/// Loads + creates + submits travel requests. Per-diem/advance are computed by
/// the API from the rate table. Offline drafts are queued to the outbox.
class TravelCubit extends Cubit<RequestListState<TravelRequest>> {
  TravelCubit(this._repo, {required OutboxStore outbox})
      : _outbox = outbox,
        super(const RequestListState<TravelRequest>());

  final TravelRepository _repo;
  final OutboxStore _outbox;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(RequestListState(items: await _repo.list()));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  Future<SaveResult> create(NewTravel input, {bool submit = false}) async {
    try {
      final created = await _repo.create(input);
      if (submit) await _repo.submit(created.id);
      emit(RequestListState(items: [created, ...state.items]));
      return SaveResult.created(created.id);
    } on ApiException catch (e) {
      if (e.statusCode == null) {
        await _outbox.enqueue(
          OutboxItem(
            id: DateTime.now().microsecondsSinceEpoch.toString(),
            kind: OutboxKind.travel,
            payload: input.toJson(),
            submitAfter: submit,
            createdAt: DateTime.now(),
          ),
        );
        return SaveResult.queued();
      }
      emit(state.copyWith(error: e.message));
      return SaveResult.failed(e.message);
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
