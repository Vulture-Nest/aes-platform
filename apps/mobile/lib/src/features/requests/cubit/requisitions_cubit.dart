import 'package:bloc/bloc.dart';

import '../../../api/api_exception.dart';
import '../../../data/attachments_repository.dart';
import '../../../data/outbox_store.dart';
import '../../../data/requisitions_repository.dart';
import '../../../models/outbox_item.dart';
import '../../../models/requisition.dart';
import '../../../services/receipt_capture.dart';
import 'request_list_state.dart';
import 'save_result.dart';

/// Loads + creates + submits cash requisitions. A captured receipt is uploaded
/// first and its key attached. When the device is offline the draft is queued to
/// the outbox and synced later.
class RequisitionsCubit extends Cubit<RequestListState<Requisition>> {
  RequisitionsCubit({
    required RequisitionsRepository repository,
    required AttachmentsRepository attachments,
    required OutboxStore outbox,
  })  : _repo = repository,
        _attachments = attachments,
        _outbox = outbox,
        super(const RequestListState<Requisition>());

  final RequisitionsRepository _repo;
  final AttachmentsRepository _attachments;
  final OutboxStore _outbox;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(RequestListState(items: await _repo.list()));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  /// Create a DRAFT requisition (uploading [receipt] first if provided), then
  /// optionally [submit] it. On a connectivity failure the draft is queued to
  /// the outbox (without the receipt) and synced later.
  Future<SaveResult> create(
    NewRequisition input, {
    CapturedReceipt? receipt,
    bool submit = false,
  }) async {
    try {
      var payload = input;
      if (receipt != null) {
        final key = await _attachments.upload(
          receipt.bytes,
          filename: receipt.filename,
          contentType: receipt.contentType,
        );
        payload = NewRequisition(
          purpose: input.purpose,
          amount: input.amount,
          currency: input.currency,
          requiredByDate: input.requiredByDate,
          attachmentKey: key,
        );
      }
      final created = await _repo.create(payload);
      if (submit) {
        // Submit succeeded server-side; reload so the item reflects its true
        // SUBMITTED status. Emitting the stale pre-submit `created` (DRAFT)
        // would leave a Submit action on-screen and make re-taps 400.
        await _repo.submit(created.id);
        await load();
      } else {
        emit(RequestListState(items: [created, ...state.items]));
      }
      return SaveResult.created(created.id);
    } on ApiException catch (e) {
      if (e.statusCode == null) {
        await _outbox.enqueue(
          OutboxItem(
            id: DateTime.now().microsecondsSinceEpoch.toString(),
            kind: OutboxKind.requisition,
            payload: input.toJson(),
            submitAfter: submit,
            createdAt: DateTime.now(),
          ),
        );
        return SaveResult.queued();
      }
      emit(state.copyWith(error: e.message));
      return SaveResult.failed(e.message);
    }
  }

  /// Submit an existing DRAFT into the approval engine; reloads to reflect status.
  Future<String?> submit(String id) async {
    try {
      await _repo.submit(id);
      await load();
      return null;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message));
      return e.message;
    }
  }
}
