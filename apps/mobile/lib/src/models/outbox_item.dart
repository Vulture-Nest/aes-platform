import 'dart:convert';

import 'package:equatable/equatable.dart';

/// The kind of queued request, which decides how the sync service dispatches it.
enum OutboxKind {
  requisition('requisition'),
  travel('travel'),
  pettyCashWithdrawal('petty_cash_withdrawal');

  const OutboxKind(this.wire);
  final String wire;

  static OutboxKind fromWire(String w) =>
      OutboxKind.values.firstWhere((k) => k.wire == w, orElse: () => OutboxKind.requisition);

  String get label => switch (this) {
        OutboxKind.requisition => 'Requisition',
        OutboxKind.travel => 'Travel request',
        OutboxKind.pettyCashWithdrawal => 'Petty-cash withdrawal',
      };
}

/// A request captured offline, awaiting sync. [payload] is the API request body;
/// [submitAfter] re-submits the created draft into the approval engine once posted.
class OutboxItem extends Equatable {
  const OutboxItem({
    required this.id,
    required this.kind,
    required this.payload,
    required this.createdAt,
    this.submitAfter = false,
    this.floatId,
    this.failed = false,
    this.lastError,
  });

  final String id;
  final OutboxKind kind;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final bool submitAfter;

  /// For petty-cash withdrawals, the float the withdrawal is raised against.
  final String? floatId;
  final bool failed;
  final String? lastError;

  /// A short human summary for the pending-sync list (e.g. "Requisition · USD 500").
  String get summary {
    final amount = payload['amount'] ?? payload['advanceAmount'];
    final currency = payload['currency'] ?? 'USD';
    final title = payload['purpose'] ?? payload['destination'] ?? kind.label;
    final money = amount == null ? '' : ' · $currency $amount';
    return '$title$money';
  }

  OutboxItem copyWith({bool? failed, String? lastError}) => OutboxItem(
        id: id,
        kind: kind,
        payload: payload,
        createdAt: createdAt,
        submitAfter: submitAfter,
        floatId: floatId,
        failed: failed ?? this.failed,
        lastError: lastError ?? this.lastError,
      );

  Map<String, dynamic> toRow() => {
        'id': id,
        'kind': kind.wire,
        'payload': jsonEncode(payload),
        'created_at': createdAt.toIso8601String(),
        'submit_after': submitAfter ? 1 : 0,
        'float_id': floatId,
        'failed': failed ? 1 : 0,
        'last_error': lastError,
      };

  factory OutboxItem.fromRow(Map<String, Object?> row) => OutboxItem(
        id: row['id'] as String,
        kind: OutboxKind.fromWire(row['kind'] as String),
        payload: jsonDecode(row['payload'] as String) as Map<String, dynamic>,
        createdAt: DateTime.parse(row['created_at'] as String),
        submitAfter: (row['submit_after'] as int? ?? 0) == 1,
        floatId: row['float_id'] as String?,
        failed: (row['failed'] as int? ?? 0) == 1,
        lastError: row['last_error'] as String?,
      );

  @override
  List<Object?> get props => [id, kind, payload, submitAfter, floatId, failed];
}
