import 'package:equatable/equatable.dart';

/// Red/Amber/Green schedule flag for a project (mirrors the API `Rag` type).
enum Rag {
  green('GREEN', 'On track'),
  amber('AMBER', 'At risk'),
  red('RED', 'Behind');

  const Rag(this.wire, this.label);

  final String wire;
  final String label;

  static Rag fromWire(String? value) {
    return Rag.values.firstWhere(
      (r) => r.wire == value,
      orElse: () => Rag.green,
    );
  }
}

/// Schedule health for a project: planned vs actual %, days ahead/behind, RAG.
/// Shared between the portfolio row and the project detail header.
class ProjectHealth extends Equatable {
  const ProjectHealth({
    required this.plannedPercent,
    required this.actualPercent,
    required this.variancePercent,
    required this.daysAheadBehind,
    required this.rag,
    required this.slip,
  });

  final double plannedPercent;
  final double actualPercent;
  final double variancePercent;

  /// Positive = ahead by N days, negative = behind by N days. Null if no schedule.
  final double? daysAheadBehind;
  final Rag rag;
  final bool slip;

  /// True when there is a schedule to judge against.
  bool get hasSchedule => daysAheadBehind != null;

  bool get isAhead => (daysAheadBehind ?? 0) >= 0;

  static double _num(Object? v) => v == null ? 0 : double.tryParse(v.toString()) ?? 0;

  factory ProjectHealth.fromJson(Map<String, dynamic> json) {
    final days = json['daysAheadBehind'];
    return ProjectHealth(
      plannedPercent: _num(json['plannedPercent']),
      actualPercent: _num(json['actualPercent']),
      variancePercent: _num(json['variancePercent']),
      daysAheadBehind: days == null ? null : _num(days),
      rag: Rag.fromWire(json['rag'] as String?),
      slip: json['slip'] as bool? ?? false,
    );
  }

  @override
  List<Object?> get props => [plannedPercent, actualPercent, variancePercent, daysAheadBehind, rag, slip];
}
