import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../models/outbox_item.dart';

/// Persistent queue of requests captured offline. Abstracted so the sync service
/// and cubits depend on the interface; the SQLite implementation survives app
/// restarts (mine sites have long dead zones) and tests use the in-memory one.
abstract class OutboxStore {
  Future<void> enqueue(OutboxItem item);
  Future<List<OutboxItem>> all();
  Future<void> update(OutboxItem item);
  Future<void> remove(String id);
  Future<int> count();
}

/// SQLite-backed outbox (via sqflite). The database is opened lazily on first
/// use so construction is synchronous. One table, ordered by capture time.
class SqfliteOutboxStore implements OutboxStore {
  SqfliteOutboxStore();

  static const _table = 'outbox';

  Future<Database>? _opening;
  Future<Database> get _db => _opening ??= _open();

  Future<Database> _open() async {
    final path = p.join(await getDatabasesPath(), 'aes_outbox.db');
    return openDatabase(
      path,
      version: 1,
      onCreate: (db, _) => db.execute('''
        CREATE TABLE $_table (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          submit_after INTEGER NOT NULL DEFAULT 0,
          float_id TEXT,
          failed INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        )
      '''),
    );
  }

  @override
  Future<void> enqueue(OutboxItem item) async {
    final db = await _db;
    await db.insert(_table, item.toRow(), conflictAlgorithm: ConflictAlgorithm.replace);
  }

  @override
  Future<List<OutboxItem>> all() async {
    final db = await _db;
    final rows = await db.query(_table, orderBy: 'created_at ASC');
    return rows.map(OutboxItem.fromRow).toList();
  }

  @override
  Future<void> update(OutboxItem item) async {
    final db = await _db;
    await db.update(_table, item.toRow(), where: 'id = ?', whereArgs: [item.id]);
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

/// In-memory outbox for tests and platforms without SQLite.
class InMemoryOutboxStore implements OutboxStore {
  final List<OutboxItem> _items = [];

  @override
  Future<void> enqueue(OutboxItem item) async => _items.add(item);

  @override
  Future<List<OutboxItem>> all() async => List.unmodifiable(_items);

  @override
  Future<void> update(OutboxItem item) async {
    final i = _items.indexWhere((e) => e.id == item.id);
    if (i >= 0) _items[i] = item;
  }

  @override
  Future<void> remove(String id) async => _items.removeWhere((e) => e.id == id);

  @override
  Future<int> count() async => _items.length;
}
