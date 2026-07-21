import 'dart:typed_data';

import 'package:aes_mobile/src/api/api_exception.dart';
import 'package:aes_mobile/src/data/alerts_repository.dart';
import 'package:aes_mobile/src/data/approvals_repository.dart';
import 'package:aes_mobile/src/data/attachments_repository.dart';
import 'package:aes_mobile/src/data/auth_repository.dart';
import 'package:aes_mobile/src/data/petty_cash_repository.dart';
import 'package:aes_mobile/src/data/requisitions_repository.dart';
import 'package:aes_mobile/src/data/travel_repository.dart';
import 'package:aes_mobile/src/models/alert.dart';
import 'package:aes_mobile/src/models/approval_decision.dart';
import 'package:aes_mobile/src/models/approval_item.dart';
import 'package:aes_mobile/src/models/auth_user.dart';
import 'package:aes_mobile/src/models/petty_cash.dart';
import 'package:aes_mobile/src/models/requisition.dart';
import 'package:aes_mobile/src/models/site_role.dart';
import 'package:aes_mobile/src/models/token_pair.dart';
import 'package:aes_mobile/src/models/travel_request.dart';
import 'package:aes_mobile/src/services/biometric_authenticator.dart';
import 'package:aes_mobile/src/services/receipt_capture.dart';
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

class FakeAttachmentsRepository extends AttachmentsRepository {
  FakeAttachmentsRepository({this.key = 'attachments/uuid/receipt.jpg'}) : super(Dio());

  final String key;
  int uploads = 0;

  @override
  Future<String> upload(Uint8List bytes, {required String filename, required String contentType}) async {
    uploads++;
    return key;
  }
}

class FakeRequisitionsRepository extends RequisitionsRepository {
  FakeRequisitionsRepository({this.items = const []}) : super(Dio());

  List<Requisition> items;
  final List<NewRequisition> created = [];
  final List<String> submitted = [];

  @override
  Future<List<Requisition>> list() async => items;

  @override
  Future<Requisition> create(NewRequisition input) async {
    created.add(input);
    return Requisition(
      id: 'req-${created.length}',
      purpose: input.purpose,
      amount: input.amount,
      currency: input.currency,
      status: 'DRAFT',
      requiredByDate: input.requiredByDate,
      attachmentKey: input.attachmentKey,
    );
  }

  @override
  Future<void> submit(String id) async => submitted.add(id);
}

class FakeTravelRepository extends TravelRepository {
  FakeTravelRepository({this.items = const []}) : super(Dio());

  List<TravelRequest> items;
  final List<NewTravel> created = [];
  final List<String> submitted = [];

  @override
  Future<List<TravelRequest>> list() async => items;

  @override
  Future<TravelRequest> create(NewTravel input) async {
    created.add(input);
    return TravelRequest(
      id: 'trv-${created.length}',
      destination: input.destination,
      advanceAmount: 120,
      currency: input.currency,
      status: 'DRAFT',
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    );
  }

  @override
  Future<void> submit(String id) async => submitted.add(id);
}

/// Receipt capture that returns a fixed image (or null to simulate cancel).
class FakeReceiptCapture implements ReceiptCapture {
  FakeReceiptCapture({this.cancel = false});

  final bool cancel;

  @override
  Future<CapturedReceipt?> capture({required bool fromCamera}) async {
    if (cancel) return null;
    return CapturedReceipt(
      bytes: Uint8List.fromList([1, 2, 3, 4]),
      filename: 'receipt.jpg',
      contentType: 'image/jpeg',
    );
  }
}

Requisition draftRequisition({String id = 'r1', String status = 'DRAFT'}) => Requisition(
      id: id,
      purpose: 'Fuel top-up',
      amount: 500,
      currency: 'USD',
      status: status,
    );

CapturedReceipt fakeCaptured() => CapturedReceipt(
      bytes: Uint8List.fromList([1, 2, 3, 4]),
      filename: 'receipt.jpg',
      contentType: 'image/jpeg',
    );

class FakePettyCashRepository extends PettyCashRepository {
  FakePettyCashRepository({this.floatList = const [], this.txnList = const []}) : super(Dio());

  List<PettyCashFloat> floatList;
  List<PettyCashTxn> txnList;
  final List<({String floatId, double amount, String purpose, String? receiptKey})> withdrawals = [];

  @override
  Future<List<PettyCashFloat>> floats() async => floatList;

  @override
  Future<List<PettyCashTxn>> txns(String floatId) async => txnList;

  @override
  Future<PettyCashTxn> createWithdrawal(
    String floatId, {
    required double amount,
    required String purpose,
    String? receiptKey,
  }) async {
    withdrawals.add((floatId: floatId, amount: amount, purpose: purpose, receiptKey: receiptKey));
    final txn = PettyCashTxn(
      id: 'txn-${withdrawals.length}',
      type: 'WITHDRAWAL',
      amount: amount,
      currency: 'USD',
      status: 'DRAFT',
      purpose: purpose,
      receiptKey: receiptKey,
    );
    txnList = [txn, ...txnList];
    return txn;
  }
}

PettyCashFloat usdFloat({String id = 'f1', bool locked = false}) => PettyCashFloat(
      id: id,
      currency: 'USD',
      floatAmount: 500,
      locked: locked,
    );
