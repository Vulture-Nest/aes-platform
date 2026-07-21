import 'package:equatable/equatable.dart';

/// A director withdrawal (`/v1/director-withdrawals`): raised by a director,
/// co-approved by a second director, posted, then completed with a manual transfer.
class DirectorWithdrawal extends Equatable {
  const DirectorWithdrawal({
    required this.id,
    required this.amount,
    required this.currency,
    required this.destinationAccount,
    required this.reason,
    required this.status,
    this.transferReference,
    this.createdAt,
  });

  final String id;
  final double amount;
  final String currency;
  final String destinationAccount;
  final String reason;
  final String status;
  final String? transferReference;
  final DateTime? createdAt;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;

  bool get isDraft => status == 'DRAFT';
  bool get awaitingTransfer => status == 'POSTED_AWAITING_TRANSFER';

  String get statusLabel => status
      .split('_')
      .map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}')
      .join(' ');

  factory DirectorWithdrawal.fromJson(Map<String, dynamic> json) => DirectorWithdrawal(
        id: json['id'] as String,
        amount: _num(json['amount']),
        currency: json['currency'] as String? ?? 'USD',
        destinationAccount: json['destinationAccount'] as String? ?? '',
        reason: json['reason'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        transferReference: json['transferReference'] as String?,
        createdAt: json['createdAt'] == null ? null : DateTime.tryParse(json['createdAt'].toString()),
      );

  @override
  List<Object?> get props => [id, amount, status, destinationAccount, reason];
}
