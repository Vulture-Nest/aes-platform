import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../data/outbox_store.dart';
import '../../../services/sync_service.dart';

class OutboxState extends Equatable {
  const OutboxState({this.pending = 0, this.syncing = false});

  final int pending;
  final bool syncing;

  OutboxState copyWith({int? pending, bool? syncing}) =>
      OutboxState(pending: pending ?? this.pending, syncing: syncing ?? this.syncing);

  @override
  List<Object?> get props => [pending, syncing];
}

/// Exposes the offline outbox to the UI: the pending count and a manual sync.
class OutboxCubit extends Cubit<OutboxState> {
  OutboxCubit({required OutboxStore store, required SyncService sync})
      : _store = store,
        _sync = sync,
        super(const OutboxState());

  final OutboxStore _store;
  final SyncService _sync;

  Future<void> refresh() async {
    emit(state.copyWith(pending: await _store.count()));
  }

  /// Flush the outbox now; returns the summary for the UI to report.
  Future<SyncSummary> syncNow() async {
    emit(state.copyWith(syncing: true));
    final summary = await _sync.flush();
    emit(OutboxState(pending: await _store.count()));
    return summary;
  }
}
