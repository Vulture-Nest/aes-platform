import 'package:dio/dio.dart';

import '../../../api/api_exception.dart';
import '../../../models/timesheet_entry.dart';
import '../../../models/timesheet_grid.dart';
import '../../../models/timesheet_period.dart';

/// A pickable site for the period selector (`GET /v1/sites`, any authenticated user).
class TimesheetSite {
  const TimesheetSite({required this.id, required this.name});

  final String id;
  final String name;

  factory TimesheetSite.fromJson(Map<String, dynamic> json) => TimesheetSite(
        id: json['id'] as String,
        name: json['name'] as String? ?? json['id'] as String,
      );
}

/// Wraps `/v1/timesheet-periods` (+ `/v1/sites`, `/v1/employees`): list/create/open
/// periods, read the grid, bulk-upsert rows and submit for approval. Mirrors the
/// requests-feature repository style (thin Dio wrapper, ApiException on failure).
class TimesheetsRepository {
  const TimesheetsRepository(this._dio);

  final Dio _dio;

  /// Sites the clerk can pick from. Readable by any authenticated user.
  Future<List<TimesheetSite>> sites() async {
    try {
      final response = await _dio.get<List<dynamic>>('/v1/sites');
      return (response.data ?? [])
          .map((j) => TimesheetSite.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// List periods, optionally filtered by site and/or month (YYYY-MM).
  Future<List<TimesheetPeriod>> listPeriods({String? siteId, String? month}) async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '/v1/timesheet-periods',
        queryParameters: {
          if (siteId != null) 'siteId': siteId,
          if (month != null) 'month': month,
        },
      );
      return (response.data ?? [])
          .map((j) => TimesheetPeriod.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// Open (create) a monthly period for a site.
  Future<TimesheetPeriod> createPeriod({required String siteId, required String month}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/v1/timesheet-periods',
        data: {'siteId': siteId, 'month': month},
      );
      return TimesheetPeriod.fromJson(response.data!);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// Fetch the full grid: the period + its entries, plus the site roster for the
  /// row labels. The roster is best-effort — some roles (SITE_CLERK) cannot list
  /// employees, in which case rows are derived from the entries already captured.
  Future<TimesheetGrid> getGrid(String periodId) async {
    final TimesheetPeriod period;
    final List<TimesheetEntry> entries;
    try {
      final response = await _dio.get<Map<String, dynamic>>('/v1/timesheet-periods/$periodId');
      final data = response.data!;
      period = TimesheetPeriod.fromJson(data);
      entries = ((data['entries'] as List<dynamic>?) ?? [])
          .map((j) => TimesheetEntry.fromJson(j as Map<String, dynamic>))
          .toList();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }

    final roster = await _rosterFor(period.siteId, entries);
    return TimesheetGrid(
      period: period,
      employees: roster,
      entries: {for (final e in entries) e.key: e},
    );
  }

  /// Bulk-upsert grid rows into an OPEN period (validated server-side).
  Future<void> upsertEntries(String periodId, List<TimesheetEntry> rows) async {
    if (rows.isEmpty) return;
    try {
      await _dio.post<Map<String, dynamic>>(
        '/v1/timesheet-periods/$periodId/entries',
        data: {'rows': rows.map((r) => r.toRowJson()).toList()},
      );
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// Submit the period for Site-Manager approval.
  Future<void> submit(String periodId) async {
    try {
      await _dio.post<Map<String, dynamic>>('/v1/timesheet-periods/$periodId/submit');
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  /// The employee roster for the grid rows. Tries the roster endpoint first; on a
  /// permission/other failure falls back to placeholder rows derived from entries.
  Future<List<TimesheetEmployee>> _rosterFor(
    String siteId,
    List<TimesheetEntry> entries,
  ) async {
    try {
      final response = await _dio.get<List<dynamic>>(
        '/v1/employees',
        queryParameters: {'siteId': siteId},
      );
      final roster = (response.data ?? [])
          .map((j) => TimesheetEmployee.fromJson(j as Map<String, dynamic>))
          .toList();
      if (roster.isNotEmpty) return roster;
    } on DioException {
      // Roster not readable for this role — fall back to entry-derived rows below.
    }
    final ids = <String>{for (final e in entries) e.employeeId};
    return [
      for (final id in ids)
        TimesheetEmployee(id: id, name: 'Employee ${id.substring(0, id.length.clamp(0, 6))}'),
    ];
  }
}
