import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../../../models/timesheet_entry.dart';

/// One draft cell captured offline, awaiting sync: an employee-day row scoped to a
/// period, plus whether the period should be submitted for approval once flushed.
class TimesheetDraft {
  const TimesheetDraft({
    required this.periodId,
    required this.entry,
    this.submitAfter = false,
  });

  final String periodId;
  final TimesheetEntry entry;
  final bool submitAfter;

  /// One draft per (period, employee, day) — later edits replace earlier ones.
  String get id => '$periodId#${entry.key}';
}

/// Persistent per-cell draft queue for the timesheet grid — the flagship
/// offline-first capture. Mirrors the requests-feature outbox (SqfliteOutboxStore):
/// drafts survive app restarts (mine sites have long dead zones) and are flushed by
/// [TimesheetSyncService] when connectivity returns. The interface is abstracted so
/// tests can use the in-memory implementation.
abstract class TimesheetDraftStore {
  Future<void> put(TimesheetDraft draft);
  Future<List<TimesheetDraft>> forPeriod(String periodId);
  Future<List<TimesheetDraft>> all();
  Future<void> removeForPeriod(String periodId);
  Future<void> remove(String id);
  Future<int> count();
}

/// SQLite-backed draft store (via sqflite). Opened lazily; one table keyed by the
/// composite draft id so re-editing a cell overwrites the queued value.
class SqfliteTimesheetDraftStore implements TimesheetDraftStore {
  SqfliteTimesheetDraftStore();

  static const _table = 'timesheet_drafts';

  Future<Database>? _opening;
  Future<Database> get _db => _opening ??= _open();

  Future<Database> _open() async {
    final path = p.join(await getDatabasesPath(), 'aes_timesheet_drafts.db');
    return openDatabase(
      path,
      version: 1,
      onCreate: (db, _) => db.execute('''
        CREATE TABLE $_table (
          id TEXT PRIMARY KEY,
          period_id TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          date TEXT NOT NULL,
          hours_normal REAL NOT NULL DEFAULT 0,
          hours_ot15 REAL NOT NULL DEFAULT 0,
          hours_ot20 REAL NOT NULL DEFAULT 0,
          ug_shift REAL NOT NULL DEFAULT 0,
          night_hours REAL NOT NULL DEFAULT 0,
          remarks TEXT,
          submit_after INTEGER NOT NULL DEFAULT 0
        )
      '''),
    );
  }

  Map<String, Object?> _toRow(TimesheetDraft d) => {
        'id': d.id,
        'period_id': d.periodId,
        'employee_id': d.entry.employeeId,
        'date': d.entry.date.toIso8601String(),
        'hours_normal': d.entry.hoursNormal,
        'hours_ot15': d.entry.hoursOt15,
        'hours_ot20': d.entry.hoursOt20,
        'ug_shift': d.entry.ugShift,
        'night_hours': d.entry.nightHours,
        'remarks': d.entry.remarks,
        'submit_after': d.submitAfter ? 1 : 0,
      };

  TimesheetDraft _fromRow(Map<String, Object?> row) => TimesheetDraft(
        periodId: row['period_id'] as String,
        submitAfter: (row['submit_after'] as int? ?? 0) == 1,
        entry: TimesheetEntry(
          employeeId: row['employee_id'] as String,
          date: DateTime.parse(row['date'] as String),
          hoursNormal: (row['hours_normal'] as num?)?.toDouble() ?? 0,
          hoursOt15: (row['hours_ot15'] as num?)?.toDouble() ?? 0,
          hoursOt20: (row['hours_ot20'] as num?)?.toDouble() ?? 0,
          ugShift: (row['ug_shift'] as num?)?.toDouble() ?? 0,
          nightHours: (row['night_hours'] as num?)?.toDouble() ?? 0,
          remarks: row['remarks'] as String?,
        ),
      );

  @override
  Future<void> put(TimesheetDraft draft) async {
    final db = await _db;
    await db.insert(_table, _toRow(draft), conflictAlgorithm: ConflictAlgorithm.replace);
  }

  @override
  Future<List<TimesheetDraft>> forPeriod(String periodId) async {
    final db = await _db;
    final rows = await db.query(
      _table,
      where: 'period_id = ?',
      whereArgs: [periodId],
      orderBy: 'date ASC',
    );
    return rows.map(_fromRow).toList();
  }

  @override
  Future<List<TimesheetDraft>> all() async {
    final db = await _db;
    final rows = await db.query(_table, orderBy: 'period_id ASC, date ASC');
    return rows.map(_fromRow).toList();
  }

  @override
  Future<void> removeForPeriod(String periodId) async {
    final db = await _db;
    await db.delete(_table, where: 'period_id = ?', whereArgs: [periodId]);
  }

  @override
  Future<void> remove(String id) async {
    final db = await _db;
    await db.delete(_table, where: 'id = ?', whereArgs: [id]);
  }

  @override
  Future<int> count() async {
    final db = await _db;
    final result = await db.rawQuery('SELECT COUNT(*) AS c FROM $_table');
    return (result.first['c'] as int?) ?? 0;
  }
}

/// In-memory draft store for tests / platforms without SQLite.
class InMemoryTimesheetDraftStore implements TimesheetDraftStore {
  final Map<String, TimesheetDraft> _items = {};

  @override
  Future<void> put(TimesheetDraft draft) async => _items[draft.id] = draft;

  @override
  Future<List<TimesheetDraft>> forPeriod(String periodId) async =>
      _items.values.where((d) => d.periodId == periodId).toList();

  @override
  Future<List<TimesheetDraft>> all() async => _items.values.toList();

  @override
  Future<void> removeForPeriod(String periodId) async =>
      _items.removeWhere((_, d) => d.periodId == periodId);

  @override
  Future<void> remove(String id) async => _items.remove(id);

  @override
  Future<int> count() async => _items.length;
}
