import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../api/api_exception.dart';
import '../../../data/approvals_repository.dart';
import '../../../models/approval_decision.dart';
import '../../../models/approval_item.dart';
import '../../../services/biometric_authenticator.dart';

/// Outcome of a decide action, surfaced to the UI for a snackbar.
enum DecideStatus { success, cancelled, failed }

class DecideResult {
  const DecideResult(this.status, [this.message]);
  final DecideStatus status;
  final String? message;
}

class ApprovalsState extends Equatable {
  const ApprovalsState({
    this.loading = false,
    this.items = const [],
    this.error,
    this.decidingId,
  });

  final bool loading;
  final List<ApprovalItem> items;
  final String? error;

  /// The approval step currently being actioned (drives per-row spinners).
  final String? decidingId;

  ApprovalsState copyWith({
    bool? loading,
    List<ApprovalItem>? items,
    String? error,
    String? decidingId,
    bool clearError = false,
    bool clearDeciding = false,
  }) {
    return ApprovalsState(
      loading: loading ?? this.loading,
      items: items ?? this.items,
      error: clearError ? null : (error ?? this.error),
      decidingId: clearDeciding ? null : (decidingId ?? this.decidingId),
    );
  }

  @override
  List<Object?> get props => [loading, items, error, decidingId];
}

/// Drives the approvals inbox: load the pending steps, and approve/reject/return
/// them. Approving a money item first requires a biometric confirmation.
class ApprovalsCubit extends Cubit<ApprovalsState> {
  ApprovalsCubit({
    required ApprovalsRepository repository,
    required BiometricAuthenticator biometric,
  })  : _repo = repository,
        _biometric = biometric,
        super(const ApprovalsState());

  final ApprovalsRepository _repo;
  final BiometricAuthenticator _biometric;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      final items = await _repo.inbox();
      emit(ApprovalsState(items: items));
    } on ApiException catch (error) {
      emit(state.copyWith(loading: false, error: error.message));
    }
  }

  Future<DecideResult> decide(
    ApprovalItem item,
    ApprovalDecision decision, {
    String? comment,
  }) async {
    // Money approvals require a biometric / passcode confirmation.
    if (decision == ApprovalDecision.approved && item.isMoneyItem) {
      final confirmed = await _biometric.confirm(
        'Confirm approval of ${item.moduleLabel} (${item.currency ?? ''} ${item.amount})',
      );
      if (!confirmed) {
        return const DecideResult(DecideStatus.cancelled, 'Biometric confirmation cancelled');
      }
    }

    emit(state.copyWith(decidingId: item.id, clearError: true));
    try {
      await _repo.decide(item.id, decision, comment: comment);
      // Drop the actioned step from the inbox.
      emit(ApprovalsState(items: state.items.where((i) => i.id != item.id).toList()));
      return DecideResult(DecideStatus.success, '${item.moduleLabel} ${decision.label.toLowerCase()}d');
    } on ApiException catch (error) {
      emit(state.copyWith(clearDeciding: true, error: error.message));
      return DecideResult(DecideStatus.failed, error.message);
    }
  }
}
