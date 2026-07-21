import 'package:aes_mobile/src/api/api_exception.dart';
import 'package:aes_mobile/src/data/alerts_repository.dart';
import 'package:aes_mobile/src/data/auth_repository.dart';
import 'package:aes_mobile/src/models/alert.dart';
import 'package:aes_mobile/src/models/auth_user.dart';
import 'package:aes_mobile/src/models/site_role.dart';
import 'package:aes_mobile/src/models/token_pair.dart';
import 'package:dio/dio.dart';

const financeDirector = AuthUser(
  id: 'u-fd',
  email: 'fd@aes.local',
  status: 'ACTIVE',
  roles: [SiteRole(siteId: null, role: 'FINANCE_DIRECTOR')],
);

const siteClerk = AuthUser(
  id: 'u-clerk',
  email: 'clerk@aes.local',
  status: 'ACTIVE',
  roles: [SiteRole(siteId: 's1', role: 'SITE_CLERK')],
);

/// Hand-rolled fake so tests avoid the network. The [Dio] passed to super is
/// never used because every method is overridden.
class FakeAuthRepository extends AuthRepository {
  FakeAuthRepository({this.user = financeDirector, this.failLogin = false}) : super(Dio());

  final AuthUser user;
  final bool failLogin;
  int loginCalls = 0;

  @override
  Future<TokenPair> login(String email, String password) async {
    loginCalls++;
    if (failLogin) {
      throw const ApiException('Invalid email or password', statusCode: 401);
    }
    return const TokenPair(accessToken: 'at', refreshToken: 'rt');
  }

  @override
  Future<AuthUser> me() async => user;

  @override
  Future<void> logout(String refreshToken) async {}
}

class FakeAlertsRepository extends AlertsRepository {
  FakeAlertsRepository({this.alerts = const []}) : super(Dio());

  final List<Alert> alerts;

  @override
  Future<List<Alert>> activeAlerts() async => alerts;
}

Alert dangerAlert(String message) => Alert(
      id: 'a1',
      ruleKey: 'cash_runway',
      severity: AlertSeverity.danger,
      message: message,
    );
