import 'package:equatable/equatable.dart';

/// One employee-day row in a timesheet period. Hours are split across the five
/// AES man-hour categories (mirrors the API's TimesheetEntry / manhours sheet):
/// normal, OT@1.5x, OT@2.0x, underground-shift allowance count, and night hours.
class TimesheetEntry extends Equatable {
  const TimesheetEntry({
    required this.employeeId,
    required this.date,
    this.hoursNormal = 0,
    this.hoursOt15 = 0,
    this.hoursOt20 = 0,
    this.ugShift = 0,
    this.nightHours = 0,
    this.remarks,
    this.anomalyFlag = false,
  });

  final String employeeId;

  /// The calendar day this row is for (date-only; time is ignored).
  final DateTime date;

  final double hoursNormal;
  final double hoursOt15;
  final double hoursOt20;
  final double ugShift;
  final double nightHours;
  final String? remarks;
  final bool anomalyFlag;

  /// Sum of all categories for the day — the compact number shown in a grid cell.
  double get total => hoursNormal + hoursOt15 + hoursOt20 + ugShift + nightHours;

  /// True when nothing has been captured for the day (empty cell).
  bool get isEmpty => total == 0 && (remarks == null || remarks!.isEmpty);

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;

  TimesheetEntry copyWith({
    double? hoursNormal,
    double? hoursOt15,
    double? hoursOt20,
    double? ugShift,
    double? nightHours,
    String? remarks,
  }) =>
      TimesheetEntry(
        employeeId: employeeId,
        date: date,
        hoursNormal: hoursNormal ?? this.hoursNormal,
        hoursOt15: hoursOt15 ?? this.hoursOt15,
        hoursOt20: hoursOt20 ?? this.hoursOt20,
        ugShift: ugShift ?? this.ugShift,
        nightHours: nightHours ?? this.nightHours,
        remarks: remarks ?? this.remarks,
        anomalyFlag: anomalyFlag,
      );

  factory TimesheetEntry.fromJson(Map<String, dynamic> json) => TimesheetEntry(
        employeeId: json['employeeId'] as String? ?? '',
        date: DateTime.parse(json['date'].toString()),
        hoursNormal: _num(json['hoursNormal']),
        hoursOt15: _num(json['hoursOt15']),
        hoursOt20: _num(json['hoursOt20']),
        ugShift: _num(json['ugShift']),
        nightHours: _num(json['nightHours']),
        remarks: json['remarks'] as String?,
        anomalyFlag: json['anomalyFlag'] as bool? ?? false,
      );

  /// Wire shape for the bulk `POST :id/entries` upsert (dates as YYYY-MM-DD).
  Map<String, dynamic> toRowJson() => {
        'employeeId': employeeId,
        'date': _dateOnly(date),
        'hoursNormal': hoursNormal,
        'hoursOt15': hoursOt15,
        'hoursOt20': hoursOt20,
        'ugShift': ugShift,
        'nightHours': nightHours,
        if (remarks != null && remarks!.isNotEmpty) 'remarks': remarks,
      };

  static String _dateOnly(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// A stable key for one employee-day cell (used to key drafts + the grid map).
  static String cellKey(String employeeId, DateTime date) => '$employeeId@${_dateOnly(date)}';

  String get key => cellKey(employeeId, date);

  @override
  List<Object?> get props =>
      [employeeId, date, hoursNormal, hoursOt15, hoursOt20, ugShift, nightHours, remarks];
}
