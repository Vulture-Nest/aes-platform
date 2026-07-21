import 'package:connectivity_plus/connectivity_plus.dart';

/// Reports connectivity and emits when the device comes back online, so the sync
/// service can flush the outbox. Abstracted for testability.
abstract class ConnectivityMonitor {
  Future<bool> isOnline();

  /// Emits `true` when connectivity is (re)gained, `false` when lost.
  Stream<bool> get onStatusChange;
}

bool _isOnline(List<ConnectivityResult> results) =>
    results.any((r) => r != ConnectivityResult.none);

class PlusConnectivityMonitor implements ConnectivityMonitor {
  PlusConnectivityMonitor([Connectivity? connectivity])
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  @override
  Future<bool> isOnline() async => _isOnline(await _connectivity.checkConnectivity());

  @override
  Stream<bool> get onStatusChange => _connectivity.onConnectivityChanged.map(_isOnline);
}

/// Always-online monitor for tests.
class AlwaysOnlineMonitor implements ConnectivityMonitor {
  const AlwaysOnlineMonitor();

  @override
  Future<bool> isOnline() async => true;

  @override
  Stream<bool> get onStatusChange => const Stream.empty();
}
