import 'package:equatable/equatable.dart';

/// A site petty-cash float (`/v1/petty-cash/floats`). Field staff raise
/// withdrawals against the float they are custodian of.
class PettyCashFloat extends Equatable {
  const PettyCashFloat({
    required this.id,
    required this.currency,
    required this.floatAmount,
    required this.locked,
    this.siteId,
  });

  final String id;
  final String currency;
  final double floatAmount;
  final bool locked;
  final String? siteId;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;

  factory PettyCashFloat.fromJson(Map<String, dynamic> json) => PettyCashFloat(
        id: json['id'] as String,
        currency: json['currency'] as String? ?? 'USD',
        floatAmount: _num(json['floatAmount']),
        locked: json['locked'] as bool? ?? false,
        siteId: json['siteId'] as String?,
      );

  @override
  List<Object?> get props => [id, currency, floatAmount, locked];
}

/// A transaction on a float (withdrawal / top-up / conversion).
class PettyCashTxn extends Equatable {
  const PettyCashTxn({
    required this.id,
    required this.type,
    required this.amount,
    required this.currency,
    required this.status,
    this.purpose,
    this.receiptKey,
    this.createdAt,
  });

  final String id;
  final String type;
  final double amount;
  final String currency;
  final String status;
  final String? purpose;
  final String? receiptKey;
  final DateTime? createdAt;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;

  String get typeLabel => type
      .split('_')
      .map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}')
      .join(' ');

  factory PettyCashTxn.fromJson(Map<String, dynamic> json) => PettyCashTxn(
        id: json['id'] as String,
        type: json['type'] as String? ?? 'WITHDRAWAL',
        amount: _num(json['amount']),
        currency: json['currency'] as String? ?? 'USD',
        status: json['status'] as String? ?? 'DRAFT',
        purpose: json['purpose'] as String?,
        receiptKey: json['receiptKey'] as String?,
        createdAt: json['createdAt'] == null ? null : DateTime.tryParse(json['createdAt'].toString()),
      );

  @override
  List<Object?> get props => [id, type, amount, status];
}
