/// Currency formatting for the dual-base (USD + ZWG) reality of the business.
/// Kept dependency-free (no intl) — a simple grouped, 2dp formatter that renders
/// `USD 1,234.50`. Where the spec shows both bases side by side, use [dual].
class Money {
  Money._();

  /// Format [amount] as `CUR 1,234.50`. Accepts num or numeric strings.
  static String format(Object? amount, {String currency = 'USD'}) {
    final value = _toDouble(amount);
    final negative = value < 0;
    final fixed = value.abs().toStringAsFixed(2);
    final parts = fixed.split('.');
    final grouped = _group(parts[0]);
    final sign = negative ? '-' : '';
    return '$currency $sign$grouped.${parts[1]}';
  }

  /// Render USD and ZWG side by side, e.g. `USD 100.00 · ZWG 3,600.00`.
  static String dual(Object? usd, Object? zwg) =>
      '${format(usd)} · ${format(zwg, currency: 'ZWG')}';

  static double _toDouble(Object? amount) {
    if (amount is num) return amount.toDouble();
    if (amount is String) return double.tryParse(amount) ?? 0;
    return 0;
  }

  static String _group(String digits) {
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) {
        buffer.write(',');
      }
      buffer.write(digits[i]);
    }
    return buffer.toString();
  }
}
