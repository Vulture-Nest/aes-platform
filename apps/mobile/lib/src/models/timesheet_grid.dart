import 'package:equatable/equatable.dart';

import 'timesheet_entry.dart';
import 'timesheet_period.dart';

/// An employee row header in the capture grid. When the roster endpoint is not
/// readable (e.g. a SITE_CLERK can't list employees) the name falls back to the
/// works number, and rows are derived from whatever entries the period already has.
class TimesheetEmployee extends Equatable {
  const TimesheetEmployee({required this.id, required this.name, this.worksNo});

  final String id;
  final String name;
  final String? worksNo;

  factory TimesheetEmployee.fromJson(Map<String, dynamic> json) {
    final first = json['firstName'] as String? ?? '';
    final last = json['lastName'] as String? ?? '';
    final full = '$first $last'.trim();
    return TimesheetEmployee(
      id: json['id'] as String,
      name: full.isEmpty ? (json['worksNo'] as String? ?? json['id'] as String) : full,
      worksNo: json['worksNo'] as String?,
    );
  }

  @override
  List<Object?> get props => [id, name, worksNo];
}

/// The full grid for one period: the period, the employee rows (roster) and the
/// captured entries keyed by employee-day. Mirrors `GET /v1/timesheet-periods/:id`
/// which embeds `entries`, augmented with the site roster for the row labels.
class TimesheetGrid extends Equatable {
  const TimesheetGrid({
    required this.period,
    required this.employees,
    required this.entries,
  });

  final TimesheetPeriod period;
  final List<TimesheetEmployee> employees;

  /// Keyed by [TimesheetEntry.cellKey] for O(1) cell lookup while rendering.
  final Map<String, TimesheetEntry> entries;

  TimesheetEntry? entryFor(String employeeId, DateTime date) =>
      entries[TimesheetEntry.cellKey(employeeId, date)];

  /// Per-employee total across the whole month (the right-hand grid summary).
  double totalFor(String employeeId) {
    var sum = 0.0;
    for (final e in entries.values) {
      if (e.employeeId == employeeId) sum += e.total;
    }
    return sum;
  }

  int get capturedDays => entries.values.where((e) => !e.isEmpty).length;

  TimesheetGrid withEntry(TimesheetEntry entry) {
    final next = Map<String, TimesheetEntry>.from(entries);
    if (entry.isEmpty) {
      next.remove(entry.key);
    } else {
      next[entry.key] = entry;
    }
    return TimesheetGrid(period: period, employees: employees, entries: next);
  }

  @override
  List<Object?> get props => [period, employees, entries];
}
