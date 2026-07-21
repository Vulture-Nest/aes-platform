import 'package:equatable/equatable.dart';

/// Command-centre alert severity (mirrors the API's AlertSeverity).
enum AlertSeverity { danger, watch, info }

AlertSeverity _severityFrom(String? raw) {
  switch (raw) {
    case 'DANGER':
      return AlertSeverity.danger;
    case 'WATCH':
      return AlertSeverity.watch;
    default:
      return AlertSeverity.info;
  }
}

/// A raised danger-engine alert (`GET /v1/alerts`). Used by the home danger banner
/// and the (later) command-centre alert feed.
class Alert extends Equatable {
  const Alert({
    required this.id,
    required this.ruleKey,
    required this.severity,
    required this.message,
    this.subjectTable,
    this.subjectId,
    this.acknowledgedAt,
  });

  final String id;
  final String ruleKey;
  final AlertSeverity severity;
  final String message;
  final String? subjectTable;
  final String? subjectId;
  final DateTime? acknowledgedAt;

  bool get isAcknowledged => acknowledgedAt != null;

  factory Alert.fromJson(Map<String, dynamic> json) => Alert(
        id: json['id'] as String,
        ruleKey: json['ruleKey'] as String? ?? '',
        severity: _severityFrom(json['severity'] as String?),
        message: json['message'] as String? ?? '',
        subjectTable: json['subjectTable'] as String?,
        subjectId: json['subjectId'] as String?,
        acknowledgedAt: json['acknowledgedAt'] == null
            ? null
            : DateTime.tryParse(json['acknowledgedAt'] as String),
      );

  @override
  List<Object?> get props => [id, ruleKey, severity, message, acknowledgedAt];
}
