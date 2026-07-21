/// A push notification (FCM) reduced to what the app acts on: a title/body and
/// the subject it deep-links to.
class PushMessage {
  const PushMessage({this.title, this.body, this.subjectTable, this.subjectId});

  final String? title;
  final String? body;
  final String? subjectTable;
  final String? subjectId;

  /// Build from an FCM data payload (the backend sets subjectTable/subjectId).
  factory PushMessage.fromData(Map<String, dynamic> data) => PushMessage(
        title: data['title'] as String?,
        body: data['body'] as String?,
        subjectTable: data['subjectTable'] as String?,
        subjectId: data['subjectId'] as String?,
      );
}

/// Maps a push notification to the in-app route to open (deep link). Kept pure
/// so it is unit-testable independently of the FCM transport.
class PushRouter {
  const PushRouter();

  /// The route to navigate to for [message], or null if it isn't actionable.
  String? routeFor(PushMessage message) {
    switch (message.subjectTable) {
      case 'alerts':
        return '/command-centre';
      case 'approvals':
      case 'approval_chains':
        return '/approvals';
      case 'requisitions':
      case 'travel_requests':
      case 'petty_cash_txns':
        return '/requests';
      default:
        return null;
    }
  }
}

/// Push transport. The concrete FCM implementation (firebase_messaging) is wired
/// per environment once a Firebase project + platform config (google-services.json /
/// GoogleService-Info.plist) are provisioned — those are external credentials, so
/// the default build ships a no-op that keeps the app fully functional without them.
abstract class PushService {
  /// Request permission + register the device token with the backend.
  Future<void> register();

  /// Foreground/opened push messages, mapped to [PushMessage].
  Stream<PushMessage> get onMessage;
}

/// No-op push service used until Firebase is configured (see above).
class NoopPushService implements PushService {
  const NoopPushService();

  @override
  Future<void> register() async {}

  @override
  Stream<PushMessage> get onMessage => const Stream.empty();
}
