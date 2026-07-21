import 'package:aes_mobile/src/api/api_exception.dart';
import 'package:aes_mobile/src/data/alerts_repository.dart';
import 'package:aes_mobile/src/data/approvals_repository.dart';
import 'package:aes_mobile/src/data/auth_repository.dart';
import 'package:aes_mobile/src/models/alert.dart';
import 'package:aes_mobile/src/models/approval_decision.dart';
import 'package:aes_mobile/src/models/approval_item.dart';
import 'package:aes_mobile/src/models/auth_user.dart';
import 'package:aes_mobile/src/models/site_role.dart';
import 'package:aes_mobile/src/models/token_pair.dart';
import 'package:aes_mobile/src/services/biometric_authenticator.dart';
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

class FakeApprovalsRepository extends ApprovalsRepository {
  FakeApprovalsRepository({this.items = const [], this.failDecide = false}) : super(Dio());

  List<ApprovalItem> items;
  final bool failDecide;
  final List<({String id, ApprovalDecision decision, String? comment})> decisions = [];

  @override
  Future<List<ApprovalItem>> inbox() async => items;

  @override
  Future<void> decide(String approvalId, ApprovalDecision decision, {String? comment}) async {
    if (failDecide) {
      throw const ApiException('Cannot record decision', statusCode: 409);
    }
    decisions.add((id: approvalId, decision: decision, comment: comment));
  }
}

/// Biometric that always declines — for testing the money-item gate.
class DenyBiometric implements BiometricAuthenticator {
  const DenyBiometric();

  @override
  Future<bool> confirm(String reason) async => false;
}

ApprovalItem moneyApproval({String id = 'ap-money', double amount = 500}) => ApprovalItem(
      id: id,
      chainId: 'c1',
      module: 'requisition',
      subjectTable: 'requisitions',
      subjectId: 's1',
      step: 1,
      approverRole: 'FINANCE_DIRECTOR',
      amount: amount,
      currency: 'USD',
      requesterId: 'r1',
    );

ApprovalItem nonMoneyApproval({String id = 'ap-ts'}) => ApprovalItem(
      id: id,
      chainId: 'c2',
      module: 'timesheet_period',
      subjectTable: 'timesheet_periods',
      subjectId: 's2',
      step: 1,
      approverRole: 'SITE_MANAGER',
    );
