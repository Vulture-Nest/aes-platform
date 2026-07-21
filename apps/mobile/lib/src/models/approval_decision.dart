/// The three approval outcomes the API accepts (`POST /v1/approvals/:id/decide`).
enum ApprovalDecision {
  approved('APPROVED', 'Approve'),
  rejected('REJECTED', 'Reject'),
  returned('RETURNED', 'Return');

  const ApprovalDecision(this.wire, this.label);

  /// The value sent to the API.
  final String wire;

  /// The button/verb shown in the UI.
  final String label;
}
