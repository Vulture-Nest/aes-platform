import 'package:equatable/equatable.dart';

/// A monthly timesheet period for a site (`/v1/timesheet-periods`). One period per
/// (site, month). Entries hang off it; only OPEN periods accept grid edits, and a
/// period is submitted for Site-Manager approval, then locked for payroll.
class TimesheetPeriod extends Equatable {
  const TimesheetPeriod({
    required this.id,
    required this.siteId,
    required this.month,
    required this.status,
    this.lockedAt,
    this.createdAt,
  });

  final String id;

  final String siteId;

  /// Calendar month in YYYY-MM.
  final String month;

  /// OPEN / SITE_APPROVED / LOCKED (server-managed lifecycle).
  final String status;

  final DateTime? lockedAt;
  final DateTime? createdAt;

  static DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

  /// Only OPEN periods accept entry edits (mirrors the API's assertEditable).
  bool get isOpen => status == 'OPEN';

  /// A period submitted for approval (or beyond) is read-only in the grid.
  bool get isLocked => status == 'LOCKED';

  bool get isSiteApproved => status == 'SITE_APPROVED';

  /// Human month label, e.g. "2026-07" → "Jul 2026".
  String get monthLabel {
    final parts = month.split('-');
    if (parts.length != 2) return month;
    final year = parts[0];
    final m = int.tryParse(parts[1]) ?? 0;
    const names = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    if (m < 1 || m > 12) return month;
    return '${names[m]} $year';
  }

  factory TimesheetPeriod.fromJson(Map<String, dynamic> json) => TimesheetPeriod(
        id: json['id'] as String,
        siteId: json['siteId'] as String? ?? '',
        month: json['month'] as String? ?? '',
        status: json['status'] as String? ?? 'OPEN',
        lockedAt: _date(json['lockedAt']),
        createdAt: _date(json['createdAt']),
      );

  @override
  List<Object?> get props => [id, siteId, month, status];
}
