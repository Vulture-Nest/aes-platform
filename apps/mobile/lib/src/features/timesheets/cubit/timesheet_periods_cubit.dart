import 'package:bloc/bloc.dart';

import '../../../api/api_exception.dart';
import '../../../models/timesheet_period.dart';
import '../data/timesheets_repository.dart';
import 'timesheet_periods_state.dart';

/// Drives the timesheet landing screen: loads the site list, the periods for the
/// selected site, and opens a new monthly period. Mirrors the requests cubits
/// (loading/loaded/error via ApiException).
class TimesheetPeriodsCubit extends Cubit<TimesheetPeriodsState> {
  TimesheetPeriodsCubit(this._repo) : super(const TimesheetPeriodsState());

  final TimesheetsRepository _repo;

  /// Load the site list on entry, then the first site's periods.
  Future<void> load() async {
    emit(state.copyWith(loadingSites: true, clearError: true));
    try {
      final sites = await _repo.sites();
      final selected = state.selectedSiteId ?? (sites.isNotEmpty ? sites.first.id : null);
      emit(state.copyWith(loadingSites: false, sites: sites, selectedSiteId: selected));
      if (selected != null) await loadPeriods();
    } on ApiException catch (e) {
      emit(state.copyWith(loadingSites: false, error: e.message));
    }
  }

  /// Switch the active site and reload its periods.
  Future<void> selectSite(String siteId) async {
    if (siteId == state.selectedSiteId) return;
    emit(state.copyWith(selectedSiteId: siteId, periods: const []));
    await loadPeriods();
  }

  /// (Re)load the periods for the selected site — also the pull-to-refresh action.
  Future<void> loadPeriods() async {
    final siteId = state.selectedSiteId;
    if (siteId == null) return;
    emit(state.copyWith(loadingPeriods: true, clearError: true));
    try {
      final periods = await _repo.listPeriods(siteId: siteId);
      emit(state.copyWith(loadingPeriods: false, periods: periods));
    } on ApiException catch (e) {
      emit(state.copyWith(loadingPeriods: false, error: e.message));
    }
  }

  /// Open (create) a period for [month] (YYYY-MM) at the selected site. Returns the
  /// new period on success, or an error message string on failure.
  Future<(TimesheetPeriod?, String?)> openPeriod(String month) async {
    final siteId = state.selectedSiteId;
    if (siteId == null) return (null, 'Pick a site first');
    emit(state.copyWith(creating: true, clearError: true));
    try {
      final period = await _repo.createPeriod(siteId: siteId, month: month);
      emit(state.copyWith(creating: false, periods: [period, ...state.periods]));
      return (period, null);
    } on ApiException catch (e) {
      emit(state.copyWith(creating: false));
      return (null, e.message);
    }
  }
}
