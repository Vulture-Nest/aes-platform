import 'package:equatable/equatable.dart';

/// One pending approval step awaiting the current user, flattened from the API's
/// `Approval & { chain }` inbox shape (`GET /v1/approvals/inbox`). The step [id]
/// is what `POST /v1/approvals/:id/decide` acts on.
class ApprovalItem extends Equatable {
  const ApprovalItem({
    required this.id,
    required this.chainId,
    required this.module,
    required this.subjectTable,
    required this.subjectId,
    required this.step,
    required this.approverRole,
    this.amount,
    this.currency,
    this.requesterId,
  });

  final String id;
  final String chainId;
  final String module;
  final String subjectTable;
  final String subjectId;
  final int step;
  final String approverRole;
  final double? amount;
  final String? currency;
  final String? requesterId;

  /// Money items require biometric confirmation before approval (spec §15.1).
  bool get isMoneyItem => amount != null;

  /// A friendly module label, e.g. `director_withdrawal` -> `Director Withdrawal`.
  String get moduleLabel => module
      .split('_')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');

  factory ApprovalItem.fromJson(Map<String, dynamic> json) {
    final chain = (json['chain'] as Map<String, dynamic>?) ?? const {};
    final rawAmount = chain['amount'];
    return ApprovalItem(
      id: json['id'] as String,
      chainId: json['chainId'] as String? ?? chain['id'] as String? ?? '',
      module: chain['module'] as String? ?? '',
      subjectTable: chain['subjectTable'] as String? ?? '',
      subjectId: chain['subjectId'] as String? ?? '',
      step: json['step'] as int? ?? 1,
      approverRole: json['approverRole'] as String? ?? '',
      amount: rawAmount == null ? null : double.tryParse(rawAmount.toString()),
      currency: chain['currency'] as String?,
      requesterId: chain['requesterId'] as String?,
    );
  }

  @override
  List<Object?> get props => [id, chainId, module, subjectId, step, amount, currency];
}
