import 'package:bloc/bloc.dart';

import '../../../api/api_exception.dart';
import '../../../data/attachments_repository.dart';
import '../../../data/requisitions_repository.dart';
import '../../../models/requisition.dart';
import '../../../services/receipt_capture.dart';
import 'request_list_state.dart';

/// Loads + creates + submits cash requisitions. A captured receipt is uploaded
/// first and its key attached to the new requisition.
class RequisitionsCubit extends Cubit<RequestListState<Requisition>> {
  RequisitionsCubit({
    required RequisitionsRepository repository,
    required AttachmentsRepository attachments,
  })  : _repo = repository,
        _attachments = attachments,
        super(const RequestListState<Requisition>());

  final RequisitionsRepository _repo;
  final AttachmentsRepository _attachments;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(RequestListState(items: await _repo.list()));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  /// Create a DRAFT requisition (uploading [receipt] first if provided). Returns
  /// the created requisition, or null on failure (with [state.error] set).
  Future<Requisition?> create(NewRequisition input, {CapturedReceipt? receipt}) async {
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
      emit(RequestListState(items: [created, ...state.items]));
      return created;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message));
      return null;
    }
  }

  /// Submit a DRAFT into the approval engine; reloads to reflect the new status.
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
