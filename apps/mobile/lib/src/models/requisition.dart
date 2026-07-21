import 'package:equatable/equatable.dart';

/// A cash requisition (`/v1/requisitions`). Field staff raise these (DRAFT),
/// submit them into the approval engine, then track them to disbursement.
class Requisition extends Equatable {
  const Requisition({
    required this.id,
    required this.purpose,
    required this.amount,
    required this.currency,
    required this.status,
    this.requiredByDate,
    this.shortfall,
    this.attachmentKey,
    this.createdAt,
  });

  final String id;
  final String purpose;
  final double amount;
  final String currency;
  final String status;
  final DateTime? requiredByDate;
  final double? shortfall;
  final String? attachmentKey;
  final DateTime? createdAt;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;
  static DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

  factory Requisition.fromJson(Map<String, dynamic> json) => Requisition(
        id: json['id'] as String,
        purpose: json['purpose'] as String? ?? '',
        amount: _num(json['amount']),
        currency: json['currency'] as String? ?? 'USD',
        status: json['status'] as String? ?? 'DRAFT',
        requiredByDate: _date(json['requiredByDate']),
        shortfall: json['shortfall'] == null ? null : _num(json['shortfall']),
        attachmentKey: json['attachmentKey'] as String?,
        createdAt: _date(json['createdAt']),
      );

  @override
  List<Object?> get props => [id, status, amount, currency, purpose];
}
