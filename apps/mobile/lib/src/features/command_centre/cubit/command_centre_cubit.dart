import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../api/api_exception.dart';
import '../../../data/alerts_repository.dart';
import '../../../data/command_centre_repository.dart';
import '../../../models/alert.dart';
import '../../../models/command_centre.dart';

class CommandCentreState extends Equatable {
  const CommandCentreState({
    this.loading = false,
    this.dashboard,
    this.alerts = const [],
    this.error,
    this.ackingId,
  });

  final bool loading;
  final CommandCentre? dashboard;
  final List<Alert> alerts;
  final String? error;
  final String? ackingId;

  CommandCentreState copyWith({
    bool? loading,
    CommandCentre? dashboard,
    List<Alert>? alerts,
    String? error,
    String? ackingId,
    bool clearError = false,
    bool clearAcking = false,
  }) {
    return CommandCentreState(
      loading: loading ?? this.loading,
      dashboard: dashboard ?? this.dashboard,
      alerts: alerts ?? this.alerts,
      error: clearError ? null : (error ?? this.error),
      ackingId: clearAcking ? null : (ackingId ?? this.ackingId),
    );
  }

  @override
  List<Object?> get props => [loading, dashboard, alerts, error, ackingId];
}

/// Loads the composite Command Centre dashboard + the active alert feed, and
/// acknowledges alerts.
class CommandCentreCubit extends Cubit<CommandCentreState> {
  CommandCentreCubit({
    required CommandCentreRepository repository,
    required AlertsRepository alerts,
  })  : _repo = repository,
        _alerts = alerts,
        super(const CommandCentreState());

  final CommandCentreRepository _repo;
  final AlertsRepository _alerts;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      final results = await Future.wait([_repo.dashboard(), _alerts.activeAlerts()]);
      emit(
        CommandCentreState(
          dashboard: results[0] as CommandCentre,
          alerts: results[1] as List<Alert>,
        ),
      );
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  Future<void> acknowledge(String alertId) async {
    emit(state.copyWith(ackingId: alertId, clearError: true));
    try {
      await _alerts.acknowledge(alertId);
      emit(
        state.copyWith(
          alerts: state.alerts.where((a) => a.id != alertId).toList(),
          clearAcking: true,
        ),
      );
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message, clearAcking: true));
    }
  }
}
