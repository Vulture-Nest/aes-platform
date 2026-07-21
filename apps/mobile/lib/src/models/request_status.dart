/// Shared lifecycle for the approval-driven request types (requisitions, travel).
/// The happy path is Draft → Submitted → Approved → Disbursed → Closed; a chain
/// can also branch to Rejected/Returned. Used by the status chip + timeline.
class RequestLifecycle {
  RequestLifecycle._();

  /// Ordered happy-path stages shown in the timeline.
  static const stages = ['Draft', 'Submitted', 'Approved', 'Disbursed', 'Closed'];

  /// Index into [stages] for a raw API status (approved variants collapse to
  /// "Approved"; retired collapses to "Closed"). Rejected/returned map to the
  /// submitted stage since that is where the chain forked.
  static int stageIndex(String status) {
    switch (status) {
      case 'DRAFT':
        return 0;
      case 'SUBMITTED':
      case 'REJECTED':
      case 'RETURNED':
        return 1;
      case 'APPROVED':
      case 'APPROVED_READY_TO_PAY':
      case 'APPROVED_PENDING_FUNDS':
        return 2;
      case 'DISBURSED':
        return 3;
      case 'CLOSED':
      case 'RETIRED':
        return 4;
      default:
        return 0;
    }
  }

  static bool isRejected(String status) => status == 'REJECTED';
  static bool isReturned(String status) => status == 'RETURNED';
  static bool isTerminalBad(String status) => isRejected(status) || isReturned(status);

  static bool isDraft(String status) => status == 'DRAFT';

  static bool isPendingFunds(String status) => status == 'APPROVED_PENDING_FUNDS';

  /// Human label for a raw status, e.g. `APPROVED_PENDING_FUNDS` -> `Approved · pending funds`.
  static String label(String status) {
    switch (status) {
      case 'APPROVED_READY_TO_PAY':
        return 'Approved · ready to pay';
      case 'APPROVED_PENDING_FUNDS':
        return 'Approved · pending funds';
      default:
        return status
            .split('_')
            .map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}')
            .join(' ');
    }
  }
}
