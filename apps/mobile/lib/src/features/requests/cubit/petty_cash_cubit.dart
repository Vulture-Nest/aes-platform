import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../api/api_exception.dart';
import '../../../data/attachments_repository.dart';
import '../../../data/outbox_store.dart';
import '../../../data/petty_cash_repository.dart';
import '../../../models/outbox_item.dart';
import '../../../models/petty_cash.dart';
import '../../../services/receipt_capture.dart';
import 'save_result.dart';

class PettyCashState extends Equatable {
  const PettyCashState({
    this.floatsLoading = false,
    this.floats = const [],
    this.txnsLoading = false,
    this.txns = const [],
    this.error,
  });

  final bool floatsLoading;
  final List<PettyCashFloat> floats;
  final bool txnsLoading;
  final List<PettyCashTxn> txns;
  final String? error;

  PettyCashState copyWith({
    bool? floatsLoading,
    List<PettyCashFloat>? floats,
    bool? txnsLoading,
    List<PettyCashTxn>? txns,
    String? error,
    bool clearError = false,
  }) {
    return PettyCashState(
      floatsLoading: floatsLoading ?? this.floatsLoading,
      floats: floats ?? this.floats,
      txnsLoading: txnsLoading ?? this.txnsLoading,
      txns: txns ?? this.txns,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props => [floatsLoading, floats, txnsLoading, txns, error];
}

/// Loads the site's petty-cash floats and, per float, its transactions; raises
/// withdrawals (uploading a receipt first when captured).
class PettyCashCubit extends Cubit<PettyCashState> {
  PettyCashCubit({
    required PettyCashRepository repository,
    required AttachmentsRepository attachments,
    required OutboxStore outbox,
  })  : _repo = repository,
        _attachments = attachments,
        _outbox = outbox,
        super(const PettyCashState());

  final PettyCashRepository _repo;
  final AttachmentsRepository _attachments;
  final OutboxStore _outbox;

  Future<void> loadFloats() async {
    emit(state.copyWith(floatsLoading: true, clearError: true));
    try {
      emit(state.copyWith(floatsLoading: false, floats: await _repo.floats()));
    } on ApiException catch (e) {
      emit(state.copyWith(floatsLoading: false, error: e.message));
    }
  }

  Future<void> loadTxns(String floatId) async {
    emit(state.copyWith(txnsLoading: true, txns: const [], clearError: true));
    try {
      emit(state.copyWith(txnsLoading: false, txns: await _repo.txns(floatId)));
    } on ApiException catch (e) {
      emit(state.copyWith(txnsLoading: false, error: e.message));
    }
  }

  /// Raise a withdrawal against [floatId]. Offline, it is queued to the outbox.
  Future<SaveResult> createWithdrawal(
    String floatId, {
    required double amount,
    required String purpose,
    CapturedReceipt? receipt,
  }) async {
    try {
      String? receiptKey;
      if (receipt != null) {
        receiptKey = await _attachments.upload(
          receipt.bytes,
          filename: receipt.filename,
          contentType: receipt.contentType,
        );
      }
      final txn = await _repo.createWithdrawal(
        floatId,
        amount: amount,
        purpose: purpose,
        receiptKey: receiptKey,
      );
      await loadTxns(floatId);
      return SaveResult.created(txn.id);
    } on ApiException catch (e) {
      if (e.statusCode == null) {
        await _outbox.enqueue(
          OutboxItem(
            id: DateTime.now().microsecondsSinceEpoch.toString(),
            kind: OutboxKind.pettyCashWithdrawal,
            payload: {'amount': amount, 'purpose': purpose},
            floatId: floatId,
            createdAt: DateTime.now(),
          ),
        );
        return SaveResult.queued();
      }
      emit(state.copyWith(error: e.message));
      return SaveResult.failed(e.message);
    }
  }
}
