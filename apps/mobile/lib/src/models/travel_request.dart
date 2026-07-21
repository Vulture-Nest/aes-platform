import 'package:equatable/equatable.dart';

/// A travel allowance request (`/v1/travel`). Per-diem and advance are resolved
/// server-side from the rate table; the client supplies the trip details only.
class TravelRequest extends Equatable {
  const TravelRequest({
    required this.id,
    required this.destination,
    required this.advanceAmount,
    required this.currency,
    required this.status,
    this.destinationClass,
    this.dateFrom,
    this.dateTo,
    this.perDiem,
    this.shortfall,
    this.createdAt,
  });

  final String id;
  final String destination;
  final double advanceAmount;
  final String currency;
  final String status;
  final String? destinationClass;
  final DateTime? dateFrom;
  final DateTime? dateTo;
  final double? perDiem;
  final double? shortfall;
  final DateTime? createdAt;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;
  static DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

  factory TravelRequest.fromJson(Map<String, dynamic> json) => TravelRequest(
        id: json['id'] as String,
        destination: json['destination'] as String? ?? '',
        advanceAmount: _num(json['advanceAmount']),
        currency: json['currency'] as String? ?? 'USD',
        status: json['status'] as String? ?? 'DRAFT',
        destinationClass: json['destinationClass'] as String?,
        dateFrom: _date(json['dateFrom']),
        dateTo: _date(json['dateTo']),
        perDiem: json['perDiem'] == null ? null : _num(json['perDiem']),
        shortfall: json['shortfall'] == null ? null : _num(json['shortfall']),
        createdAt: _date(json['createdAt']),
      );

  @override
  List<Object?> get props => [id, status, advanceAmount, currency, destination];
}
