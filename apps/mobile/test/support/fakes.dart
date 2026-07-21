import 'dart:typed_data';

import 'package:aes_mobile/src/api/api_exception.dart';
import 'package:aes_mobile/src/data/alerts_repository.dart';
import 'package:aes_mobile/src/data/approvals_repository.dart';
import 'package:aes_mobile/src/data/attachments_repository.dart';
import 'package:aes_mobile/src/data/command_centre_repository.dart';
import 'package:aes_mobile/src/data/director_repository.dart';
import 'package:aes_mobile/src/data/orders_repository.dart';
import 'package:aes_mobile/src/data/auth_repository.dart';
import 'package:aes_mobile/src/data/petty_cash_repository.dart';
import 'package:aes_mobile/src/data/requisitions_repository.dart';
import 'package:aes_mobile/src/data/travel_repository.dart';
import 'package:aes_mobile/src/models/alert.dart';
import 'package:aes_mobile/src/models/approval_decision.dart';
import 'package:aes_mobile/src/models/approval_item.dart';
import 'package:aes_mobile/src/models/command_centre.dart';
import 'package:aes_mobile/src/models/director_withdrawal.dart';
import 'package:aes_mobile/src/models/order.dart';
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
  final List<String> acked = [];

  @override
  Future<List<Alert>> activeAlerts() async => alerts;

  @override
  Future<void> acknowledge(String alertId) async => acked.add(alertId);
}

class FakeCommandCentreRepository extends CommandCentreRepository {
  FakeCommandCentreRepository([Map<String, dynamic>? raw]) : raw = raw ?? _default, super(Dio());

  final Map<String, dynamic> raw;

  static final _default = <String, dynamic>{
    'healthVerdict': {
      'verdict': 'ACT',
      'drivers': {'receivables': 250118.77},
    },
    'cashPosition': {
      'usdEquivalent': {
        'official': {'totalUsd': -1210.32},
      },
    },
    'moneyInOut': {
      'totals': {'inflow': 25000, 'outflow': 7015, 'net': 17985},
    },
    'coverage': {'expectedIn': 250115, 'expectedOut': 6450},
    'pendingObligations': {
      'usdEquivalent': {'obligations': 1450, 'unfundedGap': 2660.32},
    },
    'performance': {'bookedOrderValue': 255115, 'operatingProfit': 13000, 'margin': 0.6495},
    'taxExposure': {
      'assessmentTotals': {'totalWithInterest': 0},
    },
  };

  @override
  Future<CommandCentre> dashboard() async => CommandCentre.fromJson(raw);
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

/// A connectivity failure (no status code) — what the offline path keys on.
const offlineError = ApiException('Cannot reach the server. Check your connection.');

class FakeRequisitionsRepository extends RequisitionsRepository {
  FakeRequisitionsRepository({this.items = const [], this.offline = false}) : super(Dio());

  List<Requisition> items;
  final bool offline;
  final List<NewRequisition> created = [];
  final List<String> submitted = [];

  @override
  Future<List<Requisition>> list() async => items;

  @override
  Future<Requisition> create(NewRequisition input) async {
    if (offline) throw offlineError;
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
  FakeTravelRepository({this.items = const [], this.offline = false}) : super(Dio());

  List<TravelRequest> items;
  final bool offline;
  final List<NewTravel> created = [];
  final List<String> submitted = [];

  @override
  Future<List<TravelRequest>> list() async => items;

  @override
  Future<TravelRequest> create(NewTravel input) async {
    if (offline) throw offlineError;
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
  FakePettyCashRepository({this.floatList = const [], this.txnList = const [], this.offline = false})
      : super(Dio());

  List<PettyCashFloat> floatList;
  List<PettyCashTxn> txnList;
  final bool offline;
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
    if (offline) throw offlineError;
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

class FakeOrdersRepository extends OrdersRepository {
  FakeOrdersRepository({this.items = const []}) : super(Dio());

  List<Order> items;
  final List<String> serviced = [];

  @override
  Future<List<Order>> list() async => items;

  @override
  Future<Map<String, String>> clientNames() async => {'c1': 'Mimosa Mine'};

  @override
  Future<void> markServiced(String id) async => serviced.add(id);

  @override
  Future<Order> findOne(String id) async {
    final o = items.firstWhere((e) => e.id == id);
    // After mark-serviced the server would report it serviced.
    return Order(
      id: o.id,
      reference: o.reference,
      clientId: o.clientId,
      valueExVat: o.valueExVat,
      currency: o.currency,
      serviced: true,
      closingDate: o.closingDate,
    );
  }
}

Order openOrder({String id = 'o1', bool serviced = false, double value = 1000}) => Order(
      id: id,
      reference: 'ORD-$id',
      clientId: 'c1',
      valueExVat: value,
      currency: 'USD',
      serviced: serviced,
    );

class FakeDirectorRepository extends DirectorRepository {
  FakeDirectorRepository({this.items = const []}) : super(Dio());

  List<DirectorWithdrawal> items;
  final List<NewWithdrawal> created = [];
  final List<String> submitted = [];
  final List<({String id, String method, String ref})> completed = [];

  @override
  Future<List<DirectorWithdrawal>> list() async => items;

  @override
  Future<DirectorWithdrawal> create(NewWithdrawal input) async {
    created.add(input);
    return DirectorWithdrawal(
      id: 'dw-${created.length}',
      amount: input.amount,
      currency: input.currency,
      destinationAccount: input.destinationAccount,
      reason: input.reason,
      status: 'DRAFT',
    );
  }

  @override
  Future<void> submit(String id) async => submitted.add(id);

  @override
  Future<void> complete(String id, {required String transferMethod, required String transferReference}) async =>
      completed.add((id: id, method: transferMethod, ref: transferReference));
}

DirectorWithdrawal draftWithdrawal({String id = 'dw1', String status = 'DRAFT'}) => DirectorWithdrawal(
      id: id,
      amount: 2000,
      currency: 'USD',
      destinationAccount: 'ACC-123',
      reason: 'Dividend',
      status: status,
    );
