/// Outcome of saving a request from a form: created online, queued offline for
/// later sync, or a hard error.
class SaveResult {
  const SaveResult._({this.createdId, this.queuedOffline = false, this.error});

  factory SaveResult.created(String id) => SaveResult._(createdId: id);
  factory SaveResult.queued() => const SaveResult._(queuedOffline: true);
  factory SaveResult.failed(String message) => SaveResult._(error: message);

  final String? createdId;
  final bool queuedOffline;
  final String? error;

  bool get ok => createdId != null || queuedOffline;
}
