import 'package:equatable/equatable.dart';

import '../../../models/timesheet_period.dart';
import '../data/timesheets_repository.dart';

/// State for the timesheet landing screen: the site picker, the selected site's
/// periods, and load/error flags. Mirrors the requests-feature list state.
class TimesheetPeriodsState extends Equatable {
  const TimesheetPeriodsState({
    this.loadingSites = true,
    this.loadingPeriods = false,
    this.creating = false,
    this.sites = const [],
    this.selectedSiteId,
    this.periods = const [],
    this.error,
  });

  final bool loadingSites;
  final bool loadingPeriods;
  final bool creating;
  final List<TimesheetSite> sites;
  final String? selectedSiteId;
  final List<TimesheetPeriod> periods;
  final String? error;

  TimesheetSite? get selectedSite {
    for (final s in sites) {
      if (s.id == selectedSiteId) return s;
    }
    return null;
  }

  TimesheetPeriodsState copyWith({
    bool? loadingSites,
    bool? loadingPeriods,
    bool? creating,
    List<TimesheetSite>? sites,
    String? selectedSiteId,
    List<TimesheetPeriod>? periods,
    String? error,
    bool clearError = false,
  }) {
    return TimesheetPeriodsState(
      loadingSites: loadingSites ?? this.loadingSites,
      loadingPeriods: loadingPeriods ?? this.loadingPeriods,
      creating: creating ?? this.creating,
      sites: sites ?? this.sites,
      selectedSiteId: selectedSiteId ?? this.selectedSiteId,
      periods: periods ?? this.periods,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props =>
      [loadingSites, loadingPeriods, creating, sites, selectedSiteId, periods, error];
}
