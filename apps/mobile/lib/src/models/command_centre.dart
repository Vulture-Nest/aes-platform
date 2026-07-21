/// The composite Command Centre dashboard (`GET /v1/command-centre`). The panel
/// payloads are deeply nested and evolving, so this wraps the raw map and exposes
/// just the headline figures the mobile summary cards render, read defensively.
class CommandCentre {
  const CommandCentre(this.raw);

  final Map<String, dynamic> raw;

  factory CommandCentre.fromJson(Map<String, dynamic> json) => CommandCentre(json);

  Object? _get(List<String> path) {
    Object? cur = raw;
    for (final key in path) {
      if (cur is Map) {
        cur = cur[key];
      } else {
        return null;
      }
    }
    return cur;
  }

  static double? _d(Object? v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString());
  }

  /// Overall health verdict: ACT / WATCH / OK.
  String get verdict => (_get(['healthVerdict', 'verdict']) as String?) ?? 'OK';

  /// Cash on hand, official-rate USD equivalent.
  double? get cashUsd => _d(_get(['cashPosition', 'usdEquivalent', 'official', 'totalUsd']));

  double? get inflow => _d(_get(['moneyInOut', 'totals', 'inflow']));
  double? get outflow => _d(_get(['moneyInOut', 'totals', 'outflow']));
  double? get net => _d(_get(['moneyInOut', 'totals', 'net']));

  double? get expectedIn => _d(_get(['coverage', 'expectedIn']));
  double? get expectedOut => _d(_get(['coverage', 'expectedOut']));

  double? get obligationsUsd => _d(_get(['pendingObligations', 'usdEquivalent', 'obligations']));
  double? get unfundedGapUsd => _d(_get(['pendingObligations', 'usdEquivalent', 'unfundedGap']));

  double? get bookedOrderValue => _d(_get(['performance', 'bookedOrderValue']));
  double? get operatingProfit => _d(_get(['performance', 'operatingProfit']));

  /// Operating margin as a fraction (0.65 = 65%).
  double? get margin => _d(_get(['performance', 'margin']));

  double? get taxWithInterest => _d(_get(['taxExposure', 'assessmentTotals', 'totalWithInterest']));

  /// Outstanding receivables (from the health-verdict drivers).
  double? get receivables => _d(_get(['healthVerdict', 'drivers', 'receivables']));
}
