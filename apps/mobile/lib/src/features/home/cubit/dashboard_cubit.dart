import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../data/alerts_repository.dart';
import '../../../models/alert.dart';

/// Home dashboard state: the active alerts that feed the persistent danger banner.
class DashboardState extends Equatable {
  const DashboardState({this.alerts = const [], this.loading = false});

  final List<Alert> alerts;
  final bool loading;

  /// DANGER-severity active alerts drive the red banner.
  List<Alert> get dangerAlerts =>
      alerts.where((a) => a.severity == AlertSeverity.danger).toList();

  bool get hasDanger => dangerAlerts.isNotEmpty;

  DashboardState copyWith({List<Alert>? alerts, bool? loading}) => DashboardState(
        alerts: alerts ?? this.alerts,
        loading: loading ?? this.loading,
      );

  @override
  List<Object?> get props => [alerts, loading];
}

/// Loads the active-alert feed for the home danger banner. Silent on failure —
/// the banner just stays hidden rather than blocking the dashboard.
class DashboardCubit extends Cubit<DashboardState> {
  DashboardCubit(this._alerts) : super(const DashboardState());

  final AlertsRepository _alerts;

  Future<void> load() async {
    emit(state.copyWith(loading: true));
    try {
      final alerts = await _alerts.activeAlerts();
      emit(DashboardState(alerts: alerts, loading: false));
    } catch (_) {
      emit(state.copyWith(loading: false));
    }
  }
}
