import 'package:equatable/equatable.dart';

/// A sales order (`/v1/orders`). Field/finance staff track these to servicing
/// and payment. Full Appendix-A health needs received totals; the list carries
/// enough (serviced + closing date) for a colour-coded status.
class Order extends Equatable {
  const Order({
    required this.id,
    required this.reference,
    required this.clientId,
    required this.valueExVat,
    required this.currency,
    required this.serviced,
    this.closingDate,
    this.servicedAt,
    this.assignedUserId,
    this.receivedTotal,
  });

  final String id;
  final String reference;
  final String clientId;
  final double valueExVat;
  final String currency;
  final bool serviced;
  final DateTime? closingDate;
  final DateTime? servicedAt;
  final String? assignedUserId;

  /// Present only on the detail response (summed from receipts).
  final double? receivedTotal;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;
  static DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

  bool get isPastClosing =>
      closingDate != null && DateTime.now().isAfter(closingDate!);

  /// Simplified health for the board: paid > serviced > overdue-service > open.
  OrderStatus get status {
    if (receivedTotal != null && receivedTotal! >= valueExVat && valueExVat > 0) {
      return OrderStatus.paid;
    }
    if (serviced) return OrderStatus.serviced;
    if (isPastClosing) return OrderStatus.overdue;
    return OrderStatus.open;
  }

  factory Order.fromJson(Map<String, dynamic> json) {
    final receipts = json['receipts'] as List<dynamic>?;
    return Order(
      id: json['id'] as String,
      reference: json['reference'] as String? ?? '',
      clientId: json['clientId'] as String? ?? '',
      valueExVat: _num(json['valueExVat']),
      currency: json['currency'] as String? ?? 'USD',
      serviced: json['serviced'] as bool? ?? false,
      closingDate: _date(json['closingDate']),
      servicedAt: _date(json['servicedAt']),
      assignedUserId: json['assignedUserId'] as String?,
      receivedTotal: receipts?.fold<double>(0, (s, r) => s + _num((r as Map)['amount'])),
    );
  }

  @override
  List<Object?> get props => [id, reference, valueExVat, serviced, closingDate, receivedTotal];
}

enum OrderStatus {
  paid('Paid'),
  serviced('Serviced'),
  awaiting('Awaiting payment'),
  overdue('Overdue service'),
  open('Open');

  const OrderStatus(this.label);
  final String label;
}
