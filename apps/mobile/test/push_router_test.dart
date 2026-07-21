import 'package:aes_mobile/src/services/push_notifications.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const router = PushRouter();

  test('routes an alert push to the command centre', () {
    final route = router.routeFor(const PushMessage(subjectTable: 'alerts', subjectId: 'a1'));
    expect(route, '/command-centre');
  });

  test('routes an approval push to the approvals inbox', () {
    expect(router.routeFor(const PushMessage(subjectTable: 'approvals')), '/approvals');
  });

  test('routes a requisition/travel/petty-cash push to requests', () {
    expect(router.routeFor(const PushMessage(subjectTable: 'requisitions')), '/requests');
    expect(router.routeFor(const PushMessage(subjectTable: 'travel_requests')), '/requests');
    expect(router.routeFor(const PushMessage(subjectTable: 'petty_cash_txns')), '/requests');
  });

  test('returns null for an unknown subject', () {
    expect(router.routeFor(const PushMessage(subjectTable: 'widgets')), isNull);
    expect(router.routeFor(const PushMessage()), isNull);
  });

  test('parses an FCM data payload', () {
    final msg = PushMessage.fromData({
      'title': 'DANGER',
      'body': 'Cash runway negative',
      'subjectTable': 'alerts',
      'subjectId': 'a1',
    });
    expect(msg.title, 'DANGER');
    expect(msg.subjectTable, 'alerts');
  });
}
